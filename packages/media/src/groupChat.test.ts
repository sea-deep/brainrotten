import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {GenerateVideoInputSchema,VideoManifestSchema,scriptForFormat,type VideoScript} from '@brainrot/contracts';
import {createScript,synthesizeDialogue} from './providers.js';
import {renderFrameSvg,getRenderReadiness} from './render.js';
import {generateVideoArtifact} from './engine.js';
import {prepareChatPanels,chatStateAt,CHAT_PANEL} from './chatFrames.js';
import {groupChatExample,GROUP_CHAT_RULES} from './formatGuides.js';
import {resolveChatIcon,unknownChatIcons,iconAvatarUri} from './chatIcons.js';
import {validateVideoRequest} from './validation.js';
vi.mock('./providers.js',async original=>({...await original<typeof import('./providers.js')>(),availableVoices:()=>[{role:'motu'},{role:'jack'},{role:'patlu'}],synthesizeDialogue:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});

const example=groupChatExample('hinglish',['motu','jack','patlu']);
const script=scriptForFormat(example.script as never,'groupchat') as VideoScript;
const voice={audioPath:'unused',durationSeconds:3,words:[],segments:script.dialogue.map((line,i)=>({speaker:line.speaker,text:line.text,turnIndex:i,startMs:i*500,endMs:i*500+400}))};
const id='22222222-2222-4222-8222-222222222222';

describe('group chat format',()=>{
  it('ships a complete, valid agent example and rules',()=>{
    expect(GenerateVideoInputSchema.safeParse(example).success).toBe(true);
    expect(script.chat?.members.map(m=>m.speaker)).toEqual(['motu','jack','patlu']);
    expect(GROUP_CHAT_RULES.join(' ')).toContain('Never send coordinates');
  });
  it('shows messages as speech starts and "typing" only in the gap before the next one',()=>{
    const segments=[{startMs:0,endMs:400},{startMs:1000,endMs:1400}];
    expect(chatStateAt(segments,100)).toEqual({visible:1,typing:false});
    expect(chatStateAt(segments,600)).toEqual({visible:1,typing:true});
    expect(chatStateAt(segments,1000)).toEqual({visible:2,typing:false});
    expect(chatStateAt(segments,5000)).toEqual({visible:2,typing:false});
  });
  it('pre-renders phone-sized WhatsApp panels for every state',async()=>{
    const panels=await prepareChatPanels(script);
    const first=panels.panel({visible:1,typing:false}),last=panels.panel({visible:script.dialogue.length,typing:false});
    expect(first).toMatch(/^data:image\/png;base64,/);expect(last).not.toBe(first);
    const meta=await sharp(Buffer.from(last.split(',')[1]!,'base64')).metadata();
    expect([meta.width,meta.height]).toEqual([CHAT_PANEL.width,CHAT_PANEL.height]);
  },30000);
  it('composes only the chat over gameplay: no captions and no cartoon characters',async()=>{
    const panels=await prepareChatPanels(script);
    const svg=renderFrameSvg({...voice,words:[{text:'Did',speaker:'motu',turnIndex:0,startMs:0,endMs:200}],title:script.title,style:'brainrot',format:'groupchat',script,chatPanels:panels},.1);
    expect(svg).toContain('data-format="groupchat"');expect(svg).toContain('data:image/png');
    expect(svg).not.toContain('data-caption-turn');expect(svg.match(/<image /g)).toHaveLength(1);
  },30000);
  it('resolves generic and brand icons, and rejects unknown ones before any paid call',async()=>{
    expect(resolveChatIcon('database')?.kind).toBe('generic');
    expect(resolveChatIcon('postgresql')).toMatchObject({kind:'brand',hex:expect.stringMatching(/^#[0-9A-F]{6}$/i)});
    expect(resolveChatIcon('Next.js')?.kind).toBe('brand');
    expect(unknownChatIcons(['zap','not-a-real-icon'])).toEqual(['not-a-real-icon']);
    expect(iconAvatarUri('redis','#000')).toMatch(/^data:image\/svg\+xml;base64,/);
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const bad={...example,script:{...example.script!,chat:{...example.script!.chat!,members:example.script!.chat!.members.map((m,i)=>i?m:{...m,icon:'not-a-real-icon'})}}};
    await expect(createScript(GenerateVideoInputSchema.parse(bad),['motu','jack','patlu'])).rejects.toThrow('Unknown icon');
    expect(fetch).not.toHaveBeenCalled();
    expect(validateVideoRequest(bad,{characters:[]} as never).issues[0]?.message).toContain('Unknown icon');
  });
  it('asks the model for members and messages in one request, limited to ready voices',async()=>{
    vi.stubEnv('BRAINROT_SKIP_ENV','1');vi.stubEnv('PAPER_API_KEY','synthetic-paper-key');
    const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:JSON.stringify(script)}}]}));vi.stubGlobal('fetch',fetch);
    const result=await createScript(GenerateVideoInputSchema.parse({format:'groupchat',prompt:'Explain duplicate payment retries',quizCount:1,durationSeconds:36}),['motu','jack','patlu']);
    expect(result.chat?.title).toBe('checkout-prod 💀');expect(fetch).toHaveBeenCalledTimes(1);
    const body=JSON.parse(fetch.mock.calls[0]![1].body),schema=body.response_format.json_schema.schema;
    expect(body.messages[0].content).toContain('WhatsApp group chat');
    expect([...schema.properties.dialogue.items.properties.speaker.enum].sort()).toEqual(['jack','motu','patlu']);
    expect(schema.properties.dialogue.items.properties).not.toHaveProperty('scene');
    expect(schema.required).toEqual(expect.arrayContaining(['chat','questions']));
  });
  it('refuses a chat that needs a voice that is not ready, before any paid call',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(createScript(GenerateVideoInputSchema.parse(example),['motu','jack'])).rejects.toThrow('ready voice');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('warns about long bubbles during validation',()=>{
    const long={...example,script:{...example.script!,dialogue:example.script!.dialogue.map(line=>({...line,chat:{...line.chat,display:'a'.repeat(160)}}))}};
    const result=validateVideoRequest(long,{characters:['motu','jack','patlu'].map(id=>({id,voiceReady:true}))} as never);
    expect(result.valid).toBe(true);expect(result.warnings.join(' ')).toContain('over 140 characters');
  });
  it('renders an actual groupchat MP4 over supplied gameplay without network calls',async()=>{
    if(!getRenderReadiness().ready)return;
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-chat-'));
    try{
      const audioPath=path.join(dir,'fixture.mp3');expect(spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=3','-y',audioPath]).status).toBe(0);
      vi.mocked(synthesizeDialogue).mockResolvedValue({...voice,audioPath});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
      const out=path.join(dir,'out');
      const result=await generateVideoArtifact(GenerateVideoInputSchema.parse({...example,background:'subway-surfers'}),{jobId:id,dataDir:dir,outputDir:out});
      expect(result.learning.format).toBe('groupchat');expect(result.backgroundName).toBe('Subway Surfers');expect(fetch).not.toHaveBeenCalled();
      const manifest=VideoManifestSchema.parse(JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8')));
      expect(manifest).toMatchObject({format:'groupchat',script:{chat:{title:'checkout-prod 💀'}}});
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',path.join(out,'video.mp4')],{encoding:'utf8'});
      expect(JSON.parse(probe.stdout).streams).toEqual(expect.arrayContaining([expect.objectContaining({codec_name:'h264',width:720,height:1280})]));
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  },90000);
});

describe('repair loop for smaller models',()=>{
  it('sends validation problems back once and accepts the corrected script',async()=>{
    vi.stubEnv('BRAINROT_SKIP_ENV','1');vi.stubEnv('PAPER_API_KEY','synthetic-paper-key');
    const broken={...script,chat:{...script.chat!,members:script.chat!.members.map(m=>({...m,speaker:'motu'}))}};
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({choices:[{message:{content:JSON.stringify(broken)}}]})).mockResolvedValueOnce(Response.json({choices:[{message:{content:JSON.stringify(script)}}]}));
    vi.stubGlobal('fetch',fetch);
    const result=await createScript(GenerateVideoInputSchema.parse({format:'groupchat',prompt:'Explain retries',quizCount:1,language:'hinglish'}),['motu','jack','patlu']);
    expect(result.chat?.members.map(m=>m.speaker)).toEqual(['motu','jack','patlu']);expect(fetch).toHaveBeenCalledTimes(2);
    const retry=JSON.parse(fetch.mock.calls[1]![1].body).messages[1].content;
    expect(retry).toContain('failed validation');expect(retry).toContain('different character voice');
    expect(JSON.parse(fetch.mock.calls[0]![1].body).messages[0].content).toContain('Romanized Hinglish');
  });
});
