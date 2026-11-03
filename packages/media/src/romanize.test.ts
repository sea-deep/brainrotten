import {describe,expect,it} from 'vitest';
import {hasDevanagari,romanizeDevanagari,romanizeScriptStrings} from './romanize.js';

describe('Devanagari to Hinglish',()=>{
  it('writes Hindi the way people type Hinglish',()=>{
    expect(romanizeDevanagari('पानी जैसी पीली')).toBe('paani jaisi peeli');
    expect(romanizeDevanagari('क्या')).toBe('kya');
    expect(romanizeDevanagari('घर')).toBe('ghar');
    expect(romanizeDevanagari('ज़िंदगी')).toBe('zindagi');
  });
  it('keeps Latin text, punctuation and mixed sentences intact',()=>{
    expect(romanizeDevanagari('Jack bola: चलो!')).toBe('Jack bola: chalo!');
    expect(romanizeDevanagari('already latin')).toBe('already latin');
  });
  it('converts every string in a script and leaves nothing for the Latin-letters check',()=>{
    const script={title:'टट्टी डांस',dialogue:[{speaker:'oggy',text:'क्या हुआ?'},{speaker:'jack',text:'kuch nahi'}]};
    expect(romanizeScriptStrings(script)).toBe(2);
    expect(hasDevanagari(JSON.stringify(script))).toBe(false);
    expect(script.dialogue[1]!.text).toBe('kuch nahi');
  });
});
