import {MAX_VIDEO_SECONDS} from '@brainrot/contracts';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,readFileSync} from 'node:fs';
import {mkdir,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setImmediate as yieldFrame} from 'node:timers/promises';
import {Resvg} from '@resvg/resvg-js';
import type {CharacterId,VideoFormat,VideoScript,VideoDiagram} from '@brainrot/contracts';
import {characterImage} from './characters.js';
import {workspaceRoot} from './env.js';
import {prepareChatPanels,chatStateAt,CHAT_PANEL,type ChatPanels} from './chatFrames.js';
import {preparePrPanels,PR_PANEL,type PrPanels} from './prFrames.js';
import {preparePauseOverlay,type PauseOverlay} from './pause.js';
import {buildSketch,sketchFont,type SketchBoard} from './sketchFrames.js';
import {prepareTierPanels,type TierPanels} from './tierFrames.js';
export type VideoSpeaker=CharacterId;
export interface VideoSegment{speaker:VideoSpeaker;turnIndex?:number;text:string;startMs:number;endMs:number}
export interface VideoWord{text:string;turnIndex?:number;startMs:number;endMs:number;speaker:VideoSpeaker}
export interface PreparedBroll{kind:'code'|'image';startMs:number;endMs:number;code?:string;language?:string;imagePath?:string;caption?:string}
export interface RenderVideoInput{
  jobId:string;title:string;format?:VideoFormat;script?:VideoScript;style:'brainrot'|'calm';audioPath:string;durationSeconds:number;
  segments:VideoSegment[];words:VideoWord[];outputDir:string;backgroundPath?:string|undefined;broll?:PreparedBroll[];
  onProgress?:(progress:number)=>void;
  /** Pre-rendered group chat states; prepared by renderVideo for the groupchat format. */
  chatPanels?:ChatPanels;
  /** Pre-rendered PR review states; prepared by renderVideo for the prreview format. */
  prPanels?:PrPanels;
  /** Pause & Predict cards; prepared by renderVideo when the script has pauses. */
  pauseOverlay?:PauseOverlay;
  /** Laid-out sketch board; prepared by renderVideo for the sketch format. */
  sketchBoard?:SketchBoard;
  /** Pre-rendered tier boards; prepared by renderVideo for the tierlist format. */
  tierPanels?:TierPanels;
}
const WIDTH=720,HEIGHT=1280,FPS=24;
const FONT='Roboto,Arial,sans-serif';
const fontFiles=[path.join(workspaceRoot,'apps/web/public/fonts/Roboto.ttf'),path.join(workspaceRoot,'apps/web/public/fonts/RobotoMono.ttf'),'/System/Library/Fonts/Supplemental/Arial Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].filter(existsSync);
const FONT_OPTIONS={loadSystemFonts:fontFiles.length===0,fontFiles,defaultFontFamily:'Roboto'};
export {escapeXml} from './xml.js';
import {escapeXml} from './xml.js';
function binary(name:'ffmpeg'|'ffprobe'):string|null{
  for(const candidate of[process.env[name==='ffmpeg'?'FFMPEG_PATH':'FFPROBE_PATH'],name,`/opt/homebrew/bin/${name}`,`/usr/local/bin/${name}`,`/usr/bin/${name}`]){
    if(!candidate)continue;const result=spawnSync(candidate,['-version'],{stdio:'ignore',timeout:5000});if(result.status===0)return candidate;
  }return null;
}
let cachedBinaries:{ffmpeg:string|null;ffprobe:string|null}|undefined;
export function getRenderReadiness():{ready:boolean;ffmpegAvailable:boolean;ffmpeg:boolean;ffprobe:boolean}{
  cachedBinaries??={ffmpeg:binary('ffmpeg'),ffprobe:binary('ffprobe')};const ready=Boolean(cachedBinaries.ffmpeg&&cachedBinaries.ffprobe);return{ready,ffmpegAvailable:ready,ffmpeg:Boolean(cachedBinaries.ffmpeg),ffprobe:Boolean(cachedBinaries.ffprobe)};
}
const images=new Map<string,string>();
function imageData(file:string):string{
  let image=images.get(file);if(image)return image;
  try{const data=readFileSync(file);const type=file.endsWith('.jpg')||file.endsWith('.jpeg')?'image/jpeg':file.endsWith('.webp')?'image/webp':'image/png';image=`data:${type};base64,${data.toString('base64')}`;images.set(file,image);return image;}catch{return'';}
}
export interface CaptionGroup{words:VideoWord[];startMs:number;endMs:number;turnIndex:number}
const units=(text:string)=>Array.from(new Intl.Segmenter('und',{granularity:'grapheme'}).segment(text)).reduce((n,{segment})=>n+(/\s/.test(segment)?.28:/[WM@]/.test(segment)?.9:/[il.,!:;]/.test(segment)?.28:/[\u0900-\u09ff]/.test(segment)?.7:.54),0);
export function captionGroups(words:VideoWord[],segments:VideoSegment[]):CaptionGroup[]{
  const groups:CaptionGroup[]=[];
  segments.forEach((segment,index)=>{
    const turnIndex=segment.turnIndex??index,endMs=Math.min(segment.endMs,segments[index+1]?.startMs??Infinity);
    const selected=words.filter(word=>word.turnIndex!==undefined?word.turnIndex===turnIndex:word.speaker===segment.speaker&&(word.startMs+word.endMs)/2>=segment.startMs&&(word.startMs+word.endMs)/2<=endMs).sort((a,b)=>a.startMs-b.startMs);
    // Older manifests without word alignment still get timed short phrases, never a whole dialogue paragraph.
    const timed=selected.length?selected:segment.text.split(/\s+/).filter(Boolean).map((text,i,all)=>({text,speaker:segment.speaker,turnIndex,startMs:segment.startMs+(endMs-segment.startMs)*i/all.length,endMs:segment.startMs+(endMs-segment.startMs)*(i+1)/all.length}));
    let group:VideoWord[]=[];let rowWidth=0,rows=1;
    const flush=()=>{if(group.length)groups.push({words:group,startMs:Math.max(segment.startMs,group[0]!.startMs),endMs:Math.min(endMs,group[group.length-1]!.endMs),turnIndex});group=[];rowWidth=0;rows=1;};
    for(const word of timed){const wordWidth=units(word.text)+.3;let wraps=rowWidth>0&&rowWidth+wordWidth>12.5;if(group.length&&(group.length>=5||(wraps&&rows>=2))){flush();wraps=false;}if(wraps){rows++;rowWidth=0;}group.push(word);rowWidth+=wordWidth;if(/[.!?।]$/.test(word.text)&&group.length>=2)flush();}flush();
  });
  return groups;
}
function captions(group:CaptionGroup|undefined,timeMs:number,top:number):string{
  if(!group)return'';
  const rows:VideoWord[][]=[[]];let width=0;
  for(const word of group.words){const next=units(word.text);if(width&&width+next>12.5){rows.push([]);width=0;}rows[rows.length-1]!.push(word);width+=next+.3;}
  const fontSize=Math.min(50,Math.floor(596/Math.max(...rows.map(row=>units(row.map(w=>w.text).join(' '))))));
  const accents:Record<VideoSpeaker,string>={oggy:'#94ddff',jack:'#ffe18a',badri:'#d4c0ff',budhdev:'#ffc7aa',jhaplu:'#ffacd4',paplu:'#bebaff',taplu:'#b5e9c6',motu:'#ffb2a2',patlu:'#ffd98e',chingum:'#c6d5a4',ghasitaram:'#9ddcf1',jhatka:'#b5e9ad',john:'#d4bcff'};
  const lineHeight=fontSize*1.28,height=rows.length*lineHeight+22;
  return `<g data-caption-turn="${group.turnIndex}"><rect x="42" y="${top-fontSize-11}" width="636" height="${height}" rx="16" fill="#101017" fill-opacity=".8"/>${rows.map((row,i)=>`<text xml:space="preserve" x="360" y="${top+i*lineHeight}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" font-weight="800" stroke="#101017" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${row.map((word,j)=>`<tspan dx="${j?fontSize*.28:0}" fill="${timeMs>=word.startMs&&timeMs<word.endMs?accents[word.speaker]:'#fff'}">${escapeXml(word.text)}</tspan>`).join('')}</text>`).join('')}</g>`;
}
function brollVisual(cue:PreparedBroll|undefined):string{
  if(!cue?.imagePath)return'';
  const image=imageData(cue.imagePath);if(!image)return'';
  if(cue.kind==='code')return `<image x="40" y="80" width="640" height="440" href="${image}" preserveAspectRatio="xMidYMid meet"/>`;
  return `<rect x="44" y="88" width="632" height="398" rx="20" fill="#f8f8f8"/><clipPath id="visual"><rect x="52" y="96" width="616" height="${cue.caption?330:382}" rx="15"/></clipPath><image x="52" y="96" width="616" height="${cue.caption?330:382}" href="${image}" preserveAspectRatio="xMidYMid meet" clip-path="url(#visual)"/>${cue.caption?`<text x="360" y="462" text-anchor="middle" font-family="${FONT}" font-size="21" fill="#25202c">${escapeXml(cue.caption.slice(0,48))}</text>`:''}`;
}
function procedural(time:number):string{
  let tiles='';for(let i=0;i<13;i++){const p=((i/13+time*.16)%1);const y=330+p*p*950,w=80+p*700;tiles+=`<path d="M${360-w/2},${y}h${w}" stroke="#ffb793" stroke-opacity=".45" stroke-width="3"/>`;}
  return `<rect width="720" height="1280" fill="#8572c4"/><circle cx="570" cy="210" r="120" fill="#f5bd9a"/><path d="M275 350h170l275 930H0Z" fill="#5d4d98"/>${tiles}`;
}
function frameSvg(input:Pick<RenderVideoInput,'title'|'style'|'durationSeconds'|'segments'|'backgroundPath'|'broll'|'format'|'script'|'chatPanels'|'prPanels'|'pauseOverlay'|'sketchBoard'|'tierPanels'>,groups:CaptionGroup[],timeSeconds:number):string{
  const svg=formatFrameSvg(input,groups,timeSeconds),overlay=input.pauseOverlay?.at(timeSeconds*1000);
  const region=input.pauseOverlay?.region;
  return overlay&&region?svg.replace(/<\/svg>\s*$/,`<image x="0" y="${region.top}" width="${WIDTH}" height="${region.height}" href="${overlay}" data-pause="true"/></svg>`):svg;
}
function formatFrameSvg(input:Pick<RenderVideoInput,'title'|'style'|'durationSeconds'|'segments'|'backgroundPath'|'broll'|'format'|'script'|'chatPanels'|'prPanels'|'pauseOverlay'|'sketchBoard'|'tierPanels'>,groups:CaptionGroup[],timeSeconds:number):string{
  const timeMs=timeSeconds*1000;
  const timedSegmentIndex=input.segments.findIndex((s,i)=>timeMs>=s.startMs&&timeMs<Math.min(s.endMs,input.segments[i+1]?.startMs??Infinity));
  const segmentIndex=timedSegmentIndex>=0?timedSegmentIndex:input.format&&input.format!=='skit'?input.segments.reduce((found,s,i)=>timeMs>=s.startMs?i:found,-1):-1;
  const segment=input.segments[segmentIndex],turnIndex=segment?.turnIndex??segmentIndex;
  const group=segment?groups.find((g,i)=>g.turnIndex===turnIndex&&timeMs>=g.startMs&&timeMs<Math.min(g.endMs+90,segment.endMs,groups[i+1]?.startMs??Infinity)):undefined;
  const speaker=segment?.speaker;
  const cue=input.broll?.find(item=>timeMs>=item.startMs&&timeMs<item.endMs);
  const bob=input.style==='calm'||!segment?0:Math.round(Math.sin(Math.min(1,(timeMs-segment.startMs)/180)*Math.PI)*-8);
  if(input.format==='groupchat')return chatFrame(input,timeMs);
  if(input.format==='prreview')return prFrame(input,timeMs);
  if(input.format==='sketch')return sketchFrame(input,timeMs);
  if(input.format==='tierlist')return tierFrame(input,timeMs);
  if(input.format==='pov')return povFrame(input,segmentIndex,group,cue,timeMs);
  if(input.format&&input.format!=='skit')return storyFrame(input,segmentIndex,group,cue,timeMs);
  const character=speaker?imageData(characterImage(speaker)):'';
  const active=character?`<g transform="translate(0 ${bob})"><image x="182" y="${cue?720:660}" width="356" height="${cue?452:512}" href="${character}" preserveAspectRatio="xMidYMax meet"/></g>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 720 1280"><defs><linearGradient id="bottom" x2="0" y2="1"><stop stop-color="#15101d" stop-opacity="0"/><stop offset="1" stop-color="#15101d" stop-opacity=".62"/></linearGradient></defs>${input.backgroundPath?'<rect width="720" height="1280" fill="#13101a" fill-opacity=".08"/>':procedural(timeSeconds)}<rect y="760" width="720" height="520" fill="url(#bottom)"/>${brollVisual(cue)}${active}${captions(group,timeMs,cue?590:550)}</svg>`;
}
export function renderFrameSvg(input:Pick<RenderVideoInput,'title'|'style'|'durationSeconds'|'segments'|'words'|'backgroundPath'|'broll'|'format'|'script'|'chatPanels'|'prPanels'|'pauseOverlay'|'sketchBoard'|'tierPanels'>,timeSeconds:number):string{return frameSvg(input,captionGroups(input.words,input.segments),timeSeconds);}
// Interface formats (group chat, PR review): the interface on top, supplied gameplay below.
// No captions or characters: the interface already carries the words.
// Interface formats (group chat, PR review): the interface is a rounded card centered over the gameplay,
// at ~92% width with equal gameplay above and below. During Pause & Predict it glides up so the
// question card fits underneath while the content stays visible.
const CARD_WIDTH=664,PAUSE_CARD_MIN=380;
export function panelLayout(height:number,mode=0):{x:number;y:number;width:number;height:number}{
  const normal=CARD_WIDTH/720,paused=Math.min(normal,(HEIGHT-28-14-PAUSE_CARD_MIN-16)/height);
  const scale=normal+(paused-normal)*mode,y=(HEIGHT-height*normal)/2+(28-(HEIGHT-height*normal)/2)*mode;
  const width=720*scale;return{x:(720-width)/2,y,width,height:height*scale};
}
export function pauseRegionFor(height:number){const layout=panelLayout(height,1),top=Math.round(layout.y+layout.height+14);return{top,height:HEIGHT-top-16};}
function panelFrame(format:string,panel:string,height:number,fallback:string,mode:number,markup?:string):string{
  const l=panelLayout(height,mode),r=(n:number)=>Math.round(n*10)/10,box=`x="${r(l.x)}" y="${r(l.y)}" width="${r(l.width)}" height="${r(l.height)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 720 1280" data-format="${format}"><defs><clipPath id="card"><rect ${box} rx="24"/></clipPath><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000" flood-opacity=".5"/></filter></defs><rect ${box} rx="24" fill="${fallback}" filter="url(#shadow)"/>${markup?`<g clip-path="url(#card)"><g transform="translate(${r(l.x)} ${r(l.y)}) scale(${Math.round(l.width/720*10000)/10000})">${markup}</g></g>`:panel?`<image ${box} href="${panel}" preserveAspectRatio="none" clip-path="url(#card)"/>`:''}</svg>`;
}
function chatFrame(input:Pick<RenderVideoInput,'segments'|'chatPanels'|'pauseOverlay'>,timeMs:number):string{
  return panelFrame('groupchat',input.chatPanels?.panel(chatStateAt(input.segments,timeMs))??'',CHAT_PANEL.height,'#efeae2',input.pauseOverlay?.mode(timeMs)??0);
}
function prFrame(input:Pick<RenderVideoInput,'segments'|'prPanels'|'pauseOverlay'>,timeMs:number):string{
  const index=input.segments.reduce((found,segment,i)=>timeMs>=segment.startMs?i:found,-1);
  return panelFrame('prreview',input.prPanels?.panel(index)??'',input.prPanels?.height??PR_PANEL.height,'#0d1117',input.pauseOverlay?.mode(timeMs)??0);
}
function tierFrame(input:Pick<RenderVideoInput,'segments'|'tierPanels'|'pauseOverlay'>,timeMs:number):string{
  const index=input.segments.reduce((found,segment,i)=>timeMs>=segment.startMs?i:found,-1);
  return panelFrame('tierlist',input.tierPanels?.panel(index)??'',input.tierPanels?.height??850,'#1a1a17',input.pauseOverlay?.mode(timeMs)??0);
}
function sketchFrame(input:Pick<RenderVideoInput,'segments'|'sketchBoard'|'pauseOverlay'>,timeMs:number):string{
  const board=input.sketchBoard;if(!board)return panelFrame('sketch','',700,'#ffffff',0);
  const index=input.segments.reduce((found,segment,i)=>timeMs>=segment.startMs?i:found,-1);
  return panelFrame('sketch','',board.height,'#ffffff',input.pauseOverlay?.mode(timeMs)??0,board.markup(index,i=>timeMs-(input.segments[i]?.startMs??0)));
}
function wrapLabel(text:string,limit=23):string[]{
  const words=text.split(/\s+/).flatMap(word=>word.match(new RegExp(`.{1,${limit}}`,'gu'))??[]),rows:string[]=[''];
  for(const word of words){const last=rows.length-1;if(rows[last]!.length+word.length>limit&&rows[last])rows.push(word);else rows[last]+=(rows[last]?' ':'')+word;}
  return rows;
}
function povFrame(input:Pick<RenderVideoInput,'title'|'script'|'segments'|'style'>,index:number,group:CaptionGroup|undefined,cue:PreparedBroll|undefined,timeMs:number):string{
  const at=Math.max(0,index),line=input.script?.dialogue[at],journey=line?.scene?.journey;
  const status=journey?.status??'running',colors={running:'#c8b3fa',waiting:'#f2cf8b',blocked:'#ffb29b',done:'#9fdbed'};
  const heading=wrapLabel(line?.scene?.heading??input.title,26),action=wrapLabel(journey?.action??'',40),location=wrapLabel(journey?.location??'',32);
  const actionTop=376+(location.length-1)*30,stateTop=Math.max(460,actionTop+action.length*25+24),panelBottom=stateTop+Math.max(0,(journey?.state.length??1)-1)*68+48;
  const plate=cue?.imagePath?imageData(cue.imagePath):'';
  const history=input.script?.dialogue.slice(Math.max(0,at-2),at+1)??[];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280" data-format="pov">
    <rect width="720" height="1280" fill="#151620"/><path d="M44 94H676" stroke="#393646"/>
    <text x="44" y="65" fill="#b5aec9" font-family="${FONT}" font-size="19" font-weight="700">POV JOURNEY · ${at+1} / ${input.segments.length}</text>
    ${heading.map((row,i)=>`<text x="44" y="${147+i*37}" font-family="${FONT}" font-size="31" font-weight="800" fill="#fbf4e8">${escapeXml(row)}</text>`).join('')}
    <rect x="42" y="258" width="636" height="${panelBottom-258}" rx="22" fill="#242331" stroke="#4a4159"/>
    <text x="65" y="298" font-family="${FONT}" font-size="17" fill="${colors[status]}">${status.toUpperCase()}</text>
    ${location.map((row,i)=>`<text x="65" y="${340+i*30}" font-family="${FONT}" font-size="${Math.min(28,Math.floor(548/Math.max(1,units(row))))}" font-weight="700" fill="#fbf4e8">${escapeXml(row)}</text>`).join('')}
    ${action.map((row,i)=>`<text x="65" y="${actionTop+i*25}" font-family="${FONT}" font-size="21" fill="#d5cddd">${escapeXml(row)}</text>`).join('')}
    ${(journey?.state??[]).map((item,i)=>{const value=wrapLabel(item.value,35),key=wrapLabel(item.key,16);return `${key.map((row,j)=>`<text x="65" y="${stateTop+i*68+j*21}" font-family="${FONT}" font-size="${Math.min(17,Math.floor(150/Math.max(1,units(row))))}" fill="#b6a9cd">${escapeXml(row)}</text>`).join('')}${value.map((row,j)=>`<text x="240" y="${stateTop+i*68+j*23}" font-family="${FONT}" font-size="${Math.min(19,Math.floor(410/Math.max(1,units(row))))}" fill="#fff2d6">${escapeXml(row)}</text>`).join('')}`;}).join('')}
    ${plate?`<image x="42" y="740" width="636" height="230" href="${plate}" preserveAspectRatio="xMidYMid meet"/>`:history.map((entry,i)=>`<g><circle cx="64" cy="${752+i*70}" r="6" fill="${i===history.length-1?colors[status]:'#746780'}"/><text x="86" y="${758+i*70}" font-family="${FONT}" font-size="22" fill="${i===history.length-1?'#fbf4e8':'#b5aec9'}">${escapeXml(entry.scene?.journey?.location??'')}</text></g>`).join('')}
    ${captions(group,timeMs,1050)}
    <rect x="44" y="1196" width="632" height="5" rx="2" fill="#484052"/><rect x="44" y="1196" width="${632*(at+1)/input.segments.length}" height="5" rx="2" fill="${colors[status]}"/>
    <text x="44" y="1236" font-family="${FONT}" font-size="17" fill="#c8bed6">${escapeXml(line?.scene?.beat.toUpperCase()??'SETUP')}</text>
  </svg>`;
}
function diagramVisual(diagram:VideoDiagram,timeMs:number,calm:boolean):string{
  const nodes=diagram.nodes.map((node,i)=>({...node,x:i%2===0?56:404,y:diagram.nodes.length===2?390:300+Math.floor(i/2)*230}));
  const active=Math.floor(Math.max(0,timeMs)/1100)%diagram.edges.length;
  const paths=diagram.edges.map((edge,i)=>{
    const from=nodes.find(node=>node.id===edge.from)!,to=nodes.find(node=>node.id===edge.to)!;
    const dx=to.x-from.x,dy=to.y-from.y,scale=Math.min(dx?130/Math.abs(dx):Infinity,dy?70/Math.abs(dy):Infinity);
    const x1=from.x+130+dx*scale,y1=from.y+70+dy*scale,x2=to.x+130-dx*scale,y2=to.y+70-dy*scale;
    const phase=calm?.5:(Math.max(0,timeMs)%1100)/1100;
    return `<g data-edge="${escapeXml(edge.from)}-${escapeXml(edge.to)}"><path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="#66527c" stroke-width="3" marker-end="url(#diagram-arrow)"/>${i===active?`<circle cx="${x1+(x2-x1)*phase}" cy="${y1+(y2-y1)*phase}" r="7" fill="#b36b38"/>`:''}</g>`;
  }).join('');
  return `<g data-diagram="true"><defs><marker id="diagram-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9" fill="none" stroke="#66527c" stroke-width="1.5"/></marker></defs>${paths}${nodes.map(node=>{const rows=wrapLabel(node.label,19);return `<g data-node="${escapeXml(node.id)}"><rect x="${node.x}" y="${node.y}" width="260" height="140" rx="18" fill="#fffdf8" stroke="#b9a9c7" stroke-width="2"/>${rows.map((row,j)=>`<text x="${node.x+130}" y="${node.y+78-(rows.length-1)*14+j*28}" text-anchor="middle" font-family="${FONT}" font-size="23" font-weight="700" fill="#30263c">${escapeXml(row)}</text>`).join('')}</g>`;}).join('')}</g>`;
}
function storyFrame(input:Pick<RenderVideoInput,'title'|'format'|'script'|'segments'|'style'>,index:number,group:CaptionGroup|undefined,cue:PreparedBroll|undefined,timeMs:number):string{
  const scene=input.script?.dialogue[Math.max(0,index)]?.scene,board=input.format==='whiteboard';
  const ink=board?'#30263c':'#f6eedd',paper=board?'#f4eee4':'#17242d';
  const rows=wrapLabel(scene?.heading??input.title,25),beats=['setup','investigate','escalate','resolve'];
  const label=scene?.beat??'setup',diagram=board||!cue?scene?.diagram:undefined;
  const diagramSvg=diagram?diagramVisual(diagram,timeMs-(input.segments[Math.max(0,index)]?.startMs??0),input.style==='calm'):'';
  const image=cue?.imagePath?imageData(cue.imagePath):'';
  const evidence=image?(board?`<rect x="38" y="724" width="644" height="270" rx="14" fill="#fffdf8"/><image x="46" y="732" width="628" height="${cue?.caption?216:254}" href="${image}" preserveAspectRatio="xMidYMid meet"/>${cue?.caption?`<text x="360" y="980" text-anchor="middle" font-family="${FONT}" font-size="20" fill="#30263c">${escapeXml(cue.caption.slice(0,50))}</text>`:''}`:`<g transform="translate(0 245)">${brollVisual(cue)}</g>`):'';
  const outline=!board&&!image&&!diagram?beats.map((beat,i)=>{const line=beat===label?input.script?.dialogue[Math.max(0,index)]:input.script?.dialogue.find(line=>line.scene?.beat===beat);const heading=wrapLabel(line?.scene?.heading??beat,32);return `<g data-case-step="${beat}"><circle cx="73" cy="${330+i*145}" r="14" fill="${beat===label?'#ffd372':'#71828a'}"/>${i<3?`<path d="M73 ${350+i*145}v105" stroke="#71828a" stroke-width="2"/>`:''}<text x="110" y="${326+i*145}" font-family="${FONT}" font-size="17" fill="#b6c7ce">${beat.toUpperCase()}</text>${heading.map((row,j)=>`<text x="110" y="${363+i*145+j*30}" font-family="${FONT}" font-size="25" fill="${beat===label?'#ffe4a2':ink}">${escapeXml(row)}</text>`).join('')}</g>`;}).join(''):'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280" data-format="${input.format}">
    <rect width="720" height="1280" fill="${paper}"/>
    <path d="M42 220H678" stroke="${board?'#d7cadd':'#485d67'}"/>
    <text x="44" y="76" font-family="${FONT}" font-size="19" font-weight="700" fill="${ink}">${board?'WHITEBOARD':'CASE FILE'} · ${Math.max(1,index+1)} / ${input.segments.length}</text>
    ${rows.slice(0,3).map((row,i)=>`<text x="44" y="${126+i*36}" font-family="${FONT}" font-size="32" font-weight="800" fill="${ink}">${escapeXml(row)}</text>`).join('')}
    ${diagramSvg}${outline}${evidence}
    ${captions(group,timeMs,1050)}
    ${beats.map((beat,i)=>`<rect x="${44+i*161}" y="1196" width="149" height="5" rx="2" fill="${beat===label?(board?'#8a5f32':'#ffd372'):(board?'#c1b3cd':'#71828a')}"/>`).join('')}
    <text x="44" y="1236" font-family="${FONT}" font-size="18" font-weight="700" fill="${ink}">${escapeXml(label.toUpperCase())}</text>
  </svg>`;
}

export async function renderVideo(input: RenderVideoInput): Promise<{ videoPath: string; posterPath: string }> {
  const readiness = getRenderReadiness();
  if (!readiness.ready || !cachedBinaries?.ffmpeg) throw new Error('VIDEO_RENDERER_NOT_CONFIGURED: install FFmpeg and FFprobe to export MP4.');
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > MAX_VIDEO_SECONDS) throw new Error(`VIDEO_DURATION_INVALID: expected a duration between 0 and ${MAX_VIDEO_SECONDS} seconds.`);
  if (!input.segments.length) throw new Error('VIDEO_SEGMENTS_MISSING: speech timing is required.');
  if ((await stat(input.audioPath)).size === 0) throw new Error('VIDEO_AUDIO_EMPTY: synthesized audio is empty.');
  if (input.backgroundPath && (await stat(input.backgroundPath)).size === 0) throw new Error('VIDEO_BACKGROUND_EMPTY: the gameplay clip is empty.');
  await mkdir(input.outputDir, { recursive: true });
  const videoPath = path.resolve(input.outputDir, 'video.mp4');
  const posterPath = path.resolve(input.outputDir, 'poster.png');
  const groups = captionGroups(input.words,input.segments);
  if(input.format==='groupchat'&&input.script&&!input.chatPanels)input={...input,chatPanels:await prepareChatPanels(input.script)};
  if(input.format==='prreview'&&input.script&&!input.prPanels)input={...input,prPanels:await preparePrPanels(input.script)};
  if(input.format==='sketch'&&input.script?.sketch&&!input.sketchBoard){const font=await sketchFont();if(!FONT_OPTIONS.fontFiles.includes(font))FONT_OPTIONS.fontFiles.push(font);input={...input,sketchBoard:buildSketch(input.script)};}
  if(input.format==='tierlist'&&input.script&&!input.tierPanels)input={...input,tierPanels:await prepareTierPanels(input.script)};
  if(input.script&&!input.pauseOverlay){
    // Keep the chat/PR panel visible: the question sits over the gameplay below it.
    const panelHeight=input.format==='groupchat'?CHAT_PANEL.height:input.format==='prreview'?input.prPanels?.height??PR_PANEL.height:input.format==='sketch'?input.sketchBoard?.height:input.format==='tierlist'?input.tierPanels?.height:undefined;
    const pauseOverlay=await preparePauseOverlay(input.script,input.segments,panelHeight?pauseRegionFor(panelHeight):{top:80,height:600});if(pauseOverlay)input={...input,pauseOverlay};
  }
  const posterTime = Math.min(input.durationSeconds / 3, (input.segments[0]?.startMs ?? 0) / 1000 + 0.8);
  const poster = new Resvg(frameSvg(input, groups, posterTime), { font: FONT_OPTIONS }).render().asPng();
  if (input.backgroundPath) {
    const overlayPath = path.resolve(input.outputDir, 'poster-overlay.png');
    await writeFile(overlayPath, poster);
    try {
      await runEncoder(cachedBinaries.ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(posterTime), '-i', input.backgroundPath, '-i', overlayPath,
        '-filter_complex', '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1[bg];[bg][1:v]overlay=0:0:format=auto[out]',
        '-map', '[out]', '-frames:v', '1', posterPath,
      ]);
    } finally {
      await rm(overlayPath, { force: true });
    }
  } else {
    await writeFile(posterPath, poster);
  }

  const encoder = spawn(cachedBinaries.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...(input.backgroundPath ? ['-stream_loop', '-1', '-i', input.backgroundPath] : []),
    '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'png', '-i', 'pipe:0',
    '-i', input.audioPath,
    ...(input.backgroundPath ? [
      '-filter_complex', '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,setsar=1[bg];[bg][1:v]overlay=0:0:shortest=1:format=auto[out]',
      '-map', '[out]', '-map', '2:a:0',
    ] : ['-map', '0:v:0', '-map', '1:a:0']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-t', String(input.durationSeconds), '-shortest', videoPath,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errorText = '';
  let encoderError: Error | undefined;
  encoder.stderr.on('data', (chunk: Buffer) => { errorText = `${errorText}${chunk.toString()}`.slice(-3000); });
  encoder.on('error', (error) => { encoderError = error; });
  // Attach immediately so early spawn/encoder failures cannot become unhandled rejections.
  const finished = new Promise<void>((resolve, reject) => {
    encoder.on('close', (code) => code === 0 ? resolve() : reject(new Error(`VIDEO_ENCODING_FAILED: ${errorText.slice(-1000) || encoderError?.message || `encoder exited ${code}`}`)));
    encoder.on('error', reject);
  });
  void finished.catch(() => {});
  // Writable errors also have a listener before the first frame is sent.
  encoder.stdin.on('error', (error) => { encoderError = error; });

  try {
    const frameCount = Math.ceil(input.durationSeconds * FPS);
    let previousSvg='',previousPng:Buffer|undefined;
    for (let frame = 0; frame < frameCount; frame++) {
      if (encoderError || encoder.exitCode !== null) throw encoderError ?? new Error('VIDEO_ENCODING_FAILED: encoder stopped before all frames were rendered.');
      const time = frame / FPS;
      const svg=frameSvg(input,groups,time);
      const png=svg===previousSvg&&previousPng?previousPng:new Resvg(svg,{font:FONT_OPTIONS}).render().asPng();
      previousSvg=svg;previousPng=png;
      if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
      if (frame % FPS === 0) input.onProgress?.(frame / frameCount);
      // Rasterization itself is synchronous. Yield after each frame so HTTP/status stays responsive.
      await yieldFrame();
    }
    encoder.stdin.end();
    await finished;
    input.onProgress?.(1);
    return { videoPath, posterPath };
  } catch (error) {
    encoder.stdin.destroy();
    encoder.kill('SIGTERM');
    await finished.catch(() => {});
    throw error;
  }
}

async function runEncoder(ffmpeg: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let output = '';
    process.stderr.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-1200); });
    process.on('error', reject);
    process.on('close', (code) => code === 0 ? resolve() : reject(new Error(`VIDEO_ENCODING_FAILED: ${output || `encoder exited ${code}`}`)));
  });
}
