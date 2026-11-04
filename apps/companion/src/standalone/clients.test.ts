import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';

// add-mcp reads the home folder when it loads, so point HOME at a temporary folder first: these tests never touch
// the real agent configs on this computer.
const home=fs.mkdtempSync(path.join(os.tmpdir(),'brainrotten-agents-'));
process.env['HOME']=home;process.env['USERPROFILE']=home;process.env['APPDATA']=path.join(home,'AppData','Roaming');
process.env['XDG_CONFIG_HOME']=path.join(home,'.config');
const {CLIENTS,configPath,configure,connectionStatus,pickClients,readJsonc}=await import('./clients.js');
afterAll(()=>fs.rmSync(home,{recursive:true,force:true}));

const spec={command:'/usr/local/bin/node',args:[path.join(home,'.local/share/brainrot/bin/brainrotten-mcp.mjs'),'mcp']};
const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};

describe('installing into coding agents (via add-mcp)',()=>{
  it('covers the major agents, Antigravity included',()=>{
    const ids=CLIENTS.map(client=>client.id);
    for(const id of ['antigravity','claude-code','codex','cursor','vscode','claude-desktop','windsurf','gemini-cli','kiro-cli','opencode','zed','cline','goose','github-copilot-cli'])expect(ids).toContain(id);
  });
  it('writes Antigravity\'s shared config next to existing servers, keeps a backup, and removes only its own entry',async()=>{
    const file=configPath('antigravity');
    expect(file).toBe(path.join(home,'.gemini','config','mcp_config.json'));
    write(file,JSON.stringify({mcpServers:{other:{command:'other-mcp'}}}));
    const [antigravity]=await pickClients('antigravity');
    expect(configure([antigravity!],spec)[0]).toMatchObject({status:'added'});
    const servers=readJsonc(file)['mcpServers'] as Record<string,{command:string;args:string[]}>;
    expect(servers['other']).toEqual({command:'other-mcp'});
    expect(servers['brainrotten']).toMatchObject({command:spec.command,args:spec.args});
    expect(fs.existsSync(file+'.brainrotten-backup')).toBe(true);
    expect(configure([antigravity!],undefined)[0]).toMatchObject({status:'removed'});
    expect(Object.keys(readJsonc(file)['mcpServers'] as object)).toEqual(['other']);
  });
  it('writes one Codex TOML table, even when run twice',async()=>{
    write(configPath('codex'),'model = "gpt-5"\n');
    const [codex]=await pickClients('codex');
    configure([codex!],spec);configure([codex!],spec);
    const text=fs.readFileSync(configPath('codex'),'utf8');
    expect(text.match(/\[mcp_servers\.brainrotten\]/g)).toHaveLength(1);expect(text).toContain('model = "gpt-5"');
  });
  it('writes Claude Code and VS Code in their own formats',async()=>{
    const clients=await pickClients('claude-code,vscode');
    expect(configure(clients,spec).every(result=>result.status==='added')).toBe(true);
    expect((readJsonc(configPath('claude-code'))['mcpServers'] as Record<string,unknown>)['brainrotten']).toMatchObject({command:spec.command});
    expect((readJsonc(configPath('vscode'))['servers'] as Record<string,unknown>)['brainrotten']).toMatchObject({command:spec.command});
  });
  it('accepts the old short names, rejects unknown ones, and reports which agents are connected',async()=>{
    expect((await pickClients('kiro,gemini')).map(client=>client.id)).toEqual(['gemini-cli','kiro-cli']);
    await expect(pickClients('notepad')).rejects.toThrow('Unknown client: notepad');
    expect(await pickClients('all')).toHaveLength(CLIENTS.length);
    const status=await connectionStatus();
    expect(status.find(client=>client.id==='claude-code')).toMatchObject({connected:true});
    expect(status.find(client=>client.id==='antigravity')).toMatchObject({connected:false});
  });
});
