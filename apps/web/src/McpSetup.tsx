import React,{useEffect,useState} from 'react';
import {getMcpSetup,revealMcpToken} from './api.js';
import {EDITORS,editorConfig,type EditorId} from './editorConfig.js';
import {Icon} from './Icons.js';
const tools=[
  ['get_learning_guide','Teaching recipes, format routing and predict–practice–reflect instructions for your agent.','sessionId: "…" (optional)'],
  ['record_learning_session','Save curated task context, decisions, learning objective and thinking/practice prompts. No generation.','requestId, title, projectName, agent, context, objective, activity'],
  ['publish_session_lesson','Publish an agent-written explanation and comprehension questions to the session in your account.','sessionId: "…", video: { format, script, quizCount: 1 }'],
  ['get_learning_session','Read a session, its linked videos and your saved learning responses.','sessionId: "…"'],
  ['list_learning_sessions','Page through the learning checkpoints in the connected account.','limit: 10'],
  ['get_video_formats','Choose a skit, case file, whiteboard or POV journey; includes direct-script examples.','format: "whiteboard", language: "hinglish"'],
  ['get_character_guide','Ready voices, character vocabulary, and the question–answer script format.','language: "hinglish"'],
  ['validate_video_script','Check structure, speech length and configuration before generation. No model or speech call.','request: { format, script, … }'],
  ['list_videos','Search your private library by topic, format and saved review state.','q: "payment", review: "bookmarked", limit: 12'],
  ['get_video_review','Saved playback position, bookmark and quiz attempts for a video.','jobId: "…"'],
  ['search_broll_image','One Google image search; returns a URL to use directly in a script.','query: "server rack"'],
  ['generate_short_video','Your agent supplies a script or topic, format and optional review questions; generation runs in the background.','format: "skit", quizCount: 1, script: { title, dialogue, questions }'],
  ['get_video_status','Progress and the completed video for a submitted job.','jobId: "…"'],
  ['get_video_learning_pack','Takeaway, chapter timestamps, review questions and transcript for a ready video.','jobId: "…"'],
  ['list_video_voices','Available clones and provider/renderer readiness.','{}'],
  ['get_change_context','Optional evidence from a repository registered with the local service.','projectId: "…"'],
];
const hostedSite=import.meta.env['VITE_HOSTED']==='true';
const siteOrigin=typeof location==='undefined'?'':location.origin;
const installCommand='npx -y brainrotten-mcp@latest setup';
const installGuide=`${siteOrigin}/install.md`;
/** One copyable shell line. */
function CopyLine({text}:{text:string}):React.ReactElement{const[copied,setCopied]=useState(false);return <div className="copy-line"><pre className="code-box compact"><code>{text}</code></pre><button type="button" className="text-button" onClick={()=>{void navigator.clipboard?.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>{});}}><Icon name={copied?'check':'copy'} size={15}/>{copied?'Copied':'Copy'}</button></div>;}
const hostedApi=new URL(String(import.meta.env['VITE_API_BASE_URL']??'/api/v1'),typeof location==='undefined'?'http://localhost':location.origin).toString().replace(/\/$/,'');
export function McpSetup({onOpenAccount}:{onOpenAccount:()=>void}):React.ReactElement{
  const[editor,setEditor]=useState<EditorId>('standard'),[command,setCommand]=useState('node'),[folder,setFolder]=useState(''),[token,setToken]=useState(''),[showToken,setShowToken]=useState(false),[copied,setCopied]=useState(false),[inserting,setInserting]=useState(false),[error,setError]=useState('');
  const localOwner=import.meta.env['VITE_HOSTED']!=='true'&&import.meta.env['VITE_EXAMPLES_ONLY']!=='true';
  useEffect(()=>{if(!localOwner)return;let alive=true;void getMcpSetup().then(setup=>{if(alive){setFolder(setup.projectPath);setCommand(setup.command);}}).catch(()=>{if(alive)setError('Enter the folder where Brainrotten is installed.');});return()=>{alive=false;};},[localOwner]);
  const selected=EDITORS.find(item=>item.id===editor)!;
  const entry=folder?folder.replace(/[\\/]+$/,'')+'/apps/companion/dist/mcp.js':'/path/to/brainrot-ide/apps/companion/dist/mcp.js';
  const config=editorConfig(editor,command,entry,token),display=token&&!showToken?config.replaceAll(token,'•••••••• private token ••••••••'):config;
  const insert=async()=>{setInserting(true);setError('');try{setToken(await revealMcpToken());}catch(e){setError(e instanceof Error?e.message:'Could not load the private token.');}finally{setInserting(false);}};
  const copy=async()=>{try{await navigator.clipboard.writeText(config);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError('Clipboard is unavailable. Select and copy the configuration.');}};
  return <section className="mcp-page">
    <div className="section-line"><h1>Connect your editor</h1><span className="connection-kind">{hostedSite?'Hosted account or local':'Local · private token'}</span></div>
    <p className="mcp-intro">Your agent sends a learning checkpoint to Brainrotten: what changed, why, an explanation and a small task to try yourself.</p>
    {hostedSite&&<section className="one-line-install" aria-labelledby="install-title"><h2 id="install-title">Install in one line</h2><p>Paste this into your terminal (Node.js 20+). It opens Google sign-in, then adds Brainrotten to every coding agent on your computer: Claude Code, Codex, Antigravity, Cursor, VS Code, Claude Desktop, Windsurf, Kiro, Gemini CLI, GitHub Copilot CLI, Zed, Cline, OpenCode, Goose and more (20+ agents, on macOS, Windows and Linux).</p><CopyLine text={installCommand}/><p>Or just tell your agent: <q>Install Brainrotten MCP from {installGuide}</q>. It can do the rest itself, including signing you in.</p></section>}
    <details className="account-agent-setup"><summary>{hostedSite?'Or connect from a Brainrotten checkout':'Connect to your hosted account'}</summary><p>{hostedSite?'In your Brainrotten folder, sign in once on this computer. A browser opens for Google, the same account as this site:':'After configuring the AWS deployment, sign in once on this computer:'}</p><pre className="code-box"><code>{`pnpm brainrotten login --api-url ${hostedSite?hostedApi:'https://YOUR_API/api/v1'}`}</code></pre><p>Use the same command and entry file below, with <code>--account</code> as the last argument. Any standard stdio MCP client can use it. Access tokens refresh from a private local account connection; your provider keys stay on the service.</p><pre className="code-box"><code>{JSON.stringify({mcpServers:{brainrotten:{command,args:[entry,'--account']}}},null,2)}</code></pre><p>Reconnect the agent and ask it to call <code>get_learning_guide</code>. Hosted sessions appear under the same Cognito account in Studio and future clients. The local setup below stays on this computer.</p></details>
    <div className="setup-install"><h2>Install</h2><p>In the Brainrotten folder, run:</p><pre className="code-box compact"><code>{'pnpm install\npnpm build'}</code></pre><label className="install-path">Brainrotten installation folder<input value={folder} placeholder="/path/to/brainrot-ide" onChange={event=>setFolder(event.target.value)}/></label><p className="setup-owner">Use your installed copy until the source is published.</p></div>
    <div className="setup-connect"><h2>Configure</h2><div className="editor-tabs" role="tablist" aria-label="Code editor">{EDITORS.map(item=><button key={item.id} role="tab" aria-selected={editor===item.id} onClick={()=>{setEditor(item.id);setCopied(false);}}>{item.name}</button>)}</div>
      <p className="editor-instructions">{selected.instructions}</p>
      <div className="config-panel"><div className="config-toolbar"><code>{selected.file}</code><div>{localOwner&&<button type="button" className="text-button" onClick={()=>void insert()} disabled={inserting}><Icon name="key" size={15}/>{inserting?'Inserting…':token?'Refresh authorization':'Insert authorization'}</button>}<button type="button" className="text-button" onClick={()=>void copy()}><Icon name={copied?'check':'copy'} size={15}/>{copied?'Copied':'Copy'}</button></div></div><pre className="connection-code"><code>{display}</code></pre></div>
      <div className="connection-token"><label>Private MCP token<input type={showToken?'text':'password'} autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} placeholder="Optional for a same-user local installation"/></label><button type="button" className="text-button" onClick={()=>setShowToken(value=>!value)}>{showToken?'Hide token':'Show token'}</button></div>
      <div className="setup-links"><a href={selected.docs} target="_blank" rel="noreferrer">{selected.name} documentation</a><button className="text-button" onClick={onOpenAccount}>Google / AWS Cognito setup</button></div>
      <p className="connection-help">Merge the server entry into your personal editor config. The local bridge discovers authorization automatically; an explicit private token is optional. Reload MCP servers, then ask your agent to call <code>get_learning_guide</code>.</p>
      {error&&<p role="alert" className="error-message">{error}</p>}
    </div>
    <section className="tool-section" aria-labelledby="tools-heading"><h2 id="tools-heading">Tools</h2><ul className="tool-catalog">{tools.map(([name,description,args])=><li key={name}><code className="tool-name">{name}</code><div><p>{description}</p><code className="tool-args">{args}</code></div></li>)}</ul></section>
  </section>;
}
