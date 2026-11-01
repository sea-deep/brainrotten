import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const entry=path.join(root,'apps/companion/dist/mcp.js');
const file=path.join(root,'.mcp.json');
let prior={};try{prior=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
prior.mcpServers={...prior.mcpServers,brainrotten:{type:'stdio',command:process.execPath,args:[entry]}};
await fs.writeFile(file,JSON.stringify(prior,null,2)+'\n');
const codexDir=path.join(root,'.codex');await fs.mkdir(codexDir,{recursive:true});
const codexFile=path.join(codexDir,'config.toml');let config='';try{config=await fs.readFile(codexFile,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(!config.includes('[mcp_servers.brainrotten]'))config+=`\n[mcp_servers.brainrotten]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(entry)}]\n`;
// Local mode needs no token: the bridge reads the companion's private token file.
config=config.replace(/\n\[mcp_servers\.brainrotten\.env\]\nBRAINROTTEN_MCP_TOKEN = "PASTE_PRIVATE_TOKEN_HERE"\n/,'\n');
await fs.writeFile(codexFile,config);
console.log('Created local JSON and TOML MCP connection examples. No keys or tokens were copied; the bridge finds the local companion token itself. Reconnect MCP in your editor.');
