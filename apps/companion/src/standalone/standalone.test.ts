import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {CLIENTS,configure,pickClients,readJsonc,type Env} from './clients.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const fakeEnv=(home:string,commands:string[]=[]):Env=>({home,platform:'linux',hasCommand:name=>commands.includes(name),run:()=>({status:0,stderr:''})});
const spec={command:'/usr/bin/node',args:['/data/bin/brainrotten-mcp.mjs','mcp']};

describe('agent config writers',()=>{
  let home:string;
  beforeAll(()=>{home=fs.mkdtempSync(path.join(os.tmpdir(),'brainrotten-clients-'));});
  afterAll(()=>fs.rmSync(home,{recursive:true,force:true}));

  it('adds itself next to existing servers, keeps a backup, and removes only its own entry',()=>{
    fs.mkdirSync(path.join(home,'.cursor'));
    fs.writeFileSync(path.join(home,'.cursor','mcp.json'),'{\n // mine\n "mcpServers": {"other": {"command": "x"}},\n}\n');
    const [cursor]=pickClients(fakeEnv(home),'cursor');
    expect(configure(fakeEnv(home),[cursor!],spec)[0]).toMatchObject({status:'added'});
    const data=readJsonc(path.join(home,'.cursor','mcp.json')) as {mcpServers:Record<string,unknown>};
    expect(data.mcpServers).toEqual({other:{command:'x'},brainrotten:{command:'/usr/bin/node',args:spec.args}});
    expect(fs.existsSync(path.join(home,'.cursor','mcp.json.brainrotten-backup'))).toBe(true);
    configure(fakeEnv(home),[cursor!],undefined);
    expect((readJsonc(path.join(home,'.cursor','mcp.json')) as {mcpServers:object}).mcpServers).toEqual({other:{command:'x'}});
  });

  it('replaces its Codex table instead of duplicating it',()=>{
    fs.mkdirSync(path.join(home,'.codex'));
    fs.writeFileSync(path.join(home,'.codex','config.toml'),'model = "m"\n\n[mcp_servers.brainrotten]\ncommand = "old"\n\n[mcp_servers.other]\ncommand = "y"\n');
    const [codex]=pickClients(fakeEnv(home),'codex');
    configure(fakeEnv(home),[codex!],spec);configure(fakeEnv(home),[codex!],spec);
    const text=fs.readFileSync(path.join(home,'.codex','config.toml'),'utf8');
    expect(text.match(/\[mcp_servers\.brainrotten\]/g)).toHaveLength(1);
    expect(text).toContain('[mcp_servers.other]');expect(text).not.toContain('"old"');
    expect(text).toContain('args = ["/data/bin/brainrotten-mcp.mjs", "mcp"]');
  });

  it('detects only the agents present and rejects unknown client names',()=>{
    const found=pickClients(fakeEnv(home,['claude'])).map(client=>client.id);
    expect(found).toEqual(expect.arrayContaining(['claude-code','cursor','codex']));
    expect(found).not.toContain('windsurf');
    expect(()=>pickClients(fakeEnv(home),'notepad')).toThrow('Unknown client: notepad');
    expect(pickClients(fakeEnv(home),'all')).toHaveLength(CLIENTS.length);
  });
});

describe('packed installer over real stdio',()=>{
  let dir:string,client:Client|undefined;
  beforeAll(()=>{
    dir=fs.mkdtempSync(path.join(os.tmpdir(),'brainrotten-pack-'));
    execFileSync(process.execPath,[path.join(root,'scripts/build-mcp-package.mjs'),'--out',dir,'--guides',dir,'--api-url','https://api.example.invalid/api/v1'],{cwd:root,stdio:'ignore'});
    execFileSync('tar',['-xzf',path.join(dir,'brainrotten-mcp.tgz'),'-C',dir]);
  },120000);
  afterAll(async()=>{await client?.close();fs.rmSync(dir,{recursive:true,force:true});});

  it('starts signed out, offers sign_in, and tells the agent how to connect',async()=>{
    const env={...process.env,HOME:path.join(dir,'home'),BRAINROT_DATA_DIR:path.join(dir,'data')};
    const help=spawnSync(process.execPath,[path.join(dir,'package','cli.mjs'),'--help'],{encoding:'utf8',env});
    expect(help.stdout).toContain('brainrotten-mcp setup');
    client=new Client({name:'installer-test',version:'1.0.0'});
    await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(dir,'package','cli.mjs'),'mcp'],env:env as Record<string,string>}));
    const tools=(await client.listTools()).tools.map(tool=>tool.name);
    expect(tools).toEqual(expect.arrayContaining(['sign_in','get_video_formats','generate_short_video','validate_video_script']));
    const result=await client.callTool({name:'list_videos',arguments:{}}) as {isError?:boolean;content:Array<{text:string}>};
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Not signed in to Brainrotten. Call the sign_in tool');
    expect(client.getInstructions()).toContain('PICK THE FORMAT');
  },60000);
});
