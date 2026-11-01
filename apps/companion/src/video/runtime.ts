import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {GenerateVideoInputSchema,VideoJobSchema,scriptForFormat,videoRequestPayload,CAST_MEMBERS,VideoReviewSchema,emptyVideoReview,applyVideoReview,type VideoReview,type VideoJob,type StudioConfig,type ValidatedVideoInput} from '@brainrot/contracts';
import {availableVoices,GenerationError,activeScriptProvider,scriptProviderPreference,SCRIPT_PROVIDERS,providerKeys,workspaceRoot,CHARACTERS,CASTS,clonedVoices,generateVideoArtifact,BACKGROUNDS,getRenderReadiness,imageSearchProvider,speechBackend,localVoiceReady,localReferenceReady,formatCapabilities,videoLibrary,validateVideoRequest} from '@brainrot/media';
import {logger} from '../logger.js';
import {readCognitoSettings,cognitoPublicConfig} from '../authSettings.js';
import {LearningSessions} from './sessions.js';
interface StoredJob{job:VideoJob;input:ValidatedVideoInput;inputHash:string}
export class VideoStudio{
  readonly sessions:LearningSessions;
  private jobs=new Map<string,StoredJob>();private busy=false;private directory:string;
  constructor(private dataDir:string){
    this.sessions=new LearningSessions(dataDir);
    this.directory=path.join(dataDir,'videos-v2');fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    for(const entry of fs.readdirSync(this.directory,{withFileTypes:true})){
      if(!entry.isDirectory()||!/^[\w-]+$/.test(entry.name))continue;
      try{const record=JSON.parse(fs.readFileSync(path.join(this.directory,entry.name,'job.json'),'utf8')) as StoredJob;record.job=VideoJobSchema.parse(record.job);const savedInput=record.input as unknown as Record<string,unknown>;record.input=GenerateVideoInputSchema.parse({...savedInput,language:savedInput['language']==='hi'?'hinglish':savedInput['language'],background:savedInput['background']==='procedural'?'auto':savedInput['background']});
        if(record.job.state==='processing'){record.job.state='needs_review';record.job.stage='failed';record.job.error='Generation was interrupted. Completed speech is cached; review before retrying.';}
        this.jobs.set(record.job.jobId,record);
      }catch{/*Keep invalid/legacy files private.*/}
    }
    setImmediate(()=>{void this.runNext();});
  }
  config():StudioConfig{
    const keys=providerKeys(),voices=clonedVoices(),backend=speechBackend(),local=localVoiceReady();
    return{scriptProvider:scriptProviderPreference(),scriptConfigured:Boolean(activeScriptProvider()),geminiConfigured:Boolean(keys.gemini),scriptProviders:SCRIPT_PROVIDERS.map(provider=>({id:provider.id as 'paper'|'gemini',name:provider.name,ready:provider.isConfigured()})),voiceBackend:backend,voiceConfigured:backend==='maya-local'?local:Boolean(keys.elevenlabs),speechBackends:[{id:'maya-local',name:'Maya 2 · local',ready:local},{id:'elevenlabs',name:'ElevenLabs',ready:Boolean(keys.elevenlabs)}],paperConfigured:Boolean(keys.paper),elevenlabsConfigured:Boolean(keys.elevenlabs),ffmpegAvailable:getRenderReadiness().ffmpegAvailable,imageSearchProvider:imageSearchProvider(),
      voices:availableVoices(),characters:(Object.keys(CHARACTERS) as Array<keyof typeof CHARACTERS>).map(id=>({id,name:CHARACTERS[id].name,imageUrl:`/api/v1/characters/${id}/image`,voiceReady:backend==='maya-local'?local&&localReferenceReady(id):voices[id]?.status==='ready'})),casts:CASTS,
      defaults:{style:'brainrot',durationSeconds:60,cast:'auto',language:'hinglish',speechSpeed:1.12},backgrounds:BACKGROUNDS,
      formats:formatCapabilities(),mode:process.env['BRAINROTTEN_MODE']==='hosted'?'hosted':'local',
      auth:cognitoPublicConfig(readCognitoSettings(this.dataDir)),
    };
  }
  list():VideoJob[]{return[...this.jobs.values()].map(v=>v.job).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  get(id:string):VideoJob|undefined{return this.jobs.get(id)?.job;}
  review(id:string):VideoReview|undefined{
    if(!this.jobs.has(id))return;
    try{return VideoReviewSchema.parse(JSON.parse(fs.readFileSync(path.join(this.directory,id,'review.json'),'utf8')));}catch{return emptyVideoReview(id);}
  }
  saveReview(id:string,raw:unknown):VideoReview|undefined{
    const job=this.get(id),current=this.review(id);if(!job||!current)return;
    const next=applyVideoReview(current,raw,job),dir=path.join(this.directory,id),temp=path.join(dir,'review.tmp');
    fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600});fs.renameSync(temp,path.join(dir,'review.json'));return next;
  }
  library(query:unknown){return videoLibrary(this.list(),new Map(this.list().map(job=>[job.jobId,this.review(job.jobId)!])),query,'local');}
  validate(raw:unknown){const parsed=GenerateVideoInputSchema.safeParse(raw),config=this.config(),backend=parsed.success?parsed.data.voiceBackend:undefined;if(backend&&backend!==config.voiceBackend){config.voiceBackend=backend;config.characters=config.characters.map(character=>({...character,voiceReady:backend==='maya-local'?localVoiceReady()&&localReferenceReady(character.id):clonedVoices()[character.id]?.status==='ready'}));}return validateVideoRequest(raw,config);}
  asset(id:string,kind:'video'|'poster'|'audio'|'manifest'|'learning'|'notes'|'captions'|'flashcards'):string|undefined{
    if(this.jobs.get(id)?.job.state!=='ready')return;
    const file=path.join(this.directory,id,{video:'video.mp4',poster:'poster.png',audio:'audio.mp3',manifest:'manifest.json',learning:'learning.json',notes:'notes.md',captions:'captions.srt',flashcards:'flashcards.csv'}[kind]);return fs.existsSync(file)?file:undefined;
  }
  characterAsset(id:string):string|undefined{if(!Object.hasOwn(CHARACTERS,id))return;const file=path.join(workspaceRoot,CHARACTERS[id as keyof typeof CHARACTERS].image);return fs.existsSync(file)?file:undefined;}
  submit(raw:unknown):VideoJob{
    const input=GenerateVideoInputSchema.parse(raw),inputHash=createHash('sha256').update(JSON.stringify(videoRequestPayload(input))).digest('hex');
    if(input.sessionId&&!this.sessions.get(input.sessionId))throw new GenerationError('Learning session not found. Create the session before publishing its lesson.');
    if(input.requestId){const previous=[...this.jobs.values()].find(r=>r.input.requestId===input.requestId);if(previous){if(previous.inputHash!==inputHash)throw new GenerationError('Request ID already used for different content.');return previous.job;}}
    const config=this.config();
    if(!config.ffmpegAvailable)throw new GenerationError('Install FFmpeg and ffprobe, then restart Studio.');
    input.voiceBackend??=speechBackend();
    if(input.voiceBackend==='maya-local'){if(!localVoiceReady())throw new GenerationError('Prepare and verify the local voice engine before generating.');if(input.voiceIds)throw new GenerationError('Local speech uses character recordings. Select ElevenLabs to use provider voice IDs.');}
    else if(!config.elevenlabsConfigured)throw new GenerationError('Add your ElevenLabs API key in Settings.');
    if(!input.script){const provider=activeScriptProvider(input.scriptProvider);if(!provider)throw new GenerationError('Configure the selected Gemini/Paper script provider or provide an agent-written script through MCP.');input.scriptProvider=provider.id as 'paper'|'gemini';}
    if(input.script){try{input.script=scriptForFormat(input.script,input.format,input.participants,input.narrator);input.participants=input.script.participants;input.narrator=input.script.narrator;}catch{throw new GenerationError(input.format==='skit'?'Use two different speakers in alternating learner/expert exchanges, a concrete opening and connected follow-up questions.':'Use one narrator with 4–12 scenes, beginning with setup, including investigate and escalate, and ending with resolve.');}}
    const ready=CAST_MEMBERS[input.cast].filter(id=>input.voiceIds?.[id]||(input.voiceBackend==='maya-local'?localReferenceReady(id):clonedVoices()[id]?.status==='ready'));
    if(input.format==='skit'){if(input.participants?!ready.includes(input.participants.learner)||!ready.includes(input.participants.expert):ready.length<2)throw new GenerationError('Choose two characters with ready cloned voices. Run pnpm voices:setup.');}
    else if(input.narrator?!ready.includes(input.narrator):ready.length<1)throw new GenerationError('Choose a narrator with a ready cloned voice. Run pnpm voices:setup.');
    if(this.list().filter(j=>j.state==='queued'||j.state==='processing').length>=4)throw new GenerationError('The queue has four videos. Wait for one to finish.');
    const now=new Date().toISOString();const job:VideoJob={jobId:randomUUID(),sessionId:input.sessionId,state:'queued',stage:'queued',progress:0,prompt:input.prompt??input.script?.title??'',title:input.title??input.script?.title??null,createdAt:now,updatedAt:now,videoUrl:null,posterUrl:null,audioUrl:null,error:null,durationSeconds:null,cast:input.cast,language:input.language,voiceBackend:input.voiceBackend,participants:input.participants,format:input.format,narrator:input.narrator};
    this.jobs.set(job.jobId,{job,input,inputHash});this.persist(job.jobId);setImmediate(()=>{void this.runNext();});return job;
  }
  private persist(id:string):void{const dir=path.join(this.directory,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});const temp=path.join(dir,'job.tmp');fs.writeFileSync(temp,JSON.stringify(this.jobs.get(id),null,2),{mode:0o600});fs.renameSync(temp,path.join(dir,'job.json'));}
  private update(id:string,values:Partial<VideoJob>):void{Object.assign(this.jobs.get(id)!.job,values,{updatedAt:new Date().toISOString()});this.persist(id);}
  private async runNext():Promise<void>{
    if(this.busy)return;const next=[...this.jobs.values()].find(r=>r.job.state==='queued');if(!next)return;this.busy=true;const id=next.job.jobId;
    try{
      const result=await generateVideoArtifact(next.input,{jobId:id,dataDir:this.dataDir,outputDir:path.join(this.directory,id),onUpdate:update=>{if(update.progress===undefined||update.progress>(this.get(id)?.progress??-1)||update.stage)this.update(id,update);}});
      this.update(id,{state:'ready',stage:'ready',progress:100,title:result.title,learning:result.learning,outputs:{learningUrl:`/api/v1/videos/${id}/learning`,notesUrl:`/api/v1/videos/${id}/notes`,captionsUrl:`/api/v1/videos/${id}/captions`,flashcardsUrl:`/api/v1/videos/${id}/flashcards`},videoUrl:`/api/v1/videos/${id}/video`,posterUrl:`/api/v1/videos/${id}/poster`,audioUrl:`/api/v1/videos/${id}/audio`,voiceNames:Object.fromEntries([...new Set(result.script.dialogue.map(line=>line.speaker))].map(c=>[c,CHARACTERS[c].name]))});
      logger.info('Video ready',{jobId:id,durationSeconds:result.voice.durationSeconds});
    }catch(error){const known=error instanceof GenerationError;this.update(id,{state:known&&error.uncertain?'needs_review':'failed',stage:'failed',error:known?error.message:'Generation failed. Completed audio is cached; inspect the service log.'});logger.error('Video generation failed',{jobId:id,error:error instanceof Error?error.message.replace(/(?:sk_|pi_live_)[\w-]+/g,'[redacted]'):'Unknown error'});}
    finally{this.busy=false;setImmediate(()=>{void this.runNext();});}
  }
}
