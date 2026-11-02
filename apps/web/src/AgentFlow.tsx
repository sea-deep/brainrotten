import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Icon} from './Icons.js';

/**
 * Homepage walkthrough, driven by scrolling: the section pins while the reader scrolls through it and
 * each stretch of scroll moves the story one step (scrolling back rewinds). One real session from this
 * repository: the hosted Lambda could not find its handler, the agent fixed it and asked for a sketch.
 * Without scroll support or with reduced motion, the finished state shows as a normal section.
 */
const DURATION=15;// story length in "seconds" of progress
const PHASES=[0,1.6,3.6,5.6,10.8] as const;// request, context, queued, rendering, ready
const SCROLL_SHARE=.86;// the last part of the scroll holds the finished state

export const STEPS=[
  {label:'You ask',caption:'You ask your agent to explain the fix while it keeps working.'},
  {label:'Real context',caption:'The agent already has the diff and the reason behind it.'},
  {label:'MCP call',caption:'It writes the script itself and queues one Brainrotten job.'},
  {label:'Render',caption:'Brainrotten draws, voices and renders the video in the background.'},
  {label:'You get it',caption:'You watch a one-minute sketch and answer a quick question.'},
] as const;

const TERMINAL:Array<{at:number;kind:'user'|'agent'|'ok'|'tool';text:string}>=[
  {at:0,kind:'user',text:'› explain this fix as a sketch'},
  {at:.9,kind:'tool',text:'→ brainrotten · generate_short_video'},
  {at:2.2,kind:'agent',text:'Queued job 7f3c. Back to the deploy.'},
  {at:3.6,kind:'agent',text:'Building the arm64 image'},
  {at:5.4,kind:'agent',text:'Pushing to ECR'},
  {at:7.4,kind:'agent',text:'Updating the API stack'},
  {at:9.6,kind:'ok',text:'✓ GET /health → 200'},
  {at:11.4,kind:'agent',text:'Sketch ready: “Lambda ko handler kyun nahi mila?”'},
  {at:12.8,kind:'agent',text:'Next: keep-warm schedule'},
];
const HISTORY=[
  {kind:'agent' as const,text:'Live API: Cannot find module \'api\''},
  {kind:'agent' as const,text:'Adding apps/cloud/lambda-bootstrap.mjs'},
  {kind:'ok' as const,text:'✓ handler loads with Lambda env vars'},
];
const RENDER_STAGES=['Script','Voice','Sketch','Video'];
const LEARNED=[
  {label:'Approach',text:'A bootstrap sets _HANDLER before the runtime starts.'},
  {label:'Trade-off',text:'One more file to keep in the image.'},
  {label:'Ask',text:'Why does the runtime ignore the command argument?'},
];

const clamp=(value:number)=>Math.max(0,Math.min(1,value));
function prefersReducedMotion(){return typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;}

/** Maps the reader's position inside the tall section to story time. */
function useScrollTime(section:React.RefObject<HTMLElement|null>){
  const[time,setTime]=useState(()=>prefersReducedMotion()?DURATION:0),[scrubbed,setScrubbed]=useState(false);
  useEffect(()=>{
    const element=section.current;
    if(!element||typeof matchMedia!=='function'||prefersReducedMotion()){setTime(DURATION);setScrubbed(false);return;}
    setScrubbed(true);
    let frame=0;
    const measure=()=>{frame=0;const top=element.getBoundingClientRect().top,total=Math.max(1,element.offsetHeight-window.innerHeight);setTime(clamp(-top/total/SCROLL_SHARE)*DURATION);};
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    const motion=()=>{if(reduced.matches){setScrubbed(false);setTime(DURATION);}else{setScrubbed(true);schedule();}};
    addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);reduced.addEventListener('change',motion);
    measure();
    return()=>{removeEventListener('scroll',schedule);removeEventListener('resize',schedule);reduced.removeEventListener('change',motion);if(frame)cancelAnimationFrame(frame);};
  },[section]);
  return{time,scrubbed};
}

export function AgentFlow({heading}:{heading?:React.ReactNode}):React.ReactElement{
  const section=useRef<HTMLElement>(null),{time,scrubbed}=useScrollTime(section);
  const phase=PHASES.reduce<number>((current,start,index)=>time>=start?index:current,0);
  const renderProgress=clamp((time-PHASES[3])/(PHASES[4]-PHASES[3]));
  const lines=[...HISTORY,...TERMINAL.filter(line=>time>=line.at)].slice(-7);
  const status=phase<2?'idle':phase===2?'queued':phase===3?'rendering':'ready';
  const step=(index:number)=>phase===index?'is-active':phase>index?'is-done':'is-pending';
  /** Scrolls to the point where a step starts, so the rail doubles as navigation. */
  const jump=useCallback((index:number)=>{
    const element=section.current;if(!element)return;
    if(!scrubbed){element.querySelectorAll('.flow-card')[index]?.scrollIntoView({block:'center'});return;}
    const total=Math.max(1,element.offsetHeight-innerHeight),start=element.getBoundingClientRect().top+scrollY;
    scrollTo({top:start+total*SCROLL_SHARE*(((PHASES[index]??0)+.2)/DURATION),behavior:'smooth'});
  },[scrubbed]);
  return <section ref={section} className={`flow-section${scrubbed?' is-scrubbed':''}`} aria-labelledby="story-title" style={{'--flow-progress':time/DURATION} as React.CSSProperties}>
    <div className="flow-sticky">
      {heading}
      <ol className="flow-rail" aria-label="Walkthrough steps">{STEPS.map((item,index)=><li key={item.label} className={step(index)}><button type="button" onClick={()=>jump(index)} aria-current={phase===index?'step':undefined}><span className="flow-num">{index+1}</span><span>{item.label}</span></button></li>)}</ol>
      <p className="flow-caption" aria-live="polite"><span className="flow-count">{phase+1}/{STEPS.length}</span>{STEPS[phase]!.caption}</p>
      <div className="flow" data-phase={phase} data-complete={time>=DURATION}>
        <article className={`flow-card flow-terminal ${step(0)}`} aria-label="Step 1: your agent">
          <header><span className="flow-num">1</span><h3>Your agent</h3><span className="flow-live"><i/>keeps working</span></header>
          <div className="flow-term-body" aria-hidden="true">
            <p className="flow-term-path">~/brainrotten · agent</p>
            {lines.map(line=><p key={line.text} className={`flow-term-line is-${line.kind}`}>{line.text}</p>)}
            <p className="flow-term-line is-cursor"><span/></p>
          </div>
        </article>

        <div className="flow-column">
          <article className={`flow-card flow-diff ${step(1)}`} aria-label="Step 2: code and context">
            <header><span className="flow-num">2</span><h3>Code + context</h3></header>
            <div className="flow-file" aria-hidden="true"><span>apps/cloud/lambda-bootstrap.mjs</span><span className="flow-diffstat"><b>+4</b></span></div>
            <pre className="flow-code" aria-hidden="true"><code>
              <span className="is-add">+ const handler = process.argv[2];</span>
              <span className="is-add">+ if (handler) process.env._HANDLER = handler;</span>
              <span className="is-add">+ process.env.LAMBDA_TASK_ROOT = '/var/task/app';</span>
              <span className="is-add">+ await import('…/aws-lambda-ric/index.mjs');</span>
            </code></pre>
          </article>
          <article className={`flow-card flow-mcp ${step(2)}`} aria-label="Step 3: Brainrotten MCP">
            <header><span className="flow-num">3</span><h3>Brainrotten MCP</h3><span className={`flow-status is-${status}`}>{status}</span></header>
            <pre className="flow-code" aria-hidden="true"><code>
              <span><b>generate_short_video</b>({'{'}</span>
              <span>  format: <em>"sketch"</em>, narrator: <em>"jack"</em>,</span>
              <span>  script: {'{'} title: <em>"Lambda ko handler kyun nahi mila?"</em>, … {'}'}</span>
              <span>{'}'}) <s>→ job 7f3c</s></span>
            </code></pre>
          </article>
        </div>

        <div className="flow-column">
          <article className={`flow-card flow-reel ${step(3)}`} aria-label="Step 4: explanation video">
            <header><span className="flow-num">4</span><h3>Sketch video</h3></header>
            <div className="flow-reel-body">
              <div className="flow-phone">
                <img src="/examples/session-sketch-lambda/poster.png" alt="Sketch board explaining why the Lambda could not find its handler" width="360" height="640" loading="lazy"/>
                <div className="flow-phone-shade" style={{opacity:phase>=4?0:.82-renderProgress*.62}}/>
                {phase>=4?<span className="flow-play"><Icon name="play" size={14}/>Ready</span>:<span className="flow-percent">{phase>=3?`${Math.round(renderProgress*100)}%`:'…'}</span>}
                <span className="flow-bar"><span style={{transform:`scaleX(${phase>=4?1:renderProgress})`}}/></span>
              </div>
              <ol className="flow-stages" aria-label="Render stages">{RENDER_STAGES.map((stage,index)=>{const done=phase>=4||renderProgress>=(index+1)/RENDER_STAGES.length;return <li key={stage} className={done?'is-done':phase===3&&renderProgress>=index/RENDER_STAGES.length?'is-active':''}><span aria-hidden="true">{done?'✓':'·'}</span>{stage}</li>;})}</ol>
            </div>
          </article>
          <article className={`flow-card flow-learned ${step(4)}`} aria-label="Step 5: understanding">
            <header><span className="flow-num">5</span><h3>What you now know</h3></header>
            <ul>{LEARNED.map((item,index)=><li key={item.label} className={phase>=4&&time>=PHASES[4]+.4+index*.8?'is-shown':''}><strong>{item.label}</strong> {item.text}</li>)}</ul>
          </article>
        </div>
      </div>
    </div>
  </section>;
}
