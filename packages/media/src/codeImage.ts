import fs from 'node:fs/promises';
import path from 'node:path';
import {codeToImage,type CodeToImageOptions} from 'shiki-image';
import {format} from 'prettier';
import sharp from 'sharp';
import {workspaceRoot} from './env.js';
const parsers:Record<string,string>={js:'babel',javascript:'babel',ts:'typescript',typescript:'typescript',jsx:'babel',tsx:'typescript',json:'json',css:'css',html:'html',xml:'html',md:'markdown',markdown:'markdown',yaml:'yaml',yml:'yaml'};
const aliases:Record<string,string>={js:'javascript',ts:'typescript',shell:'bash',sh:'bash',py:'python',yml:'yaml',txt:'text',plaintext:'text'};
async function formatCode(code:string,language:string):Promise<string>{
  let formatted=code.replace(/\r\n/g,'\n').replace(/\t/g,'  ');const parser=parsers[language.toLowerCase()];
  if(parser){try{formatted=(await format(formatted,{parser,printWidth:42,tabWidth:2,singleQuote:true,trailingComma:'none'})).trimEnd();}catch{/*Fragments still render exactly as supplied.*/}}
  return formatted;
}
async function renderCodePage(code:string,language:string,outputFile:string,maxColumns?:number):Promise<{width:number;height:number;formattedCode:string}>{
  const fontSize=25,padding=26,lines=code.split('\n');
  const columns=maxColumns??Math.max(...lines.map(line=>[...line].reduce((n,char)=>n+(char.charCodeAt(0)>255?1.5:1),0)));
  // Explicit dimensions stop Takumi's intrinsic-width estimate wrapping one token onto the next code row.
  const width=Math.max(360,Math.ceil(columns*fontSize*.72+padding*2+24)),height=Math.ceil(lines.length*fontSize*1.5+padding*2);
  const font=await fs.readFile(path.join(workspaceRoot,'apps/web/public/fonts/RobotoMono.ttf'));
  const options={lang:(aliases[language.toLowerCase()]??language.toLowerCase()) as CodeToImageOptions['lang'],theme:'github-dark' as const,format:'png' as const,font:font.buffer.slice(font.byteOffset,font.byteOffset+font.byteLength),width,height,style:{fontFamily:'Roboto Mono',fontWeight:500,fontSize,lineHeight:`${fontSize*1.5}px`,padding,borderRadius:18,backgroundColor:'#161b22',whiteSpace:'pre' as const}};
  let bytes:Uint8Array;try{bytes=await codeToImage(code,options);}catch{bytes=await codeToImage(code,{...options,lang:'text' as CodeToImageOptions['lang']});}
  const metadata=await sharp(bytes).metadata();if(!metadata.width||!metadata.height)throw new Error('The code image renderer returned an empty image.');
  await fs.writeFile(outputFile,bytes);return{width:metadata.width,height:metadata.height,formattedCode:code};
}
export async function createCodeImage(code:string,language:string,outputFile:string){return renderCodePage(await formatCode(code,language),language,outputFile);}
export async function createCodeCards(code:string,language:string,outputPrefix:string):Promise<Array<{file:string;code:string}>>{
  const formatted=await formatCode(code,language),lines=formatted.split('\n'),columns=Math.max(...lines.map(line=>[...line].reduce((n,char)=>n+(char.charCodeAt(0)>255?1.5:1),0)));
  const pages:Array<{file:string;code:string}>=[];
  for(let line=0;line<lines.length;line+=11){const page=lines.slice(line,line+11).join('\n'),file=`${outputPrefix}-${pages.length}.png`;await renderCodePage(page,language,file,columns);pages.push({file,code:page});}
  return pages;
}
