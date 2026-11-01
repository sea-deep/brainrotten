import {describe,it,expect} from 'vitest';
import {normalizeScript,scriptForFormat} from './index.js';

const base={title:'t',dialogue:[{speaker:'jack' as const,text:'One.'},{speaker:'jack' as const,text:'Two.'},{speaker:'jack' as const,text:'Three.'},{speaker:'jack' as const,text:'Four.'}]};
describe('harness auto-fixes instead of rejecting',()=>{
  it('drops pauses that come too early or have no reveal',()=>{
    const pause={prompt:'Guess what?',choices:['A','B'],answer:0};
    const {script,fixes}=normalizeScript({...base,dialogue:base.dialogue.map((l,i)=>i===0||i===3?{...l,pause}:l)} as never,'skit');
    expect(script.dialogue.every(l=>!l.pause)).toBe(true);expect(fixes).toHaveLength(2);
  });
  it('clamps PR ranges and strips pasted diff signs',()=>{
    const pr={title:'Fix',author:{name:'claude-code',icon:'anthropic'},reviewers:[{speaker:'jack',name:'dev',icon:'user'}],verdict:'approve',files:[{path:'a.ts',language:'ts',lines:[{kind:'ctx',code:'x'},{kind:'del',code:'-  old();'},{kind:'add',code:'+  next();'}]}]};
    const raw={...base,pr,dialogue:base.dialogue.map((l,i)=>({...l,pr:i===3?{tone:'praise'}:{file:i===1?5:0,lines:[1,9],tone:'question'}}))};
    const {script,fixes}=normalizeScript(raw as never,'prreview');
    expect(script.pr!.files[0]!.lines.map(l=>l.code)).toEqual(['x','  old();','  next();']);
    expect(script.dialogue[0]!.pr!.lines).toEqual([1,2]);expect(script.dialogue[1]!.pr!.file).toBeUndefined();
    expect(fixes.join(' ')).toContain('Clamped');
    expect(()=>scriptForFormat(raw as never,'prreview')).not.toThrow();
  });
  it('removes duplicate sketch edges and dangling references',()=>{
    const sketch={nodes:[{id:'a',label:'A',kind:'service'},{id:'b',label:'B',kind:'store'}],edges:[{from:'a',to:'b'},{from:'a',to:'b'},{from:'a',to:'zzz'}]};
    const raw={...base,narrator:'jack',sketch,dialogue:base.dialogue.map((l,i)=>i?l:{...l,sketch:{show:['a','ghost'],mark:'fix',note:{text:'hi',near:'ghost'}}})};
    const {script}=normalizeScript(raw as never,'sketch');
    expect(script.sketch!.edges).toHaveLength(1);expect(script.dialogue[0]!.sketch).toEqual({show:['a']});
    expect(()=>scriptForFormat(raw as never,'sketch')).not.toThrow();
  });
  it('moves emoji out of spoken chat text and ignores repeat tier placements',()=>{
    const chat={title:'g',members:[{speaker:'jack',name:'A',icon:'zap'},{speaker:'motu',name:'B',icon:'user'}]};
    const {script}=normalizeScript({...base,chat,dialogue:[{speaker:'jack',text:'It broke 💀'},...base.dialogue.slice(1).map((l,i)=>({...l,speaker:i%2?'jack':'motu'}))]} as never,'groupchat');
    expect(script.dialogue[0]).toMatchObject({text:'It broke',chat:{display:'It broke 💀'}});
    const tierlist={criterion:'speed',items:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}]};
    const tiers=[{place:{item:'a',tier:'S'}},{place:{item:'a',tier:'F'}},{place:{item:'b',tier:'A'}},{place:{item:'c',tier:'B'}}];
    const fixed=normalizeScript({...base,narrator:'jack',tierlist,dialogue:base.dialogue.map((l,i)=>({...l,tier:tiers[i]}))} as never,'tierlist');
    expect(fixed.script.dialogue[1]!.tier!.place).toBeUndefined();
  });
});
