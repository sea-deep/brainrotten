import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {SQSEvent} from 'aws-lambda';
import {GetSecretValueCommand,SecretsManagerClient} from '@aws-sdk/client-secrets-manager';
import {S3Client} from '@aws-sdk/client-s3';
import {GenerateVideoInputSchema,LearningPackSchema} from '@brainrot/contracts';
import {GenerationError} from '@brainrot/media';
import * as store from './store.js';
import * as mediaModule from '@brainrot/media';
import {handler} from './worker.js';
import type {HostedJob} from './store.js';

describe('hosted worker speech protection and lifecycle',()=>{
  const fakeSecretArn='arn:aws:secretsmanager:us-east-1:123456789012:secret:brainrotten/providers';
  const fakeBucket='test-media-bucket';
  const fakeSub='alice';
  const fakeJobId='22222222-2222-4222-8222-222222222222';

  const makeRecord=(overrides:Partial<HostedJob>={}):HostedJob=>({
    pk:`USER#${fakeSub}`,
    sk:`JOB#${fakeJobId}`,
    owner:fakeSub,
    hash:'fake-hash',
    input:GenerateVideoInputSchema.parse({prompt:'Test prompt',cast:'auto',language:'hinglish'}),
    job:{
      jobId:fakeJobId,
      state:'queued',
      stage:'queued',
      progress:0,
      prompt:'Test prompt',
      title:null,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      videoUrl:null,
      posterUrl:null,
      audioUrl:null,
      error:null,
      voiceBackend:'elevenlabs',
      cast:'auto',
      language:'hinglish',
    },
    ...overrides,
  });

  const makeSqsEvent=(sub=fakeSub,jobId=fakeJobId):SQSEvent=>({
    Records:[
      {
        messageId:'msg-1',
        receiptHandle:'handle-1',
        body:JSON.stringify({sub,jobId}),
        attributes:{} as never,
        messageAttributes:{},
        md5OfBody:'hash',
        eventSource:'aws:sqs',
        eventSourceARN:'arn:aws:sqs:us-east-1:123456789012:test-queue',
        awsRegion:'us-east-1',
      },
    ],
  });

  beforeEach(()=>{
    vi.stubEnv('PROVIDER_SECRET_ARN',fakeSecretArn);
    vi.stubEnv('S3_BUCKET',fakeBucket);
    vi.stubEnv('BRAINROTTEN_ROOT','/tmp');
    vi.spyOn(SecretsManagerClient.prototype,'send').mockImplementation(async(command:unknown)=>{
      if(command instanceof GetSecretValueCommand){
        return{
          SecretString:JSON.stringify({
            ELEVENLABS_API_KEY:'synthetic-elevenlabs-key-12345',
            CHARACTER_VOICES_JSON:{oggy:{id:'oggy-id',name:'Oggy',status:'ready'},jack:{id:'jack-id',name:'Jack',status:'ready'}},
          }),
        };
      }
      throw new Error('Unexpected Secrets Manager command');
    });
  });

  afterEach(()=>{
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uploads all eight artifacts and persists the learning pack after one generation',async()=>{
    const fs=await import('node:fs/promises'),path=await import('node:path');const record=makeRecord();vi.spyOn(store,'findJob').mockResolvedValue(record);vi.spyOn(store,'claim').mockResolvedValue(true);const uploads:string[]=[];vi.spyOn(S3Client.prototype,'send').mockImplementation(async(command:unknown)=>{uploads.push((command as {input:{Key:string}}).input.Key);return{};});
    const learning=LearningPackSchema.parse({schemaVersion:'BrainrottenLearningPackV1',jobId:fakeJobId,format:'whiteboard',title:'Payment',language:'en',durationSeconds:2,takeaway:'Reuse the key.',chapters:[{id:'retry',title:'Retry',startMs:0,endMs:2000}],questions:[],transcript:[{turnIndex:0,speaker:'jhatka',text:'Reuse the key.',startMs:0,endMs:2000}]});
    const generation=vi.spyOn(mediaModule,'generateVideoArtifact').mockImplementation(async(_input,options)=>{await fs.mkdir(options.outputDir,{recursive:true});for(const file of ['video.mp4','poster.png','audio.mp3','manifest.json','learning.json','notes.md','captions.srt','flashcards.csv'])await fs.writeFile(path.join(options.outputDir,file),'offline fixture');options.onUpdate?.({stage:'rendering',learning});return{title:'Payment',script:{title:'Payment',dialogue:[]},voice:{audioPath:'fixture',durationSeconds:2,segments:[],words:[]},backgroundName:'Whiteboard diagrams',sourceCredits:[],learning};});
    const saved=vi.spyOn(store,'putJob').mockResolvedValue();const result=await handler(makeSqsEvent(),{} as never,()=>undefined) as {batchItemFailures:unknown[]};expect(result.batchItemFailures).toEqual([]);expect(generation).toHaveBeenCalledTimes(1);expect(uploads).toHaveLength(8);expect(uploads).toContain(`${fakeSub}/${fakeJobId}/captions.srt`);expect(saved).toHaveBeenLastCalledWith(record,expect.objectContaining({state:'ready',learning}));
  });

  it('skips speech generation when job is already claimed or no longer queued',async()=>{
    const record=makeRecord({job:{...makeRecord().job,state:'processing'}});
    vi.spyOn(store,'findJob').mockResolvedValue(record);
    vi.spyOn(store,'claim').mockResolvedValue(false);
    const generateSpy=vi.spyOn(mediaModule,'generateVideoArtifact');
    const putJobSpy=vi.spyOn(store,'putJob').mockResolvedValue();

    const response=await handler(makeSqsEvent(),{} as never,()=>undefined) as{batchItemFailures:unknown[]};
    expect(response.batchItemFailures).toEqual([]);
    expect(generateSpy).not.toHaveBeenCalled();
    expect(putJobSpy).not.toHaveBeenCalled();
  });

  it('marks expired lease as needs_review without retrying speech',async()=>{
    const expiredRecord=makeRecord({
      job:{...makeRecord().job,state:'processing'},
      leaseUntil:Date.now()-10000,
    });
    vi.spyOn(store,'findJob').mockResolvedValue(expiredRecord);
    vi.spyOn(store,'claim').mockResolvedValue(false);
    const putJobSpy=vi.spyOn(store,'putJob').mockResolvedValue();
    const generateSpy=vi.spyOn(mediaModule,'generateVideoArtifact');

    const response=await handler(makeSqsEvent(),{} as never,()=>undefined) as{batchItemFailures:unknown[]};
    expect(response.batchItemFailures).toEqual([]);
    expect(generateSpy).not.toHaveBeenCalled();
    expect(putJobSpy).toHaveBeenCalledWith(
      expiredRecord,
      expect.objectContaining({state:'needs_review',stage:'failed'})
    );
  });

  it('calls failAndRefund when generation fails during scripting',async()=>{
    const record=makeRecord();
    vi.spyOn(store,'findJob').mockResolvedValue(record);
    vi.spyOn(store,'claim').mockResolvedValue(true);
    vi.spyOn(mediaModule,'generateVideoArtifact').mockImplementation(async(_input,options)=>{
      options?.onUpdate?.({stage:'scripting',progress:10});
      throw new GenerationError('Invalid script topic',false);
    });
    const refundSpy=vi.spyOn(store,'failAndRefund').mockResolvedValue();
    const putJobSpy=vi.spyOn(store,'putJob').mockResolvedValue();

    const response=await handler(makeSqsEvent(),{} as never,()=>undefined) as{batchItemFailures:unknown[]};
    expect(response.batchItemFailures).toEqual([]);
    expect(refundSpy).toHaveBeenCalledWith(record,'Invalid script topic');
    expect(putJobSpy).not.toHaveBeenCalledWith(
      record,
      expect.objectContaining({state:'needs_review'})
    );
  });

  it('holds reservation in needs_review on uncertain speech failure and never refunds',async()=>{
    const record=makeRecord();
    vi.spyOn(store,'findJob').mockResolvedValue(record);
    vi.spyOn(store,'claim').mockResolvedValue(true);
    vi.spyOn(S3Client.prototype,'send').mockResolvedValue({} as never);
    vi.spyOn(mediaModule,'generateVideoArtifact').mockImplementation(async(_input,options)=>{
      options?.onUpdate?.({stage:'voicing',progress:40});
      throw new GenerationError('Speech connection was lost. Automatic retries stopped because billing may have occurred.',true);
    });
    const refundSpy=vi.spyOn(store,'failAndRefund').mockResolvedValue();
    const putJobSpy=vi.spyOn(store,'putJob').mockResolvedValue();

    const response=await handler(makeSqsEvent(),{} as never,()=>undefined) as{batchItemFailures:unknown[]};
    expect(response.batchItemFailures).toEqual([]);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(putJobSpy).toHaveBeenCalledWith(
      record,
      expect.objectContaining({state:'needs_review',stage:'failed'})
    );
  });
});

describe('job telemetry',()=>{
  it('writes one CloudWatch metric line with the outcome and the user-facing error',async()=>{
    const {jobTelemetry}=await import('./worker.js');
    const line=JSON.parse(jobTelemetry({jobId:'j1',format:'skit',ok:false,stage:'scripting',jobSeconds:12.4,queueWaitSeconds:3.6,error:'Gemini script request failed (HTTP 503).'}));
    expect(line._aws.CloudWatchMetrics[0].Namespace).toBe('Brainrotten');
    expect(line).toMatchObject({Format:'skit',JobFailed:1,JobSucceeded:0,JobSeconds:12,QueueWaitSeconds:4,outcome:'failed',error:'Gemini script request failed (HTTP 503).'});
  });
});
