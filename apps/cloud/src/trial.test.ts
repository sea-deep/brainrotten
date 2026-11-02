import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {GetCommand,TransactWriteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {SQSClient} from '@aws-sdk/client-sqs';
import {GenerateVideoInputSchema,LearningPackSchema,videoRequestPayload} from '@brainrot/contracts';
import {db,reserveJob,quota,findJob,TrialLimitError,RequestConflictError} from './store.js';
import {handler} from './api.js';
import type {APIGatewayProxyEventV2} from 'aws-lambda';
vi.mock('@aws-sdk/s3-request-presigner',()=>({getSignedUrl:async(_client:unknown,command:{input:{Key:string}})=>'https://signed.example/'+command.input.Key}));
const rows=new Map<string,Record<string,unknown>>();
const key=(pk:unknown,sk:unknown)=>`${pk}/${sk}`;
beforeEach(()=>{
  rows.clear();
  vi.stubEnv('HOSTED_ENABLED','true');
  vi.stubEnv('DYNAMODB_TABLE','test-only');
  vi.stubEnv('JOB_QUEUE_URL','https://sqs.us-east-1.amazonaws.com/123456789012/test-queue');
  vi.stubEnv('COGNITO_ISSUER','https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TESTPOOL');
  vi.stubEnv('COGNITO_CLIENT_ID','test-client-id');
  vi.stubEnv('COGNITO_DOMAIN','https://test-auth.auth.us-east-1.amazoncognito.com');
  vi.stubEnv('S3_BUCKET','test-media-bucket');
  vi.spyOn(db,'send').mockImplementation((async(command:unknown)=>{
    if(command instanceof GetCommand){const k=command.input.Key!;return{Item:rows.get(key(k['pk'],k['sk']))};}
    if(command instanceof TransactWriteCommand){
      const tx=command.input.TransactItems!,update=tx[0]!.Update!,pk=update.Key!['pk'];
      const q=rows.get(key(pk,'QUOTA'))??{used:0};
      const request=tx[2]!.Put!.Item!;
      if(Number(q['used'])>=5||rows.has(key(request['pk'],request['sk'])))throw Object.assign(new Error('cancelled'),{name:'TransactionCanceledException'});
      rows.set(key(pk,'QUOTA'),{used:Number(q['used'])+1});
      for(const item of tx){if(item.Put){const value=item.Put.Item!;rows.set(key(value['pk'],value['sk']),value);}}
      return{};
    }
    if(command instanceof UpdateCommand){
      const k=command.input.Key!;
      const current=rows.get(key(k['pk'],k['sk']));
      if(current&&command.input.UpdateExpression?.includes('job.#state = :review')){
        const job=(current['job']??{}) as Record<string,unknown>;
        rows.set(key(k['pk'],k['sk']),{...current,job:{...job,state:'needs_review',stage:'failed',error:'Queue delivery is uncertain. The trial reservation is held for review.'}});
      }
      return{};
    }
    throw new Error('Unexpected DynamoDB operation');
  }) as typeof db.send);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('five lifetime videos',()=>{
  it('atomically reserves five slots when six concurrent requests race',async()=>{
    const results=await Promise.allSettled(Array.from({length:6},(_,i)=>reserveJob('alice',GenerateVideoInputSchema.parse({prompt:`Concept ${i}`,requestId:`request-${i}`}))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(5);
    const rejected=results.find(r=>r.status==='rejected');expect(rejected?.status==='rejected'&&rejected.reason).toBeInstanceOf(TrialLimitError);
    expect(await quota('alice')).toEqual({used:5,limit:5,remaining:0});
  });
  it('does not spend another slot when the same submission races or retries',async()=>{
    const input=GenerateVideoInputSchema.parse({prompt:'Explain DNS caching',requestId:'stable-request'});
    const results=await Promise.all(Array.from({length:8},()=>reserveJob('alice',input)));
    expect(new Set(results.map(r=>r.record.job.jobId)).size).toBe(1);
    expect(results.filter(r=>r.created)).toHaveLength(1);
    expect((await quota('alice')).used).toBe(1);
    await expect(reserveJob('alice',{...input,prompt:'Different topic'})).rejects.toBeInstanceOf(RequestConflictError);
  });
  it('scopes ownership and quotas to the authenticated subject',async()=>{
    const result=await reserveJob('alice',GenerateVideoInputSchema.parse({prompt:'A concept'}));
    expect(await findJob('bob',result.record.job.jobId)).toBeUndefined();expect((await quota('bob')).remaining).toBe(5);
  });
  it('permits distinct users to submit with the same requestId without collision',async()=>{
    const inputAlice=GenerateVideoInputSchema.parse({prompt:'Concept for Alice',requestId:'shared-request-id'});
    const inputBob=GenerateVideoInputSchema.parse({prompt:'Concept for Bob',requestId:'shared-request-id'});
    const resAlice=await reserveJob('alice',inputAlice);
    const resBob=await reserveJob('bob',inputBob);
    expect(resAlice.record.job.jobId).not.toBe(resBob.record.job.jobId);
    expect(resAlice.created).toBe(true);
    expect(resBob.created).toBe(true);
    expect((await quota('alice')).used).toBe(1);
    expect((await quota('bob')).used).toBe(1);
  });
  it('marks job needs_review when SQS delivery fails and avoids duplicate send on retry',async()=>{
    let sqsCalls=0;
    vi.spyOn(SQSClient.prototype,'send').mockImplementation(async()=>{
      sqsCalls++;
      throw new Error('SQS service unavailable');
    });
    const makeEvent=(sub:string,body:unknown):APIGatewayProxyEventV2=>({
      rawPath:'/api/v1/videos',
      body:JSON.stringify(body),
      requestContext:{
        requestId:'req-sqs-fail',
        http:{method:'POST'},
        authorizer:{jwt:{claims:{iss:'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TESTPOOL',client_id:'test-client-id',token_use:'access',sub}}}
      }
    } as unknown as APIGatewayProxyEventV2);
    const event=makeEvent('alice',{prompt:'Explain TCP',requestId:'sqs-fail-id'});
    const res1=await handler(event) as{statusCode:number;body:string};
    expect(res1.statusCode).toBe(202);
    const job1=JSON.parse(res1.body);
    expect(job1.state).toBe('needs_review');
    expect(sqsCalls).toBe(1);
    expect((await quota('alice')).used).toBe(1);

    // Retrying with the same requestId returns the existing job and does NOT trigger SQS again
    const res2=await handler(event) as{statusCode:number;body:string};
    expect(res2.statusCode).toBe(202);
    const job2=JSON.parse(res2.body);
    expect(job2.jobId).toBe(job1.jobId);
    expect(sqsCalls).toBe(1);
    expect((await quota('alice')).used).toBe(1);
  });
  it('rejects tokens with ID token_use, mismatched issuer or mismatched client_id',async()=>{
    const makeAuthEvent=(claims:Record<string,unknown>):APIGatewayProxyEventV2=>({
      rawPath:'/api/v1/videos',
      body:JSON.stringify({prompt:'Test'}),
      requestContext:{
        requestId:'test',
        http:{method:'POST'},
        authorizer:{jwt:{claims}}
      }
    } as unknown as APIGatewayProxyEventV2);
    // ID token rejected
    const idResult=await handler(makeAuthEvent({iss:'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TESTPOOL',client_id:'test-client-id',token_use:'id',sub:'alice'})) as{statusCode:number};
    expect(idResult.statusCode).toBe(401);
    // Wrong issuer rejected
    const issResult=await handler(makeAuthEvent({iss:'https://evil.com',client_id:'test-client-id',token_use:'access',sub:'alice'})) as{statusCode:number};
    expect(issResult.statusCode).toBe(401);
    // Wrong client ID rejected
    const clientResult=await handler(makeAuthEvent({iss:'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TESTPOOL',client_id:'wrong-client',token_use:'access',sub:'alice'})) as{statusCode:number};
    expect(clientResult.statusCode).toBe(401);
  });
  it('hosted /studio/config returns safe config and never exposes provider keys',async()=>{
    const event={rawPath:'/api/v1/studio/config',requestContext:{requestId:'cfg-test',http:{method:'GET'}}} as APIGatewayProxyEventV2;
    const result=await handler(event) as{statusCode:number;body:string};
    expect(result.statusCode).toBe(200);
    const body=JSON.parse(result.body);
    expect(body.mode).toBe('hosted');
    expect(body.voiceConfigured).toBe(true);
    expect(body.auth.configured).toBe(true);
    expect(result.body).not.toContain('sk_');
    expect(result.body).not.toContain('API_KEY');
    expect(body).not.toHaveProperty('ELEVENLABS_API_KEY');
  });
  it('rejects unauthenticated paid requests before touching storage',async()=>{
    vi.mocked(db.send).mockClear();
    const event={rawPath:'/api/v1/videos',body:'{}',requestContext:{requestId:'test',http:{method:'POST'}}} as APIGatewayProxyEventV2;
    const result=await handler(event) as{statusCode:number};expect(result.statusCode).toBe(401);expect(db.send).not.toHaveBeenCalled();
  });
  it('keeps the hosted service closed until explicitly enabled',async()=>{
    vi.stubEnv('HOSTED_ENABLED','false');vi.mocked(db.send).mockClear();const result=await handler({rawPath:'/api/v1/videos',requestContext:{http:{method:'POST'}}} as APIGatewayProxyEventV2) as{statusCode:number};expect(result.statusCode).toBe(503);expect(db.send).not.toHaveBeenCalled();
  });
});


describe('hosted learning output ownership',()=>{
  const event=(sub:string,path:string)=>({rawPath:path,requestContext:{requestId:'learning-test',http:{method:'GET'},authorizer:{jwt:{claims:{iss:process.env['COGNITO_ISSUER'],client_id:process.env['COGNITO_CLIENT_ID'],token_use:'access',sub}}}}} as unknown as APIGatewayProxyEventV2);
  it('returns the owner’s learning pack and denies other accounts without spending another slot',async()=>{const {record}=await reserveJob('alice',GenerateVideoInputSchema.parse({prompt:'A payment mystery',format:'whiteboard'}));const learning=LearningPackSchema.parse({schemaVersion:'BrainrottenLearningPackV1',jobId:record.job.jobId,format:'whiteboard',title:'Payment',language:'en',durationSeconds:2,takeaway:'Reuse the purchase key.',chapters:[{id:'retry',title:'Retry',startMs:0,endMs:2000}],questions:[],transcript:[{turnIndex:0,speaker:'jhatka',text:'Reuse the key.',startMs:0,endMs:2000}]});record.job={...record.job,state:'ready',stage:'ready',learning};rows.set(key(record.pk,record.sk),{...record});const path='/api/v1/videos/'+record.job.jobId;const response=await handler(event('alice',path+'/learning')) as {statusCode:number;body:string};expect(response.statusCode).toBe(200);expect(JSON.parse(response.body)).toEqual(learning);expect((await handler(event('bob',path+'/learning')) as {statusCode:number}).statusCode).toBe(404);const ready=await handler(event('alice',path)) as {body:string};expect(JSON.parse(ready.body).outputs).toMatchObject({learningUrl:expect.stringContaining('/alice/'),notesUrl:expect.stringContaining('notes.md'),captionsUrl:expect.stringContaining('captions.srt')});expect((await quota('alice')).used).toBe(1);});
  it('preserves old request fingerprints when additive defaults are introduced',async()=>{const {createHash}=await import('node:crypto');const input=GenerateVideoInputSchema.parse({prompt:'Old request',requestId:'old-retry'});const result=await reserveJob('alice',input);const expected=createHash('sha256').update(JSON.stringify({...videoRequestPayload(input),requestId:undefined})).digest('hex');expect(result.record.hash).toBe(expected);expect((await reserveJob('alice',{...input,format:'skit',quizCount:0})).created).toBe(false);});
});
