import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareVoiceSample} from './prepare-voice-sample.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
const dir=process.env.BRAINROT_DATA_DIR??path.join(os.homedir(),'.local/share/brainrot');
let settings={};try{settings=JSON.parse(await fs.readFile(path.join(dir,'provider-keys.json'),'utf8'));}catch{}
const key=settings.elevenlabs||process.env.ELEVENLABS_API_KEY;if(!key)throw new Error('Add your ElevenLabs key in Settings or .env.');
await fs.mkdir(dir,{recursive:true,mode:0o700});
const file=path.join(dir,'character-voices.json'),fingerprint=createHash('sha256').update(key).digest('hex');
let voices={};try{voices=JSON.parse(await fs.readFile(file,'utf8'));}catch{}
if(voices._keyFingerprint&&voices._keyFingerprint!==fingerprint)voices={};voices._keyFingerprint=fingerprint;
const account=await fetch('https://api.elevenlabs.io/v2/voices?page_size=100',{headers:{'xi-api-key':key}});
if(!account.ok)throw new Error(`Cannot list account voices (${account.status})`);
const existing=(await account.json()).voices??[];
const samples=[['oggy','Oggy','assets/characters/oggy-and-the-cockroaches/voices/oggy/combined_oggy_full.wav'],['jack','Jack','assets/characters/oggy-and-the-cockroaches/voices/jack/combined_jack_full.wav'],['badri','Badri','assets/characters/bandbudh-aur-budbak/voices/badrinath/combined_badrinath_full.wav'],['budhdev','Budhdev','assets/characters/bandbudh-aur-budbak/voices/budhdeb/combined_budhdeb_full.wav'],['jhaplu','Jhaplu','assets/characters/oggy-and-the-cockroaches/voices/joey/combined_joey_full.wav'],['paplu','Paplu','assets/characters/oggy-and-the-cockroaches/voices/deedee/combined_deedee_full.wav'],['taplu','Taplu','assets/characters/oggy-and-the-cockroaches/voices/marky/combined_marky_full.wav'],...['motu','patlu','chingum','ghasitaram','jhatka','john'].map(id=>[id,id[0].toUpperCase()+id.slice(1),`motupatlu/${id}/combined_${id}_full.wav`])];
let failures=0;
for(const[id,label,relative]of samples){
  const saved=voices[id];
  if(saved?.pinned){if(existing.some(voice=>voice.voice_id===saved.id)){console.log(`${label}: user-selected clone retained (pinned)`);continue;}console.log(`${label}: pinned clone is unavailable; choose a replacement explicitly.`);failures++;continue;}
  const buffer=await fs.readFile(path.join(root,relative)),sampleHash=createHash('sha256').update(buffer).digest('hex');
  const name=`Brainrotten ${label} Hindi ${sampleHash.slice(0,8)}`;
  // Existing Badri/Budhdev clones already used these exact samples in the first setup.
  const unchangedLegacy=['badri','budhdev'].includes(id)&&saved?.status==='ready'&&!saved.sampleHash;
  const match=existing.find(v=>v.name===name)||(unchangedLegacy?existing.find(v=>v.voice_id===saved.id):undefined);
  if(match){voices[id]={id:match.voice_id,name:label,status:'ready',sampleHash};console.log(`${label}: matching sample clone reused`);}
  else if(saved?.sampleHash===sampleHash&&saved.status==='ready'&&existing.some(v=>v.voice_id===saved.id)){console.log(`${label}: matching saved clone reused`);}
  else{
    const prepared=await prepareVoiceSample(path.join(root,relative),buffer);
    if(prepared.converted)console.log(`${label}: prepared a smaller FLAC upload; original recording preserved`);
    const form=new FormData();form.append('name',name);form.append('description',`Hindi ${label} voice cloned from the user-supplied reference recording.`);form.append('labels',JSON.stringify({language:'hi',project:'brainrotten',character:id,sample:sampleHash.slice(0,8)}));form.append('remove_background_noise','true');form.append('files',new Blob([prepared.buffer],{type:prepared.type}),prepared.filename);
    const response=await fetch('https://api.elevenlabs.io/v1/voices/add',{method:'POST',headers:{'xi-api-key':key},body:form,signal:AbortSignal.timeout(120000)});
    const result=await response.json();
    if(!response.ok){const reason=String(result.detail?.message??result.detail?.status??'').replaceAll(key,'[redacted]').replace(/\s+/g,' ').slice(0,180);console.log(`${label}: clone rejected (${response.status})${reason?`: ${reason}`:''}; existing voice left unchanged.`);failures++;continue;}
    voices[id]={id:result.voice_id,name:label,status:result.requires_verification?'verification_required':'ready',sampleHash};console.log(`${label}: ${voices[id].status} from current recording`);
  }
  await fs.writeFile(file,JSON.stringify(voices,null,2),{mode:0o600});
}
console.log('Private clone registry saved. Original provider voices were preserved.');
if(failures)process.exitCode=1;
