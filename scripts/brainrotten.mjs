#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [command,...args]=process.argv.slice(2);
const help='Usage: pnpm brainrotten doctor | login --api-url HTTPS_API | logout | mcp [--account] | generate --input request.json [--wait] [--output video.mp4]';
async function main(){
  if(command==='login'||command==='logout'){
    const {accountLogin,removeAccountProfile}=await import('../apps/companion/dist/mcp/account.js');
    const directory=process.env.BRAINROT_DATA_DIR??path.join(os.homedir(),'.local/share/brainrot');
    if(command==='logout'){removeAccountProfile(directory);console.log('Removed this computer’s saved account connection.');return;}
    const index=args.indexOf('--api-url'),url=index<0?undefined:args[index+1];if(!url)throw new Error(help);
    await accountLogin(url,directory,!args.includes('--no-open'));console.log('Account connected. Launch MCP with --account in any compatible agent.');return;
  }
  if(command==='mcp'){
    const child=spawn(process.execPath,[path.join(root,'apps/companion/dist/mcp.js'),...(args.includes('--account')?['--account']:[])],{stdio:'inherit'});
    child.on('error',()=>{console.error('Build the project first with pnpm build.');process.exitCode=1;});
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
    child.on('exit',code=>{process.exitCode=code??1;});return;
  }
  if(command==='doctor'){
    const checks=[['Node 26+',Number(process.versions.node.split('.')[0])>=26],['Built MCP',Boolean(await fs.stat(path.join(root,'apps/companion/dist/mcp.js')).catch(()=>null))],['FFmpeg',spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0],['Supplied gameplay',Boolean(await fs.stat(path.join(root,'assets/gameplay/sources.json')).catch(()=>null))]];
    for(const[name,ok]of checks)console.log(`${ok?'OK':'MISSING'}  ${name}`);
    console.log('No provider calls were made. Configure keys and character voices in local Studio.');
    if(checks.some(([,ok])=>!ok))process.exitCode=1;return;
  }
  if(command!=='generate'){console.log(help);if(command&&command!=='--help')process.exitCode=1;return;}
  const option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
  const input=option('--input');if(!input)throw new Error(help);
  const {GenerateVideoInputSchema,VideoJobSchema}=await import('../packages/contracts/dist/index.js');
  const raw=JSON.parse(await fs.readFile(path.resolve(input),'utf8'));
  const request=GenerateVideoInputSchema.parse({...raw,requestId:raw.requestId??randomUUID()});
  const port=Number(process.env.BRAINROT_PORT??3001);
  const {mcpEndpoint}=await import('../apps/companion/dist/mcp/endpoint.js');
  const endpoint=mcpEndpoint(process.env,port);
  const data=process.env.BRAINROT_DATA_DIR??path.join(os.homedir(),'.local/share/brainrot');
  const token=endpoint.remote?endpoint.token:process.env.BRAINROTTEN_MCP_TOKEN||await fs.readFile(path.join(data,'mcp-token'),'utf8').then(x=>x.trim()).catch(()=>{throw new Error('Start local Studio once before using the CLI.');});
  const headers={'content-type':'application/json',authorization:`Bearer ${token}`,...(!endpoint.remote?{Origin:`http://localhost:${port}`}:{})};
  const call=async(route,body)=>{
    const response=await fetch(endpoint.baseUrl+route,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok)throw new Error(result.message??`HTTP ${response.status}`);return VideoJobSchema.parse(result);
  };
  console.error(`Submitting requestId ${request.requestId}. Preserve this ID if the response is lost.`);
  let job=await call('/videos',request);
  if(args.includes('--wait')||option('--output')){
    const deadline=Date.now()+20*60000;
    while(!['ready','failed','needs_review'].includes(job.state)){
      if(Date.now()>deadline)throw new Error(`Still processing job ${job.jobId}; poll GET /videos/${job.jobId}.`);
      console.error(`${job.stage} ${job.progress}%`);
      await new Promise(resolve=>setTimeout(resolve,5000));job=await call(`/videos/${job.jobId}`);
    }
    if(job.state==='failed'||job.state==='needs_review')throw new Error(job.error??'Video generation failed.');
  }
  const output=option('--output');
  if(output&&job.state==='ready'){
    const url=new URL(job.downloadUrl??job.videoUrl,endpoint.baseUrl);
    const sameOrigin=url.origin===new URL(endpoint.baseUrl).origin;
    if(url.protocol!=='https:'&&!(sameOrigin&&!endpoint.remote&&url.protocol==='http:'))throw new Error('Invalid media download URL.');
    const response=await fetch(url,{headers:sameOrigin?headers:{},redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok||!response.body)throw new Error('Could not download the MP4. Fetch the job again for a fresh link.');
    const {Readable}=await import('node:stream'),{pipeline}=await import('node:stream/promises'),{createWriteStream}=await import('node:fs');
    const target=path.resolve(output),temporary=target+`.${randomUUID()}.tmp`;
    try{await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary,{flags:'wx',mode:0o600}));await fs.rename(temporary,target);}catch(error){await fs.rm(temporary,{force:true});throw error;}
    console.error(`Saved ${target}`);
  }
  console.log(JSON.stringify(job,null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Command failed.');process.exitCode=1;});
