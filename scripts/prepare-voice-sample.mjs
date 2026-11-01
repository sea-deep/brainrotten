import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);

// Keep the source recording/hash intact. Large stereo WAVs can exceed the
// provider's upload limit; FLAC keeps the full recording without MP3 artifacts.
export async function prepareVoiceSample(source,buffer){
  if(buffer.length<=10_000_000)return{buffer,type:'audio/wav',filename:path.basename(source),converted:false};
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-voice-'));
  try{
    const output=path.join(temporary,'sample.flac');
    for(const sampleRate of[44100,24000]){
      await execute(process.env.FFMPEG_PATH??'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,'-map','0:a:0','-vn','-ac','1','-ar',String(sampleRate),'-c:a','flac',output],{timeout:60000});
      const prepared=await fs.readFile(output);
      if(prepared.length<=10_000_000)return{buffer:prepared,type:'audio/flac',filename:path.basename(source,path.extname(source))+'.flac',converted:true};
    }
    throw new Error('The prepared voice sample still exceeds the upload size limit.');
  }finally{await fs.rm(temporary,{recursive:true,force:true});}
}
