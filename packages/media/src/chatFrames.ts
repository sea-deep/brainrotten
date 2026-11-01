// WhatsApp-style group chat panels for the `groupchat` format.
// The agent supplies members and messages; everything visual is decided here.
import type {CharacterId,GroupChat,VideoScript} from '@brainrot/contracts';
import {iconAvatarUri} from './chatIcons.js';
import {h,text,img,svgUri,renderPanel,type UiNode} from './uiKit.js';

export const CHAT_PANEL={width:720,height:760};
const HEADER=118,INPUT=88;
const WA={header:'#008069',wallpaper:'#efeae2',incoming:'#ffffff',outgoing:'#d9fdd3',text:'#111b21',meta:'#667781',tick:'#53bdeb',chip:'#e1f2fb'};
// WhatsApp-like sender name colors, assigned in member order.
const NAME_COLORS=['#d1477a','#1f7aec','#c75d0e','#06a88c'];

const ICON={
  back:svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="#fff"/></svg>'),
  video:svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" fill="#fff"/></svg>'),
  call:svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="#fff"/></svg>'),
  more:svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" fill="#fff"/><circle cx="12" cy="12" r="2" fill="#fff"/><circle cx="12" cy="19" r="2" fill="#fff"/></svg>'),
  ticks:svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 11"><path d="M1 6l3 3 6-7M7 9l1 1 7-8" fill="none" stroke="${WA.tick}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  mic:svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z" fill="#fff"/></svg>'),
};

export interface ChatState{visible:number;typing:boolean}
export interface ChatPanels{panel(state:ChatState):string}
type Line=VideoScript['dialogue'][number];

function clock(index:number){const minute=41+index;return `10:${String(minute%60).padStart(2,'0')}`;}

function bubble(line:Line,index:number,lines:Line[],chat:GroupChat,faces:Map<CharacterId,string>):UiNode{
  const member=chat.members.find(m=>m.speaker===line.speaker)!,mine=Boolean(member.you);
  const color=NAME_COLORS[chat.members.indexOf(member)%NAME_COLORS.length]!;
  const firstOfRun=index===0||lines[index-1]!.speaker!==line.speaker;
  const body=line.chat?.display??line.text,reaction=line.chat?.reaction;
  const meta=h('div',{alignSelf:'flex-end',alignItems:'center',gap:4,marginLeft:12,marginTop:6},text({fontSize:17,color:WA.meta},clock(index)),mine?img(ICON.ticks,{width:22,height:14}):null);
  const card=h('div',{flexDirection:'column',background:mine?WA.outgoing:WA.incoming,padding:'8px 14px 8px',borderRadius:16,
    borderTopLeftRadius:!mine&&firstOfRun?4:16,borderTopRightRadius:mine&&firstOfRun?4:16,maxWidth:520,boxShadow:'0 1px 1px rgba(11,20,26,.13)'},
    !mine&&firstOfRun?text({fontSize:20,color,marginBottom:2},member.name):null,
    h('div',{flexWrap:'wrap',alignItems:'flex-end'},text({fontSize:28,lineHeight:1.28,color:WA.text},body),line.chat?.code?null:meta),
    line.chat?.code?h('div',{flexDirection:'column',background:'#f0f2f5',borderRadius:8,padding:'8px 10px',marginTop:8},...line.chat.code.split('\n').map(row=>text({fontFamily:'Mono',fontSize:21,color:'#1f2328',whiteSpace:'pre'},row||' '))):null,
    line.chat?.code?meta:null);
  const withReaction=h('div',{flexDirection:'column',alignItems:mine?'flex-end':'flex-start'},card,
    reaction?h('div',{marginTop:-10,marginLeft:mine?0:18,marginRight:mine?18:0,background:'#fff',borderRadius:16,padding:'2px 8px',border:'1px solid #e9edef'},text({fontSize:22},reaction)):null);
  const face=!mine?(firstOfRun?img(faces.get(line.speaker)!,{width:44,height:44,borderRadius:22}):h('div',{width:44})):null;
  return h('div',{width:'100%',justifyContent:mine?'flex-end':'flex-start',alignItems:'flex-start',gap:10,marginTop:firstOfRun?14:4},face,withReaction);
}

function panelTree(script:VideoScript,state:ChatState,faces:Map<CharacterId,string>):UiNode{
  const chat=script.chat!,lines=script.dialogue,next=lines[state.visible];
  const typer=state.typing&&next?chat.members.find(m=>m.speaker===next.speaker):undefined;
  // WhatsApp never shows your own typing to you.
  const typingName=typer&&!typer.you?typer.name:undefined;
  const subtitle=typingName?`${typingName} is typing…`:chat.members.map(m=>m.you?'You':m.name).join(', ');
  // WhatsApp's default group photo: a grey circle with a people silhouette.
  const groupFace=img(iconAvatarUri('users','#c3cbd0'),{width:58,height:58,borderRadius:29});
  const header=h('div',{height:HEADER,background:WA.header,alignItems:'flex-end',padding:'0 14px 16px',gap:12},
    img(ICON.back,{width:30,height:30,marginBottom:12}),groupFace,
    h('div',{flexDirection:'column',flex:1,marginBottom:2},text({fontSize:28,color:'#fff'},chat.title),text({fontSize:19,color:typingName?'#d9fdd3':'rgba(255,255,255,.8)'},subtitle)),
    img(ICON.video,{width:32,height:32,marginBottom:12}),img(ICON.call,{width:28,height:28,marginBottom:13,marginLeft:12}),img(ICON.more,{width:28,height:28,marginBottom:13,marginLeft:6}));
  const shown=lines.slice(0,state.visible);
  // Newest messages stay pinned to the bottom; older ones scroll off the top like a real thread.
  const body=h('div',{flex:1,flexDirection:'column',justifyContent:'flex-end',background:WA.wallpaper,padding:'0 14px 12px',overflow:'hidden'},
    h('div',{justifyContent:'center',marginBottom:6},text({background:WA.chip,color:'#54656f',fontSize:17,padding:'5px 14px',borderRadius:8},'TODAY')),
    ...shown.map((line,index)=>bubble(line,index,shown,chat,faces)));
  const input=h('div',{height:INPUT,background:WA.wallpaper,alignItems:'center',padding:'0 12px 10px',gap:10},
    h('div',{flex:1,height:62,background:'#fff',borderRadius:31,alignItems:'center',padding:'0 22px'},text({fontSize:24,color:'#8696a0'},'Message')),
    h('div',{width:62,height:62,borderRadius:31,background:'#00a884',alignItems:'center',justifyContent:'center'},img(ICON.mic,{width:30,height:30})));
  return h('div',{width:CHAT_PANEL.width,height:CHAT_PANEL.height,flexDirection:'column',fontFamily:'Roboto',background:WA.wallpaper},header,body,input);
}

/** Pre-renders every chat state once (2 per message + an empty thread), so video frames stay cheap. */
export async function prepareChatPanels(script:VideoScript):Promise<ChatPanels>{
  if(!script.chat)throw new Error('Group chat scripts need chat members.');
  const faces=new Map<CharacterId,string>();script.chat.members.forEach((member,index)=>faces.set(member.speaker,iconAvatarUri(member.icon,NAME_COLORS[index%NAME_COLORS.length]!)));
  const rendered=new Map<string,string>(),key=(s:ChatState)=>`${s.visible}:${s.typing?1:0}`;
  const states:ChatState[]=[];for(let visible=0;visible<=script.dialogue.length;visible++)states.push({visible,typing:false},...(visible<script.dialogue.length?[{visible,typing:true}]:[]));
  for(const state of states){
    rendered.set(key(state),await renderPanel(panelTree(script,state,faces),CHAT_PANEL));
  }
  return{panel:state=>rendered.get(key({visible:Math.max(0,Math.min(script.dialogue.length,state.visible)),typing:state.typing&&state.visible<script.dialogue.length}))??''};
}

/** Which chat state belongs at a moment: message k appears when its speech starts; "typing…" fills gaps. */
export function chatStateAt(segments:Array<{startMs:number;endMs:number}>,timeMs:number):ChatState{
  let visible=0;for(const [index,segment]of segments.entries())if(timeMs>=segment.startMs)visible=index+1;
  const current=segments[visible-1],next=segments[visible];
  const typing=Boolean(next&&(!current||timeMs>=current.endMs)&&next.startMs-timeMs<=1200);
  return{visible,typing};
}
