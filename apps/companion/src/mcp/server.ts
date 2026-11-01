/**
 * MCP stdio bridge — uses @modelcontextprotocol/server v2.
 *
 * Stdout is exclusively for MCP protocol frames. All logs go to stderr.
 * This process calls the companion HTTP API on loopback; it does not open
 * the SQLite database directly.
 *
 * Usage:
 *   node apps/companion/dist/mcp.js
 *
 * The local companion starts automatically on the first HTTP tool call.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GenerateVideoInputSchema,GetVideoInputSchema,ValidateVideoScriptInputSchema,LibraryQuerySchema,VideoLibrarySchema,VideoReviewSchema,ScriptValidationSchema,StudioConfigSchema,CAST_MEMBERS,FormatGuideInputSchema,LearningPackSchema,VIDEO_FORMATS } from '@brainrot/contracts';
import { CharacterGuideInputSchema,ImageSearchInputSchema } from '@brainrot/contracts';
import {characterGuide,SERVER_INSTRUCTIONS} from '@brainrot/media';
import {mcpEndpoint} from './endpoint.js';
import {readAccountProfile,accountAccessToken} from './account.js';
import {CreateLearningSessionSchema,GetSessionInputSchema,PublishSessionLessonSchema,SessionListQuerySchema,SessionDetailSchema,SessionPageSchema,LearningSessionSchema,LearningGuideSchema} from '@brainrot/contracts';

// ── Config ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['BRAINROT_PORT'] ?? '3001', 10);
const DATA_DIR =
  process.env['BRAINROT_DATA_DIR'] ??
  path.join(os.homedir(), '.local', 'share', 'brainrot');
const accountMode=process.argv.includes('--account')||process.env['BRAINROTTEN_CONNECTION']==='account';
const account=accountMode?readAccountProfile(DATA_DIR):undefined;
const endpoint=account?{baseUrl:account.apiUrl,remote:true,token:undefined}:mcpEndpoint(process.env,PORT);
const BASE_URL = endpoint.baseUrl;

let startup: Promise<void> | undefined;
async function ensureCompanion(): Promise<void> {
  if(endpoint.remote)return;
  startup ??= (async () => {
    try {
      const health = await fetch(`${BASE_URL}/health`, {signal: AbortSignal.timeout(800)});
      if (health.ok) return;
    } catch { /* start the local service on the first tool call */ }
    if (process.env['BRAINROT_NO_AUTOSTART'] === '1') throw new Error('Start the Brainrot companion first.');
    fs.mkdirSync(DATA_DIR, {recursive: true, mode: 0o700});
    const log = fs.openSync(path.join(DATA_DIR, 'companion.log'), 'a', 0o600);
    const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server.js');
    const child = spawn(process.execPath, [entry], {detached: true, stdio: ['ignore', log, log], env: {...process.env}});
    fs.closeSync(log); child.unref();
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try { if ((await fetch(`${BASE_URL}/health`, {signal: AbortSignal.timeout(300)})).ok) return; } catch { /* wait for startup */ }
    }
    throw new Error('Brainrot could not start. Run pnpm start in the project and check local logs.');
  })();
  try { await startup; } catch (error) { startup = undefined; throw error; }
}

// ── Local authentication ──────────────────────────────────────────────────

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
/**
 * Local mode needs no configuration: the companion owns a private (0600) token file in the data
 * directory and this bridge runs as the same OS user. An explicit BRAINROTTEN_MCP_TOKEN still
 * wins, so existing editor configurations keep working.
 */
function localMcpToken(): string {
  const explicit = process.env['BRAINROTTEN_MCP_TOKEN'];
  if (explicit) {if (!TOKEN_PATTERN.test(explicit)) throw new Error('BRAINROTTEN_MCP_TOKEN is malformed. Use the private token from Studio or unset it for automatic local authentication.');return explicit;}
  try {
    const saved = fs.readFileSync(path.join(DATA_DIR, 'mcp-token'), 'utf8').trim();
    if (TOKEN_PATTERN.test(saved)) return saved;
  } catch { /* the companion creates the file on first start */ }
  throw new Error('Could not find the local Brainrotten connection token. Start the companion once with pnpm start, or set BRAINROTTEN_MCP_TOKEN from Studio → MCP.');
}

// ── HTTP helper ───────────────────────────────────────────────────────────

interface CompanionError {
  code: string;
  message: string;
  retryable: boolean;
}

async function companionRequest(
  method: 'GET' | 'POST',
  urlPath: string,
  body?: unknown
): Promise<unknown> {
  await ensureCompanion();
  if(endpoint.remote&&urlPath==='/context')throw new Error('Repository evidence is available through the local companion only. Pass your context in the video script.');
  const token=endpoint.remote?(account?await accountAccessToken(DATA_DIR,BASE_URL):endpoint.token!):localMcpToken();

  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(!endpoint.remote?{Origin: `http://localhost:${PORT}`} : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect:'error',
    signal:AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({
      code: 'HTTP_ERROR',
      message: `HTTP ${response.status}`,
    }))) as CompanionError;
    throw new Error(`${errorBody.code}: ${errorBody.message}`);
  }

  return response.json();
}

// ── MCP Server ────────────────────────────────────────────────────────────

function createBrainrotServer(): McpServer {
  const server = new McpServer({
    name: 'brainrotten',
    version: '0.6.0',
  },{instructions:SERVER_INSTRUCTIONS});

  // One-step skills: each prompt hands the agent a format's rules and a complete example.
  const skills:Array<[string,string,string]>=[
    ['explain-with-sketch','sketch','Explain what we just did as an Excalidraw-style sketch board (default for systems, flows, bugs and changes).'],
    ['explain-with-skit','skit','Explain a concept or misconception from this session as a two-character skit.'],
    ['review-my-diff','prreview','Turn the real diff from this session into a GitHub-style PR review video.'],
    ['rank-the-options','tierlist','Rank the options we weighed in this session as a tier list.'],
    ['group-chat','groupchat','Tell this session’s story as the components texting in a WhatsApp group.'],
  ];
  for(const[name,format,description]of skills){
    server.registerPrompt(name,{title:description.split(' as ')[0]??name,description,argsSchema:z.object({focus:z.string().optional().describe('What the video should focus on'),language:z.enum(['en','hinglish','benglish']).optional()})},async args=>{
      const guide=await companionRequest('GET',`/formats/guide?format=${format}&language=${args.language??'hinglish'}`) as {rules?:string[];storyExample?:unknown;readyVoices?:string[]};
      const text=[`Make one Brainrotten ${format} video about what we just did${args.focus?`, focused on: ${args.focus}`:''}. Use only facts from this session; never invent code, tests or numbers.`,
        `Rules:\n- ${(guide.rules??[]).join('\n- ')}`,`Ready voices: ${(guide.readyVoices??[]).join(', ')}`,
        `Copy this complete example's structure and replace its content with ours:\n${JSON.stringify(guide.storyExample)}`,
        'Then call validate_video_script, fix every issue, and call generate_short_video once. If you can run Python, use the Brainrotten SDK instead: print(Brainrotten().make_video(request)).'].join('\n\n');
      return{messages:[{role:'user' as const,content:{type:'text' as const,text}}]};
    });
  }
  server.registerTool('get_learning_guide',{
    description:'Start here to turn your actual coding session into an account-owned learning experience. Supplies format selection recipes, script/quiz/practice instructions and metacognitive prompts. Optionally pass a sessionId for its context-specific recommendation. Read-only: no models, speech or quota. You write the script and questions from your context, choose the best format, and publish explicitly at a meaningful milestone. Never answer prediction/reflection prompts on the learner’s behalf.',
    inputSchema:z.object({sessionId:z.string().uuid().optional()}),
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(LearningGuideSchema.parse(await companionRequest('GET',input.sessionId?`/sessions/${input.sessionId}/guide`:'/learning-guide')))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('record_learning_session',{
    description:'Save one curated learning checkpoint from the current coding session in the connected user’s account. Include actual task/changes, decisions/trade-offs, uncertainties and short evidence excerpts, plus a learning objective, a before-watching prediction and a small transfer practice task. Exclude secrets and full chat dumps. Context is explicitly agent-supplied, not verified repository evidence. A stable requestId makes retries idempotent; changed context needs a new checkpoint ID. Read get_learning_guide first. Does not generate or spend quota.',
    inputSchema:CreateLearningSessionSchema,
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(LearningSessionSchema.parse(await companionRequest('POST','/sessions',input)))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('get_learning_session',{
    description:'Read an owned session checkpoint, its linked video jobs and saved learning responses. Use it to retrieve context/status; do not fill learner responses for them.',inputSchema:GetSessionInputSchema,
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(SessionDetailSchema.parse(await companionRequest('GET',`/sessions/${input.sessionId}`)))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('list_learning_sessions',{
    description:'Read a bounded page of checkpoints in the connected account. Android and Studio use these same resources. Does not generate or mark anything understood.',inputSchema:SessionListQuerySchema,
  },async input=>{try{const query=new URLSearchParams(Object.entries(input).filter(([,value])=>value!==undefined).map(([key,value])=>[key,String(value)]));return{content:[{type:'text',text:JSON.stringify(SessionPageSchema.parse(await companionRequest('GET','/sessions?'+query.toString())))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('publish_session_lesson',{
    description:'Explicitly queue a lesson for an existing owned session. The invoking agent chooses the best available format and provides the complete context-grounded video script plus 1–3 comprehension questions with replay turnIndices. Call get_learning_guide/get_video_formats and validate_video_script first. This is the paid-capable publish action; only use when requested or the learner enabled this workflow. The API links the video to the account/session and returns a job ID immediately. Stable requestId prevents duplicate billing. Do not claim completed tests, code execution or mastery without evidence.',inputSchema:PublishSessionLessonSchema,
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(await companionRequest('POST',`/sessions/${input.sessionId}/videos`,input.video))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});

  server.registerTool('generate_short_video', {
    description: 'Queue an educational MP4 as a skit, a WhatsApp-style group chat (groupchat: the components involved text each other) a GitHub-style PR review (prreview: reviewers comment on the real diff) an Excalidraw-style sketch board (sketch: one presenter draws the system) or a TierMaker-style tier list (tierlist: rank options against one criterion). casefile, whiteboard and pov are retired for new videos. Any format can add a Pause & Predict question (line.pause). Call get_video_formats for format rules and list_video_voices for readiness. Prefer your own complete script: it uses your task context and bypasses the script provider. Skits use exactly two alternating learner/expert voices, with a concrete mishap and connected follow-up questions; call get_character_guide for their vocabulary. Casefile, whiteboard and POV use one ready narrator and 4–12 scenes with setup, investigate, escalate and resolve beats. Whiteboard scenes require small typed diagrams of nodes and edges; POV scenes require journey location, action, status and 1–3 state key/value pairs. Use validate_video_script before spending speech credits. Ground claims in supplied evidence. Use brollSequence for 1–4 specific image/code references per turn. Keep Hinglish/Benglish in Latin letters. Optional quizCount 1–3 adds review questions outside the spoken video; complete scripts must supply those questions with turnIndices linking their evidence. Otherwise quizCount is 0. Supports 15–180 seconds and configured cloned voices. Returns a job ID immediately; poll get_video_status sparingly and get_video_learning_pack when ready. Reuse requestId for safe retries.',
    inputSchema: GenerateVideoInputSchema,
  }, async input => {
    try { return {content: [{type: 'text', text: JSON.stringify(await companionRequest('POST', '/videos', input))}]}; }
    catch (error) { return {isError: true, content: [{type: 'text', text: String(error)}]}; }
  });
  server.registerTool('get_video_formats',{
    description:'Read a format’s rules and a complete valid example before writing a video. Sketch and skit are the defaults. Call with format: sketch | skit | prreview | tierlist | groupchat. No generation or provider calls. Quiz questions refer to zero-based dialogue indices and stay outside the spoken MP4.',
    inputSchema:FormatGuideInputSchema,
  },async input=>{try{
    const config=StudioConfigSchema.parse(await companionRequest('GET','/studio/config'));
    const formats=(config.formats??VIDEO_FORMATS).filter(format=>!input.format||format.id===input.format);
    const exampleNarrator=config.characters.find(c=>c.id==='jhatka'&&c.voiceReady)?.id??config.characters.find(c=>c.id==='jack'&&c.voiceReady)?.id??config.characters.find(c=>c.voiceReady)?.id??'jhatka';
    if(!input.format||['skit','sketch','groupchat','prreview','tierlist'].includes(input.format)){const guide=await companionRequest('GET',`/formats/guide?language=${input.language}${input.format?`&format=${input.format}`:''}`) as Record<string,unknown>;return{content:[{type:'text',text:JSON.stringify({formats,...guide})}]};}
    return{content:[{type:'text',text:JSON.stringify({formats,readyNarrators:config.characters.filter(character=>character.voiceReady),language:input.language,languageRule:'Use everyday English, Hinglish or Benglish in Latin letters. Keep technical vocabulary natural.',storyExample:{format:input.format&&input.format!=='skit'?input.format:'casefile',cast:'auto',language:input.language,narrator:exampleNarrator,quizCount:1,script:{title:'The payment that ran twice',narrator:exampleNarrator,takeaway:'Use a stable idempotency key to deduplicate retried payment operations.',dialogue:[{speaker:exampleNarrator,scene:{beat:'setup',heading:'Two charges, one order',journey:{location:'Checkout',action:'Submit the purchase',status:'running',state:[{key:'operationKey',value:'purchase-42'}]},diagram:{nodes:[{id:'phone',label:'Phone'},{id:'payment',label:'Payment service'}],edges:[{from:'phone',to:'payment'}]}},text:input.format==='pov'?'I am a purchase request. A timeout sends me back through checkout.':'A mobile checkout timed out, so the user pressed Pay again.'},{speaker:exampleNarrator,scene:{beat:'investigate',heading:'A timeout hides the outcome',journey:{location:'Response channel',action:'Response lost after the charge',status:'waiting',state:[{key:'outcome',value:'Charge committed'}]},diagram:{nodes:[{id:'charge',label:'Charge succeeded'},{id:'response',label:'Response lost'}],edges:[{from:'charge',to:'response'}]}},text:input.format==='pov'?'My charge already succeeded, but my response never reached the phone.':'The first charge succeeded, but the response never reached the phone.'},{speaker:exampleNarrator,scene:{beat:'escalate',heading:'A fresh retry repeats the charge',journey:{location:'Payment API',action:'A fresh key starts another operation',status:'blocked',state:[{key:'operationKey',value:'new key'}]},diagram:{nodes:[{id:'retry',label:'Retry with a fresh key'},{id:'charge',label:'Another charge'}],edges:[{from:'retry',to:'charge'}]}},text:input.format==='pov'?'With a fresh operation key, I look like a second purchase and can be charged again.':'A new request ID looked like another purchase to the payment service.'},{speaker:exampleNarrator,scene:{beat:'resolve',heading:'Reuse the operation key',journey:{location:'Operation store',action:'Return the original result',status:'done',state:[{key:'operationKey',value:'purchase-42'},{key:'result',value:'Original saved result'}]},diagram:{nodes:[{id:'retry',label:'Retry with purchase key'},{id:'lookup',label:'Find original operation'},{id:'result',label:'Return original result'}],edges:[{from:'retry',to:'lookup'},{from:'lookup',to:'result'}]}},text:input.format==='pov'?'Keep my original purchase key. The service recognizes me and returns the saved result.':'Persist one idempotency key per purchase and return the original result on retries.'}],questions:[{id:'q1',prompt:'What should the retry reuse?',choices:['The original purchase idempotency key','A newly generated request key'],answer:0,explanation:'A stable operation key lets the server recognize the same purchase.',turnIndices:[2,3]}]}},skitGuide:'Call get_character_guide for the two-speaker script shape. Set format skit, or omit format for existing behavior.',outputs:['MP4','audio.mp3','learning.json','notes.md','captions.srt','flashcards.csv']})}]};
  }catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('get_video_learning_pack',{
    description:'Read a ready video’s portable learning pack: takeaway, chapter timestamps, review questions with answers/explanations and transcript. Does not generate media or consume another video slot.',
    inputSchema:GetVideoInputSchema,
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(LearningPackSchema.parse(await companionRequest('GET',`/videos/${input.jobId}/learning`)))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('validate_video_script',{
    description:'Check an intended video request without model, image, speech or rendering calls. Pass the planned generate_short_video arguments as request. Returns structural issues, estimated speech length and configuration warnings; does not verify facts, external assets or voice likeness.',
    inputSchema:ValidateVideoScriptInputSchema,
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(ScriptValidationSchema.parse(await companionRequest('POST','/videos/validate',input.request)))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('list_videos',{
    description:'Browse the caller’s private video library by title/topic, format, generation state and review state. Returns bounded pages with a nextCursor. Pass the same filters on the next page. Does not generate content or spend a trial slot.',
    inputSchema:LibraryQuerySchema,
  },async input=>{try{const params=new URLSearchParams();for(const[key,value]of Object.entries(input))if(value!==undefined)params.set(key,String(value));return{content:[{type:'text',text:JSON.stringify(VideoLibrarySchema.parse(await companionRequest('GET','/library?'+params.toString())))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('get_video_review',{
    description:'Read the caller’s saved watch position, bookmark and quiz attempts for an existing video. Does not mark it watched or answer questions on the user’s behalf.',
    inputSchema:GetVideoInputSchema,
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(VideoReviewSchema.parse(await companionRequest('GET',`/videos/${input.jobId}/review`)))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});
  server.registerTool('get_video_status', {
    description: 'Get real script/voice/render progress for a video job. When ready, returns the MP4 playback/download path on the local Brainrot server. Poll sparingly; rendering is asynchronous.',
    inputSchema: GetVideoInputSchema,
  }, async input => {
    try {
      const job = await companionRequest('GET', `/videos/${input.jobId}`);
      return {content: [{type: 'text', text: JSON.stringify({...(job as object),...(!endpoint.remote?{studioUrl: `http://127.0.0.1:${PORT}/studio?video=${input.jobId}`}:{})})}]};
    } catch (error) { return {isError: true, content: [{type: 'text', text: String(error)}]}; }
  });
  server.registerTool('list_video_voices', {
    description: 'List the actual cloned character voices and check local provider/FFmpeg readiness. Never returns API keys. If clones are missing, run pnpm voices:setup with the user’s ElevenLabs account.',
    inputSchema: z.object({}),
  }, async () => {
    try { return {content: [{type: 'text', text: JSON.stringify(await companionRequest('GET', '/studio/config'))}]}; }
    catch (error) { return {isError: true, content: [{type: 'text', text: String(error)}]}; }
  });

  server.registerTool('get_character_guide', {
    description: 'Get the ready character roster, English/Hinglish/Benglish vocabulary and question-answer contract. Choose two speakers yourself from context; cross-show pairs are supported. Oggy calls Jack bhaiyaaa; Jack calls Oggy munna. Includes the direct-script shape and B-roll examples. Does not generate speech or spend credits.',
    inputSchema: CharacterGuideInputSchema,
  }, async input => {try{
    const config=StudioConfigSchema.parse(await companionRequest('GET','/studio/config'));
    const roster=config.characters.filter(character=>CAST_MEMBERS[input.cast].includes(character.id));
    return {content:[{type:'text',text:JSON.stringify({guide:characterGuide(input.cast,input.language,input.participants),characters:roster,selection:'Choose exactly two voiceReady characters yourself using the task context. Set participants.learner and participants.expert. No fixed pair; cross-show pairs are allowed.',scriptShape:{cast:input.cast,language:input.language,participants:{learner:'<chosen learner ID>',expert:'<chosen expert ID>'},durationSeconds:60,speechSpeed:1.12,script:{title:'Your concept',dialogue:[{speaker:'<chosen learner ID>',text:'I tried a concrete fix, but this unexpected result happened.'},{speaker:'<chosen expert ID>',text:'An in-character observation, test or next step grounded in that result.',broll:{kind:'code',code:'const result = await fetch(url);',language:'javascript'}},{speaker:'<chosen learner ID>',text:'A follow-up about a specific detail or failure case from that answer?'},{speaker:'<chosen expert ID>',text:'Resolve that follow-up with a concrete mechanism or example.'}]}}})}]};
  }catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});


  server.registerTool('search_broll_image',{
    description:'Find one Google image for a B-roll insert using the Pixd search pipeline. Use a specific query naming the object/interface and its distinguishing feature. One lookup, one result, no image selection/approval loop. Returns imageUrl, sourceUrl and title. Use the result directly as {kind:"image",url:imageUrl,sourceUrl,title,caption:"..."} in your script, so rendering does not search again. Google Images works without a search API key.',
    inputSchema:ImageSearchInputSchema,
  },async input=>{try{return{content:[{type:'text',text:JSON.stringify(await companionRequest('POST','/images/search',input))}]};}catch(error){return{isError:true,content:[{type:'text',text:String(error)}]};}});

  // Tool: get_change_context
  server.registerTool(
    'get_change_context',
    {
      description:
        'Get a bounded evidence snapshot of recent changes in a registered repository. ' +
        'Returns citation IDs you can reference in a lesson draft.',
      inputSchema: z.object({
        projectId: z.string().uuid().describe('Registered project ID (from companion registration)'),
        comparisonMode: z
          .enum(['git-head', 'dirty-working-tree'])
          .optional()
          .describe('How to compare: git-head (default) or dirty-working-tree'),
      }),
    },
    async (input) => {
      try {
        const snapshot = await companionRequest('POST', '/context', input);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(snapshot, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: String(err),
                hint: 'Ensure the Brainrot companion is running: pnpm dev',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ── Entry point ───────────────────────────────────────────────────────────

serveStdio(createBrainrotServer);
