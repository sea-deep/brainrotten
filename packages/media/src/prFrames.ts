// GitHub-style pull request review panels for the `prreview` format.
// The agent supplies the PR, its real diff lines and comments; layout and styling are decided here.
import type {PrReview,VideoScript} from '@brainrot/contracts';
import {iconAvatarUri,resolveChatIcon} from './chatIcons.js';
import {h,text,img,svgUri,renderPanel,type UiNode} from './uiKit.js';

export const PR_PANEL={width:720,height:800};
/** Panel height that fits the tallest state without a big empty area; constant within one video. */
export function prPanelHeight(script:VideoScript):number{
  const pr=script.pr!,commentRows=(t:string)=>Math.ceil(t.length/46);
  const titleRows=Math.ceil(pr.title.length/34);
  let tallest=0;
  script.dialogue.forEach((line,index)=>{
    const file=pr.files[fileForComment(script.dialogue,index)]!,rows=Math.min(VISIBLE,file.lines.length);
    const card=88+commentRows(line.pr?.display??line.text)*31;
    tallest=Math.max(tallest,rows*31+card+(index===script.dialogue.length-1?70:0));
  });
  return Math.max(560,Math.min(860,Math.round(250+titleRows*37+60+tallest+24)));
}
const GH={bg:'#0d1117',panel:'#161b22',border:'#30363d',fg:'#e6edf3',muted:'#7d8590',green:'#3fb950',red:'#f85149',open:'#238636',accent:'#f78166',focus:'rgba(187,128,9,.22)',focusBar:'#d29922'};
const TONE:Record<string,{label:string;color:string}>={praise:{label:'praise',color:'#3fb950'},question:{label:'question',color:'#58a6ff'},nit:{label:'nit',color:'#a371f7'},roast:{label:'roast 🔥',color:'#f0883e'},blocker:{label:'blocker',color:'#f85149'}};
const VISIBLE=11;
const AVATAR_COLORS=['#8957e5','#1f6feb','#bf4b8a'];

function lucide(name:string,color:string):string{
  const icon=resolveChatIcon(name);if(!icon||icon.kind!=='generic')return '';
  const body=icon.svg.replace(/<!--[\s\S]*?-->/g,'').replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`);
}

type Line=VideoScript['dialogue'][number];
export interface PrPanels{height:number;panel(index:number):string}

/** Which file a comment shows: its own, or the file the previous anchored comment was on. */
export function fileForComment(lines:Line[],index:number):number{
  for(let i=Math.min(index,lines.length-1);i>=0;i--){const file=lines[i]?.pr?.file;if(file!==undefined)return file;}
  return 0;
}

function header(pr:PrReview,commentCount:number):UiNode{
  const repo=pr.repo??'your-org/your-repo',[owner,name]=repo.split('/');
  return h('div',{flexDirection:'column',padding:'26px 22px 0',background:GH.bg},
    h('div',{alignItems:'center',gap:10},img(lucide('book-marked',GH.muted)||lucide('folder',GH.muted),{width:22,height:22}),text({fontSize:21,color:GH.muted},`${owner} / `),text({fontSize:21,color:GH.fg},name??'')),
    h('div',{marginTop:12,flexWrap:'wrap'},text({fontSize:29,color:GH.fg,lineHeight:1.25},pr.title),text({fontSize:29,color:GH.muted,marginLeft:8},'#142')),
    h('div',{alignItems:'center',gap:10,marginTop:12},
      h('div',{alignItems:'center',gap:6,background:GH.open,borderRadius:16,padding:'5px 12px'},img(lucide('git-pull-request','#ffffff'),{width:18,height:18}),text({fontSize:18,color:'#fff'},'Open')),
      img(iconAvatarUri(pr.author.icon,'#6e7681'),{width:24,height:24,borderRadius:12}),
      text({fontSize:18,color:GH.muted},`${pr.author.name} wants to merge into main`)),
    h('div',{gap:26,marginTop:18,borderBottom:`1px solid ${GH.border}`},
      ...[['Conversation',String(commentCount)],['Commits','1'],['Checks','1'],['Files changed',String(pr.files.length)]].map(([label,count],i)=>h('div',{alignItems:'center',gap:6,paddingBottom:10,borderBottom:i===3?`3px solid ${GH.accent}`:'3px solid transparent'},
        text({fontSize:18,color:i===3?GH.fg:GH.muted},label!),text({fontSize:15,color:GH.fg,background:'#30363d',borderRadius:10,padding:'1px 7px'},count!)))));
}

function commentCard(line:Line,pr:PrReview):UiNode{
  const reviewer=pr.reviewers.find(r=>r.speaker===line.speaker)??pr.reviewers[0]!;
  const color=AVATAR_COLORS[pr.reviewers.indexOf(reviewer)%AVATAR_COLORS.length]!,tone=TONE[line.pr?.tone??'question']!;
  return h('div',{flexDirection:'column',margin:'8px 10px',background:GH.panel,border:`1px solid ${GH.border}`,borderRadius:10,padding:'12px 14px'},
    h('div',{alignItems:'center',gap:10},img(iconAvatarUri(reviewer.icon,color),{width:34,height:34,borderRadius:17}),text({fontSize:20,color:GH.fg},reviewer.name),
      text({fontSize:15,color:tone.color,border:`1px solid ${tone.color}`,borderRadius:12,padding:'1px 9px'},tone.label),text({fontSize:16,color:GH.muted,marginLeft:'auto'},'now')),
    text({fontSize:23,color:GH.fg,lineHeight:1.32,marginTop:8},line.pr?.display??line.text));
}

function verdictBanner(pr:PrReview,line:Line):UiNode{
  const reviewer=pr.reviewers.find(r=>r.speaker===line.speaker)??pr.reviewers[0]!;
  const look=pr.verdict==='approve'?{icon:'circle-check',color:GH.green,label:'approved these changes'}:pr.verdict==='request-changes'?{icon:'file-diff',color:GH.red,label:'requested changes'}:{icon:'message-square',color:GH.muted,label:'reviewed'};
  return h('div',{alignItems:'center',gap:12,margin:'8px 10px',padding:'12px 16px',borderRadius:10,border:`1px solid ${look.color}`,background:'rgba(255,255,255,.03)'},
    img(lucide(look.icon,look.color),{width:30,height:30}),text({fontSize:21,color:GH.fg},reviewer.name),text({fontSize:21,color:look.color},look.label));
}

function panelTree(script:VideoScript,index:number,height:number):UiNode{
  const pr=script.pr!,lines=script.dialogue,line=index>=0?lines[index]:undefined;
  const fileIndex=fileForComment(lines,Math.max(0,index)),file=pr.files[fileIndex]!;
  const focus=line?.pr?.file===fileIndex?line.pr.lines??[0,Math.min(2,file.lines.length-1)]:undefined;
  const start=Math.max(0,Math.min((focus?.[0]??0)-2,file.lines.length-VISIBLE)),end=Math.min(file.lines.length,start+VISIBLE);
  const adds=file.lines.filter(l=>l.kind==='add').length,dels=file.lines.filter(l=>l.kind==='del').length;
  let number=0;const numbers=file.lines.map(l=>l.kind==='del'?'':String(40+(++number)));
  const rows:UiNode[]=[];
  for(let i=start;i<end;i++){
    const diff=file.lines[i]!,focused=Boolean(focus&&i>=focus[0]&&i<=focus[1]);
    const tint=diff.kind==='add'?'rgba(46,160,67,.15)':diff.kind==='del'?'rgba(248,81,73,.15)':'transparent';
    rows.push(h('div',{background:focused?GH.focus:tint,borderLeft:`4px solid ${focused?GH.focusBar:'transparent'}`,padding:'3px 0',alignItems:'center'},
      text({width:48,justifyContent:'flex-end',paddingRight:10,fontFamily:'Mono',fontSize:18,color:GH.muted},numbers[i]!),
      text({width:22,fontFamily:'Mono',fontSize:21,color:diff.kind==='add'?GH.green:diff.kind==='del'?GH.red:GH.muted},diff.kind==='add'?'+':diff.kind==='del'?'-':' '),
      text({fontFamily:'Mono',fontSize:21,color:GH.fg,whiteSpace:'pre'},diff.code||' ')));
    if(line&&focused&&i===focus![1])rows.push(commentCard(line,pr));
  }
  const summary=line&&line.pr?.file===undefined?commentCard(line,pr):null;
  const verdict=line&&index===lines.length-1?verdictBanner(pr,line):null;
  return h('div',{width:PR_PANEL.width,height,flexDirection:'column',background:GH.bg,fontFamily:'Roboto'},
    header(pr,Math.max(0,index+1)),
    h('div',{flexDirection:'column',margin:'14px 12px 0',border:`1px solid ${GH.border}`,borderRadius:10,overflow:'hidden',flexShrink:1},
      h('div',{background:GH.panel,padding:'10px 14px',alignItems:'center',gap:12,borderBottom:`1px solid ${GH.border}`},
        text({fontFamily:'Mono',fontSize:18,color:GH.fg,flex:1},file.path),text({fontSize:17,color:GH.green},`+${adds}`),text({fontSize:17,color:GH.red},`−${dels}`)),
      h('div',{flexDirection:'column',background:GH.bg},...rows)),
    summary,verdict);
}

/** Pre-renders the opening view plus one view per spoken comment. */
export async function preparePrPanels(script:VideoScript):Promise<PrPanels>{
  if(!script.pr)throw new Error('PR review scripts need script.pr.');
  const panels:string[]=[],height=prPanelHeight(script);
  for(let index=-1;index<script.dialogue.length;index++)panels.push(await renderPanel(panelTree(script,index,height),{width:PR_PANEL.width,height}));
  return{height,panel:index=>panels[Math.max(-1,Math.min(script.dialogue.length-1,index))+1]??''};
}
