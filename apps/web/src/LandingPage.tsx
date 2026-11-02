import React,{useEffect,useRef,useState} from 'react';
import {SiteLayout} from './SiteLayout.js';
import {Icon} from './Icons.js';
import {GummyScene} from './GummyScene.js';
import {AgentFlow} from './AgentFlow.js';
import {REAL_EXAMPLES} from './realExamples.js';

const workflows={
  MCP:{heading:'Your agent writes it.',description:'Any MCP client works. The agent already has the diff and the reasons, so it picks the format, writes the script and queues the video without leaving your session.',code:'get_video_formats({ format: "sketch" })\n\ngenerate_short_video({\n  format: "sketch",\n  narrator: "jack",\n  script: { title: "Lambda ko handler kyun nahi mila?",\n            sketch: { nodes: […], edges: […] },\n            dialogue: […] }\n})',link:'/mcp',action:'Connect an agent'},
  Python:{heading:'One script, fewer tokens.',description:'Agents that can run Python do the whole thing in one call: validate, generate, wait, and print a small summary instead of several tool round trips.',code:'from brainrotten import Brainrotten\n\nbr = Brainrotten(account=True)\nreq = br.format_guide("sketch")["storyExample"]\n# …replace the example with your session\nprint(br.make_video(req))',link:'/mcp#python',action:'Use the Python SDK'},
  Studio:{heading:'Or start from a topic.',description:'Paste a topic or some context, pick a format, and generate. Studio shows each real stage: script, voice and render.',code:'Why did the old price come back\nafter we updated it in Postgres?\n\nFormat: Sketch board\nLanguage: Hinglish',link:'/studio',action:'Open Studio'},
  API:{heading:'Submit. Poll. Download.',description:'Send a topic or a complete script as JSON. You get a job ID back; poll it, then fetch the MP4 and its learning pack.',code:'POST /api/v1/videos\nAuthorization: Bearer <access-token>\n\n{\n  "format": "sketch",\n  "prompt": "Why does a database replica lag?",\n  "language": "hinglish"\n}',link:'/api',action:'Read the API docs'},
};
type WorkflowName=keyof typeof workflows;
const WORKFLOW_NAMES=Object.keys(workflows) as WorkflowName[];

export function LandingPage():React.ReactElement{
  const[selected,setSelected]=useState(0),[playing,setPlaying]=useState(false),[workflow,setWorkflow]=useState<WorkflowName>('MCP');
  const root=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null);const example=REAL_EXAMPLES[selected]!,flow=workflows[workflow];
  useEffect(()=>{if(typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('has-entered');observer.unobserve(entry.target);}}),{threshold:.12});root.current?.querySelectorAll('.shelf-enter').forEach(element=>observer.observe(element));return()=>observer.disconnect();},[]);
  const choose=(index:number)=>{video.current?.pause();setPlaying(false);setSelected(index);};
  const pickTab=(event:React.KeyboardEvent,index:number,count:number,select:(next:number)=>void,id:(next:number)=>string)=>{
    if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;event.preventDefault();
    const next=(index+(event.key==='ArrowRight'?1:count-1))%count;select(next);document.getElementById(id(next))?.focus();
  };
  return <SiteLayout><div ref={root} className="landing">
    <section className="landing-intro" aria-labelledby="landing-title">
      <div className="intro-copy">
        <h1 id="landing-title">Stop doomscrolling. Understand what your agent just changed.</h1>
        <p>A one-minute video on your agent’s latest change: the approach it took, the trade-offs, and where a better practice exists. Drawn as a sketch, a skit, a PR review, a tier list or a group chat.</p>
        <div className="intro-actions"><a className="site-button" href="/studio">Open Studio <Icon name="arrow"/></a><a className="watch-link" href="#clips">Watch real examples <Icon name="play" size={16}/></a></div>
      </div>
      <GummyScene/>
    </section>

    <AgentFlow heading={<div className="flow-heading"><h2 id="story-title">The code moved on. You can too.</h2><a href="/mcp">Connect MCP <Icon name="arrow" size={18}/></a></div>}/>

    <section id="clips" className="work-shelf" aria-labelledby="work-title">
      <div className="shelf-heading"><div><h2 id="work-title" className="shelf-enter">Made from real sessions.</h2><p className="shelf-enter">Each video below was written by the coding agent from work in this repository, one per format.</p></div><a href="/examples" className="shelf-enter">All examples <Icon name="arrow" size={18}/></a></div>
      <div className="format-tabs" role="tablist" aria-label="Choose a format">{REAL_EXAMPLES.map((item,index)=><button key={item.slug} id={`format-${item.format}`} role="tab" aria-selected={selected===index} aria-controls="format-panel" tabIndex={selected===index?0:-1} onClick={()=>choose(index)} onKeyDown={event=>pickTab(event,index,REAL_EXAMPLES.length,choose,next=>`format-${REAL_EXAMPLES[next]!.format}`)}><span>{item.formatName}</span><small>{item.when}</small></button>)}</div>
      <div className="example-stage" id="format-panel" role="tabpanel" aria-labelledby={`format-${example.format}`}>
        <div className="example-selection">
          <p className="example-kicker">{example.formatName} · {example.seconds}s · Hinglish</p>
          <h3>{example.title}</h3>
          <dl className="example-facts"><div><dt>What happened</dt><dd>{example.session}</dd></div><div><dt>What the agent did</dt><dd>{example.agentDid}</dd></div></dl>
          <p className="example-voices">Voices: {example.voices}</p>
        </div>
        <div className="example-screen" key={example.slug}>{playing?<video ref={video} controls autoPlay playsInline preload="none" src={`/examples/${example.slug}/video.mp4`} poster={`/examples/${example.slug}/poster.png`} aria-label={example.title}/>:<button className="sleeve-play" onClick={()=>setPlaying(true)} aria-label={`Play example: ${example.title}`}><img src={`/examples/${example.slug}/poster.png`} alt={`A frame from the ${example.formatName.toLowerCase()} video`} width="540" height="960" loading="lazy"/><span className="play-disc"><Icon name="play" size={24}/><span>Play</span></span></button>}</div>
      </div>
    </section>

    <section className="workflow-section" aria-labelledby="workflow-title"><h2 id="workflow-title" className="shelf-enter">Four ways in.</h2><div className="workflow-tabs" role="tablist" aria-label="Choose an interface">{WORKFLOW_NAMES.map((name,index)=><button role="tab" id={`tab-${name}`} aria-controls="workflow-panel" aria-selected={workflow===name} key={name} onClick={()=>setWorkflow(name)} onKeyDown={event=>pickTab(event,index,WORKFLOW_NAMES.length,next=>setWorkflow(WORKFLOW_NAMES[next]!),next=>`tab-${WORKFLOW_NAMES[next]}`)} tabIndex={workflow===name?0:-1}>{name}</button>)}</div><div className="workflow-body" id="workflow-panel" role="tabpanel" aria-labelledby={`tab-${workflow}`}><div className="workflow-copy"><h3>{flow.heading}</h3><p>{flow.description}</p><a href={flow.link}>{flow.action} <Icon name="arrow" size={18}/></a></div><pre className="workflow-code"><code>{flow.code}</code></pre></div></section>

    <section className="run-section" aria-labelledby="run-title"><h2 id="run-title" className="shelf-enter">Run it your way.</h2><div className="run-columns"><div className="shelf-enter"><h3>Hosted</h3><p>Sign in with Google and make five videos free. Connect your agent to the same account with one login command.</p><a href="/studio">Open Studio <Icon name="arrow" size={18}/></a></div><div className="shelf-enter"><h3>On your computer</h3><p>Bring your own ElevenLabs and script keys. Use Studio, any stdio MCP client, the Python SDK or the local API.</p><a href="/setup#local">Local setup <Icon name="arrow" size={18}/></a></div></div></section>

    <section className="landing-faq" aria-labelledby="faq-title"><h2 id="faq-title" className="shelf-enter">A few details.</h2><div className="shelf-enter">{[
      ['Who writes the script?','Your coding agent, from its own context: the diff, the bug and the reasons. Brainrotten checks the script, then draws, voices and renders it. Studio can also write one from a topic.'],
      ['Which format does it pick?','Sketch board for systems and bugs, character skit for concepts, PR review for a real diff, tier list when options were weighed, group chat when parts of a system “talk”. The agent chooses; you can ask for one.'],
      ['Which languages work?','English, Hinglish and Benglish, always in Latin letters. Videos run up to three minutes; most are about one.'],
      ['What does the hosted trial include?','Five videos per Google account, with the project’s voices. Run Studio locally with your own keys for more.'],
      ['Do I need a specific editor?','No. Any client that can launch an MCP stdio server works, and other tools can use the REST API or the Python SDK.'],
    ].map(([question,answer])=><details key={question}><summary>{question}<Icon name="plus" size={18}/></summary><p>{answer}</p></details>)}</div></section>
  </div></SiteLayout>;
}
