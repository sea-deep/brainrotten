import {describe,it,expect} from 'vitest';
import {GenerateVideoInputSchema,PrReviewScriptSchema,VideoScriptSchema,CREATABLE_FORMATS,RETIRED_FORMATS,retiredFormatMessage} from './index.js';

const pr={title:'Reuse purchase key on retry',repo:'acme/checkout',author:{name:'claude-code',icon:'anthropic'},
  reviewers:[{speaker:'jhatka',name:'senior-dev',icon:'user'}],
  files:[{path:'src/retry.ts',language:'ts',lines:[{kind:'ctx',code:'function retry(order) {'},{kind:'del',code:'  const key = uuid();'},{kind:'add',code:'  const key = order.key;'},{kind:'ctx',code:'}'}]}],verdict:'approve'};
const script={title:'Retry key',pr,dialogue:[
  {speaker:'jhatka',text:'Let us review the retry fix for double charges.',pr:{file:0,lines:[0,3],tone:'question'}},
  {speaker:'jhatka',text:'The old code made a new key on every retry.',pr:{file:0,lines:[1,1],tone:'roast'}},
  {speaker:'jhatka',text:'The reply is lost and the app retries. What happens?',pr:{file:0,lines:[1,1],tone:'question'},pause:{prompt:'What happens on retry?',choices:['Charged twice','Same result'],answer:0}},
  {speaker:'jhatka',text:'Right, it charges twice. Reusing the order key fixes it.',pr:{file:0,lines:[2,2],tone:'praise'}},
  {speaker:'jhatka',text:'Approved.',pr:{tone:'praise'}},
]};

describe('PR review format',()=>{
  it('accepts a real diff, anchored comments, a verdict and a pause',()=>{
    expect(PrReviewScriptSchema.safeParse(script).success).toBe(true);
    expect(GenerateVideoInputSchema.safeParse({format:'prreview',script}).success).toBe(true);
  });
  it('rejects comments outside the diff, non-reviewer voices and files without changes',()=>{
    const withLine=(patch:object)=>({...script,dialogue:[{...script.dialogue[0],pr:{...script.dialogue[0]!.pr,...patch}},...script.dialogue.slice(1)]});
    expect(PrReviewScriptSchema.safeParse(withLine({lines:[2,9]})).success).toBe(false);
    expect(PrReviewScriptSchema.safeParse(withLine({file:2})).success).toBe(false);
    expect(PrReviewScriptSchema.safeParse({...script,dialogue:[...script.dialogue,{speaker:'motu',text:'Nice.'}]}).success).toBe(false);
    expect(PrReviewScriptSchema.safeParse({...script,pr:{...pr,files:[{path:'a.ts',lines:[{kind:'ctx',code:'x'}]}]}}).success).toBe(false);
    expect(PrReviewScriptSchema.safeParse({...script,pr:{...pr,files:[{path:'a.ts',lines:[{kind:'add',code:'x'.repeat(47)}]}]}}).success).toBe(false);
  });
  it('needs at least one comment on real lines',()=>{
    expect(PrReviewScriptSchema.safeParse({...script,dialogue:script.dialogue.map(({pr:_pr,pause:_pause,...line})=>line)}).success).toBe(false);
  });
});

describe('Pause & Predict',()=>{
  it('needs a following reveal line and at most two pauses',()=>{
    const last={...script,dialogue:[...script.dialogue.slice(0,4),{...script.dialogue[4]!,pause:{prompt:'Ready to merge?',choices:['Yes','No'],answer:0}}]};
    expect(VideoScriptSchema.safeParse(last).success).toBe(false);
    const p={prompt:'Guess the result?',choices:['A','B'],answer:1};
    const many={...script,dialogue:[0,1,2,3].map(i=>({speaker:'jhatka',text:`Line ${i}`,...(i<3?{pause:p}:{})}))};
    expect(VideoScriptSchema.safeParse(many).success).toBe(false);
  });
  it('validates choices and thinking time',()=>{
    const bad=(pause:object)=>VideoScriptSchema.safeParse({...script,dialogue:script.dialogue.map((line,i)=>i===2?{...line,pause}:line)}).success;
    expect(bad({prompt:'Which one?',choices:['A','B'],answer:0})).toBe(true);
    expect(bad({prompt:'Which one?',choices:['A','A'],answer:0})).toBe(false);
    expect(bad({prompt:'Which one?',choices:['A','B'],answer:3})).toBe(false);
    expect(bad({prompt:'Which one?',choices:['A','B'],answer:0,seconds:11})).toBe(false);
  });
  it('gives the viewer context first: no pause on the first two lines',()=>{
    const early=(index:number)=>VideoScriptSchema.safeParse({...script,dialogue:script.dialogue.map(({pause:_p,...line},i)=>i===index?{...line,pause:{prompt:'Guess the result?',choices:['A','B'],answer:0}}:line)});
    expect(early(0).success).toBe(false);expect(early(1).success).toBe(false);expect(early(2).success).toBe(true);
    expect(JSON.stringify(early(1).error?.issues)).toContain('context first');
  });
});

describe('retired formats',()=>{
  it('stay readable but are not offered for new videos',()=>{
    expect(CREATABLE_FORMATS.map(f=>f.id)).toEqual(['skit','groupchat','sketch','tierlist','prreview']);
    expect([...RETIRED_FORMATS]).toEqual(['casefile','whiteboard','pov']);
    expect(retiredFormatMessage('pov')).toContain('retired');expect(retiredFormatMessage('skit')).toBeUndefined();
  });
});
