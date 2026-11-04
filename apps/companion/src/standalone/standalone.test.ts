import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');

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
