import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {Server} from 'node:http';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {LearningSessionSchema,SessionDetailSchema,SessionPageSchema} from '@brainrot/contracts';
import {VideoStudio} from '../video/runtime.js';
import {createStudioRouter} from '../video/routes.js';
import {SessionAuth} from '../auth.js';

// Real MCP stdio bridge -> real companion HTTP routes -> private session files.
const entry=path.resolve(new URL('../../dist/mcp.js',import.meta.url).pathname);
const checkpoint={requestId:'stdio-checkpoint-01',title:'Checkout retries',projectName:'Shop',agent:'MCP stdio test',intent:'debugging',objective:'Explain why one purchase keeps one idempotency key.',context:{task:'Fix duplicate charges',summary:'The first response was lost after charging.'},activity:{predictionPrompt:'Would a fresh request key prevent another charge?',practice:{prompt:'Trace two retries after a lost response.',successCriteria:'Both return the original purchase result.'}}};
let directory:string,server:Server,client:Client,ownerToken:string,mcpToken:string,base:string;
const text=(result:unknown)=>(result as {content:Array<{text:string}>}).content[0]!.text;

describe('learning sessions over real MCP stdio and companion routes',()=>{
  beforeAll(async()=>{
    directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-session-stdio-'));
    vi.stubEnv('BRAINROT_SKIP_ENV','1');vi.stubEnv('BRAINROT_DATA_DIR',directory);vi.stubEnv('PAPER_API_KEY','');vi.stubEnv('ELEVENLABS_API_KEY','');
    const auth=new SessionAuth(directory);ownerToken=auth.getToken();mcpToken=auth.getMcpToken();
    const app=express();app.get('/api/v1/health',(_req,res)=>{res.json({status:'ok'});});app.use('/api/v1',createStudioRouter(new VideoStudio(directory),auth));
    server=await new Promise<Server>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    const port=(server.address() as {port:number}).port;base=`http://127.0.0.1:${port}/api/v1`;
    client=new Client({name:'brainrotten-session-test',version:'1.0.0'});
    await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],env:{...process.env,BRAINROT_PORT:String(port),BRAINROTTEN_MCP_TOKEN:mcpToken,BRAINROT_SKIP_ENV:'1',BRAINROT_NO_AUTOSTART:'1',BRAINROT_DATA_DIR:directory,ELEVENLABS_API_KEY:'',PAPER_API_KEY:''}}));
  });
  afterAll(async()=>{await client?.close();server?.closeAllConnections();await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());await fs.rm(directory,{recursive:true,force:true});vi.unstubAllEnvs();});

  it('records, lists and reads a checkpoint, then serves its contextual guide',async()=>{
    const recorded=await client.callTool({name:'record_learning_session',arguments:checkpoint});
    expect(recorded.isError).not.toBe(true);
    const session=LearningSessionSchema.parse(JSON.parse(text(recorded)));
    expect(session).toMatchObject({evidenceTrust:'agent-supplied',recommendation:{format:'casefile',chosenBy:'routing-guide'}});
    // Same requestId is idempotent; changed context with the same ID is rejected.
    expect(JSON.parse(text(await client.callTool({name:'record_learning_session',arguments:checkpoint}))).sessionId).toBe(session.sessionId);
    expect((await client.callTool({name:'record_learning_session',arguments:{...checkpoint,title:'Different context'}})).isError).toBe(true);
    const page=SessionPageSchema.parse(JSON.parse(text(await client.callTool({name:'list_learning_sessions',arguments:{limit:5}}))));
    expect(page.sessions.map(item=>item.sessionId)).toEqual([session.sessionId]);
    const detail=SessionDetailSchema.parse(JSON.parse(text(await client.callTool({name:'get_learning_session',arguments:{sessionId:session.sessionId}}))));
    expect(detail.review.version).toBe(0);expect(detail.videos).toEqual([]);
    const guide=JSON.parse(text(await client.callTool({name:'get_learning_guide',arguments:{sessionId:session.sessionId}})));
    expect(guide.recommendation.format).toBe('casefile');
    await expect(fs.stat(path.join(directory,'learning-sessions',session.sessionId+'.json'))).resolves.toBeTruthy();
  });

  it('refuses a session lesson without a complete script before anything is queued',async()=>{
    const session=JSON.parse(text(await client.callTool({name:'record_learning_session',arguments:checkpoint})));
    const result=await client.callTool({name:'publish_session_lesson',arguments:{sessionId:session.sessionId,video:{prompt:'Explain retries'}}});
    expect(result.isError).toBe(true);
    const detail=SessionDetailSchema.parse(JSON.parse(text(await client.callTool({name:'get_learning_session',arguments:{sessionId:session.sessionId}}))));
    expect(detail.videos).toEqual([]);
  });

  it('keeps learner responses learner-only: the MCP token cannot write them, the owner session can',async()=>{
    const session=JSON.parse(text(await client.callTool({name:'record_learning_session',arguments:checkpoint})));
    const route=`${base}/sessions/${session.sessionId}/review`,body=JSON.stringify({kind:'predict',expectedVersion:0,text:'A fresh key allows a second charge.',confidence:3,skipped:false});
    const agent=await fetch(route,{method:'PUT',headers:{authorization:'Bearer '+mcpToken,'content-type':'application/json'},body});
    expect(agent.status).toBe(401);
    const owner=await fetch(route,{method:'PUT',headers:{authorization:'Bearer '+ownerToken,'content-type':'application/json'},body});
    expect(owner.status).toBe(200);
    const detail=SessionDetailSchema.parse(JSON.parse(text(await client.callTool({name:'get_learning_session',arguments:{sessionId:session.sessionId}}))));
    expect(detail.review).toMatchObject({version:1,prediction:{confidence:3}});
  });
});
