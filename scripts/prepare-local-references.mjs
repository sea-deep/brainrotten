// Explicit setup only. --scribe opts into one transcription request per changed reference.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {LOCAL_VOICE_SOURCES,localVoicePaths,workspaceRoot,providerKeys} from '../packages/media/dist/index.js';
const execute=promisify(execFile),{root,python}=localVoicePaths(),directory=path.join(root,'references');await fs.mkdir(directory,{recursive:true,mode:0o700});
const key=process.argv.includes('--scribe')?providerKeys().elevenlabs:undefined;if(process.argv.includes('--scribe')&&!key)throw new Error('Scribe reference preparation requires your configured ElevenLabs key.');
let registry={schemaVersion:'BrainrottenLocalReferencesV1',voices:{}};try{registry=JSON.parse(await fs.readFile(path.join(directory,'index.json'),'utf8'));}catch{}
const iso={asm:'as',ben:'bn',eng:'en',guj:'gu',hin:'hi',kan:'kn',mal:'ml',mar:'mr',ori:'or',pan:'pa',tam:'ta',tel:'te',as:'as',bn:'bn',en:'en',gu:'gu',hi:'hi',kn:'kn',ml:'ml',mr:'mr',or:'or',pa:'pa',ta:'ta',te:'te'};
for(const[id,relative]of Object.entries(LOCAL_VOICE_SOURCES)){
 const source=path.join(workspaceRoot,relative),sourceHash=createHash('sha256').update(await fs.readFile(source)).digest('hex'),file=id+'.wav',audioPath=path.join(directory,file);
 if(registry.voices[id]?.sourceHash===sourceHash){try{const current=createHash('sha256').update(await fs.readFile(audioPath)).digest('hex');if(current===registry.voices[id].referenceHash){console.log(id+': prepared reference reused');continue;}}catch{}}
 await execute(process.env.FFMPEG_PATH??'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,'-t','8','-ac','1','-ar','24000',audioPath]);
 let transcript;
 if(key){const form=new FormData();form.append('model_id','scribe_v2');form.append('tag_audio_events','false');form.append('file',new Blob([await fs.readFile(audioPath)],{type:'audio/wav'}),file);const response=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':key},body:form,signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('Reference transcription rejected for '+id+' (HTTP '+response.status+').');transcript=await response.json();}
 else{const out=path.join(directory,id+'-transcript.json');await execute(python,[path.join(workspaceRoot,'tools/local-voice/transcribe_reference.py'),'--audio',audioPath,'--output',out],{env:{...process.env,HF_HUB_OFFLINE:'1'},timeout:120000});transcript=JSON.parse(await fs.readFile(out,'utf8'));}
 await fs.writeFile(path.join(directory,id+'-transcript.json'),JSON.stringify(transcript,null,2),{mode:0o600});
 const language=iso[transcript.language_code];if(!language||!transcript.text?.trim()||transcript.text.length<8)throw new Error('Review the language/content of '+id+' before preparing its clone.');
 const buffer=await fs.readFile(audioPath);registry.voices[id]={file,text:transcript.text.trim(),language,source:relative,sourceHash,referenceHash:createHash('sha256').update(buffer).digest('hex'),transcriber:key?'scribe_v2':'local-whisper-base',preparedAt:new Date().toISOString()};
 await fs.writeFile(path.join(directory,'index.json'),JSON.stringify(registry,null,2),{mode:0o600});console.log(id+': reference prepared ('+language+')');
}
