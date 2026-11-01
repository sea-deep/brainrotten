import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand,UpdateCommand,PutCommand} from '@aws-sdk/lib-dynamodb';
import {createHash,randomUUID} from 'node:crypto';
import {videoRequestPayload,VideoReviewSchema,emptyVideoReview,applyVideoReview,ReviewConflictError,type VideoReview,type ValidatedVideoInput,type VideoJob} from '@brainrot/contracts';
import {LearningSessionSchema,SessionReviewSchema,emptySessionReview,applySessionReview,SessionReviewConflictError,type LearningSession} from '@brainrot/contracts';
import {newLearningSession,sessionFingerprint,sessionPage} from '@brainrot/media';
export const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
export const table=()=>process.env['DYNAMODB_TABLE']!;
export interface HostedJob {pk:string;sk:string;owner:string;input:ValidatedVideoInput;job:VideoJob;hash:string;refunded?:boolean;leaseUntil?:number}
export class TrialLimitError extends Error{}
export class RequestConflictError extends Error{}
export function userKey(sub:string):string{return `USER#${sub}`;}
export async function findJob(sub:string,id:string):Promise<HostedJob|undefined>{return(await db.send(new GetCommand({TableName:table(),Key:{pk:userKey(sub),sk:`JOB#${id}`},ConsistentRead:true}))).Item as HostedJob|undefined;}
export async function quota(sub:string):Promise<{used:number;limit:number;remaining:number}>{const result=await db.send(new GetCommand({TableName:table(),Key:{pk:userKey(sub),sk:'QUOTA'},ConsistentRead:true}));const used=Number(result.Item?.['used']??0);return{used,limit:5,remaining:Math.max(0,5-used)};}
async function ownerRows(sub:string,prefix:string):Promise<Record<string,unknown>[]>{
  const items:Record<string,unknown>[]=[],seen=new Set<string>();let cursor:Record<string,unknown>|undefined;
  do{const result=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'pk = :pk AND begins_with(sk, :prefix)',ExpressionAttributeValues:{':pk':userKey(sub),':prefix':prefix},ConsistentRead:true,...(cursor?{ExclusiveStartKey:cursor}:{})}));items.push(...(result.Items??[]));cursor=result.LastEvaluatedKey;if(cursor){const value=JSON.stringify(cursor);if(seen.has(value))throw new Error('Library pagination stalled');seen.add(value);}}while(cursor);
  return items;
}
export async function listJobs(sub:string):Promise<HostedJob[]>{return await ownerRows(sub,'JOB#') as unknown as HostedJob[];}
export async function findSession(sub:string,id:string):Promise<LearningSession|undefined>{const result=await db.send(new GetCommand({TableName:table(),Key:{pk:userKey(sub),sk:`SESSION#${id}`},ConsistentRead:true}));return result.Item?LearningSessionSchema.parse(result.Item['session']):undefined;}
export async function createSession(sub:string,raw:unknown):Promise<LearningSession>{
  const session=newLearningSession(raw,sub),hash=sessionFingerprint(raw);
  const existing=await findSession(sub,session.sessionId);if(existing){if(sessionFingerprint(existing)!==hash)throw new RequestConflictError('Session request ID was already used for different context.');return existing;}
  try{await db.send(new PutCommand({TableName:table(),Item:{pk:userKey(sub),sk:`SESSION#${session.sessionId}`,session,hash},ConditionExpression:'attribute_not_exists(pk)'}));return session;}
  catch(error){if((error as Error).name!=='ConditionalCheckFailedException')throw error;const raced=await findSession(sub,session.sessionId);if(!raced||sessionFingerprint(raced)!==hash)throw new RequestConflictError('Session request ID was already used for different context.');return raced;}
}
export async function listSessions(sub:string,query:unknown){const rows=await ownerRows(sub,'SESSION#');return sessionPage(rows.map(row=>LearningSessionSchema.parse(row['session'])),query);}
export async function getSessionReview(sub:string,id:string){const result=await db.send(new GetCommand({TableName:table(),Key:{pk:userKey(sub),sk:`SESSIONREVIEW#${id}`},ConsistentRead:true}));return result.Item?SessionReviewSchema.parse(result.Item['review']):emptySessionReview(id);}
export async function saveSessionReview(sub:string,id:string,raw:unknown){
  const current=await getSessionReview(sub,id),next=applySessionReview(current,raw);
  try{await db.send(new PutCommand({TableName:table(),Item:{pk:userKey(sub),sk:`SESSIONREVIEW#${id}`,version:next.version,review:next},ConditionExpression:current.version===0?'attribute_not_exists(pk)':'#version = :expected',...(current.version?{ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':current.version}}:{})}));}
  catch(error){if((error as Error).name==='ConditionalCheckFailedException')throw new SessionReviewConflictError(await getSessionReview(sub,id));throw error;}
  return next;
}
export async function getReview(sub:string,id:string):Promise<VideoReview>{const result=await db.send(new GetCommand({TableName:table(),Key:{pk:userKey(sub),sk:`REVIEW#${id}`},ConsistentRead:true}));return result.Item?VideoReviewSchema.parse(result.Item['review']):emptyVideoReview(id);}
export async function listReviews(sub:string):Promise<Map<string,VideoReview>>{const rows=await ownerRows(sub,'REVIEW#');return new Map(rows.map(row=>{const review=VideoReviewSchema.parse(row['review']);return[review.jobId,review];}));}
export async function saveReview(sub:string,job:VideoJob,raw:unknown):Promise<VideoReview>{
  const current=await getReview(sub,job.jobId),next=applyVideoReview(current,raw,job);
  try{await db.send(new PutCommand({TableName:table(),Item:{pk:userKey(sub),sk:`REVIEW#${job.jobId}`,version:next.version,review:next},ConditionExpression:current.version===0?'attribute_not_exists(pk)':'#version = :expected',...(current.version?{ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':current.version}}:{})}));}
  catch(error){if((error as Error).name==='ConditionalCheckFailedException')throw new ReviewConflictError(await getReview(sub,job.jobId));throw error;}
  return next;
}
export async function reserveJob(sub:string,input:ValidatedVideoInput):Promise<{record:HostedJob;created:boolean}>{
  const pk=userKey(sub),requestId=input.requestId??randomUUID();
  const sk=`REQUEST#${createHash('sha256').update(requestId).digest('hex')}`;
  const hash=createHash('sha256').update(JSON.stringify({...videoRequestPayload(input),requestId:undefined})).digest('hex');
  const previous=async()=>{const value=(await db.send(new GetCommand({TableName:table(),Key:{pk,sk},ConsistentRead:true}))).Item;if(!value)return;if(value['hash']!==hash)throw new RequestConflictError('Request ID was already used for different content.');return findJob(sub,String(value['jobId']));};
  const existing=await previous();if(existing)return{record:existing,created:false};
  const now=new Date().toISOString(),id=randomUUID();
  const record:HostedJob={pk,sk:`JOB#${id}`,owner:sub,input,hash,job:{jobId:id,sessionId:input.sessionId,state:'queued',stage:'queued',progress:0,prompt:input.prompt??input.script?.title??'',title:input.title??input.script?.title??null,createdAt:now,updatedAt:now,videoUrl:null,error:null,voiceBackend:'elevenlabs',cast:input.cast,language:input.language,participants:input.participants,format:input.format,narrator:input.narrator}};
  try{await db.send(new TransactWriteCommand({TransactItems:[
    {Update:{TableName:table(),Key:{pk,sk:'QUOTA'},UpdateExpression:'SET used = if_not_exists(used, :zero) + :one',ConditionExpression:'attribute_not_exists(used) OR used < :limit',ExpressionAttributeValues:{':zero':0,':one':1,':limit':5}}},
    {Put:{TableName:table(),Item:record,ConditionExpression:'attribute_not_exists(pk)'}},
    {Put:{TableName:table(),Item:{pk,sk,jobId:id,hash},ConditionExpression:'attribute_not_exists(pk)'}},
  ]}));}catch(error){if((error as Error).name!=='TransactionCanceledException')throw error;const raced=await previous();if(raced)return{record:raced,created:false};if((await quota(sub)).remaining===0)throw new TrialLimitError('Your five lifetime videos are used. Run Studio or MCP locally with your own keys.');throw error;}
  return{record,created:true};
}
export async function claim(record:HostedJob):Promise<boolean>{try{await db.send(new UpdateCommand({TableName:table(),Key:{pk:record.pk,sk:record.sk},UpdateExpression:'SET job.#state = :processing, job.updatedAt = :now, leaseUntil = :lease',ConditionExpression:'job.#state = :queued',ExpressionAttributeNames:{'#state':'state'},ExpressionAttributeValues:{':processing':'processing',':queued':'queued',':now':new Date().toISOString(),':lease':Date.now()+960000}}));return true;}catch(error){if((error as Error).name==='ConditionalCheckFailedException')return false;throw error;}}
export async function putJob(record:HostedJob,job:VideoJob):Promise<void>{await db.send(new UpdateCommand({TableName:table(),Key:{pk:record.pk,sk:record.sk},UpdateExpression:'SET job = :job',ExpressionAttributeValues:{':job':{...job,updatedAt:new Date().toISOString()}}}));}
export async function failAndRefund(record:HostedJob,message:string):Promise<void>{
  const job={...record.job,state:'failed',stage:'failed',error:message,updatedAt:new Date().toISOString()};
  await db.send(new TransactWriteCommand({TransactItems:[
    {Update:{TableName:table(),Key:{pk:record.pk,sk:record.sk},UpdateExpression:'SET job = :job, refunded = :yes',ConditionExpression:'attribute_not_exists(refunded) AND job.#state <> :ready',ExpressionAttributeNames:{'#state':'state'},ExpressionAttributeValues:{':job':job,':yes':true,':ready':'ready'}}},
    {Update:{TableName:table(),Key:{pk:record.pk,sk:'QUOTA'},UpdateExpression:'SET used = used - :one',ConditionExpression:'used >= :one',ExpressionAttributeValues:{':one':1}}},
  ]}));
}

export async function markQueueUncertain(record:HostedJob):Promise<void>{try{await db.send(new UpdateCommand({TableName:table(),Key:{pk:record.pk,sk:record.sk},UpdateExpression:'SET job.#state = :review, job.stage = :failed, job.error = :error',ConditionExpression:'job.#state = :queued',ExpressionAttributeNames:{'#state':'state'},ExpressionAttributeValues:{':review':'needs_review',':failed':'failed',':queued':'queued',':error':'Queue delivery is uncertain. The trial reservation is held for review.'}}));}catch(error){if((error as Error).name!=='ConditionalCheckFailedException')throw error;}}
