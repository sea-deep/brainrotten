// TierMaker-style board for the `tierlist` format.
// The agent supplies the criterion, items and placements; the board is drawn here.
import type {VideoScript} from '@brainrot/contracts';
import {resolveChatIcon,iconAvatarUri} from './chatIcons.js';
import {h,text,img,svgUri,renderPanel,type UiNode} from './uiKit.js';

export const TIER_PANEL={width:720,height:850};
const TIERS=[['S','#ff7f7f'],['A','#ffbf7f'],['B','#ffdf7f'],['C','#ffff7f'],['D','#bfff7f'],['F','#7fbfff']] as const;
const ROW=96,TILE=84;

function iconUri(name:string|undefined):string{
  if(!name)return '';const icon=resolveChatIcon(name);if(!icon)return '';
  if(icon.kind==='brand')return iconAvatarUri(name,'#333');
  const body=icon.svg.replace(/<!--[\s\S]*?-->/g,'').replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1a1a17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`);
}

type Item=NonNullable<VideoScript['tierlist']>['items'][number];
function tile(item:Item,state:'placed'|'new'|'tray'|'held'):UiNode{
  const icon=iconUri(item.icon),size=state==='held'?TILE+4:TILE;
  return h('div',{width:size,height:size,flexDirection:'column',alignItems:'center',justifyContent:'center',background:state==='tray'?'#e9e7e0':'#f7f5ee',borderRadius:6,
      border:state==='new'||state==='held'?'4px solid #ffd43b':'4px solid transparent',opacity:state==='tray'?.6:1,padding:4},
    icon?img(icon,{width:state==='held'?38:34,height:state==='held'?38:34}):null,
    text({fontSize:13,color:'#1a1a17',textAlign:'center',justifyContent:'center',marginTop:icon?4:0,lineHeight:1.1},item.label));
}

export interface TierPanels{height:number;panel(index:number):string}

function panelTree(script:VideoScript,index:number):UiNode{
  const list=script.tierlist!,lines=script.dialogue;
  const placed=new Map<string,string>(),order:string[]=[];
  for(let i=0;i<=index;i++){const place=lines[i]?.tier?.place;if(place){placed.set(place.item,place.tier);order.push(place.item);}}
  const newest=lines[index]?.tier?.place?.item,held=lines[index]?.tier?.focus;
  const heldItem=held&&!placed.has(held)?list.items.find(i=>i.id===held):undefined;
  const rows=TIERS.map(([tier,color])=>h('div',{height:ROW,borderBottom:'2px solid #1a1a17'},
    text({width:ROW,background:color,fontSize:40,color:'#1a1a17',justifyContent:'center',alignItems:'center'},tier),
    h('div',{flex:1,background:'#2a2a26',alignItems:'center',gap:6,padding:'0 6px',flexWrap:'wrap'},
      ...order.filter(id=>placed.get(id)===tier).map(id=>tile(list.items.find(i=>i.id===id)!,id===newest?'new':'placed')))));
  const tray=list.items.filter(item=>!placed.has(item.id)&&item.id!==heldItem?.id);
  return h('div',{width:TIER_PANEL.width,height:TIER_PANEL.height,flexDirection:'column',background:'#1a1a17',fontFamily:'Roboto',padding:'22px 14px 14px'},
    // Fixed-height header so the board never shifts; a held item floats in its corner.
    h('div',{height:96,position:'relative',marginBottom:10},
      h('div',{flexDirection:'column',width:540},text({fontSize:28,color:'#ffffff',lineHeight:1.15},script.title),text({fontSize:19,color:'#b9b5a8',marginTop:6},`ranked by: ${list.criterion}`)),
      heldItem?h('div',{position:'absolute',right:6,top:-8,flexDirection:'column',alignItems:'center',gap:3},text({fontSize:12,color:'#ffd43b'},'NOW RANKING'),tile(heldItem,'held')):null),
    h('div',{flexDirection:'column',borderTop:'2px solid #1a1a17'},...rows),
    h('div',{flex:1,marginTop:12,background:'#23231f',borderRadius:8,padding:8,gap:6,flexWrap:'wrap',alignItems:'flex-start'},
      ...(tray.length?tray.map(item=>tile(item,'tray')):[text({fontSize:16,color:'#7a776d',padding:8},'all ranked')])));
}

/** Pre-renders the opening board plus one board per spoken line. */
export async function prepareTierPanels(script:VideoScript):Promise<TierPanels>{
  if(!script.tierlist)throw new Error('Tier list scripts need script.tierlist.');
  const panels:string[]=[];
  for(let index=-1;index<script.dialogue.length;index++)panels.push(await renderPanel(panelTree(script,index),TIER_PANEL));
  return{height:TIER_PANEL.height,panel:index=>panels[Math.max(-1,Math.min(script.dialogue.length-1,index))+1]??''};
}
