/**
 * Romanizes Devanagari (Hindi) the way people type Hinglish: क्या → kya, है → hai, पानी → paani. Models sometimes
 * write Hindi words in Devanagari even when asked for Latin letters; the captions and voices need Latin, so the
 * script is converted instead of rejected. Text without Devanagari is returned unchanged.
 */
const CONSONANTS:Record<string,string>={
  'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'n','च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'n','ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n',
  'त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'sh','ष':'sh',
  'स':'s','ह':'h','क़':'q','ख़':'kh','ग़':'gh','ज़':'z','ड़':'r','ढ़':'rh','फ़':'f','य़':'y',
};
const NUKTA:Record<string,string>={'क':'q','ख':'kh','ग':'gh','ज':'z','ड':'r','ढ':'rh','फ':'f','य':'y'};
const VOWELS:Record<string,string>={'अ':'a','आ':'aa','इ':'i','ई':'ee','उ':'u','ऊ':'oo','ऋ':'ri','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ऑ':'o','ऍ':'e'};
const SIGNS:Record<string,string>={'ा':'aa','ि':'i','ी':'ee','ु':'u','ू':'oo','ृ':'ri','े':'e','ै':'ai','ो':'o','ौ':'au','ॉ':'o','ॅ':'e'};
const MARKS:Record<string,string>={'ं':'n','ँ':'n','ः':'h','।':'.','॥':'.','ॐ':'om'};
const DEVANAGARI=/[ऀ-ॿ]/;

export function hasDevanagari(text:string):boolean{return DEVANAGARI.test(text);}

function romanizeWord(word:string):string{
  let out='';
  for(let i=0;i<word.length;i++){
    const ch=word[i]!,next=word[i+1];
    let consonant=CONSONANTS[ch];
    if(consonant!==undefined){
      if(next==='़'){consonant=NUKTA[ch]??consonant;i++;}
      out+=consonant;
      const after=word[i+1];
      if(after==='्'){i++;continue;}                 // virama: no vowel
      if(after&&SIGNS[after]!==undefined){out+=SIGNS[after];i++;continue;}
      out+='a';                                           // inherent vowel; trimmed at word end below
      continue;
    }
    if(VOWELS[ch]!==undefined){out+=VOWELS[ch];continue;}
    if(MARKS[ch]!==undefined){out+=MARKS[ch];continue;}
    if(ch>='०'&&ch<='९'){out+=String(ch.charCodeAt(0)-0x966);continue;}
    if(SIGNS[ch]!==undefined){out+=SIGNS[ch];continue;}
    if(ch==='्'||ch==='़')continue;
    out+=ch;
  }
  // Hinglish spelling: no trailing inherent "a" (ghar, not ghara), and a final long "aa" is written "a" (kya, tha).
  if(/[^aeiou]a$/.test(out)&&out.length>2&&!/aa$/.test(out))out=out.slice(0,-1);
  return out.replace(/aa$/,'a').replace(/ee$/,'i');
}

export function romanizeDevanagari(text:string):string{
  if(!hasDevanagari(text))return text;
  return text.replace(/[ऀ-ॿ]+/g,word=>romanizeWord(word));
}

/** Romanizes every string in parsed script JSON, in place. Returns how many strings changed. */
export function romanizeScriptStrings(value:unknown):number{
  let changed=0;
  const walk=(node:unknown):unknown=>{
    if(typeof node==='string'){if(!hasDevanagari(node))return node;changed++;return romanizeDevanagari(node);}
    if(Array.isArray(node)){for(let i=0;i<node.length;i++)node[i]=walk(node[i]);return node;}
    if(node&&typeof node==='object'){const record=node as Record<string,unknown>;for(const key of Object.keys(record))record[key]=walk(record[key]);return record;}
    return node;
  };
  walk(value);
  return changed;
}
