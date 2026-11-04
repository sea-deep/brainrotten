import type {SQSHandler} from 'aws-lambda';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod/v4';
import type {VideoJob} from '@brainrot/contracts';
import {generateVideoArtifact,GenerationError} from '@brainrot/media';
import {findJob,claim,putJob,failAndRefund} from './store.js';
const secrets=new SecretsManagerClient({}),s3=new S3Client({});
/**
 * One structured log line per finished job. CloudWatch turns the _aws block into metrics (namespace Brainrotten,
 * by format): JobSucceeded, JobFailed, JobSeconds and QueueWaitSeconds. Errors are the user-facing message only.
 */
export function jobTelemetry(entry:{jobId:string;format:string;ok:boolean;stage:string;jobSeconds:number;queueWaitSeconds:number;error?:string}):string{
  return JSON.stringify({_aws:{Timestamp:Date.now(),CloudWatchMetrics:[{Namespace:'Brainrotten',Dimensions:[['Format']],Metrics:[
    {Name:'JobSucceeded',Unit:'Count'},{Name:'JobFailed',Unit:'Count'},{Name:'JobSeconds',Unit:'Seconds'},{Name:'QueueWaitSeconds',Unit:'Seconds'}]}]},
    event:'video-job',Format:entry.format,JobSucceeded:entry.ok?1:0,JobFailed:entry.ok?0:1,JobSeconds:Math.round(entry.jobSeconds),QueueWaitSeconds:Math.round(entry.queueWaitSeconds),
    jobId:entry.jobId,outcome:entry.ok?'ready':'failed',stage:entry.stage,...(entry.error?{error:entry.error.slice(0,300)}:{})});
}
const secretSchema=z.object({ELEVENLABS_API_KEY:z.string().min(10),PAPER_API_KEY:z.string().min(10).optional(),GEMINI_API_KEY:z.string().min(10).optional(),GEMINI_MODEL:z.string().optional(),BRAVE_SEARCH_API_KEY:z.string().min(10).optional(),CHARACTER_VOICES_JSON:z.record(z.string(),z.unknown())});
let secretLoaded=false;
async function configure(){if(secretLoaded)return;const result=await secrets.send(new GetSecretValueCommand({SecretId:process.env['PROVIDER_SECRET_ARN']!}));const value=secretSchema.parse(JSON.parse(result.SecretString??'{}'));process.env['ELEVENLABS_API_KEY']=value.ELEVENLABS_API_KEY;if(value.GEMINI_API_KEY)process.env['GEMINI_API_KEY']=value.GEMINI_API_KEY;if(value.GEMINI_MODEL)process.env['GEMINI_MODEL']=value.GEMINI_MODEL;if(value.PAPER_API_KEY)process.env['PAPER_API_KEY']=value.PAPER_API_KEY;if(value.BRAVE_SEARCH_API_KEY)process.env['BRAVE_SEARCH_API_KEY']=value.BRAVE_SEARCH_API_KEY;process.env['CHARACTER_VOICES_JSON']=JSON.stringify(value.CHARACTER_VOICES_JSON);process.env['BRAINROTTEN_MODE']='hosted';process.env['BRAINROT_SKIP_ENV']='1';secretLoaded=true;}
async function archiveRecovery(directory:string,prefix:string):Promise<void>{
  async function upload(folder:string):Promise<void>{for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await upload(file);else if(entry.isFile()&&(/\.(mp3|json|txt)$/.test(entry.name)||entry.name==='requested')){const info=await fs.stat(file);await s3.send(new PutObjectCommand({Bucket:process.env['S3_BUCKET']!,Key:`${prefix}/recovery/${path.relative(directory,file)}`,Body:createReadStream(file),ContentLength:info.size,ContentType:'application/octet-stream',ServerSideEncryption:'AES256'}));}}}
  await upload(directory);
}
export const handler:SQSHandler=async event=>{
  // Scheduled keep-warm ping: no queue records, nothing to render.
  if(!Array.isArray((event as {Records?:unknown}).Records))return{batchItemFailures:[]};
  const batchItemFailures:Array<{itemIdentifier:string}>=[];
  for(const message of event.Records){
    let payload:{sub:string;jobId:string};try{payload=z.object({sub:z.string().regex(/^[\w-]{1,150}$/),jobId:z.string().uuid()}).parse(JSON.parse(message.body));}catch{console.error('Invalid queue message',{messageId:message.messageId});continue;}
    // Configure before claiming: a transient Secrets/Dynamo outage is safe to retry without speech billing.
    let record;try{await configure();record=await findJob(payload.sub,payload.jobId);if(!record)continue;if(!await claim(record)){if(record.job.state==='processing'&&record.leaseUntil&&record.leaseUntil<Date.now())await putJob(record,{...record.job,state:'needs_review',stage:'failed',error:'The worker stopped before finishing. Reservation held for review; speech will not retry automatically.'});continue;}}catch{batchItemFailures.push({itemIdentifier:message.messageId});continue;}
    const directory=path.join('/tmp/brainrotten',payload.jobId);
    const started=Date.now(),queueWaitSeconds=Math.max(0,(started-Date.parse(record.job.createdAt))/1000);
    let current:VideoJob={...record.job,state:'processing'};let pending=Promise.resolve(),lastSaved=0;
    try{
      const result=await generateVideoArtifact(record.input,{jobId:payload.jobId,dataDir:directory,outputDir:directory,onUpdate:update=>{current={...current,...update};if(Date.now()-lastSaved>3000){lastSaved=Date.now();const snapshot={...current};pending=pending.then(()=>putJob(record,snapshot)).catch(()=>{});}}});
      for(const[name,type]of[['video.mp4','video/mp4'],['poster.png','image/png'],['audio.mp3','audio/mpeg'],['manifest.json','application/json'],['learning.json','application/json'],['notes.md','text/markdown; charset=utf-8'],['captions.srt','application/x-subrip'],['flashcards.csv','text/csv; charset=utf-8']]){
        const file=path.join(directory,name!),info=await fs.stat(file);await s3.send(new PutObjectCommand({Bucket:process.env['S3_BUCKET']!,Key:`${payload.sub}/${payload.jobId}/${name}`,Body:createReadStream(file),ContentLength:info.size,ContentType:type!,ServerSideEncryption:'AES256'}));
      }
      await pending;
      await putJob(record,{...current,state:'ready',stage:'ready',progress:100,title:result.title,learning:result.learning,durationSeconds:result.voice.durationSeconds,backgroundName:result.backgroundName,sourceCredits:result.sourceCredits});
      console.log(jobTelemetry({jobId:payload.jobId,format:record.job.format??record.input.format??'unknown',ok:true,stage:'ready',jobSeconds:(Date.now()-started)/1000,queueWaitSeconds}));
    }catch(error){
      const known=error instanceof GenerationError;
      const isUncertain=Boolean(known&&error.uncertain);
      try{await archiveRecovery(directory,`${payload.sub}/${payload.jobId}`);}catch{console.error('Recovery upload unavailable',{jobId:payload.jobId});}
      await pending;
      // Only an uncertain speech request (it may have been billed) is held for review. Anything else, including a bug
      // on our side after the voices were made, fails clearly and returns the free video so the user can retry.
      try{if(!isUncertain)await failAndRefund(record,known?error.message:'Something went wrong on our side while making this video. Your free video was returned; please try again.');else await putJob(record,{...current,state:'needs_review',stage:'failed',error:known?error.message:'Generation was interrupted. The trial reservation is held for review; it will not automatically synthesize again.'});}catch{console.error('Could not persist worker outcome',{jobId:payload.jobId});}
      console.error(jobTelemetry({jobId:payload.jobId,format:record.job.format??record.input.format??'unknown',ok:false,stage:current.stage,jobSeconds:(Date.now()-started)/1000,queueWaitSeconds,error:known?error.message:`${error instanceof Error?error.name:'UnknownError'}: ${error instanceof Error?error.message:''}`}));
    }finally{await fs.rm(directory,{recursive:true,force:true});}
  }
  return{batchItemFailures};
};
