// Excalidraw-style sketch board for the `sketch` format.
// The agent supplies nodes, edges and per-line beats; layout (dagre), drawing (rough.js),
// colors, fonts and timing are decided here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import roughDefault from 'roughjs';
import dagre from '@dagrejs/dagre';
import {decompress} from 'wawoff2';
import type {VideoScript} from '@brainrot/contracts';
import {resolveChatIcon} from './chatIcons.js';
import {workspaceRoot} from './env.js';
import {escapeXml} from './xml.js';

export const SKETCH_WIDTH=720;
const INK='#1e1e1e',PROBLEM='#e03131',FIX='#2f9e44',FOCUS='#1971c2',NOTE='#e03131';
const FILL:Record<string,string>={actor:'#ffec99',service:'#a5d8ff',store:'#b2f2bb',queue:'#d0bfff',external:'#ffc9c9'};
const TOOLBAR=84,FADE_MS=320;

/** Virgil ships as the original OFL WOFF2; it is decompressed to a temp TTF at render time for resvg. */
let fontPath:Promise<string>|undefined;
export function sketchFont():Promise<string>{
  fontPath??=(async()=>{
    const target=path.join(os.tmpdir(),'brainrotten-fonts','Virgil.ttf');
    if(!fs.existsSync(target)){fs.mkdirSync(path.dirname(target),{recursive:true});const ttf=await decompress(fs.readFileSync(path.join(workspaceRoot,'apps/web/public/fonts/Virgil.woff2')));fs.writeFileSync(target+'.tmp',ttf);fs.renameSync(target+'.tmp',target);}
    return target;
  })();
  return fontPath;
}

function seed(id:string){let h=7;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;return 1+h%2147483646;}
// roughjs ships CommonJS; its default export is the rough object at runtime.
const rough=((roughDefault as unknown as {default?:unknown}).default??roughDefault) as {generator:()=>import('roughjs/bin/generator.js').RoughGenerator};
const gen=rough.generator();
function paths(drawable:ReturnType<typeof gen.rectangle>,opacity:number){
  return gen.toPaths(drawable).map((p:{d:string;stroke:string;strokeWidth:number;fill?:string})=>`<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill??'none'}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}
function iconMarkup(name:string|undefined,x:number,y:number,size:number,opacity:number):string{
  if(!name)return '';const icon=resolveChatIcon(name);if(!icon)return '';
  const body=icon.svg.replace(/<!--[\s\S]*?-->/g,'').replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace(/<title>[\s\S]*?<\/title>/,'');
  const scale=size/24,common=`transform="translate(${x-size/2} ${y-size/2}) scale(${scale})" opacity="${opacity}"`;
  return icon.kind==='brand'?`<g ${common} fill="${icon.hex}">${body}</g>`:`<g ${common} fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}
// A tiny Excalidraw-like toolbar (rectangle tool selected), drawn with Lucide icons.
function toolbar():string{
  const tools=['hand','mouse-pointer-2','square','diamond','circle','arrow-right','minus','pencil','type','image','eraser'];
  const width=tools.length*46+16,x0=(SKETCH_WIDTH-width)/2;
  return `<rect x="${x0}" y="18" width="${width}" height="54" rx="12" fill="#ffffff" stroke="#e9ecef"/>`+tools.map((tool,i)=>{const cx=x0+8+i*46+23;
    return `${i===2?`<rect x="${cx-19}" y="25" width="38" height="40" rx="9" fill="#e0dfff"/>`:''}${iconMarkup(tool,cx,45,20,i===2?1:.75).replace(`stroke="${INK}"`,`stroke="${i===2?'#4a47b1':'#495057'}"`)}`;}).join('');
}

const round=(value:number)=>Math.round(value*10)/10;
interface Placed{id:string;x:number;y:number;width:number;height:number;label:string;kind:string;icon?:string|undefined}
export interface SketchBoard{height:number;markup(index:number,sinceStartMs:(index:number)=>number):string}

/** Lays the graph out once so shapes stay put while the drawing builds up. */
export function buildSketch(script:VideoScript):SketchBoard{
  const sketch=script.sketch!,lines=script.dialogue;
  const g=new dagre.graphlib.Graph();g.setGraph({rankdir:'TB',nodesep:64,ranksep:58,marginx:16,marginy:12});g.setDefaultEdgeLabel(()=>({}));
  for(const node of sketch.nodes){const width=Math.max(180,Math.min(300,node.label.length*14+56));g.setNode(node.id,{width,height:node.icon?104:80});}
  for(const edge of sketch.edges)g.setEdge(edge.from,edge.to,{label:edge.label??'',width:edge.label?edge.label.length*10+16:0,height:edge.label?26:0});
  dagre.layout(g);
  // Fill the board: scale the drawing up (to 1.35×) or down so it uses the width and fits a tall phone frame.
  const graph=g.graph(),gw=graph.width??SKETCH_WIDTH,gh=graph.height??600,scale=Math.min(1.5,(SKETCH_WIDTH-56)/gw,(900-TOOLBAR-20-40)/gh);
  const offsetX=(SKETCH_WIDTH-gw*scale)/2,offsetY=TOOLBAR+20;
  const at=(x:number,y:number)=>[offsetX+x*scale,offsetY+y*scale] as const;
  // Text and icons shrink with a wide board scaled down to fit, but never grow past their designed size.
  const ink=Math.min(1,scale);
  const nodes:Placed[]=sketch.nodes.map(node=>{const n=g.node(node.id);const[x,y]=at(n.x,n.y);return{id:node.id,x,y,width:n.width*scale,height:n.height*scale,label:node.label,kind:node.kind,icon:node.icon};});
  const height=Math.round(Math.max(620,Math.min(900,offsetY+gh*scale+40)));
  // When each element first appears: on its first mention; unmentioned nodes from the start;
  // unmentioned edges as soon as both of their ends are visible.
  const first=new Map<string,number>();
  lines.forEach((line,index)=>{for(const ref of[...(line.sketch?.show??[]),...(line.sketch?.focus??[]),...(line.sketch?.note?[line.sketch.note.near]:[])])if(!first.has(ref))first.set(ref,index);});
  for(const edge of sketch.edges){const key=edge.from+'>'+edge.to;for(const end of[edge.from,edge.to])if(first.has(key)&&!first.has(end))first.set(end,first.get(key)!);}
  const appearNode=(id:string)=>first.get(id)??0;
  const appearEdge=(from:string,to:string)=>first.get(from+'>'+to)??Math.max(appearNode(from),appearNode(to));

  return{height,markup(index,sinceStartMs){
    const line=index>=0?lines[index]:undefined,focus=new Set(line?.sketch?.focus??[]),mark=line?.sketch?.mark;
    const focusColor=mark==='problem'?PROBLEM:mark==='fix'?FIX:FOCUS;
    const fade=(appear:number)=>appear>index?0:appear<index?1:Math.min(1,Math.max(0,sinceStartMs(appear)/FADE_MS));
    let out=`<rect width="${SKETCH_WIDTH}" height="${height}" fill="#ffffff"/>`+toolbar();
    for(const edge of sketch.edges){
      const key=edge.from+'>'+edge.to,opacity=fade(appearEdge(edge.from,edge.to));if(!opacity)continue;
      const points=g.edge(edge.from,edge.to).points.map(p=>at(p.x,p.y));const hot=focus.has(key),stroke=hot?focusColor:INK,width=hot?3.4:2;
      out+=paths(gen.linearPath(points.map(([x,y])=>[x,y]),{seed:seed(key),stroke,strokeWidth:width,roughness:1.2,bowing:1.4}),opacity);
      const[a,b]=points.slice(-2) as Array<readonly [number,number]>,angle=Math.atan2(b![1]-a![1],b![0]-a![0]);
      out+=paths(gen.linearPath([[b![0]-16*Math.cos(angle-.5),b![1]-16*Math.sin(angle-.5)],[b![0],b![1]],[b![0]-16*Math.cos(angle+.5),b![1]-16*Math.sin(angle+.5)]],{seed:seed(key+'head'),stroke,strokeWidth:width,roughness:1}),opacity);
      if(edge.label){const mid=points[Math.floor(points.length/2)]!,w=(edge.label.length*10+16)*ink;
        out+=`<rect x="${mid[0]-w/2}" y="${mid[1]-15*ink}" width="${w}" height="${28*ink}" fill="#ffffff" opacity="${opacity}"/><text x="${mid[0]}" y="${mid[1]+6*ink}" font-family="Virgil" font-size="${round(19*ink)}" text-anchor="middle" fill="${hot?stroke:'#495057'}" opacity="${opacity}">${escapeXml(edge.label)}</text>`;}
    }
    for(const node of nodes){
      const opacity=fade(appearNode(node.id));if(!opacity)continue;
      const hot=focus.has(node.id),stroke=hot?focusColor:INK,options={seed:seed(node.id),fill:FILL[node.kind]??'#a5d8ff',fillStyle:'hachure',hachureGap:8,hachureAngle:-41,fillWeight:1.4,stroke,strokeWidth:hot?3.6:2,roughness:1.3};
      const x=node.x-node.width/2,y=node.y-node.height/2;
      out+=paths(node.kind==='actor'?gen.ellipse(node.x,node.y,node.width,node.height,options):gen.rectangle(x,y,node.width,node.height,options),opacity);
      // Icon and label shrink with the box, so a wide board never stacks them on top of each other.
      out+=iconMarkup(node.icon,node.x,y+34*ink,30*ink,opacity);
      out+=`<text x="${node.x}" y="${node.icon?y+node.height-22*ink:node.y+9*ink}" font-family="Virgil" font-size="${round(24*ink)}" text-anchor="middle" fill="${INK}" opacity="${opacity}">${escapeXml(node.label)}</text>`;
    }
    const note=line?.sketch?.note;
    if(note){
      const target=nodes.find(n=>n.id===note.near)??(()=>{const e=sketch.edges.find(e=>e.from+'>'+e.to===note.near);if(!e)return undefined;const p=g.edge(e.from,e.to).points;const[x,y]=at(p[Math.floor(p.length/2)]!.x,p[Math.floor(p.length/2)]!.y);return{x,y,width:0,height:0} as Placed;})();
      if(target){
        const opacity=Math.min(1,sinceStartMs(index)/FADE_MS),width=note.text.length*12.5+20;
        const right=target.x+target.width/2+width+30<SKETCH_WIDTH,tx=right?target.x+target.width/2+26:Math.max(16,target.x-target.width/2-26-width),ty=target.y-target.height/2-6;
        out+=paths(gen.curve([[right?tx+4:tx+width-4,ty+6],[right?tx-10:tx+width+10,ty+22],[right?target.x+target.width/2+4:target.x-target.width/2-4,target.y-6]],{seed:seed(note.text),stroke:NOTE,strokeWidth:2.2,roughness:.8}),opacity);
        out+=`<text x="${tx}" y="${ty}" font-family="Virgil" font-size="23" fill="${NOTE}" opacity="${opacity}">${escapeXml(note.text)}</text>`;
      }
    }
    return out;
  }};
}
