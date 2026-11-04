import {describe,expect,it} from 'vitest';
import {MAX_VIDEO_SECONDS,estimateSpokenSeconds,maxSecondsFor,targetWordsFor} from './duration.js';

describe('video length rules',()=>{
  it('treats the chosen length as a target with room to run longer, never past the ceiling',()=>{
    expect(maxSecondsFor(30)).toBe(60);
    expect(maxSecondsFor(60)).toBe(90);
    expect(maxSecondsFor(180)).toBe(225);
    expect(maxSecondsFor(220)).toBe(MAX_VIDEO_SECONDS);
  });
  it('asks for enough words to fill the chosen length without crossing the limit',()=>{
    for(const seconds of [30,60,120,180]){
      const words=targetWordsFor(seconds,1.12);
      const spoken=estimateSpokenSeconds({dialogue:[{text:Array(words).fill('word').join(' ')}]},1.12);
      expect(spoken).toBeGreaterThan(seconds*0.85);
      expect(spoken).toBeLessThanOrEqual(maxSecondsFor(seconds));
    }
  });
  it('counts Pause & Predict thinking time, but not a pause on the last line',()=>{
    const line=(pause?:boolean)=>({text:'one two three',...(pause?{pause:{}}:{})});
    expect(estimateSpokenSeconds({dialogue:[line(true),line(),line(true)]},1)-estimateSpokenSeconds({dialogue:[line(),line(),line()]},1)).toBe(8);
  });
});
