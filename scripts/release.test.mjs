import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {spawn} from 'node:child_process';
const run=(args,env,cwd)=>new Promise(resolve=>{const child=spawn(process.execPath,args,{env:{PATH:process.env.PATH,BRAINROT_SKIP_ENV:'1',...env},stdio:['ignore','pipe','pipe'],...(cwd?{cwd}:{})});let stdout='',stderr='';child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);child.on('exit',code=>resolve({code,stdout,stderr}));});
test('provider export writes a private synthetic registry without printing secrets or overwriting',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-release-'));
  try{
    const token='synthetic-elevenlabs-secret';
    const registry=Object.fromEntries(['oggy','jack','badri','budhdev','jhaplu','paplu','taplu','motu','patlu','chingum','ghasitaram','jhatka','john'].map(id=>[id,{id:`synthetic-${id}`,name:id,status:'ready'}]));
    await fs.writeFile(path.join(directory,'character-voices.json'),JSON.stringify(registry));
    const env={BRAINROT_DATA_DIR:directory,ELEVENLABS_API_KEY:token,PAPER_API_KEY:'synthetic-paper-secret'},output=path.join(directory,'providers.json');
    const first=await run(['scripts/export-provider-secret.mjs',output],env);assert.equal(first.code,0);assert.ok(!first.stdout.includes(token)&&!first.stderr.includes(token));
    const result=JSON.parse(await fs.readFile(output,'utf8'));assert.equal(result.CHARACTER_VOICES_JSON.jack.id,'synthetic-jack');assert.equal(Object.keys(result.CHARACTER_VOICES_JSON).length,13);
    if(process.platform!=='win32')assert.equal((await fs.stat(output)).mode&0o777,0o600);
    const again=await run(['scripts/export-provider-secret.mjs',output],env);assert.equal(again.code,1);assert.match(again.stderr,/Output exists/);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('CLI submits once with a stable request ID and downloads authenticated local media',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-cli-'));const token='b'.repeat(64);let submissions=0,request;
  const now=new Date().toISOString();const job={jobId:'11111111-1111-4111-8111-111111111111',state:'ready',stage:'ready',progress:100,prompt:'Explain replica lag',title:'Replica lag',error:null,createdAt:now,updatedAt:now,videoUrl:'/media.mp4',downloadUrl:'/media.mp4'};
  const server=http.createServer((req,res)=>{if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401);res.end();return;}if(req.url==='/media.mp4'){res.setHeader('content-type','video/mp4');res.end('synthetic-media');return;}let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{submissions++;request=JSON.parse(body);res.setHeader('content-type','application/json');res.end(JSON.stringify(job));});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const input=path.join(directory,'request.json'),output=path.join(directory,'output.mp4');await fs.writeFile(input,JSON.stringify({requestId:'stable-synthetic-request',prompt:'Explain replica lag'}));await fs.writeFile(path.join(directory,'mcp-token'),token);
    const result=await run(['scripts/brainrotten.mjs','generate','--input',input,'--output',output],{BRAINROT_PORT:String(server.address().port),BRAINROT_DATA_DIR:directory});assert.equal(result.code,0,result.stderr);assert.equal(submissions,1);assert.equal(request.requestId,'stable-synthetic-request');assert.equal(JSON.parse(result.stdout).jobId,job.jobId);assert.equal(await fs.readFile(output,'utf8'),'synthetic-media');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
test('public gallery contains only the user-selected ElevenLabs voices',async()=>{
  const root='apps/web/public/examples',entries=JSON.parse(await fs.readFile(root+'/index.json','utf8')),approved=new Set(['jack','badri','budhdev','jhaplu','paplu','taplu','jhatka','john','motu']);assert.ok(entries.length>=3);
  const slugs=new Set();for(const entry of entries){assert.equal(entry.voiceBackend,'elevenlabs');const speakers=new Set([...Object.values(entry.script.participants??{}),entry.script.narrator,...entry.script.dialogue.map(line=>line.speaker)].filter(Boolean));for(const character of speakers)assert.ok(approved.has(character),`Unapproved example speaker ${character}`);const slug=entry.videoUrl.split('/')[2];slugs.add(slug);assert.ok((await fs.stat(`${root}/${slug}/video.mp4`)).size>1000);}
  for(const entry of await fs.readdir(root,{withFileTypes:true}))if(entry.isDirectory())assert.ok(slugs.has(entry.name),'An unlisted video directory would still be publicly shipped.');
});

test('explicit example export supports narrated V3 bundles and rewrites every public output link',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-export-formats-'));const id='11111111-1111-4111-8111-111111111111';
  try{const data=path.join(directory,'data'),jobDir=path.join(data,'videos-v2',id);await fs.mkdir(jobDir,{recursive:true});
    const script={title:'Payment retries',narrator:'jhatka',dialogue:['setup','investigate','escalate','resolve'].map(beat=>({speaker:'jhatka',scene:{beat,heading:beat,diagram:{nodes:[{id:'purchase',label:'One purchase'},{id:'key',label:'Stable key'}],edges:[{from:'purchase',to:'key'}]}},text:'Reuse the purchase key.'}))};
    const learning={schemaVersion:'BrainrottenLearningPackV1',jobId:id,format:'whiteboard',title:script.title,language:'en',durationSeconds:2,takeaway:'Reuse the key.',chapters:[{id:'retry',title:'Retry',startMs:0,endMs:2000}],questions:[],transcript:script.dialogue.map((line,i)=>({turnIndex:i,speaker:'jhatka',text:line.text,startMs:i*500,endMs:(i+1)*500}))};
    const job={jobId:id,state:'ready',stage:'ready',progress:100,prompt:'Payment retries',title:script.title,error:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z',videoUrl:'/api/v1/videos/'+id+'/video',script,learning,outputs:{learningUrl:'/api/v1/videos/'+id+'/learning',notesUrl:'/api/v1/videos/'+id+'/notes',captionsUrl:'/api/v1/videos/'+id+'/captions'}};
    const manifest={schemaVersion:'BrainrottenPlaybackManifestV3',jobId:id,format:'whiteboard',learning,title:script.title,cast:'auto',language:'en',speechSpeed:1.12,durationSeconds:2,script,segments:[],words:[],broll:[],sourceCredits:[]};
    await fs.writeFile(path.join(jobDir,'job.json'),JSON.stringify({job}));await fs.writeFile(path.join(jobDir,'manifest.json'),JSON.stringify(manifest));for(const name of ['video.mp4','poster.png','learning.json','notes.md','captions.srt'])await fs.writeFile(path.join(jobDir,name),'synthetic offline fixture');
    const result=await run([path.resolve('scripts/export-examples.mjs'),'whiteboard-test='+id],{BRAINROT_DATA_DIR:data},directory);assert.equal(result.code,0,result.stderr);const publicRoot=path.join(directory,'apps/web/public/examples'),[entry]=JSON.parse(await fs.readFile(path.join(publicRoot,'index.json'),'utf8'));assert.equal(entry.format,'whiteboard');assert.equal(entry.videoUrl,'/examples/whiteboard-test/video.mp4');assert.equal(entry.outputs.notesUrl,'/examples/whiteboard-test/notes.md');assert.ok(!JSON.stringify(entry.outputs).includes('/api/'));for(const name of ['learning.json','notes.md','captions.srt'])assert.ok((await fs.stat(path.join(publicRoot,'whiteboard-test',name))).isFile());
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
