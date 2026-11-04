#!/usr/bin/env node
// Returns the free video for hosted jobs stuck "on hold for review" (state needs_review), marking them failed with
// a clear message so the user can retry. Jobs that are ready, already refunded, or not on hold are left alone.
//   pnpm ops:refund <jobId> [jobId…]
// Needs AWS credentials that can write the jobs table. Run pnpm build first (it uses apps/cloud/dist).
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ids=process.argv.slice(2);
if(!ids.length||ids.some(id=>!/^[0-9a-f-]{36}$/.test(id))){console.error('Usage: pnpm ops:refund <jobId> [jobId…]');process.exit(1);}
const region=process.env.AWS_REGION??'ap-south-1',stack=process.env.API_STACK??'brainrotten-api';
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
process.env.AWS_REGION=region;
process.env.DYNAMODB_TABLE=aws(['cloudformation','describe-stack-resources','--stack-name',stack]).StackResources.find(r=>r.LogicalResourceId==='JobsTable').PhysicalResourceId;
const {findJob,failAndRefund,quota}=await import(path.join(root,'apps/cloud/dist/store.js'));

for(const id of ids){
  // The job key includes its owner; find it without needing the user id.
  const found=aws(['dynamodb','scan','--table-name',process.env.DYNAMODB_TABLE,'--filter-expression','sk = :sk','--expression-attribute-values',JSON.stringify({':sk':{S:`JOB#${id}`}}),'--projection-expression','pk']).Items?.[0];
  if(!found){console.log(`${id.slice(0,8)}: not found`);continue;}
  const sub=found.pk.S.replace(/^USER#/,'');
  const record=await findJob(sub,id);
  if(record.job.state!=='needs_review'||record.refunded){console.log(`${id.slice(0,8)}: left alone (${record.job.state}${record.refunded?', already refunded':''})`);continue;}
  const before=(await quota(sub)).remaining;
  await failAndRefund(record,'Something went wrong on our side while making this video. It is fixed now, and your free video was returned; please try again.');
  console.log(`${id.slice(0,8)}: refunded, free videos left ${before} → ${(await quota(sub)).remaining}`);
}
