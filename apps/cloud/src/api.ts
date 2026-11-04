import type {APIGatewayProxyEventV2,APIGatewayProxyResultV2} from 'aws-lambda';
import {SQSClient,SendMessageCommand} from '@aws-sdk/client-sqs';
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {GenerateVideoInputSchema,scriptForFormat,CREATABLE_FORMATS,retiredFormatMessage,LibraryQuerySchema,VideoReviewPatchSchema,ReviewConflictError,ReviewInputError,ImageSearchInputSchema,videoOpenApi,type VideoJob,type StudioConfig} from '@brainrot/contracts';
import {CHARACTERS,CASTS,BACKGROUNDS,searchBrollImage,imageSearchProvider,videoLibrary,validateVideoRequest,LibraryCursorError} from '@brainrot/media';
import {reserveJob,findJob,listJobs,getReview,listReviews,saveReview,quota,markQueueUncertain,TrialLimitError,RequestConflictError} from './store.js';
import {CreateLearningSessionSchema,SessionListQuerySchema,SessionReviewPatchSchema,SessionReviewConflictError,VideoLanguageSchema} from '@brainrot/contracts';
import {learningGuide,prepareSessionLesson,formatGuide} from '@brainrot/media';
import {createSession,findSession,listSessions,getSessionReview,saveSessionReview} from './store.js';
const sqs=new SQSClient({}),s3=new S3Client({});
// Every response carries the request ID (x-request-id, also in error bodies) and nosniff. Every error body has the
// documented shape {code, message, retryable, requestId}: a stable machine-readable code, a human message, and
// whether retrying the same request can succeed. Endpoint-specific fields (e.g. the latest review on 409) are kept.
let requestId='';
const ERROR_CODES:Record<number,string>={400:'bad_request',401:'unauthorized',403:'forbidden',404:'not_found',409:'conflict',413:'payload_too_large',415:'unsupported_media_type',422:'validation_failed',429:'rate_limited',500:'internal_error',502:'upstream_failed',503:'unavailable',504:'upstream_timeout'};
export const RETRYABLE=new Set([429,500,502,503,504]);
const reply=(statusCode:number,body:unknown):APIGatewayProxyResultV2=>{
  const payload=statusCode>=400&&body&&typeof body==='object'?{code:ERROR_CODES[statusCode]??'error',retryable:RETRYABLE.has(statusCode),...body as Record<string,unknown>,requestId}:body;
  return{statusCode,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...(requestId?{'x-request-id':requestId}:{})},body:JSON.stringify(payload)};
};
/** Reads a JSON request body: 413 when too large, 415 for a non-JSON content type, 400 when missing or malformed. */
function readJson(event:APIGatewayProxyEventV2,maxBytes:number,{optional=false}:{optional?:boolean}={}):{value:unknown}|{response:APIGatewayProxyResultV2}{
  if(!event.body)return optional?{value:{}}:{response:reply(400,{code:'missing_body',message:'Send a JSON request body.'})};
  if(event.isBase64Encoded)return{response:reply(415,{message:'Send the body as application/json.'})};
  const type=(event.headers?.['content-type']??'application/json').toLowerCase();
  if(!/^application\/(?:[\w.+-]+\+)?json\b/.test(type))return{response:reply(415,{message:'Send the body as application/json.'})};
  if(Buffer.byteLength(event.body,'utf8')>maxBytes)return{response:reply(413,{message:`The request body is larger than ${Math.round(maxBytes/1000)} KB.`})};
  try{return{value:JSON.parse(event.body)};}catch{return{response:reply(400,{code:'invalid_json',message:'The request body is not valid JSON.'})};}
}
export function authenticatedSubject(event:APIGatewayProxyEventV2):string|undefined{
  const context=event.requestContext as typeof event.requestContext&{authorizer?:{jwt?:{claims?:Record<string,unknown>}}};
  const claims=context.authorizer?.jwt?.claims;
  const issuer=process.env['COGNITO_ISSUER'],primary=process.env['COGNITO_CLIENT_ID'];
  const clients=new Set([primary,process.env['COGNITO_AGENT_CLIENT_ID'],process.env['COGNITO_ANDROID_CLIENT_ID'],...(process.env['COGNITO_ADDITIONAL_CLIENT_IDS']??'').split(',').map(id=>id.trim()).filter(id=>/^[a-z0-9]{10,128}$/.test(id))]);
  if(!issuer||!primary||!claims||claims['iss']!==issuer||typeof claims['client_id']!=='string'||!clients.has(claims['client_id'])||claims['token_use']!=='access')return;
  return typeof claims['sub']==='string'&&claims['sub'].length<=150?claims['sub']:undefined;
}
async function media(job:VideoJob,sub:string):Promise<VideoJob>{
  if(job.state!=='ready')return job;
  const mediaExpiresAt=new Date(Date.parse(job.createdAt)+30*86400000).toISOString();
  if(Date.parse(mediaExpiresAt)<=Date.now())return{...job,mediaExpired:true,mediaExpiresAt,videoUrl:null,posterUrl:null,audioUrl:null,downloadUrl:undefined,outputs:undefined};
  const sign=(name:string,type:string)=>getSignedUrl(s3,new GetObjectCommand({Bucket:process.env['S3_BUCKET']!,Key:`${sub}/${job.jobId}/${name}`,ResponseContentType:type}),{expiresIn:3600});
  const [videoUrl,posterUrl,audioUrl]=await Promise.all([sign('video.mp4','video/mp4'),sign('poster.png','image/png'),sign('audio.mp3','audio/mpeg')]);
  const outputs=job.learning?{learningUrl:await sign('learning.json','application/json'),notesUrl:await sign('notes.md','text/markdown; charset=utf-8'),captionsUrl:await sign('captions.srt','application/x-subrip'),...(job.learning.flashcards?{flashcardsUrl:await sign('flashcards.csv','text/csv; charset=utf-8')}:{})}:undefined;
  return{...job,mediaExpired:false,mediaExpiresAt,videoUrl,posterUrl,audioUrl,outputs,downloadUrl:await getSignedUrl(s3,new GetObjectCommand({Bucket:process.env['S3_BUCKET']!,Key:`${sub}/${job.jobId}/video.mp4`,ResponseContentDisposition:`attachment; filename="brainrotten-${job.jobId}.mp4"`}),{expiresIn:3600})};
}
function hostedConfig(enabled:boolean):StudioConfig{
    const config:StudioConfig={mode:'hosted',formats:CREATABLE_FORMATS.map(format=>({...format,ready:enabled})),scriptConfigured:enabled,scriptProvider:'auto',voiceBackend:'elevenlabs',voiceConfigured:enabled,imageSearchProvider:imageSearchProvider(),paperConfigured:enabled,elevenlabsConfigured:enabled,ffmpegAvailable:enabled,voices:[],characters:(Object.keys(CHARACTERS) as Array<keyof typeof CHARACTERS>).map(id=>({id,name:CHARACTERS[id].name,imageUrl:`/characters/${id}.png`,voiceReady:enabled})),casts:CASTS,backgrounds:BACKGROUNDS,defaults:{style:'brainrot',durationSeconds:60,cast:'auto',language:'hinglish',speechSpeed:1.12},auth:{configured:enabled&&Boolean(process.env['COGNITO_DOMAIN']&&process.env['COGNITO_CLIENT_ID']),loginUrl:`${process.env['COGNITO_DOMAIN']??''}/oauth2/authorize`,clientId:process.env['COGNITO_CLIENT_ID']??'',agentClientId:process.env['COGNITO_AGENT_CLIENT_ID']??'',issuer:process.env['COGNITO_ISSUER']??'',domain:process.env['COGNITO_DOMAIN']??'',userPoolId:process.env['COGNITO_ISSUER']?.split('/').pop()??''},mediaOrigins:[`https://${process.env['S3_BUCKET']}.s3.${process.env['AWS_REGION']}.amazonaws.com`]};
  return config;
}
export async function handler(event:APIGatewayProxyEventV2):Promise<APIGatewayProxyResultV2>{
  requestId=event.requestContext?.requestId??'';
  // Scheduled keep-warm ping: keeps a container ready so users skip the large-image cold start.
  if((event as unknown as {warmup?:boolean}).warmup)return{statusCode:200,body:'warm'};
  const enabled=process.env['HOSTED_ENABLED']==='true';
  const route=event.rawPath.replace(/^.*\/api\/v1/,'');
  const method=event.requestContext.http.method;
  if(route==='/openapi.json'&&method==='GET')return reply(200,videoOpenApi('hosted'));
  if(route==='/health'&&method==='GET')return reply(200,{status:'ok',service:'brainrotten-api',hostedEnabled:enabled});
  if(route==='/studio/config')return reply(200,hostedConfig(enabled));
  if(route==='/formats/guide'&&method==='GET'){const language=VideoLanguageSchema.safeParse(event.queryStringParameters?.['language']??'hinglish');if(!language.success)return reply(400,{message:'language must be en, hinglish or benglish'});return reply(200,formatGuide(event.queryStringParameters?.['format'],language.data,enabled?(Object.keys(CHARACTERS) as Array<keyof typeof CHARACTERS>):[]));}
  if(!enabled||!process.env['DYNAMODB_TABLE']||!process.env['JOB_QUEUE_URL'])return reply(503,{code:'not_configured',message:'The hosted trial is not configured. Use local Studio or MCP.'});
  const sub=authenticatedSubject(event);if(!sub)return reply(401,{message:'Sign in with Google to use the trial.'});
  try{
    if(route==='/learning-guide'&&method==='GET')return reply(200,learningGuide());
    if(route==='/sessions'&&method==='GET'){const query=SessionListQuerySchema.safeParse(event.queryStringParameters??{});if(!query.success)return reply(400,{message:'Check the session page and cursor.'});return reply(200,await listSessions(sub,query.data));}
    if(route==='/sessions'&&method==='POST'){
      const body=readJson(event,40000);if('response' in body)return body.response;
      const raw:unknown=body.value;
      const input=CreateLearningSessionSchema.safeParse(raw);if(!input.success)return reply(422,{message:'Provide bounded context, an objective, a prediction prompt and a practice task.'});return reply(201,await createSession(sub,input.data));
    }
    const sessionMatch=/^\/sessions\/([a-f0-9-]{36})(?:\/(guide|review))?$/.exec(route);
    if(sessionMatch){
      const session=await findSession(sub,sessionMatch[1]!);if(!session)return reply(404,{message:'Learning session not found.'});
      if(method==='GET'&&sessionMatch[2]==='guide')return reply(200,learningGuide(session));
      if(method==='GET'&&sessionMatch[2]==='review')return reply(200,await getSessionReview(sub,session.sessionId));
      if(method==='GET'&&!sessionMatch[2])return reply(200,{session,review:await getSessionReview(sub,session.sessionId),videos:await Promise.all((await listJobs(sub)).filter(record=>record.job.sessionId===session.sessionId).map(record=>media(record.job,sub)))});
      if(method==='PUT'&&sessionMatch[2]==='review'){
        const claims=(event.requestContext as unknown as {authorizer:{jwt:{claims:Record<string,unknown>}}}).authorizer.jwt.claims;if(process.env['COGNITO_AGENT_CLIENT_ID']&&claims['client_id']===process.env['COGNITO_AGENT_CLIENT_ID'])return reply(403,{message:'Learning responses belong to the learner. Use Studio or the first-party app.'});
        const body=readJson(event,16000);if('response' in body)return body.response;
        const raw:unknown=body.value;const parsed=SessionReviewPatchSchema.safeParse(raw);if(!parsed.success)return reply(422,{message:'Check the learning response, confidence and version.'});return reply(200,await saveSessionReview(sub,session.sessionId,parsed.data));
      }
    }
    if(route==='/library'&&method==='GET'){
      const query=LibraryQuerySchema.safeParse(event.queryStringParameters??{});if(!query.success)return reply(400,{message:'Check library filters and page size.'});
      const [records,reviews]=await Promise.all([listJobs(sub),listReviews(sub)]);const page=videoLibrary(records.map(r=>r.job),reviews,query.data,sub);
      const jobs=await Promise.all(page.jobs.map(async item=>{const record=records.find(r=>r.job.jobId===item.jobId)!;const signed=await media(record.job,sub);return{...item,posterUrl:signed.posterUrl,mediaExpired:signed.mediaExpired,mediaExpiresAt:signed.mediaExpiresAt};}));return reply(200,{...page,jobs});
    }
    if(route==='/videos/validate'&&method==='POST'){
      const body=readJson(event,128000);if('response' in body)return body.response;
      const raw:unknown=body.value;return reply(200,validateVideoRequest(raw,hostedConfig(enabled)));
    }
    const reviewMatch=/^\/videos\/([a-f0-9-]{36})\/review$/.exec(route);
    if(reviewMatch&&(method==='GET'||method==='PUT')){
      const record=await findJob(sub,reviewMatch[1]!);if(!record)return reply(404,{message:'Video not found.'});
      if(method==='GET')return reply(200,await getReview(sub,record.job.jobId));
      const body=readJson(event,16000);if('response' in body)return body.response;
      const raw:unknown=body.value;const parsed=VideoReviewPatchSchema.safeParse(raw);if(!parsed.success)return reply(422,{message:'Check the review action and version.'});return reply(200,await saveReview(sub,record.job,parsed.data));
    }
    if(route==='/images/search'&&method==='POST'){
      const body=readJson(event,16000,{optional:true});if('response' in body)return body.response;const raw:unknown=body.value;
      const input=ImageSearchInputSchema.safeParse(raw);if(!input.success)return reply(422,{message:'Enter an image query.'});
      try{return reply(200,await searchBrollImage(input.data,'/tmp/brainrotten-image-search'));}catch(error){return reply(502,{message:error instanceof Error?error.message:'Image search failed.'});}
    }
    if(route==='/me')return reply(200,{quota:await quota(sub)});
    if(route==='/videos'&&method==='GET'){const jobs=(await listJobs(sub)).sort((a,b)=>b.job.createdAt.localeCompare(a.job.createdAt));return reply(200,{jobs:await Promise.all(jobs.map(r=>media(r.job,sub)))});}
    const sessionLesson=/^\/sessions\/([a-f0-9-]{36})\/videos$/.exec(route);
    if((route==='/videos'||sessionLesson)&&method==='POST'){
      const body=readJson(event,128000);if('response' in body)return body.response;
      let raw:unknown=body.value;
      if(sessionLesson){const session=await findSession(sub,sessionLesson[1]!);if(!session)return reply(404,{message:'Learning session not found.'});try{raw=prepareSessionLesson(session,raw);}catch{return reply(422,{message:'Session lessons require a complete script and comprehension questions.'});}}
      const parsed=GenerateVideoInputSchema.safeParse(raw);if(!parsed.success)return reply(422,{message:'Invalid video request. Check the script, cast, and duration.'});
      const retired=retiredFormatMessage(parsed.data.format);if(retired)return reply(422,{message:retired});
      if(parsed.data.sessionId&&!await findSession(sub,parsed.data.sessionId))return reply(404,{message:'Learning session not found.'});
      if(parsed.data.script){try{parsed.data.script=scriptForFormat(parsed.data.script,parsed.data.format,parsed.data.participants,parsed.data.narrator);parsed.data.participants=parsed.data.script.participants;parsed.data.narrator=parsed.data.script.narrator;}catch{return reply(422,{message:'Use two alternating speakers for a skit, or one narrator with setup, investigate, escalate and resolve scenes for a story.'});}}
      if(parsed.data.voiceBackend==='maya-local')return reply(422,{message:'The local voice engine runs on your own computer. Hosted trials use the configured project voices.'});
      if(parsed.data.voiceIds)return reply(422,{message:'Hosted trials use the project’s character clones. Use local MCP for custom voice IDs.'});
      const {record,created}=await reserveJob(sub,parsed.data);
      if(created){try{await sqs.send(new SendMessageCommand({QueueUrl:process.env['JOB_QUEUE_URL']!,MessageBody:JSON.stringify({sub,jobId:record.job.jobId})}));}catch{
        // A timed-out send may still have enqueued. Preserve the reservation; do not enqueue twice or refund blindly.
        await markQueueUncertain(record);return reply(202,(await findJob(sub,record.job.jobId))?.job??record.job);
      }}
      return reply(202,await media(record.job,sub));
    }
    const learningMatch=/^\/videos\/([a-f0-9-]{36})\/learning$/.exec(route);
    if(learningMatch&&method==='GET'){const record=await findJob(sub,learningMatch[1]!);return record?.job.state==='ready'&&record.job.learning?reply(200,record.job.learning):reply(404,{message:'Learning pack not found or not ready.'});}
    const match=/^\/videos\/([a-f0-9-]{36})$/.exec(route);if(match&&method==='GET'){const record=await findJob(sub,match[1]!);return record?reply(200,await media(record.job,sub)):reply(404,{message:'Video not found.'});}
    return reply(404,{message:'Not found.'});
  }catch(error){if(error instanceof SessionReviewConflictError)return reply(409,{code:'version_conflict',message:error.message,sessionReview:error.review});if(error instanceof ReviewConflictError)return reply(409,{code:'version_conflict',message:error.message,review:error.review});if(error instanceof ReviewInputError)return reply(422,{message:error.message});if(error instanceof LibraryCursorError)return reply(400,{message:error.message});if(error instanceof TrialLimitError)return reply(403,{code:'trial_limit_reached',message:error.message});if(error instanceof RequestConflictError)return reply(409,{code:'request_conflict',message:error.message});console.error('Hosted API operation failed',{name:error instanceof Error?error.name:'UnknownError',requestId:event.requestContext.requestId});return reply(503,{message:'The hosted service is temporarily unavailable.'});}
}
