import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {speedUpToFit} from './providers.js';

// Speech that runs a little long is sped up with FFmpeg instead of being thrown away (it was already paid for).
const chunkFolder=(seconds:number)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'speech-fit-'));const chunk=path.join(dir,'chunk.mp3');
  expect(spawnSync('ffmpeg',['-loglevel','error','-f','lavfi','-i',`sine=frequency=330:duration=${seconds}`,'-y',chunk]).status).toBe(0);
  fs.writeFileSync(path.join(dir,'inputs.txt'),`file '${chunk}'`);return dir;
};

describe('speech that runs a little long',()=>{
  it('is sped up to fit the allowed length',async()=>{
    const dir=chunkFolder(20);
    try{
      // 20 s of raw speech at speech speed 1.0 that may only take 18 s: about 1.11x faster.
      const fitted=await speedUpToFit(dir,20,18,1);
      expect(fitted.speed).toBeCloseTo(20/18,2);
      expect(fitted.durationSeconds).toBeGreaterThan(17.5);expect(fitted.durationSeconds).toBeLessThanOrEqual(18.2);
      expect(fs.existsSync(fitted.path)).toBe(true);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  });
  it('refuses to rush speech more than 1.25x',async()=>{
    const dir=chunkFolder(2);
    try{await expect(speedUpToFit(dir,30,20,1)).rejects.toThrow(/rushed/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
  });
});
