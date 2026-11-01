import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './Icons.js';

/**
 * Homepage walkthrough: one concrete request moving from the agent's terminal, through Brainrotten MCP,
 * to a rendered reel, while the agent keeps coding. One timer drives every card; it pauses offscreen
 * and on hidden tabs, then holds the finished state. Reduced motion skips to the finished state.
 */
const DURATION=15;// seconds; play once so completed cards never disappear beneath the reader.
const PHASES=[0,1.6,3.6,5.6,10.8] as const;// request, context, queued, rendering, ready

const TERMINAL:Array<{at:number;kind:'user'|'agent'|'ok'|'tool';text:string}>=[
  {at:0,kind:'user',text:'› explain this fix as a reel'},
  {at:.9,kind:'tool',text:'→ brainrotten · generate_short_video'},
  {at:2.2,kind:'agent',text:'Queued job 7f3c. Back to the webhook.'},
  {at:3.6,kind:'agent',text:'Editing src/payments/webhook.ts'},
  {at:5.4,kind:'agent',text:'Adding an idempotency key'},
  {at:7.4,kind:'agent',text:'Editing src/payments/webhook.test.ts'},
  {at:9.6,kind:'ok',text:'✓ 24 tests passed'},
  {at:11.4,kind:'agent',text:'Reel ready: “Paise kat gaye…”'},
  {at:12.8,kind:'agent',text:'Next: retry policy for refunds'},
];
const HISTORY=[
  {kind:'agent' as const,text:'Reads after payment hit a lagging replica'},
  {kind:'agent' as const,text:'Editing src/orders/read.ts'},
  {kind:'ok' as const,text:'✓ 18 tests passed'},
];
const RENDER_STAGES=['Script','Voices','Captions','Video'];
const LEARNED=[
  {label:'Approach',text:'Fresh writes read from the primary.'},
  {label:'Trade-off',text:'More load on the primary.'},
  {label:'Ask',text:'Why not route by replication lag?'},
];

function useWalkthrough(root:React.RefObject<HTMLElement|null>){
  const[time,setTime]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches?DURATION:0);
  useEffect(()=>{
    const element=root.current;
    if(!element||typeof IntersectionObserver==='undefined'||typeof matchMedia!=='function'){setTime(DURATION);return;}
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let timer:ReturnType<typeof setInterval>|undefined,visible=false,started=0,elapsed=0;
    const stop=()=>{
      if(timer===undefined)return;
      elapsed=Math.min(DURATION,elapsed+(performance.now()-started)/1000);
      clearInterval(timer);timer=undefined;
    };
    const start=()=>{
      if(timer!==undefined||!visible||document.hidden||reduced.matches||elapsed>=DURATION)return;
      started=performance.now();
      timer=setInterval(()=>{
        const next=Math.min(DURATION,elapsed+(performance.now()-started)/1000);
        setTime(next);
        if(next>=DURATION)stop();
      },100);
    };
    const sync=()=>{if(reduced.matches){stop();elapsed=DURATION;setTime(DURATION);}else start();};
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;if(visible)start();else stop();},{threshold:.1});
    observer.observe(element);
    const visibility=()=>{if(document.hidden)stop();else start();};
    document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',sync);
    sync();
    return()=>{stop();observer.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',sync);};
  },[root]);
  return time;
}

export function AgentFlow():React.ReactElement{
  const root=useRef<HTMLDivElement>(null),time=useWalkthrough(root);
  const phase=PHASES.reduce<number>((current,start,index)=>time>=start?index:current,0);
  const renderProgress=Math.max(0,Math.min(1,(time-PHASES[3])/(PHASES[4]-PHASES[3])));
  const lines=[...HISTORY,...TERMINAL.filter(line=>time>=line.at)].slice(-7);
  const status=phase<2?'idle':phase===2?'queued':phase===3?'rendering':'ready';
  const step=(index:number)=>phase===index?'is-active':phase>index?'is-done':'is-pending';
  return <div ref={root} className="flow" data-phase={phase} data-complete={time>=DURATION}>
    <article className={`flow-card flow-terminal ${step(0)}`} aria-label="Step 1: your agent">
      <header><span className="flow-num">1</span><h3>Your agent</h3><span className="flow-live"><i/>keeps coding</span></header>
      <div className="flow-term-body" aria-hidden="true">
        <p className="flow-term-path">~/shop-api · agent</p>
        {lines.map(line=><p key={line.text} className={`flow-term-line is-${line.kind}`}>{line.text}</p>)}
        <p className="flow-term-line is-cursor"><span/></p>
      </div>
    </article>

    <div className="flow-column">
      <article className={`flow-card flow-diff ${step(1)}`} aria-label="Step 2: code and context">
        <header><span className="flow-num">2</span><h3>Code + context</h3></header>
        <div className="flow-file" aria-hidden="true"><span>src/orders/read.ts</span><span className="flow-diffstat"><b>+2</b> <i>−1</i></span></div>
        <pre className="flow-code" aria-hidden="true"><code>
          <span>export async function getOrder(id) {'{'}</span>
          <span className="is-del">-  return replica.orders.find(id)</span>
          <span className="is-add">+  const fresh = await recentlyWritten(id)</span>
          <span className="is-add">+  return (fresh ? primary : replica).orders.find(id)</span>
          <span>{'}'}</span>
        </code></pre>
      </article>
      <article className={`flow-card flow-mcp ${step(2)}`} aria-label="Step 3: Brainrotten MCP">
        <header><span className="flow-num">3</span><h3>Brainrotten MCP</h3><span className={`flow-status is-${status}`}>{status}</span></header>
        <pre className="flow-code" aria-hidden="true"><code>
          <span><b>generate_short_video</b>({'{'}</span>
          <span>  participants: {'{'} learner: <em>"jhaplu"</em>, expert: <em>"paplu"</em> {'}'},</span>
          <span>  script: {'{'} title: <em>"Paise kat gaye, khareed gayab!"</em>, … {'}'}</span>
          <span>{'}'}) <s>→ job 7f3c</s></span>
        </code></pre>
      </article>
    </div>

    <div className="flow-column">
      <article className={`flow-card flow-reel ${step(3)}`} aria-label="Step 4: explanation reel">
        <header><span className="flow-num">4</span><h3>Explanation reel</h3></header>
        <div className="flow-reel-body">
          <div className="flow-phone">
            <img src="/examples/hinglish-database-replica-eleven/poster.png" alt="Jhaplu and Paplu in a saved Brainrotten reel about replica lag" width="360" height="640" loading="lazy"/>
            <div className="flow-phone-shade" style={{opacity:phase>=4?0:.82-renderProgress*.62}}/>
            {phase>=4?<span className="flow-play"><Icon name="play" size={14}/>0:50</span>:<span className="flow-percent">{phase>=3?`${Math.round(renderProgress*100)}%`:'…'}</span>}
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
  </div>;
}
