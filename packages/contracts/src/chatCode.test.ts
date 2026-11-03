import {describe,expect,it} from 'vitest';
import {CHAT_CODE_COLUMNS,CHAT_CODE_ROWS,ChatLineSchema,fitChatCode,fitChatCodeInRawScript} from './videoSchema.js';

const fits=(code:string)=>{const rows=code.split('\n');return rows.length<=CHAT_CODE_ROWS&&rows.every(row=>row.length<=CHAT_CODE_COLUMNS);};

describe('chat code bubbles fit a phone',()=>{
  it('leaves code that already fits unchanged',()=>{const code='const x = 1;\nreturn x;';expect(fitChatCode(code)).toBe(code);});
  it('wraps long lines at a space or punctuation, indenting the continuation',()=>{
    const out=fitChatCode('const result = await fetch(url, { method: "POST" });');
    expect(fits(out)).toBe(true);expect(out.split('\n').length).toBeGreaterThan(1);expect(out.split('\n')[1]!.startsWith('  ')).toBe(true);
    expect(ChatLineSchema.safeParse({code:out}).success).toBe(true);
  });
  it('cuts an unbreakable run with an ellipsis',()=>{const out=fitChatCode('x'.repeat(80));expect(fits(out)).toBe(true);expect(out.endsWith('…')).toBe(true);});
  it('ends with an ellipsis row when there are too many lines',()=>{const out=fitChatCode(Array.from({length:14},(_,i)=>`step${i}();`).join('\n'));expect(fits(out)).toBe(true);expect(out.split('\n').at(-1)).toBe('…');});
  it('fixes every bubble in a raw model script before validation',()=>{
    const raw={dialogue:[{speaker:'jack',text:'hi',chat:{code:'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL;'}},{speaker:'john',text:'ok'}]};
    expect(fitChatCodeInRawScript(raw)).toBe(1);expect(fits(raw.dialogue[0]!.chat!.code)).toBe(true);
  });
});
