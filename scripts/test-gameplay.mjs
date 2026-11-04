// Vitest global setup: render tests need background gameplay clips, which are third-party media kept out of git.
// When assets/gameplay is not present, make short synthetic clips (FFmpeg test pattern) in a temp folder and point
// BRAINROT_GAMEPLAY_DIR at them, so the tests run anywhere without the private media. Without FFmpeg it does nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const IDS=['minecraft-lava','minecraft-end','subway-surfers','gta-stunts'];

export default function setup(){
  if(process.env.BRAINROT_GAMEPLAY_DIR)return;
  const real=path.join(root,'assets/gameplay');
  if(IDS.every(id=>fs.existsSync(path.join(real,`${id}.mp4`)))&&fs.existsSync(path.join(real,'sources.json')))return;
  // Without FFmpeg nothing can be rendered anyway (render tests skip themselves), so there is nothing to make.
  try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brainrot-test-gameplay-'));
  IDS.forEach((id,index)=>execFileSync('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i',`testsrc2=size=360x640:rate=30:duration=4,hue=h=${index*90}`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-an',path.join(dir,`${id}.mp4`)]));
  fs.writeFileSync(path.join(dir,'sources.json'),JSON.stringify({clips:IDS.map(id=>({id,title:`Test pattern (${id})`,sourceUrl:'https://ffmpeg.org/ffmpeg-filters.html#testsrc2',attribution:'Synthetic FFmpeg test pattern'}))}));
  process.env.BRAINROT_GAMEPLAY_DIR=dir;
  return()=>fs.rmSync(dir,{recursive:true,force:true});
}
