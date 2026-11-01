import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareVoiceSample} from './prepare-voice-sample.mjs';
const execute=promisify(execFile);

test('oversized stereo WAV becomes a bounded full-duration FLAC without changing its source',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-voice-test-'));
  try{
    const frames=3_000_000,rate=48000,channels=2,bytes=frames*channels*2,buffer=Buffer.alloc(44+bytes);
    buffer.write('RIFF');buffer.writeUInt32LE(36+bytes,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(channels,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*channels*2,28);buffer.writeUInt16LE(channels*2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(bytes,40);
    const source=path.join(directory,'large.wav');await fs.writeFile(source,buffer);
    const result=await prepareVoiceSample(source,buffer);
    assert.equal(result.converted,true);assert.equal(result.type,'audio/flac');assert.ok(result.buffer.length<10_000_000);assert.equal(result.buffer.subarray(0,4).toString(),'fLaC');
    assert.equal(createHash('sha256').update(await fs.readFile(source)).digest('hex'),createHash('sha256').update(buffer).digest('hex'));
    const output=path.join(directory,result.filename);await fs.writeFile(output,result.buffer);
    const probe=JSON.parse((await execute(process.env.FFPROBE_PATH??'ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,channels','-of','json',output])).stdout);
    assert.equal(probe.streams[0].codec_name,'flac');assert.equal(probe.streams[0].channels,1);assert.ok(Math.abs(Number(probe.format.duration)-frames/rate)<.01);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
