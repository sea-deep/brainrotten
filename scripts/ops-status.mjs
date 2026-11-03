#!/usr/bin/env node
// Health of the hosted backend at a glance: the render queue, jobs waiting or running now, the last day's outcomes
// with failure reasons, and how often the script model had to fall back. Read-only; needs AWS read access.
//   pnpm ops:status            last 24 hours
//   pnpm ops:status 6          last 6 hours
import {execFileSync} from 'node:child_process';

const region=process.env.AWS_REGION??'ap-south-1',stack=process.env.API_STACK??'brainrotten-api';
const hours=Number(process.argv[2])||24,since=Date.now()-hours*3600_000;
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:64<<20})||'null');
const resources=aws(['cloudformation','describe-stack-resources','--stack-name',stack]).StackResources;
const physical=id=>resources.find(r=>r.LogicalResourceId===id)?.PhysicalResourceId;
const ago=ms=>{const s=Math.round(ms/1000);return s<90?`${s}s`:s<5400?`${Math.round(s/60)}m`:`${(s/3600).toFixed(1)}h`;};

// Queue
const depth=url=>aws(['sqs','get-queue-attributes','--queue-url',url,'--attribute-names','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible']).Attributes;
const queue=depth(physical('VideoQueue')),dead=depth(physical('DeadLetters'));
const mapping=aws(['lambda','get-event-source-mapping','--uuid',physical('WorkerQueue')]);
console.log(`Queue: ${queue.ApproximateNumberOfMessages} waiting, ${queue.ApproximateNumberOfMessagesNotVisible} rendering (max ${mapping.ScalingConfig?.MaximumConcurrency??'?'} at once), ${dead.ApproximateNumberOfMessages} in dead letters`);

// Jobs
const plain=value=>{const[[type,v]]=Object.entries(value);return type==='M'?Object.fromEntries(Object.entries(v).map(([k,w])=>[k,plain(w)])):type==='L'?v.map(plain):type==='N'?Number(v):v;};
const items=[];let start;
do{const page=aws(['dynamodb','scan','--table-name',physical('JobsTable'),'--filter-expression','begins_with(sk,:j)','--expression-attribute-values','{":j":{"S":"JOB#"}}',...(start?['--starting-token',start]:[])]);items.push(...page.Items);start=page.NextToken;}while(start);
const jobs=items.map(item=>({...plain(item.job),user:item.pk.S.slice(5,13)})).filter(job=>Date.parse(job.createdAt)>=since).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
const active=jobs.filter(job=>job.state==='queued'||job.state==='processing');
console.log(`\nNow: ${active.length?'':'nothing waiting or rendering'}`);
for(const job of active)console.log(`  ${job.state.padEnd(10)} ${job.format.padEnd(9)} ${job.stage} ${Math.round(job.progress??0)}%  for ${ago(Date.now()-Date.parse(job.createdAt))}  user ${job.user}`);

const done=jobs.filter(job=>job.state==='ready'),failed=jobs.filter(job=>job.state==='failed'||job.state==='needs_review');
const minutes=done.map(job=>(Date.parse(job.updatedAt)-Date.parse(job.createdAt))/60000).sort((a,b)=>a-b);
console.log(`\nLast ${hours}h: ${jobs.length} jobs from ${new Set(jobs.map(job=>job.user)).size} users: ${done.length} ready, ${failed.length} failed${minutes.length?`, median ${minutes[Math.floor(minutes.length/2)].toFixed(1)} min from click to video`:''}`);
// The same numbers since the worker was last deployed, so you can see whether a fix is working.
const deployed=Date.parse(aws(['lambda','get-function-configuration','--function-name',physical('Worker')]).LastModified);
const recent=jobs.filter(job=>Date.parse(job.createdAt)>=deployed);
const at=new Date(deployed).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'});
console.log(`Since the last backend deploy (${at} IST): ${recent.length} job${recent.length===1?'':'s'}, ${recent.filter(job=>job.state==='ready').length} ready, ${recent.filter(job=>job.state==='failed'||job.state==='needs_review').length} failed`);
console.log(`Failure reasons (last ${hours}h, time in IST):`);
const reasons=new Map();for(const job of failed){const reason=String(job.error?.message??job.error??'unknown').replace(/\(.*?\)/g,'(…)').slice(0,110);reasons.set(reason,(reasons.get(reason)??0)+1);}
const last=new Map();for(const job of failed){const reason=String(job.error?.message??job.error??'unknown').replace(/\(.*?\)/g,'(…)').slice(0,110);last.set(reason,job.createdAt);}
const clock=iso=>new Date(iso).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'});
for(const[reason,count]of[...reasons].sort((a,b)=>b[1]-a[1]))console.log(`  ${String(count).padStart(3)} × last ${clock(last.get(reason))}  ${reason}`);

// Script model fallbacks
const group=aws(['logs','describe-log-groups','--log-group-name-prefix',`${stack}-WorkerLogs`]).logGroups?.[0]?.logGroupName;
if(group){
  const events=aws(['logs','filter-log-events','--log-group-name',group,'--start-time',String(since),'--filter-pattern','"script failed"']).events??[];
  const byProvider=new Map();for(const event of events){const name=event.message.match(/\] (\w+) script failed/)?.[1]??'?';byProvider.set(name,(byProvider.get(name)??0)+1);}
  console.log(`\nScript model fallbacks: ${events.length?[...byProvider].map(([name,count])=>`${name} failed ${count}×, next provider took over`).join('; '):'none'}`);
}
