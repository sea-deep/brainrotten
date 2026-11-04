import {maxSecondsFor} from '@brainrot/contracts';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod/v4';
import type {CharacterId,ValidatedVideoInput,VideoScript} from '@brainrot/contracts';
import type {VoiceResult} from './providers.js';
import {GenerationError} from './generationError.js';
import {workspaceRoot,loadStudioEnv,localDataDir} from './env.js';
const execute=promisify(execFile);
export const LOCAL_VOICE_REVISION='880744846e630eee8c80a21527fd93c9e8217931';
export const LOCAL_VOICE_SOURCES:Record<CharacterId,string>={oggy:'assets/characters/oggy-and-the-cockroaches/voices/oggy/combined_oggy_full.wav',jack:'assets/characters/oggy-and-the-cockroaches/voices/jack voice.mp3',badri:'assets/characters/bandbudh-aur-budbak/voices/badrinath/combined_badrinath_full.wav',budhdev:'assets/characters/bandbudh-aur-budbak/voices/budhdeb/combined_budhdeb_full.wav',jhaplu:'assets/characters/oggy-and-the-cockroaches/voices/joey/combined_joey_full.wav',paplu:'assets/characters/oggy-and-the-cockroaches/voices/deedee/combined_deedee_full.wav',taplu:'assets/characters/oggy-and-the-cockroaches/voices/marky/combined_marky_full.wav',motu:'assets/characters/motu-patlu/voices/motu/combined_motu_1min.wav',patlu:'assets/characters/motu-patlu/voices/patlu/combined_patlu_1min.wav',chingum:'assets/characters/motu-patlu/voices/chingum/combined_chingum_1min.wav',ghasitaram:'assets/characters/motu-patlu/voices/ghasitaram/combined_ghasitaram_1min.wav',jhatka:'assets/characters/motu-patlu/voices/jhatka/combined_jhatka_1min.wav',john:'assets/characters/motu-patlu/voices/john/combined_john_1min.wav'};
export function speechBackend():'elevenlabs'|'maya-local'{
  loadStudioEnv();if(process.env['BRAINROTTEN_MODE']==='hosted')return 'elevenlabs';
  let configured=process.env['BRAINROTTEN_SPEECH_BACKEND'];
  if(process.env['BRAINROT_SKIP_ENV']!=='1'){try{configured=JSON.parse(fs.readFileSync(path.join(localDataDir(),'voice-backend.json'),'utf8')).backend??configured;}catch{/*Environment/default.*/}}
  return configured==='maya-local'?'maya-local':'elevenlabs';
}
export function saveSpeechBackend(backend:'elevenlabs'|'maya-local'):void{
  if(process.env['BRAINROTTEN_MODE']==='hosted')throw new GenerationError('Voice backend settings are local-only.');
  if(backend==='maya-local'&&!localVoiceReady())throw new GenerationError('Prepare and verify the local voice engine before selecting it.');
  fs.mkdirSync(localDataDir(),{recursive:true,mode:0o700});fs.writeFileSync(path.join(localDataDir(),'voice-backend.json'),JSON.stringify({backend}),{mode:0o600});
}
export function localVoicePaths(){const root=process.env['BRAINROTTEN_LOCAL_VOICE_DIR']??path.join(os.homedir(),'.local/share/brainrotten-voice');return{root,python:path.join(root,'.venv/bin/python'),model:path.join(root,'models/maya2-native-bf16'),marker:path.join(root,'ready.json'),worker:path.join(workspaceRoot,'tools/local-voice/render_speech.py')};}
export function localVoiceReady():boolean{if(process.env['BRAINROT_SKIP_ENV']==='1'&&!process.env['BRAINROTTEN_LOCAL_VOICE_DIR'])return false;const p=localVoicePaths();if(process.env['BRAINROTTEN_MODE']==='hosted')return false;try{return fs.existsSync(p.python)&&fs.existsSync(p.worker)&&fs.existsSync(path.join(p.model,'config.json'))&&(()=>{const marker=JSON.parse(fs.readFileSync(p.marker,'utf8'));return marker.modelRevision===LOCAL_VOICE_REVISION&&marker.precision==='bf16'&&marker.conditioning==='icl_spk';})();}catch{return false;}}
const hashes=new Map<string,{stamp:string;hash:string}>();
function fileHash(file:string):string{const stat=fs.statSync(file),stamp=`${stat.mtimeMs}:${stat.size}`;let saved=hashes.get(file);if(saved?.stamp===stamp)return saved.hash;saved={stamp,hash:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};hashes.set(file,saved);return saved.hash;}
export function localReference(id:CharacterId):{audioPath:string;text:string;language:string;sourceHash:string;referenceHash:string}|undefined{
  try{const root=localVoicePaths().root,entry=JSON.parse(fs.readFileSync(path.join(root,'references/index.json'),'utf8')).voices[id];if(!entry||entry.file!==id+'.wav'||!entry.text?.trim()||!['as','bn','en','gu','hi','kn','ml','mr','or','pa','ta','te'].includes(entry.language)||entry.sourceHash!==fileHash(path.join(workspaceRoot,LOCAL_VOICE_SOURCES[id])))return;const audioPath=path.join(root,'references',entry.file);if(entry.referenceHash!==fileHash(audioPath))return;return{audioPath,text:entry.text,language:entry.language,sourceHash:entry.sourceHash,referenceHash:entry.referenceHash};}catch{return;}
}
export function localReferenceReady(id:CharacterId):boolean{return Boolean(localReference(id));}
export function mergeLocalPunctuation<T extends {text:string;speaker:string;turnIndex:number;startMs:number;endMs:number}>(words:T[]):T[]{
  const merged:T[]=[];for(const word of words){const previous=merged.at(-1);if(previous&&previous.speaker===word.speaker&&previous.turnIndex===word.turnIndex&&/^[.,!?;:]+$/.test(word.text)){previous.text+=word.text;previous.endMs=Math.max(previous.endMs,word.endMs);}else merged.push({...word});}return merged;
}
const receiptSchema=z.object({durationSeconds:z.number().positive(),segments:z.array(z.object({speaker:z.string(),turnIndex:z.number().int().nonnegative(),text:z.string(),startMs:z.number().nonnegative(),endMs:z.number().nonnegative()})),words:z.array(z.object({speaker:z.string(),turnIndex:z.number().int().nonnegative(),text:z.string().min(1),startMs:z.number().nonnegative(),endMs:z.number().nonnegative()}))});
export async function synthesizeLocal(script:VideoScript,input:ValidatedVideoInput,dataDir:string):Promise<VoiceResult>{
  if(!localVoiceReady())throw new GenerationError('The local voice engine is not prepared. Run its explicit setup and voice check before generating.');
  if(input.voiceIds)throw new GenerationError('Provider voice IDs apply to ElevenLabs. Local speech uses the supplied character recordings.');
  const selected=[...new Set(script.dialogue.map(line=>line.speaker))],prepared=Object.fromEntries(selected.map(id=>[id,localReference(id)]));
  if(selected.some(id=>!prepared[id]))throw new GenerationError('A selected character reference needs preparation. Refresh the local references after changing recordings.');
  const paths=localVoicePaths();
  const hash=createHash('sha256').update(JSON.stringify({dialogue:script.dialogue.map(line=>({speaker:line.speaker,text:line.text})),language:input.language,references:prepared,modelRevision:LOCAL_VOICE_REVISION,precision:'bf16',conditioning:'icl_spk',version:2})).digest('hex');
  const directory=path.join(dataDir,'local-voice-cache-v2',hash);await fsp.mkdir(directory,{recursive:true,mode:0o700});
  const resultFile=path.join(directory,'result.json');
  if(!fs.existsSync(resultFile)){
    const request=path.join(directory,'request.json');await fsp.writeFile(request,JSON.stringify({dialogue:script.dialogue,references:prepared,language:input.language==='en'?'en':input.language==='benglish'?'bn':'hi',speechSpeed:input.speechSpeed,modelPath:paths.model,modelRevision:LOCAL_VOICE_REVISION}),{mode:0o600});
    try{await execute(paths.python,[paths.worker,'--request',request,'--output',directory],{timeout:3600000,maxBuffer:2_000_000,env:{...process.env,HF_HUB_OFFLINE:'1',PYTHONUNBUFFERED:'1'}});}catch(error){await fsp.writeFile(path.join(directory,'worker-error.log'),error instanceof Error?error.message:'Local voice generation failed',{mode:0o600});throw new GenerationError('Local speech or caption alignment failed. Its completed audio is cached for review; no paid voice fallback ran.');}
  }
  const result=receiptSchema.parse(JSON.parse(await fsp.readFile(resultFile,'utf8')));
  if(result.segments.length!==script.dialogue.length||result.segments.some((s,i)=>s.turnIndex!==i||s.speaker!==script.dialogue[i]!.speaker||s.text!==script.dialogue[i]!.text)||result.words.some(w=>!selected.includes(w.speaker as CharacterId)||w.turnIndex>=script.dialogue.length||script.dialogue[w.turnIndex]?.speaker!==w.speaker||w.endMs<=w.startMs||w.endMs>result.durationSeconds*1000+2))throw new GenerationError('Local speech timing did not match the submitted script. Review its cached output.');
  const audioPath=path.join(directory,`audio-${input.speechSpeed}.mp3`);if(!fs.existsSync(audioPath))await execute(process.env['FFMPEG_PATH']??'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(directory,'source.wav'),'-af',`atempo=${input.speechSpeed}`,'-c:a','libmp3lame','-b:a','128k',audioPath]);
  const durationSeconds=result.durationSeconds/input.speechSpeed;if(durationSeconds>maxSecondsFor(input.durationSeconds))throw new GenerationError(`The spoken script runs about ${Math.round(durationSeconds)} seconds, longer than a ${input.durationSeconds}-second video allows. Shorten the script and try again.`);
  return{audioPath,durationSeconds,segments:result.segments.map(s=>({...s,speaker:s.speaker as CharacterId,startMs:Math.round(s.startMs/input.speechSpeed),endMs:Math.round(s.endMs/input.speechSpeed)})),words:mergeLocalPunctuation(result.words).map(w=>({...w,speaker:w.speaker as CharacterId,startMs:Math.round(w.startMs/input.speechSpeed),endMs:Math.round(w.endMs/input.speechSpeed)}))};
}
