// Pause & Predict: real thinking time inserted into the audio, plus a question card over the frame.
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {VideoScript,ReviewQuestion} from '@brainrot/contracts';
import {h,text,renderPanel,type UiNode} from './uiKit.js';

const execFileAsync=promisify(execFile);
const REVEAL_MS=2600;
type Timed={startMs:number;endMs:number};
type VoiceLike<S extends Timed,W extends Timed>={audioPath:string;durationSeconds:number;segments:S[];words:W[]};

/** Thinking time is the app's call: time to read the question and choices, plus a few seconds to think. */
export function pauseSeconds(pause:NonNullable<VideoScript['dialogue'][number]['pause']>):number{
  const words=[pause.prompt,...pause.choices].join(' ').split(/\s+/).filter(Boolean).length;
  return Math.min(10,Math.max(5,pause.seconds??0,Math.ceil(words/2.5)+3));
}
export function pauseLines(script:VideoScript):number[]{return script.dialogue.flatMap((line,index)=>line.pause&&index<script.dialogue.length-1?[index]:[]);}

/** Inserts each pause's silence right after its line and shifts every later timing. */
export async function insertPauses<S extends Timed,W extends Timed>(voice:VoiceLike<S,W>,script:VideoScript,outputDir:string):Promise<VoiceLike<S,W>>{
  const pauses=pauseLines(script);if(!pauses.length)return voice;
  const cuts=pauses.map(index=>({at:voice.segments[index]!.endMs,ms:pauseSeconds(script.dialogue[index]!.pause!)*1000})).sort((a,b)=>a.at-b.at);
  const filters:string[]=[],labels:string[]=[];let from=0;
  cuts.forEach((cut,i)=>{
    filters.push(`[0:a]atrim=start=${from/1000}:end=${cut.at/1000},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
    filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${cut.ms/1000}[s${i}]`);
    labels.push(`[a${i}]`,`[s${i}]`);from=cut.at;
  });
  filters.push(`[0:a]atrim=start=${from/1000},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[tail]`);labels.push('[tail]');
  filters.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`);
  const audioPath=path.join(outputDir,'paused-audio.mp3');
  await execFileAsync(process.env['FFMPEG_PATH']??'ffmpeg',['-hide_banner','-loglevel','error','-y','-i',voice.audioPath,'-filter_complex',filters.join(';'),'-map','[out]','-c:a','libmp3lame','-b:a','128k',audioPath]);
  // Every silence that starts before a moment pushes it later. A boundary exactly at a cut belongs to the speech
  // before it: an end there stays before that silence (but after every earlier one), a start there moves past it.
  const silenceBefore=(ms:number,inclusive:boolean)=>cuts.filter(cut=>inclusive?cut.at<=ms:cut.at<ms).reduce((n,cut)=>n+cut.ms,0);
  const move=<T extends Timed>(item:T):T=>({...item,startMs:item.startMs+silenceBefore(item.startMs,true),endMs:item.endMs+silenceBefore(item.endMs,false)});
  return{...voice,audioPath,durationSeconds:voice.durationSeconds+cuts.reduce((n,cut)=>n+cut.ms,0)/1000,segments:voice.segments.map(move),words:voice.words.map(move)};
}

/** Pause questions become graded learning questions, linked to the reveal line. */
export function pauseQuestions(script:VideoScript):ReviewQuestion[]{
  return pauseLines(script).map(index=>{const pause=script.dialogue[index]!.pause!,reveal=script.dialogue[index+1]!;
    return{id:`pause-${index}`,prompt:pause.prompt,choices:pause.choices,answer:pause.answer,explanation:(reveal.chat?.display??reveal.pr?.display??reveal.text).slice(0,400),turnIndices:[index,index+1]};});
}

/** The card sits in the given region (below the chat/PR panel), so the content it asks about stays visible. */
function card(prompt:string,choices:string[],state:{count?:number;answer?:number},region:{height:number}):UiNode{
  const letters='ABCD',tight=region.height<470||choices.length>3;
  return h('div',{width:720,height:region.height,background:state.answer===undefined?'rgba(8,10,16,.62)':'rgba(8,10,16,.3)',alignItems:'center',justifyContent:'center',fontFamily:'Roboto'},
    h('div',{width:672,flexDirection:'column',background:'#fffdf7',borderRadius:24,padding:tight?'16px 20px':'22px 24px',boxShadow:'0 14px 40px rgba(0,0,0,.45)'},
      h('div',{alignItems:'center',justifyContent:'space-between'},
        text({fontSize:20,color:'#6b5bd2',background:'#ece8ff',borderRadius:12,padding:'5px 12px'},state.answer===undefined?'⏸ Pause & predict':'✅ Answer'),
        state.count!==undefined?h('div',{width:56,height:56,borderRadius:28,background:'#ff6b4a',alignItems:'center',justifyContent:'center'},text({fontSize:32,color:'#fff'},String(state.count))):null),
      text({fontSize:tight?25:28,color:'#1b1530',lineHeight:1.22,marginTop:12},prompt),
      h('div',{flexDirection:'column',gap:tight?7:10,marginTop:tight?10:14},...choices.map((choice,i)=>{const right=state.answer===i,dim=state.answer!==undefined&&!right;
        return h('div',{alignItems:'center',gap:12,padding:tight?'8px 12px':'11px 14px',borderRadius:14,background:right?'#d9f7e3':'#f3f0ea',border:`3px solid ${right?'#2ea05a':'transparent'}`,opacity:dim?.45:1},
          h('div',{width:36,height:36,borderRadius:18,background:right?'#2ea05a':'#1b1530',alignItems:'center',justifyContent:'center'},text({fontSize:19,color:'#fff'},letters[i]!)),
          text({fontSize:tight?21:24,color:'#1b1530',flex:1},choice));}))));
}

export interface PauseRegion{top:number;height:number}
export interface PauseOverlay{region:PauseRegion;at(timeMs:number):string;
  /** 0 = normal layout, 1 = pause layout (panel moved up for the card), eased in and out. */
  mode(timeMs:number):number}
const SLIDE_MS=350;
const ease=(x:number)=>x<=0?0:x>=1?1:x*x*(3-2*x);
/** Pre-renders countdown and reveal cards; at(t) returns the overlay PNG for that moment, or ''. */
export async function preparePauseOverlay(script:VideoScript,segments:Timed[],region:PauseRegion={top:80,height:600}):Promise<PauseOverlay|undefined>{
  const lines=pauseLines(script);if(!lines.length)return undefined;
  const windows:Array<{start:number;end:number;revealEnd:number;counts:Map<number,string>;reveal:string}>=[];
  for(const index of lines){
    const pause=script.dialogue[index]!.pause!,start=segments[index]!.endMs,end=segments[index+1]!.startMs,counts=new Map<number,string>();
    for(let n=1;n<=pauseSeconds(pause);n++)counts.set(n,await renderPanel(card(pause.prompt,pause.choices,{count:n},region),{width:720,height:region.height}));
    windows.push({start,end,revealEnd:end+REVEAL_MS,counts,reveal:await renderPanel(card(pause.prompt,pause.choices,{answer:pause.answer},region),{width:720,height:region.height})});
  }
  return{region,mode(timeMs){
    let value=0;for(const w of windows)value=Math.max(value,Math.min(ease((timeMs-(w.start-SLIDE_MS))/SLIDE_MS),ease((w.revealEnd+SLIDE_MS-timeMs)/SLIDE_MS)));
    return value;
  },at(timeMs){
    for(const w of windows){
      if(timeMs>=w.start&&timeMs<w.end){const left=Math.max(1,Math.ceil((w.end-timeMs)/1000));return w.counts.get(Math.min(left,w.counts.size))??'';}
      if(timeMs>=w.end&&timeMs<w.revealEnd)return w.reveal;
    }
    return '';
  }};
}
