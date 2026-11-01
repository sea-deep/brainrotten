// Shared building blocks for interface-style frames (group chat, PR review, pause cards).
// Satori lays out flexbox trees; resvg rasterizes them. Fonts and emoji are local files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import satori from 'satori';
import {Resvg} from '@resvg/resvg-js';
import {workspaceRoot} from './env.js';

export type UiNode={type:string;props:Record<string,unknown>};
export const h=(type:string,style:Record<string,unknown>,...children:unknown[]):UiNode=>({type,props:{style:{display:'flex',...style},children:children.flat().filter(child=>child!==null&&child!==false&&child!==undefined)}});
// Roboto has no arrow glyphs and arrows are not emoji, so they would render blank.
const ARROWS:Record<string,string>={'→':'->','←':'<-','⇒':'=>','⇐':'<=','↔':'<->','➜':'->','➡':'->','⟶':'->'};
export const plainArrows=(value:string)=>value.replace(/[→←⇒⇐↔➜➡⟶]\uFE0F?/g,c=>ARROWS[c.replace('\uFE0F','')]??c);
export const text=(style:Record<string,unknown>,value:string):UiNode=>({type:'div',props:{style:{display:'flex',...style},children:plainArrows(value)}});
export const img=(src:string,style:Record<string,unknown>):UiNode=>({type:'img',props:{src,style}});
export const svgUri=(svg:string)=>'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');

let fontCache:{name:string;data:Buffer;weight:400;style:'normal'}[]|undefined;
function fonts(){
  fontCache??=[
    {name:'Roboto',data:fs.readFileSync(path.join(workspaceRoot,'apps/web/public/fonts/Roboto.ttf')),weight:400,style:'normal'},
    {name:'Mono',data:fs.readFileSync(path.join(workspaceRoot,'apps/web/public/fonts/RobotoMono.ttf')),weight:400,style:'normal'},
  ];
  return fontCache;
}
// Twemoji graphics (CC-BY 4.0) ship with @twemoji/svg; resolved locally, never fetched.
const twemojiDir=path.dirname(fileURLToPath(import.meta.resolve('@twemoji/svg/package.json')));
export function emojiUri(segment:string):string{
  const points=[...segment].map(c=>c.codePointAt(0)!.toString(16));
  const name=(segment.includes('‍')?points:points.filter(p=>p!=='fe0f')).join('-');
  for(const candidate of[name,points.join('-')]){const file=path.join(twemojiDir,candidate+'.svg');if(fs.existsSync(file))return svgUri(fs.readFileSync(file,'utf8'));}
  return '';
}

/** Lays out and rasterizes one panel; returns a PNG data URI. */
export async function renderPanel(tree:UiNode,size:{width:number;height:number}):Promise<string>{
  const svg=await satori(tree as never,{...size,fonts:fonts(),loadAdditionalAsset:async(code:string,segment:string)=>code==='emoji'?emojiUri(segment):[]});
  return 'data:image/png;base64,'+new Resvg(svg).render().asPng().toString('base64');
}
/** A white single-path icon as a data URI, for headers and toolbars. */
export const glyph=(d:string,color='#fff',viewBox='0 0 24 24')=>svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${d}" fill="${color}"/></svg>`);
