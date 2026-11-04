// Adds or removes the Brainrotten MCP server in every coding agent's own config, on macOS, Windows and Linux.
// The agent list, config paths and file formats come from add-mcp (Neon, Apache-2.0), the shared open tool for
// this; it covers 20+ agents. On top of it, every edit keeps a one-time backup (<file>.brainrotten-backup) and
// only the "brainrotten" entry is touched.
import fs from 'node:fs';
import {agents,detectGlobalAgents,getAgentTypes,removeServer,upsertServer} from 'add-mcp';

export type ServerSpec={command:string;args:string[]};
export type ClientResult={client:string;name:string;status:'added'|'removed'|'unchanged'|'skipped'|'failed';detail:string};
type AgentType=ReturnType<typeof getAgentTypes>[number];
export type Client={id:AgentType;name:string};

const SERVER='brainrotten';
// Names this installer accepted before it used add-mcp, plus a few obvious short forms.
const ALIASES:Record<string,AgentType>={kiro:'kiro-cli',gemini:'gemini-cli','github-copilot':'github-copilot-cli',copilot:'github-copilot-cli',claude:'claude-code',cline_vscode:'cline'};

export const CLIENTS:Client[]=getAgentTypes().map(id=>({id,name:agents[id].displayName}));

/** Where an agent keeps its global (user-wide) MCP config. */
export function configPath(id:AgentType):string{
  const agent=agents[id];
  return agent.resolveConfigPath?agent.resolveConfigPath(agent,{local:false,cwd:process.cwd()}):agent.configPath;
}

/** Chooses clients: the named ones (comma list or "all"), otherwise every agent found on this computer. */
export async function pickClients(wanted?:string):Promise<Client[]>{
  if(!wanted){const found=new Set(await detectGlobalAgents());return CLIENTS.filter(client=>found.has(client.id));}
  if(wanted==='all')return CLIENTS;
  const ids=wanted.split(',').map(id=>id.trim().toLowerCase()).filter(Boolean).map(id=>ALIASES[id]??id);
  const unknown=ids.filter(id=>!CLIENTS.some(client=>client.id===id));
  if(unknown.length)throw new Error(`Unknown client: ${unknown.join(', ')}. Use one of: ${CLIENTS.map(client=>client.id).join(', ')}.`);
  return CLIENTS.filter(client=>ids.includes(client.id));
}

function backup(file:string){const copy=file+'.brainrotten-backup';try{if(fs.existsSync(file)&&!fs.existsSync(copy))fs.copyFileSync(file,copy);}catch{/* a missing backup never blocks the edit */}}

/** Adds (spec given) or removes (no spec) the brainrotten entry for each client. Never throws. */
export function configure(clients:Client[],spec:ServerSpec|undefined):ClientResult[]{
  return clients.map(client=>{
    const file=configPath(client.id);
    try{
      backup(file);
      if(spec){
        const result=upsertServer(client.id,SERVER,{command:spec.command,args:spec.args},{local:false});
        return result.success?{client:client.id,name:client.name,status:'added',detail:result.path}:{client:client.id,name:client.name,status:'failed',detail:result.error??'could not write the config'};
      }
      const result=removeServer(client.id,SERVER,{local:false});
      if(!result.success)return{client:client.id,name:client.name,status:'failed',detail:result.error??'could not write the config'};
      return{client:client.id,name:client.name,status:result.removed?'removed':'unchanged',detail:result.path};
    }catch(error){return{client:client.id,name:client.name,status:'failed',detail:error instanceof Error?error.message:String(error)};}
  });
}

/** Whether an agent's global config already has the brainrotten entry (JSON, TOML or YAML). */
function hasEntry(id:AgentType):boolean{
  const file=configPath(id);if(!fs.existsSync(file))return false;
  const agent=agents[id];
  try{
    if(agent.format==='json'){let node:unknown=readJsonc(file);for(const key of agent.configKey.split('.'))node=(node as Record<string,unknown>|undefined)?.[key];return Boolean(node&&typeof node==='object'&&SERVER in node);}
    const text=fs.readFileSync(file,'utf8');
    return agent.format==='toml'?new RegExp(`^\\s*\\[[\\w.]*\\.?${SERVER}\\]`,'m').test(text):new RegExp(`^\\s+${SERVER}:`,'m').test(text);
  }catch{return false;}
}

/** For `status`: which agents are on this computer and which already have Brainrotten. */
export async function connectionStatus():Promise<Array<Client&{found:boolean;connected:boolean}>>{
  const found=new Set(await detectGlobalAgents());
  return CLIENTS.map(client=>({...client,found:found.has(client.id),connected:hasEntry(client.id)}));
}

/** Reads JSON that may contain comments or trailing commas (used by tests and diagnostics). */
export function readJsonc(file:string):Record<string,unknown>{
  if(!fs.existsSync(file))return{};
  const text=fs.readFileSync(file,'utf8');
  if(!text.trim())return{};
  try{return JSON.parse(text) as Record<string,unknown>;}catch{/* fall through to a comment-tolerant parse */}
  let out='',inString=false;
  for(let i=0;i<text.length;i++){
    const c=text[i]!,next=text[i+1];
    if(inString){out+=c;if(c==='\\'){out+=next??'';i++;}else if(c==='"')inString=false;continue;}
    if(c==='"'){inString=true;out+=c;continue;}
    if(c==='/'&&next==='/'){while(i<text.length&&text[i]!=='\n')i++;out+='\n';continue;}
    if(c==='/'&&next==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i++;continue;}
    out+=c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g,'$1')) as Record<string,unknown>;
}
