#!/usr/bin/env node
// Listening test for character voices: for each character, plays a slice of the original episode audio, then the same
// line spoken by its clone on each model. Output: .artifacts/voice-ab/<character>.mp3 (original → model A → model B)
// and all.mp3. Spends ElevenLabs credits (about 70 characters per character per model).
// Usage: node scripts/voice-ab-test.mjs [--models eleven_v3,eleven_v4] [--only oggy,jack] [--similarity 0.9] [--stability 0.5]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name,fallback)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:fallback;};
const models=arg('--models','eleven_v3,eleven_v4').split(',');
const only=arg('--only','')?.split(',').filter(Boolean);
const similarity=Number(arg('--similarity','0.9')),stability=Number(arg('--stability','0.5'));
const out=path.join(root,'.artifacts','voice-ab');
const dataDir=process.env.BRAINROT_DATA_DIR??path.join(os.homedir(),'.local/share/brainrot');

function apiKey(){
  if(process.env.ELEVENLABS_API_KEY)return process.env.ELEVENLABS_API_KEY;
  try{const env=fs.readFileSync(path.join(root,'.env'),'utf8').match(/^ELEVENLABS_API_KEY=(.+)$/m);if(env)return env[1].trim().replace(/^['"]|['"]$/g,'');}catch{/* no .env */}
  try{const saved=JSON.parse(fs.readFileSync(path.join(dataDir,'provider-keys.json'),'utf8'));if(saved.elevenlabs)return saved.elevenlabs;}catch{/* none */}
  throw new Error('No ElevenLabs key found.');
}
const key=apiKey();
const registry=JSON.parse(fs.readFileSync(path.join(dataDir,'character-voices.json'),'utf8'));
const O='assets/characters/oggy-and-the-cockroaches/voices',M='assets/characters/motu-patlu/voices',B='assets/characters/bandbudh-aur-budbak/voices';
const originals={oggy:`${O}/oggy`,jack:`${O}/jack`,jhaplu:`${O}/joey`,paplu:`${O}/deedee`,taplu:`${O}/marky`,badri:`${B}/badrinath`,budhdev:`${B}/budhdeb`,motu:`${M}/motu`,patlu:`${M}/patlu`,chingum:`${M}/chingum`,ghasitaram:`${M}/ghasitaram`,jhatka:`${M}/jhatka`,john:`${M}/john`};
// One line for everyone, so differences come from the voice, not the words.
const LINE='Arre yaar, retry kiya toh paise do baar kat gaye! Ab main kya karun, bata na?';

const run=(cmd,args)=>execFileSync(cmd,args,{stdio:['ignore','pipe','pipe']});
const say=text=>process.stderr.write(text+'\n');
fs.mkdirSync(out,{recursive:true});

async function speak(model,voiceId){
  const settings=model==='eleven_v4'?{stability,similarity_boost:similarity}:{stability:1};
  const body={model_id:model,language_code:'hi',inputs:[{text:LINE,voice_id:voiceId}],settings};
  let response=await fetch('https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128',{method:'POST',headers:{'content-type':'application/json','xi-api-key':key},body:JSON.stringify(body)});
  if(!response.ok&&response.status===400&&model==='eleven_v4'){
    const detail=await response.text();
    say(`  ${model}: settings rejected (${detail.replaceAll(key,'[redacted]').slice(0,160)}); retrying with stability only`);
    body.settings={stability};
    response=await fetch('https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128',{method:'POST',headers:{'content-type':'application/json','xi-api-key':key},body:JSON.stringify(body)});
  }
  if(!response.ok)throw new Error(`${model} failed (${response.status}): ${(await response.text()).replaceAll(key,'[redacted]').slice(0,200)}`);
  return Buffer.from(await response.arrayBuffer());
}

/** First ~7 s of the character's real clips (skips the combined file), so the listener hears the target voice. */
function originalSlice(id,file){
  const dir=path.join(root,originals[id]);
  const clips=fs.readdirSync(dir).filter(name=>/\.(wav|mp3|m4a)$/.test(name)&&!name.startsWith('combined')).sort().slice(0,4).map(name=>path.join(dir,name));
  if(!clips.length)return false;
  const inputs=clips.flatMap(clip=>['-i',clip]);
  run('ffmpeg',['-y','-loglevel','error',...inputs,'-filter_complex',`${clips.map((_,i)=>`[${i}:a]aresample=44100,aformat=channel_layouts=mono[a${i}]`).join(';')};${clips.map((_,i)=>`[a${i}]`).join('')}concat=n=${clips.length}:v=0:a=1,atrim=0:7,loudnorm[o]`,'-map','[o]','-ar','44100','-ac','1',file]);
  return true;
}
const tone=file=>run('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','sine=frequency=880:duration=0.18','-af','volume=0.25,apad=pad_dur=0.6','-ar','44100','-ac','1',file]);

const ids=Object.keys(originals).filter(id=>!only?.length||only.includes(id));
tone(path.join(out,'_beep.wav'));
const done=[];
for(const id of ids){
  const voice=registry[id];if(!voice?.id){say(`${id}: no clone, skipped`);continue;}
  say(`${id}`);
  const parts=[];
  const ref=path.join(out,`${id}-original.wav`);if(originalSlice(id,ref))parts.push(ref);
  for(const model of models){
    const file=path.join(out,`${id}-${model}.mp3`);
    if(!fs.existsSync(file))fs.writeFileSync(file,await speak(model,voice.id));
    parts.push(file);say(`  ${model}: ${fs.statSync(file).size} bytes`);
  }
  // original → beep → model A → beep → model B, all loudness-matched
  const seq=parts.flatMap((part,i)=>i?[path.join(out,'_beep.wav'),part]:[part]);
  run('ffmpeg',['-y','-loglevel','error',...seq.flatMap(file=>['-i',file]),'-filter_complex',`${seq.map((_,i)=>`[${i}:a]aresample=44100,aformat=channel_layouts=mono,loudnorm[a${i}]`).join(';')};${seq.map((_,i)=>`[a${i}]`).join('')}concat=n=${seq.length}:v=0:a=1[o]`,'-map','[o]','-b:a','128k',path.join(out,`${id}.mp3`)]);
  done.push(path.join(out,`${id}.mp3`));
}
if(done.length){
  const list=path.join(out,'_list.txt');fs.writeFileSync(list,done.map(file=>`file '${file}'\nfile '${path.join(out,'_beep.wav')}'`).join('\n'));
  run('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',list,'-ar','44100','-ac','1','-b:a','128k',path.join(out,'all.mp3')]);
}
say(`\nListening files in ${path.relative(root,out)}: <character>.mp3 = original → ${models.join(' → ')}`);
