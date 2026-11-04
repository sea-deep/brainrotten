import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {insertPauses,pauseSeconds} from './pause.js';

// Real timings from a hosted sketch video that failed on 2026-11-03: eight lines, Pause & Predict on lines 2 and 5.
const ENDS=[10071,16071,19714,25607,31429,36214,41786,50787];
const segments=ENDS.map((endMs,i)=>({turnIndex:i,startMs:i?ENDS[i-1]!:0,endMs}));
const pause={prompt:'What happens next?',choices:['A','B'],answer:0};
const script={title:'t',narrator:'jack',dialogue:ENDS.map((_,i)=>({speaker:'jack',text:`line ${i}`,...(i===2||i===5?{pause}:{})}))} as never;

describe('Pause & Predict timing',()=>{
  it('shifts every later line by every earlier pause, so two pauses keep the order',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pause-'));const audio=path.join(dir,'voice.mp3');
    expect(spawnSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=50.788','-y',audio]).status).toBe(0);
    try{
      const result=await insertPauses({audioPath:audio,durationSeconds:50.788,segments,words:segments},script,dir);
      const gap=pauseSeconds(pause)*1000,limit=Math.round(result.durationSeconds*1000);
      for(const [i,s] of result.segments.entries()){
        expect(s.endMs,`line ${i} ends after it starts`).toBeGreaterThan(s.startMs);
        expect(s.endMs,`line ${i} ends inside the video`).toBeLessThanOrEqual(limit);
        if(i)expect(s.startMs,`line ${i} starts after line ${i-1}`).toBeGreaterThanOrEqual(result.segments[i-1]!.endMs);
      }
      // The line that ends exactly where the second pause starts still moved past the first pause.
      expect(result.segments[5]).toMatchObject({startMs:31429+gap,endMs:36214+gap});
      expect(result.segments[6]!.startMs).toBe(36214+2*gap);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  });
});
