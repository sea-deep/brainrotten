// brainrotten-mcp: one command to connect any coding agent to a hosted Brainrotten account.
//   setup      sign in (browser) and add the MCP server to every agent found on this computer
//   mcp        run the MCP server over stdio (what agents launch)
//   login | logout | status | uninstall
// Bundled into a single file (scripts/build-mcp-package.mjs) and served from the website.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {accountLogin,accountAccessToken,readAccountProfile,removeAccountProfile} from '../mcp/account.js';
import {CLIENTS,configure,connectionStatus,pickClients,type ServerSpec} from './clients.js';

declare const __BRAINROTTEN_API__:string|undefined;
declare const __BRAINROTTEN_VERSION__:string|undefined;
const VERSION=typeof __BRAINROTTEN_VERSION__==='string'?__BRAINROTTEN_VERSION__:'dev';
const DEFAULT_API=process.env['BRAINROTTEN_API_URL']??(typeof __BRAINROTTEN_API__==='string'?__BRAINROTTEN_API__:'');
const DATA_DIR=process.env['BRAINROT_DATA_DIR']??path.join(os.homedir(),'.local','share','brainrot');
const INSTALLED=path.join(DATA_DIR,'bin','brainrotten-mcp.mjs');

const HELP=`brainrotten-mcp ${VERSION} — connect your coding agent to Brainrotten

Usage:
  brainrotten-mcp setup [--client <ids>] [--no-open] [--no-login]
      Sign in with Google in the browser, then add Brainrotten to every coding agent
      found on this computer (or only --client, comma-separated, or "all").
  brainrotten-mcp status       Show the account, free videos left and configured agents
  brainrotten-mcp login        Sign in again          (--no-open prints the link instead)
  brainrotten-mcp logout       Forget this computer's sign-in
  brainrotten-mcp uninstall    Remove Brainrotten from the agents' configs (--logout too)
  brainrotten-mcp mcp          Run the MCP server over stdio (agents launch this)

Clients: ${CLIENTS.map(client=>client.id).join(', ')}
Options: --api-url <https URL> uses another Brainrotten deployment.`;

const argv=process.argv.slice(2),command=argv[0]??'help';
const flag=(name:string)=>argv.includes(name);
const option=(name:string)=>{const index=argv.indexOf(name);return index>=0?argv[index+1]:undefined;};
const say=(line='')=>process.stderr.write(line+'\n');// stdout stays clean for the MCP protocol

/** A Node path that survives Homebrew upgrades (the Cellar path changes on every version bump). */
function stableNode():string{
  const current=process.execPath;
  if(current.includes('/Cellar/')){for(const candidate of['/opt/homebrew/bin/node','/usr/local/bin/node'])if(fs.existsSync(candidate))return candidate;}
  return current;
}
const spec=():ServerSpec=>({command:stableNode(),args:[INSTALLED,'mcp']});
const loginHint=()=>`${stableNode()} ${INSTALLED} login`;

function signedIn(){try{readAccountProfile(DATA_DIR);return true;}catch{return false;}}
function apiUrl(){
  const api=option('--api-url')??(signedIn()?readAccountProfile(DATA_DIR).apiUrl:DEFAULT_API);
  if(!api)throw new Error('No Brainrotten API configured. Pass --api-url https://…/api/v1.');
  return api;
}

/** Copies this single-file program to a stable place so agent configs never point into the npx cache. */
function installSelf(){
  const self=fileURLToPath(import.meta.url);
  fs.mkdirSync(path.dirname(INSTALLED),{recursive:true,mode:0o700});
  if(path.resolve(self)!==path.resolve(INSTALLED))fs.copyFileSync(self,INSTALLED);
  fs.chmodSync(INSTALLED,0o755);
}

async function login(){
  const api=apiUrl();
  say('Opening your browser for Google sign-in…');
  await accountLogin(api,DATA_DIR,!flag('--no-open'));
  say('Signed in.');
}

async function status(){
  say(`brainrotten-mcp ${VERSION}`);
  say(`Program: ${fs.existsSync(INSTALLED)?INSTALLED:'not installed (run setup)'}`);
  if(!signedIn()){say('Account: not signed in (run: brainrotten-mcp login)');}
  else{
    const profile=readAccountProfile(DATA_DIR);
    say(`Account: signed in to ${profile.apiUrl}`);
    try{
      const response=await fetch(profile.apiUrl+'/me',{headers:{authorization:'Bearer '+await accountAccessToken(DATA_DIR,profile.apiUrl)},signal:AbortSignal.timeout(15000)});
      const body=await response.json() as{quota?:{remaining:number;limit:number}};
      if(body.quota)say(`Free videos left: ${body.quota.remaining} of ${body.quota.limit}`);
    }catch{say('Free videos left: unknown (could not reach the API)');}
  }
  for(const client of await connectionStatus()){
    if(client.connected)say(`  connected  ${client.name}`);
    else if(client.found)say(`  found      ${client.name} (run setup to connect it)`);
  }
}

function report(results:ReturnType<typeof configure>){
  for(const result of results)say(`  ${result.status==='failed'?'✗':'✓'} ${result.name}: ${result.status==='failed'?result.detail:result.status}`);
}

async function main(){
  if(command==='mcp'){
    process.env['BRAINROTTEN_CONNECTION']='account';
    process.env['BRAINROTTEN_API_URL']??=DEFAULT_API;
    process.env['BRAINROTTEN_LOGIN_HINT']??=loginHint();
    process.env['BRAINROT_DATA_DIR']??=DATA_DIR;
    await import('../mcp/server.js');
    return;
  }
  if(command==='setup'){
    const clients=await pickClients(option('--client'));
    installSelf();
    say(`Installed to ${INSTALLED}`);
    if(!flag('--no-login')&&!signedIn())await login();
    else if(signedIn())say('Already signed in.');
    if(!clients.length){
      say('\nNo coding agents found. Add this MCP server to your agent manually:');
      say(JSON.stringify({mcpServers:{brainrotten:spec()}},null,2));
      return;
    }
    say('\nAdding Brainrotten to:');report(configure(clients,spec()));
    say('\nDone. Restart or reload your agent, then ask it to "explain what we just did as a Brainrotten video".');
    say('If a tool says "Not signed in", the agent can call the sign_in tool.');
    return;
  }
  if(command==='login'){await login();return;}
  if(command==='logout'){removeAccountProfile(DATA_DIR);say('Signed out on this computer.');return;}
  if(command==='status'){await status();return;}
  if(command==='uninstall'){
    say('Removing Brainrotten from:');report(configure(await pickClients(option('--client')??'all'),undefined).filter(result=>result.status!=='unchanged'));
    if(flag('--logout'))removeAccountProfile(DATA_DIR);
    fs.rmSync(INSTALLED,{force:true});
    say('Done.');return;
  }
  if(command==='--version'||command==='version'){process.stdout.write(VERSION+'\n');return;}
  process.stdout.write(HELP+'\n');
  if(!['help','--help','-h'].includes(command))process.exitCode=1;
}

main().catch(error=>{say(`Error: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});
