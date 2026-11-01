import {describe,it,expect} from 'vitest';
import {GenerateVideoInputSchema,GroupChatScriptSchema,scriptForFormat,VIDEO_FORMATS} from './index.js';

export const groupChatScript={
  title:'Why the retry charged twice',
  chat:{title:'checkout-prod 💀',members:[{speaker:'motu',name:'Client',icon:'smartphone',you:true},{speaker:'jack',name:'Payment API',icon:'server'},{speaker:'patlu',name:'Postgres',icon:'postgresql'}]},
  dialogue:[
    {speaker:'motu',text:'Did my payment go through? I got no response.',chat:{display:'did my payment go through?? no response 😭'}},
    {speaker:'jack',text:'It went through. The reply got lost on the way back.'},
    {speaker:'motu',text:'Okay, I am retrying with a brand new key.',chat:{reaction:'💀'}},
    {speaker:'patlu',text:'A new key means a new purchase, so I am charging you again.',chat:{code:'INSERT purchase\n  key = uuid()  -- new!'}},
    {speaker:'jack',text:'Send the same purchase key on every retry and I will return the first result.'},
  ],
};

describe('group chat format',()=>{
  it('is discoverable with up to four voices',()=>{expect(VIDEO_FORMATS.find(f=>f.id==='groupchat')).toMatchObject({speakers:4});});
  it('accepts members, display text, reactions and short code',()=>{
    const script=scriptForFormat(groupChatScript as never,'groupchat');
    expect(script.chat?.members).toHaveLength(3);expect(script.dialogue[0]?.chat?.display).toContain('😭');
    expect(GenerateVideoInputSchema.safeParse({format:'groupchat',script:groupChatScript}).success).toBe(true);
  });
  it('rejects messages from non-members, duplicate voices and two "you" members',()=>{
    const bad=(patch:object)=>GroupChatScriptSchema.safeParse({...groupChatScript,...patch}).success;
    expect(bad({dialogue:[...groupChatScript.dialogue,{speaker:'oggy',text:'Who invited me?'}]})).toBe(false);
    expect(bad({chat:{title:'x',members:[{speaker:'jack',name:'A',icon:'zap'},{speaker:'jack',name:'B',icon:'zap'}]}})).toBe(false);
    expect(bad({chat:{title:'x',members:[{speaker:'jack',name:'A',icon:'zap',you:true},{speaker:'motu',name:'B',icon:'zap',you:true}]}})).toBe(false);
  });
  it('keeps emoji out of spoken text and code readable on a phone',()=>{
    const lines=(text:string,chat?:object)=>({...groupChatScript,dialogue:[{speaker:'motu',text,...(chat?{chat}:{})},...groupChatScript.dialogue.slice(1)]});
    expect(GroupChatScriptSchema.safeParse(lines('This is fine 💀')).success).toBe(false);
    expect(GroupChatScriptSchema.safeParse(lines('Look at this',{code:'x'.repeat(40)})).success).toBe(false);
  });
  it('requires an icon for every member',()=>{const noIcon={...groupChatScript,chat:{...groupChatScript.chat,members:groupChatScript.chat.members.map(({icon:_icon,...m})=>m)}};expect(GroupChatScriptSchema.safeParse(noIcon).success).toBe(false);});
  it('needs a chat block and real back-and-forth, not a narrator',()=>{
    const {chat:_chat,...withoutChat}=groupChatScript;
    expect(GroupChatScriptSchema.safeParse(withoutChat).success).toBe(false);
    const solo=GenerateVideoInputSchema.safeParse({format:'groupchat',script:{...groupChatScript,dialogue:groupChatScript.dialogue.map(line=>({...line,speaker:'jack'}))}});
    expect(solo.success).toBe(false);
    expect(GenerateVideoInputSchema.safeParse({format:'groupchat',narrator:'jack',script:groupChatScript}).success).toBe(false);
  });
});
