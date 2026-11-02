// Adds or removes the Brainrotten MCP server in each coding agent's own config file.
// Every edit keeps a one-time backup (<file>.brainrotten-backup) and only touches the "brainrotten" entry.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export type ServerSpec={command:string;args:string[]};
export type Env={home:string;platform:NodeJS.Platform;appData?:string|undefined;hasCommand:(name:string)=>boolean;run:(command:string,args:string[])=>{status:number|null;stderr:string}};
export type ClientResult={client:string;name:string;status:'added'|'removed'|'unchanged'|'skipped'|'failed';detail:string};
type Client={id:string;name:string;detect:(env:Env)=>boolean;add:(env:Env,spec:ServerSpec)=>string;remove:(env:Env)=>string};

const SERVER='brainrotten';

export function systemEnv():Env{
  return{
    home:process.env['HOME']??process.env['USERPROFILE']??'',platform:process.platform,appData:process.env['APPDATA'],
    hasCommand:name=>spawnSync(process.platform==='win32'?'where':'which',[name],{stdio:'ignore'}).status===0,
    run:(command,args)=>{const result=spawnSync(command,args,{encoding:'utf8',shell:process.platform==='win32'});return{status:result.status,stderr:String(result.stderr??'')};},
  };
}

/** Per-platform folder for desktop apps' user settings (VS Code, Claude Desktop). */
function appSupport(env:Env,app:string):string{
  if(env.platform==='darwin')return path.join(env.home,'Library','Application Support',app);
  if(env.platform==='win32')return path.join(env.appData??path.join(env.home,'AppData','Roaming'),app);
  return path.join(env.home,'.config',app);
}

/** Reads JSON that may contain comments or trailing commas (VS Code and Cursor allow both). */
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

function backup(file:string){const copy=file+'.brainrotten-backup';if(fs.existsSync(file)&&!fs.existsSync(copy))fs.copyFileSync(file,copy);}
function writeJson(file:string,data:Record<string,unknown>){fs.mkdirSync(path.dirname(file),{recursive:true});backup(file);fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}

/** A client whose config is a JSON object with the server under one key (mcpServers, servers, mcp). */
function jsonClient(id:string,name:string,folder:(env:Env)=>string,file:(env:Env)=>string,key:string,entry:(spec:ServerSpec)=>unknown):Client{
  return{
    id,name,detect:env=>fs.existsSync(folder(env)),
    add:(env,spec)=>{
      const target=file(env),data=readJsonc(target),servers={...(data[key] as Record<string,unknown>|undefined)};
      const next=entry(spec);
      if(JSON.stringify(servers[SERVER])===JSON.stringify(next))return target;
      servers[SERVER]=next;writeJson(target,{...data,[key]:servers});return target;
    },
    remove:env=>{
      const target=file(env);if(!fs.existsSync(target))return target;
      const data=readJsonc(target),servers={...(data[key] as Record<string,unknown>|undefined)};
      if(!(SERVER in servers))return target;
      delete servers[SERVER];writeJson(target,{...data,[key]:servers});return target;
    },
  };
}
const standard=(spec:ServerSpec)=>({command:spec.command,args:spec.args});

const tomlString=(value:string)=>JSON.stringify(value);
/** Codex keeps MCP servers in ~/.codex/config.toml as [mcp_servers.<name>] tables. */
function codexToml(text:string,spec?:ServerSpec):string{
  const lines=text.split('\n'),kept:string[]=[];let skipping=false;
  for(const line of lines){
    const header=/^\s*\[([^\]]+)\]\s*$/.exec(line);
    if(header)skipping=header[1]!.trim()===`mcp_servers.${SERVER}`||header[1]!.trim().startsWith(`mcp_servers.${SERVER}.`);
    if(!skipping)kept.push(line);
  }
  let out=kept.join('\n').replace(/\n+$/,'');
  if(spec)out+=(out?'\n\n':'')+`[mcp_servers.${SERVER}]\ncommand = ${tomlString(spec.command)}\nargs = [${spec.args.map(tomlString).join(', ')}]\n`;
  return out.endsWith('\n')||!out?out:out+'\n';
}

export const CLIENTS:Client[]=[
  {
    id:'claude-code',name:'Claude Code',detect:env=>env.hasCommand('claude'),
    add:(env,spec)=>{
      env.run('claude',['mcp','remove',SERVER,'--scope','user']);
      const result=env.run('claude',['mcp','add',SERVER,'--scope','user','--',spec.command,...spec.args]);
      if(result.status!==0)throw new Error(result.stderr.trim()||'claude mcp add failed');
      return 'claude mcp add --scope user';
    },
    remove:env=>{env.run('claude',['mcp','remove',SERVER,'--scope','user']);return 'claude mcp remove --scope user';},
  },
  {
    id:'codex',name:'Codex',detect:env=>fs.existsSync(path.join(env.home,'.codex')),
    add:(env,spec)=>{const file=path.join(env.home,'.codex','config.toml'),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',after=codexToml(before,spec);if(after!==before){fs.mkdirSync(path.dirname(file),{recursive:true});backup(file);fs.writeFileSync(file,after);}return file;},
    remove:env=>{const file=path.join(env.home,'.codex','config.toml');if(fs.existsSync(file)){const before=fs.readFileSync(file,'utf8'),after=codexToml(before);if(after!==before){backup(file);fs.writeFileSync(file,after);}}return file;},
  },
  jsonClient('cursor','Cursor',env=>path.join(env.home,'.cursor'),env=>path.join(env.home,'.cursor','mcp.json'),'mcpServers',standard),
  jsonClient('vscode','VS Code',env=>path.join(appSupport(env,'Code'),'User'),env=>path.join(appSupport(env,'Code'),'User','mcp.json'),'servers',spec=>({type:'stdio',...standard(spec)})),
  jsonClient('claude-desktop','Claude Desktop',env=>appSupport(env,'Claude'),env=>path.join(appSupport(env,'Claude'),'claude_desktop_config.json'),'mcpServers',standard),
  jsonClient('windsurf','Windsurf',env=>path.join(env.home,'.codeium','windsurf'),env=>path.join(env.home,'.codeium','windsurf','mcp_config.json'),'mcpServers',standard),
  jsonClient('kiro','Kiro',env=>path.join(env.home,'.kiro'),env=>path.join(env.home,'.kiro','settings','mcp.json'),'mcpServers',standard),
  jsonClient('gemini','Gemini CLI',env=>path.join(env.home,'.gemini'),env=>path.join(env.home,'.gemini','settings.json'),'mcpServers',standard),
  jsonClient('opencode','OpenCode',env=>path.join(env.home,'.config','opencode'),env=>path.join(env.home,'.config','opencode','opencode.json'),'mcp',spec=>({type:'local',command:[spec.command,...spec.args],enabled:true})),
];

/** Chooses clients: the named ones (comma list or "all"), otherwise every client found on this computer. */
export function pickClients(env:Env,wanted?:string):Client[]{
  if(!wanted)return CLIENTS.filter(client=>client.detect(env));
  if(wanted==='all')return CLIENTS;
  const ids=wanted.split(',').map(id=>id.trim().toLowerCase()).filter(Boolean);
  const unknown=ids.filter(id=>!CLIENTS.some(client=>client.id===id));
  if(unknown.length)throw new Error(`Unknown client: ${unknown.join(', ')}. Use one of: ${CLIENTS.map(client=>client.id).join(', ')}.`);
  return CLIENTS.filter(client=>ids.includes(client.id));
}

export function configure(env:Env,clients:Client[],spec:ServerSpec|undefined):ClientResult[]{
  return clients.map(client=>{
    try{
      const where=spec?client.add(env,spec):client.remove(env);
      return{client:client.id,name:client.name,status:spec?'added':'removed',detail:where};
    }catch(error){return{client:client.id,name:client.name,status:'failed',detail:error instanceof Error?error.message:String(error)};}
  });
}
