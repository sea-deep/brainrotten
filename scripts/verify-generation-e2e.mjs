/**
 * Connected application smoke, deliberately offline at the two paid provider boundaries.
 * No production keys, owner data, AI artwork or public service are used.
 * --serve keeps the isolated application open for browser QA until SIGINT/SIGTERM.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-connected-'));
const require=createRequire(path.join(root,'apps/companion/package.json'));
const token='a'.repeat(64);
Object.assign(process.env,{
  BRAINROT_SKIP_ENV:'1',BRAINROT_DATA_DIR:directory,BRAINROTTEN_MODE:'local',
  BRAINROTTEN_MCP_TOKEN:token,BRAINROT_NO_AUTOSTART:'1',
  BRAINROTTEN_SCRIPT_PROVIDER:'paper',BRAINROTTEN_VOICE_BACKEND:'elevenlabs',
  PAPER_API_KEY:'synthetic-e2e-paper',PAPERINSTRUMENTS_API_KEY:'',
  GEMINI_API_KEY:'',ELEVENLABS_API_KEY:'synthetic-e2e-speech',BRAVE_SEARCH_API_KEY:'',
  CHARACTER_VOICES_JSON:JSON.stringify(Object.fromEntries(['motu','jack','jhatka'].map(id=>[id,{id:'synthetic-'+id,status:'ready'}]))),
});
const originalFetch=globalThis.fetch;
let server,storage,client,transport;
let scriptCalls=0,speechCalls=0,unexpectedNetworkCalls=0;
const formats=['skit','groupchat','prreview','sketch','tierlist'];
const question={id:'purchase-key',prompt:'Which key should the retry reuse?',choices:['The purchase key','A fresh key'],answer:0,explanation:'One operation keeps one stable key.',turnIndices:[2,3]};
function scriptFor(format){
  if(format==='tierlist')return{
    title:'Payment retry — tierlist',narrator:'jhatka',takeaway:'Keep one stable key per purchase.',
    tierlist:{criterion:'one charge when the reply is lost',items:[{id:'same-key',label:'Same key',icon:'key-round'},{id:'backoff',label:'Backoff',icon:'timer'},{id:'new-key',label:'New key',icon:'shuffle'}]},
    dialogue:[
      {speaker:'jhatka',text:'Ranking retry fixes by one rule: one charge when the reply is lost.'},
      {speaker:'jhatka',text:'A new key per retry charges again. F tier.',tier:{place:{item:'new-key',tier:'F'}}},
      {speaker:'jhatka',text:'Where does a stable purchase key go?',tier:{focus:'same-key'},pause:{prompt:'Where does a stable purchase key go?',choices:['S tier','F tier'],answer:0}},
      {speaker:'jhatka',text:'S tier. The retry returns the first result.',tier:{place:{item:'same-key',tier:'S'}}},
      {speaker:'jhatka',text:'Backoff lowers load but does not stop it. C tier.',tier:{place:{item:'backoff',tier:'C'}}},
    ],questions:[question],
  };
  if(format==='sketch')return{
    title:'Payment retry — sketch',narrator:'jhatka',takeaway:'Keep one stable key per purchase.',
    sketch:{nodes:[{id:'app',label:'Checkout app',kind:'actor',icon:'smartphone'},{id:'api',label:'Payment API',kind:'service',icon:'server'},{id:'db',label:'Postgres',kind:'store',icon:'postgresql'}],edges:[{from:'app',to:'api',label:'POST /pay'},{from:'api',to:'db',label:'insert'}]},
    dialogue:[
      {speaker:'jhatka',text:'The app sends a payment to the API.',sketch:{show:['app','api','app>api']}},
      {speaker:'jhatka',text:'The API stores the purchase in Postgres.',sketch:{show:['db','api>db']}},
      {speaker:'jhatka',text:'The reply is lost and the app retries with a new key. What happens?',sketch:{focus:['app>api']},pause:{prompt:'What does the retry with a new key do?',choices:['Charges again','Returns the first result'],answer:0}},
      {speaker:'jhatka',text:'It charges again. Reuse the purchase key so Postgres finds the first result.',sketch:{focus:['db'],mark:'fix',note:{text:'same key',near:'db'}}},
    ],questions:[question],
  };
  if(format==='prreview')return{
    title:'Payment retry — prreview',takeaway:'Keep one stable key per purchase.',
    pr:{title:'Reuse purchase key on retry',repo:'acme/checkout',author:{name:'claude-code',icon:'anthropic'},reviewers:[{speaker:'jhatka',name:'senior-dev',icon:'user'},{speaker:'jack',name:'dba',icon:'postgresql'}],
      files:[{path:'src/retry.ts',language:'ts',lines:[{kind:'ctx',code:'function retry(order) {'},{kind:'del',code:'  const key = uuid();'},{kind:'add',code:'  const key = order.purchaseKey;'},{kind:'ctx',code:'}'}]}],verdict:'approve'},
    dialogue:[
      {speaker:'jhatka',text:'Let us review the retry fix for double charges.',pr:{file:0,lines:[0,3],tone:'question'}},
      {speaker:'jhatka',text:'The old code made a new key on every retry.',pr:{file:0,lines:[1,1],tone:'roast'}},
      {speaker:'jack',text:'The reply is lost and the app retries. What happens?',pr:{file:0,lines:[1,1],tone:'question'},pause:{prompt:'Response lost, app retries. What happens?',choices:['Charged twice','Same result'],answer:0}},
      {speaker:'jhatka',text:'The card is charged twice. Reusing the purchase key fixes it.',pr:{file:0,lines:[2,2],tone:'praise'}},
      {speaker:'jhatka',text:'Approved.',pr:{tone:'praise',display:'LGTM 🚀'}},
    ],questions:[question],
  };
  if(format==='groupchat')return{
    title:'Payment retry — groupchat',takeaway:'Keep one stable key per purchase.',
    chat:{title:'checkout-prod 💀',members:[{speaker:'motu',name:'Client',icon:'smartphone',you:true},{speaker:'jack',name:'Payment API',icon:'server'},{speaker:'jhatka',name:'Postgres',icon:'postgresql'}]},
    dialogue:[
      {speaker:'motu',text:'Did my payment go through? I got no response.',chat:{display:'did my payment go through?? 😭'}},
      {speaker:'jack',text:'The charge succeeded but the response was lost.'},
      {speaker:'jhatka',text:'A fresh retry key would look like a new purchase to me.',chat:{reaction:'💀'}},
      {speaker:'jack',text:'Reuse the purchase key and I return the saved result.'},
    ],questions:[question],
  };
  const texts=format==='skit'?[
    'The payment ran twice after I retried.',
    'The charge succeeded but its response was lost.',
    'Which key should I reuse on the retry?',
    'Keep the original purchase key and return the saved result.',
  ]:[
    `In this ${format} example, one payment was retried.`,
    'The charge succeeded but the response was lost.',
    'A fresh retry key permits another charge.',
    'Reuse the purchase key and return the saved result.',
  ];
  return{
    title:`Payment retry — ${format}`,takeaway:'Keep one stable key per purchase.',
    ...(format==='skit'?{participants:{learner:'motu',expert:'jack'}}:{narrator:'jhatka'}),
    dialogue:texts.map((text,index)=>({speaker:format==='skit'?(index%2?'jack':'motu'):'jhatka',text,
      ...(format==='skit'?{}:{scene:{beat:['setup','investigate','escalate','resolve'][index],heading:['One purchase','Lost response','New key','Original result'][index],
        ...(format==='whiteboard'?{diagram:{nodes:[{id:'purchase',label:'Purchase'},{id:'key',label:'Stable key'}],edges:[{from:'purchase',to:'key'}]}}:{}),
        ...(format==='pov'?{journey:{location:'Payment API',action:'Recognize the operation',status:index===3?'done':'running',state:[{key:'purchase',value:'same operation'}]}}:{}),
      }}),
    })),questions:[question],
  };
}
try{
  const audio=path.join(directory,'synthetic.mp3');
  const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=4','-y',audio],{encoding:'utf8'});
  assert.equal(encoded.status,0,'FFmpeg must be installed for the connected rendering smoke.');
  const audioBase64=(await fs.readFile(audio)).toString('base64');
  globalThis.fetch=async(resource,options)=>{
    const url=new URL(typeof resource==='string'||resource instanceof URL?resource:resource.url);
    if(url.hostname==='127.0.0.1'&&server&&url.port===String(server.address().port))return originalFetch(resource,options);
    if(url.href==='https://api.paperinstruments.com/v1/chat/completions'){
      scriptCalls++;
      const body=JSON.parse(options.body),system=body.messages[0].content;
      const format=system.includes('TierMaker-style tier list')?'tierlist':system.includes('Excalidraw-style sketch board')?'sketch':system.includes('GitHub pull request review')?'prreview':system.includes('WhatsApp group chat')?'groupchat':system.includes('first-person POV journey')?'pov':system.includes('whiteboard explanation')?'whiteboard':system.includes('narrated case-file')?'casefile':'skit';
      return Response.json({choices:[{message:{content:JSON.stringify(scriptFor(format))}}]});
    }
    if(url.origin==='https://api.elevenlabs.io'&&url.pathname==='/v1/text-to-dialogue/with-timestamps'){
      speechCalls++;
      const inputs=JSON.parse(options.body).inputs;
      const characters=[],starts=[],ends=[],segments=[];
      inputs.forEach((line,index)=>{
        const start=characters.length,letters=Array.from(line.text);
        letters.forEach((letter,position)=>{characters.push(letter);starts.push(index+position/letters.length);ends.push(index+(position+1)/letters.length);});
        segments.push({dialogue_input_index:index,start_time_seconds:index,end_time_seconds:index+1,character_start_index:start,character_end_index:characters.length});
      });
      return Response.json({audio_base64:audioBase64,alignment:{characters,character_start_times_seconds:starts,character_end_times_seconds:ends},voice_segments:segments});
    }
    unexpectedNetworkCalls++;
    throw new Error('Unexpected external request blocked by end-to-end fixture.');
  };
  const express=require('express');
  const {BrainrotStorage}=await import('../packages/core/dist/index.js');
  const {GenerateVideoInputSchema,VideoManifestSchema}=await import('../packages/contracts/dist/index.js');
  const {SessionAuth}=await import('../apps/companion/dist/auth.js');
  const {VideoStudio}=await import('../apps/companion/dist/video/runtime.js');
  const {createStudioRouter}=await import('../apps/companion/dist/video/routes.js');
  const {createRouter}=await import('../apps/companion/dist/http/routes.js');
  const {Client}=await import(require.resolve('@modelcontextprotocol/client'));
  const {StdioClientTransport}=await import(require.resolve('@modelcontextprotocol/client/stdio'));
  const auth=new SessionAuth(directory),studio=new VideoStudio(directory),app=express();
  storage=new BrainrotStorage(path.join(directory,'db.sqlite'));
  app.use('/api/v1',createStudioRouter(studio,auth));
  app.use('/api/v1',createRouter(storage,{port:0,dataDir:directory,logLevel:'error'},auth));
  app.use(express.static(path.join(root,'apps/web/dist')));
  app.get('/{*splat}',(_request,response)=>response.sendFile(path.join(root,'apps/web/dist/index.html')));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(route,method='GET',body)=>fetch(base+'/api/v1'+route,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'apps/companion/dist/mcp.js')],env:{PATH:process.env.PATH??'',HOME:os.homedir(),BRAINROT_SKIP_ENV:'1',BRAINROT_DATA_DIR:directory,BRAINROT_PORT:String(server.address().port),BRAINROTTEN_MCP_TOKEN:token,BRAINROT_NO_AUTOSTART:'1'}});
  client=new Client({name:'brainrotten-connected-smoke',version:'1.0.0'});
  await client.connect(transport);
  const call=async(name,args)=>{const response=await client.callTool({name,arguments:args});assert.notEqual(response.isError,true,JSON.stringify(response.content));return JSON.parse(response.content.find(block=>block.type==='text').text);};
  const waitForReady=async jobId=>{
    const deadline=Date.now()+60000;
    do{
      const job=await call('get_video_status',{jobId});
      assert.ok(!['failed','needs_review'].includes(job.state),job.error??job.state);
      if(job.state==='ready')return job;
      await delay(100);
    }while(Date.now()<deadline);
    assert.fail('Generation did not finish within sixty seconds.');
  };
  assert.equal((await client.listTools()).tools.length,16);
  assert.equal((await originalFetch(base+'/api/v1/library')).status,401);
  const jobs=[];
  for(const [index,format]of formats.entries()){
    const input=GenerateVideoInputSchema.parse({requestId:`connected-${format}`,format,prompt:'Explain a lost payment response and a retry using the same purchase key.',scriptProvider:'paper',voiceBackend:'elevenlabs',speechSpeed:1,broll:false,quizCount:1,language:'en',...(format==='skit'?{participants:{learner:'motu',expert:'jack'},background:'minecraft-lava'}:format==='groupchat'?{background:'subway-surfers'}:format==='prreview'?{background:'gta-stunts'}:format==='sketch'?{narrator:'jhatka',background:'minecraft-end'}:format==='tierlist'?{narrator:'jhatka',background:'minecraft-lava'}:{narrator:'jhatka'})});
    const checked=await call('validate_video_script',{request:{...input,script:scriptFor(format)}});
    assert.equal(checked.valid,true);assert.equal(checked.generationReady,true);
    // Exercise both public entry points. Both must reach the actual queue and engine.
    const submitted=index%2?await call('generate_short_video',input):await(await request('/videos','POST',input)).json();
    assert.ok(submitted.jobId);assert.ok(['queued','processing'].includes(submitted.state));
    const job=await waitForReady(submitted.jobId);
    assert.equal(job.state,'ready',`${format} did not finish`);
    assert.equal(job.format,format);assert.equal(job.learning.questions.length,['prreview','sketch','tierlist'].includes(format)?2:1,'pauses add a graded question');
    for(const kind of ['video','poster','audio','manifest','learning','notes','captions','flashcards']){
      const response=await request(`/videos/${job.jobId}/${kind}`);
      assert.equal(response.status,200,`${format}/${kind}`);
      assert.ok((await response.arrayBuffer()).byteLength>25,`${kind} must contain a real artifact`);
    }
    const manifest=VideoManifestSchema.parse(await(await request(`/videos/${job.jobId}/manifest`)).json());
    assert.equal(manifest.format,format);
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',path.join(directory,'videos-v2',job.jobId,'video.mp4')],{encoding:'utf8'});
    assert.equal(probe.status,0);
    const streams=JSON.parse(probe.stdout).streams;
    assert.ok(streams.some(stream=>stream.codec_name==='h264'&&stream.width===720&&stream.height===1280));
    assert.ok(streams.some(stream=>stream.codec_name==='aac'));
    const range=await originalFetch(base+job.videoUrl,{headers:{authorization:'Bearer '+token,range:'bytes=0-127'}});
    assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,128);
    const before=speechCalls;
    assert.equal((await call('generate_short_video',input)).jobId,job.jobId);
    assert.equal(speechCalls,before,'Retry must not synthesize again.');
    assert.equal((await request('/videos','POST',{...input,prompt:'Different content'})).status,409);
    let review=await(await request(`/videos/${job.jobId}/review`)).json();
    for(const action of [{kind:'watch',positionMs:1500},{kind:'bookmark',value:true},{kind:'answer',questionId:question.id,choice:0}]){
      const response=await request(`/videos/${job.jobId}/review`,'PUT',{...action,expectedVersion:review.version});
      assert.equal(response.status,200);review=await response.json();
    }
    assert.equal(review.answers[question.id].correct,true);
    assert.equal((await request(`/videos/${job.jobId}/review`,'PUT',{kind:'bookmark',value:false,expectedVersion:0})).status,409);
    assert.equal((await call('get_video_review',{jobId:job.jobId})).bookmarked,true);
    assert.equal((await call('get_video_learning_pack',{jobId:job.jobId})).questions.length,['prreview','sketch','tierlist'].includes(format)?2:1);
    jobs.push({jobId:job.jobId,format,studioUrl:`${base}/studio?video=${job.jobId}`});
  }
  const first=await call('list_videos',{limit:3,review:'bookmarked'});
  assert.equal(first.jobs.length,3);assert.ok(first.nextCursor);
  const second=await call('list_videos',{limit:3,review:'bookmarked',cursor:first.nextCursor});
  assert.equal(second.jobs.length,2);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.jobs,...second.jobs].map(job=>job.jobId)).size,5);
  // A fresh agent-authored job must work with every script-provider key absent.
  process.env.PAPER_API_KEY='';
  const agentInput={requestId:'connected-agent-prreview',format:'prreview',script:scriptFor('prreview'),speechSpeed:1,broll:false,quizCount:1,language:'en',voiceBackend:'elevenlabs'};
  assert.equal(studio.config().scriptConfigured,false);
  assert.equal((await call('validate_video_script',{request:agentInput})).generationReady,true);
  const agentJob=await waitForReady((await call('generate_short_video',agentInput)).jobId);
  assert.equal(agentJob.format,'prreview');assert.ok(agentJob.learning.questions.some(q=>q.id==='pause-2'),'pause question is graded');
  jobs.push({jobId:agentJob.jobId,format:'prreview',source:'agent script without a model key',studioUrl:`${base}/studio?video=${agentJob.jobId}`});
  process.env.PAPER_API_KEY='synthetic-e2e-paper';
  const checkpoint=await call('record_learning_session',{
    requestId:'connected-session-checkpoint',title:'The retried purchase',projectName:'Checkout',agent:'Connected MCP fixture',intent:'debugging',
    objective:'Trace one purchase identity across a lost response and retry.',
    context:{task:'Trace a request through the payment pipeline',summary:'The charge succeeded before its response was lost.',changes:['Keep one purchase-scoped idempotency key.'],decisions:[{choice:'Reuse the purchase key',reason:'A delivery attempt must not create a new operation.',tradeoff:'The operation result needs durable storage.'}],uncertainties:['The fixture does not claim an actual payment ran.']},
    activity:{predictionPrompt:'What happens if the retry uses a new purchase key?',practice:{prompt:'Trace the same purchase after two lost responses.',successCriteria:'One charge; both retries receive the saved result.',hint:'Separate operation identity from delivery attempts.'},reflectionPrompt:'Which assumption would you test before accepting the change?'},
  });
  assert.equal(checkpoint.recommendation.format,'sketch');
  assert.equal((await call('get_learning_guide',{sessionId:checkpoint.sessionId})).version,'BrainrottenTeachingGuideV1');
  const linked=await waitForReady((await call('publish_session_lesson',{sessionId:checkpoint.sessionId,video:{...agentInput,requestId:'connected-session-lesson'}})).jobId);
  assert.equal(linked.sessionId,checkpoint.sessionId);
  const learningRoute=base+'/api/v1/sessions/'+checkpoint.sessionId+'/review';
  assert.equal((await request('/sessions/'+checkpoint.sessionId+'/review','PUT',{kind:'predict',expectedVersion:0,text:'A fresh key can permit another charge.',confidence:4,skipped:false})).status,401,'Agents must not write learner responses.');
  let version=0;
  for(const action of [{kind:'predict',text:'A fresh key can permit another charge.',confidence:4,skipped:false},{kind:'practice',attempt:'Traced both delivery attempts to the same saved result.',completed:true},{kind:'reflect',explanation:'The operation identity persists across delivery attempts.',confidence:3,traps:['progression','mislead'],nextAction:'Inspect the operation-store uniqueness boundary.'}]){
    const response=await fetch(learningRoute,{method:'PUT',headers:{authorization:'Bearer '+auth.getToken(),'content-type':'application/json'},body:JSON.stringify({...action,expectedVersion:version})});assert.equal(response.status,200);version=(await response.json()).version;
  }
  assert.equal((await call('get_learning_session',{sessionId:checkpoint.sessionId})).videos[0].jobId,linked.jobId);
  jobs.push({jobId:linked.jobId,format:'prreview',source:'account-owned session lesson',studioUrl:`${base}/studio?session=${checkpoint.sessionId}`});
  const restored=new VideoStudio(directory);
  assert.equal(restored.list().length,7);
  assert.equal(restored.sessions.review(checkpoint.sessionId).reflection.confidence,3);
  assert.equal(restored.review(jobs[0].jobId).positionMs,1500);
  assert.equal(restored.review(jobs[0].jobId).answers[question.id].correct,true);
  assert.equal(scriptCalls,5);assert.equal(speechCalls,5);assert.equal(unexpectedNetworkCalls,0);
  console.log(JSON.stringify({ok:true,scope:'real local application; synthetic model/speech responses',formats,jobs,scriptCalls,speechCalls,paidRequests:0,unexpectedNetworkCalls,checks:['real stdio MCP','real HTTP queue','skit, groupchat, prreview, sketch and tierlist topic MP4s plus a fresh agent PR review with Pause & Predict','agent script without a model key','eight downloads per format','range playback','retry idempotency','request conflicts','server grading','review conflict','restart persistence','private paginated library']},null,2));
  if(process.argv.includes('--serve')){
    console.log(`Isolated browser QA server: ${base}/studio`);
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }
}finally{
  await client?.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  storage?.close();globalThis.fetch=originalFetch;
  await fs.rm(directory,{recursive:true,force:true});
}
