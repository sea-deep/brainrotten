import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import {VideoManifestSchema,type ValidatedVideoInput,type VideoJob,type VideoScript,type LearningPack} from '@brainrot/contracts';
import {availableVoices,createScript,synthesizeDialogue,GenerationError,type VoiceResult} from './providers.js';
import {renderVideo,type PreparedBroll} from './render.js';
import {workspaceRoot} from './env.js';
import {searchBrollImage,downloadBrollReference} from './imageSearch.js';
import {speechBackend} from './localVoice.js';
import {createCodeCards} from './codeImage.js';
import {createLearningPack,learningNotes,subtitlesFor,flashcardsCsv} from './learning.js';
import {insertPauses,pauseQuestions} from './pause.js';
export const BACKGROUNDS=[
  {id:'auto' as const,name:'Random'},
  {id:'minecraft-lava' as const,name:'Minecraft · Lava'},
  {id:'minecraft-end' as const,name:'Minecraft · End'},
  {id:'subway-surfers' as const,name:'Subway Surfers'},
  {id:'gta-stunts' as const,name:'GTA Stunts'},
];
export function resolveBackground(background:ValidatedVideoInput['background'],jobId:string,assetDir=path.join(workspaceRoot,'apps/companion/assets/gameplay')):{file:string;name:string;credits:NonNullable<VideoJob['sourceCredits']>}{
  const selected=background==='auto'?BACKGROUNDS[1+parseInt(jobId.slice(0,2),16)%4]!.id:background;
  if(selected==='auto'||!BACKGROUNDS.some(item=>item.id===selected))throw new GenerationError('Choose one of the supplied gameplay videos.');
  const file=path.join(assetDir,`${selected}.mp4`);
  if(!syncFs.existsSync(file)||syncFs.statSync(file).size===0)throw new GenerationError('The selected supplied gameplay video is missing. Restore the gameplay assets before generating.');
  let ledger:{clips:Array<{id:string;title:string;sourceUrl:string;attribution:string}>};
  try{ledger=JSON.parse(syncFs.readFileSync(path.join(assetDir,'sources.json'),'utf8'));}catch{throw new GenerationError('The supplied gameplay source ledger is missing. Restore the gameplay assets.');}
  const source=ledger.clips.find(clip=>clip.id===selected);
  if(!source)throw new GenerationError('The selected gameplay video has no supplied source. Restore its source entry.');
  return{file,name:BACKGROUNDS.find(item=>item.id===selected)!.name,credits:[{title:source.title,url:source.sourceUrl,attribution:source.attribution}]};
}
export interface EngineResult{learning:LearningPack;script:VideoScript;voice:VoiceResult;title:string;backgroundName:string;sourceCredits:NonNullable<VideoJob['sourceCredits']>}
export interface ResolvedBroll {index:number;page?:number;pageCount?:number;cue:Omit<PreparedBroll,'startMs'|'endMs'>}
export async function resolveVisuals(script:VideoScript,outputDir:string,dataDir?:string,cachedImages?:ReadonlyMap<number|string,string>):Promise<{items:ResolvedBroll[];credits:NonNullable<VideoJob['sourceCredits']>}>{
  const items:ResolvedBroll[]=[],credits:NonNullable<VideoJob['sourceCredits']>=[];
  await fs.mkdir(outputDir,{recursive:true});
  for(let index=0;index<script.dialogue.length;index++){
    const line=script.dialogue[index]!,visuals=line.brollSequence??(line.broll?[line.broll]:[]),turnItems:ResolvedBroll[]=[];
    for(const [position,visual]of visuals.entries()){
    const suffix=visuals.length===1?`${index}`:`${index}-${position}`;
    if(visual.kind==='code'){
      const cards=await createCodeCards(visual.code,visual.language,path.join(outputDir,`code-${suffix}`));
      cards.forEach(card=>turnItems.push({index,cue:{kind:'code',imagePath:card.file,code:card.code,language:visual.language}}));
    }else{
      const cached=cachedImages?.get(`${index}:${position}`)??(position===0?cachedImages?.get(index):undefined);if(cached){const imagePath=path.join(outputDir,`broll-${suffix}.png`);await fs.copyFile(cached,imagePath);turnItems.push({index,cue:{kind:'image',imagePath,caption:visual.caption}});if(visual.sourceUrl)credits.push({title:visual.title??visual.query??'Reference image',url:visual.sourceUrl,attribution:visual.title??visual.query??'Reference image'});continue;}
      const result=visual.url?{imageUrl:visual.url,thumbnailUrl:visual.thumbnailUrl,sourceUrl:visual.sourceUrl??visual.url,title:visual.title??visual.query??'Image'}:await searchBrollImage({query:visual.query},dataDir);
      const imagePath=path.join(outputDir,`broll-${suffix}.png`);await downloadBrollReference(result,imagePath);
      turnItems.push({index,cue:{kind:'image',imagePath,caption:visual.caption}});credits.push({title:result.title,url:result.sourceUrl,attribution:result.title});
    }
    }
    turnItems.forEach((item,page)=>items.push({...item,page,pageCount:turnItems.length}));
  }
  return{items,credits};
}
export function timeVisuals(items:ResolvedBroll[],voice:VoiceResult):PreparedBroll[]{
  return items.flatMap(({index,cue,page=0,pageCount=1},i)=>{const segment=voice.segments[index];if(!segment)return[];const next=items.slice(i+1).find(item=>item.index!==index);const end=Math.min(voice.durationSeconds*1000,voice.segments[next?.index??-1]?.startMs??Infinity,Math.max(segment.endMs,segment.startMs+3000));const span=(end-segment.startMs)/pageCount;return[{...cue,startMs:segment.startMs+page*span,endMs:segment.startMs+(page+1)*span}];});
}
export async function prepareBroll(script:VideoScript,voice:VoiceResult,outputDir:string,cachedImages?:ReadonlyMap<number|string,string>):Promise<{cues:PreparedBroll[];credits:NonNullable<VideoJob['sourceCredits']>}>{const resolved=await resolveVisuals(script,outputDir,undefined,cachedImages);return{cues:timeVisuals(resolved.items,voice),credits:resolved.credits};}
export async function generateVideoArtifact(input:ValidatedVideoInput,options:{jobId:string;dataDir:string;outputDir:string;onUpdate?:(update:Partial<VideoJob>)=>void}):Promise<EngineResult>{
  // Resolve supplied footage before either paid script or speech generation. Never synthesize a background.
  const background=['skit','groupchat','prreview','sketch','tierlist'].includes(input.format)?resolveBackground(input.background,options.jobId):undefined;
  const update=options.onUpdate??(()=>{});
  await fs.mkdir(options.outputDir,{recursive:true});
  update({state:'processing',stage:'scripting',progress:5});
  const ready=[...new Set([...availableVoices(input.voiceBackend??speechBackend()).map(v=>v.role),...Object.keys(input.voiceIds??{})])] as import('@brainrot/contracts').CharacterId[];
  const script=await createScript(input,ready),title=input.title??script.title;
  if(input.imageBroll&&input.broll){const line=script.dialogue.find(item=>item.brollSequence?.some(cue=>cue.kind==='image')||item.broll?.kind==='image')??script.dialogue[0]!;if(line.brollSequence){const position=line.brollSequence.findIndex(cue=>cue.kind==='image');if(position>=0)line.brollSequence[position]=input.imageBroll;else line.brollSequence=[input.imageBroll,...line.brollSequence].slice(0,4);}else line.brollSequence=[input.imageBroll,...(line.broll?.kind==='code'?[line.broll]:[])];}
  let resolved:{items:ResolvedBroll[];credits:NonNullable<VideoJob['sourceCredits']>}={items:[],credits:[]};
  if(input.broll&&!['groupchat','prreview','sketch','tierlist'].includes(input.format)){try{resolved=await resolveVisuals(script,options.outputDir,options.dataDir);}catch(error){throw new GenerationError(error instanceof Error?error.message:'Could not prepare B-roll. No speech was generated.');}}
  update({title,script,format:input.format,narrator:script.narrator,participants:script.participants,voiceBackend:input.voiceBackend??speechBackend(),stage:'voicing',progress:22});
  const voice=await insertPauses(await synthesizeDialogue(script,input,options.dataDir),script,options.outputDir);
  await fs.copyFile(voice.audioPath,path.join(options.outputDir,'audio.mp3'));
  // Pause & Predict questions join the graded quiz (up to the pack's three questions).
  const learning=createLearningPack(options.jobId,{...script,title,...(pauseQuestions(script).length?{questions:[...(script.questions??[]),...pauseQuestions(script)].slice(0,3)}:{})},voice,input.format,input.language);
  await Promise.all([fs.writeFile(path.join(options.outputDir,'learning.json'),JSON.stringify(learning,null,2)),fs.writeFile(path.join(options.outputDir,'notes.md'),learningNotes(learning)),fs.writeFile(path.join(options.outputDir,'captions.srt'),subtitlesFor(voice)),fs.writeFile(path.join(options.outputDir,'flashcards.csv'),flashcardsCsv(learning))]);
  update({stage:'rendering',progress:48,durationSeconds:voice.durationSeconds,learning});
  const sourceCredits:NonNullable<VideoJob['sourceCredits']>=[...(background?.credits??[])];
  const visuals={cues:timeVisuals(resolved.items,voice),credits:resolved.credits};sourceCredits.push(...visuals.credits);
  const backgroundName=background?.name??(input.format==='whiteboard'?'Whiteboard diagrams':input.format==='pov'?'POV journey':'Case file');
  const backgroundPath=background?.file;
  update({backgroundName,sourceCredits});
  await renderVideo({jobId:options.jobId,title,format:input.format,script,style:input.style,audioPath:voice.audioPath,durationSeconds:voice.durationSeconds,segments:voice.segments,words:voice.words,broll:visuals.cues,outputDir:options.outputDir,backgroundPath,onProgress:p=>update({progress:Math.round(48+Math.min(1,p)*49)})});
  await fs.writeFile(path.join(options.outputDir,'manifest.json'),JSON.stringify(VideoManifestSchema.parse({schemaVersion:'BrainrottenPlaybackManifestV3',format:input.format,learning,voiceBackend:input.voiceBackend??speechBackend(),jobId:options.jobId,title,cast:input.cast,participants:script.participants,language:input.language,speechSpeed:input.speechSpeed,script,durationSeconds:voice.durationSeconds,segments:voice.segments,words:voice.words,broll:visuals.cues.map(({imagePath,...cue})=>({...cue,...(imagePath?{imageFile:path.basename(imagePath)}:{})})),sourceCredits}),null,2));
  return{script,voice,title,backgroundName,sourceCredits,learning};
}
