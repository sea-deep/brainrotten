import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {GenerateVideoInputSchema,TierListScriptSchema,VideoManifestSchema,scriptForFormat,type VideoScript} from '@brainrot/contracts';
import {createScript,synthesizeDialogue} from './providers.js';
import {renderFrameSvg,getRenderReadiness} from './render.js';
import {generateVideoArtifact} from './engine.js';
import {prepareTierPanels} from './tierFrames.js';
import {tierListExample} from './formatGuides.js';
import {validateVideoRequest} from './validation.js';
import {recommendSessionFormat} from './sessionLearning.js';
vi.mock('./providers.js',async original=>({...await original<typeof import('./providers.js')>(),availableVoices:()=>[{role:'jack'}],synthesizeDialogue:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});

const example=tierListExample('hinglish',['jack']);
const script=scriptForFormat(example.script as never,'tierlist',undefined,'jack') as VideoScript;
const segments=script.dialogue.map((line,i)=>({speaker:line.speaker,text:line.text,turnIndex:i,startMs:i*1000,endMs:i*1000+800}));

describe('tier list format',()=>{
  it('ships a valid example; every item is placed exactly once',()=>{
    expect(GenerateVideoInputSchema.safeParse(example).success).toBe(true);
    expect(validateVideoRequest(example,{characters:[{id:'jack',voiceReady:true}]} as never).issues).toEqual([]);
    const twice={...script,dialogue:script.dialogue.map((line,i)=>i===2?{...line,tier:{place:{item:'new-uuid',tier:'B'}}}:line)};
    const issues=JSON.stringify(TierListScriptSchema.safeParse(twice).error?.issues);
    expect(issues).toContain('already placed');expect(issues).toContain('Missing: backoff');
  });
  it('pre-renders a stable board per line at a fixed height',async()=>{
    const panels=await prepareTierPanels(script);
    const meta=await sharp(Buffer.from(panels.panel(3).split(',')[1]!,'base64')).metadata();
    expect([meta.width,meta.height]).toEqual([720,panels.height]);
    expect(panels.panel(1)).not.toBe(panels.panel(2));
    const svg=renderFrameSvg({segments,words:[],title:script.title,style:'brainrot',durationSeconds:7,format:'tierlist',script,tierPanels:panels},2.2);
    expect(svg).toContain('data-format="tierlist"');expect(svg).not.toContain('data-caption-turn');
  },60000);
  it('generates a tier list from a topic with one presenter voice',async()=>{
    vi.stubEnv('BRAINROT_SKIP_ENV','1');vi.stubEnv('PAPER_API_KEY','synthetic-paper-key');
    const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:JSON.stringify(script)}}]}));vi.stubGlobal('fetch',fetch);
    const result=await createScript(GenerateVideoInputSchema.parse({format:'tierlist',prompt:'Rank double charge fixes',quizCount:1,durationSeconds:56}),['jack']);
    expect(result.tierlist?.items).toHaveLength(5);
    const body=JSON.parse(fetch.mock.calls[0]![1].body),schema=body.response_format.json_schema.schema;
    expect(body.messages[0].content).toContain('TierMaker-style tier list');
    expect(schema.properties.narrator.enum).toEqual(['jack']);expect(schema.properties.dialogue.items.properties).toHaveProperty('tier');
    expect(schema.properties.dialogue.items.properties).not.toHaveProperty('sketch');
  });
  it('routes sessions that weighed several options to the tier list',()=>{
    const session={requestId:'tier-0001',title:'Retry fixes',projectName:'Shop',agent:'MCP',intent:'concept' as const,objective:'Compare the ways to stop double charges.',context:{task:'Pick a retry fix',summary:'Several options were weighed.',changes:[],concepts:[],decisions:[{choice:'Same key',reason:'Stable identity'},{choice:'Unique constraint',reason:'Race safety'}],uncertainties:[],evidence:[]},activity:{predictionPrompt:'Which option fails when the reply is lost?',practice:{prompt:'Rank one more option.',successCriteria:'Uses the stated criterion.'},reflectionPrompt:'Which criterion did you use?'}};
    expect(recommendSessionFormat(session as never).format).toBe('tierlist');
  });
  it('renders an actual tier list MP4 with a pause without network calls',async()=>{
    if(!getRenderReadiness().ready)return;
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-tier-'));
    try{
      const audioPath=path.join(dir,'fixture.mp3');expect(spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=8','-y',audioPath]).status).toBe(0);
      vi.mocked(synthesizeDialogue).mockResolvedValue({audioPath,durationSeconds:8,segments,words:[]});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
      const out=path.join(dir,'out');
      const result=await generateVideoArtifact(GenerateVideoInputSchema.parse({...example,background:'subway-surfers'}),{jobId:'88888888-8888-4888-8888-888888888888',dataDir:dir,outputDir:out});
      expect(fetch).not.toHaveBeenCalled();expect(result.learning.questions.map(q=>q.id)).toEqual(['q1','pause-3']);
      const manifest=VideoManifestSchema.parse(JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8')));
      expect(manifest).toMatchObject({format:'tierlist',script:{tierlist:{criterion:expect.any(String)}}});
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',path.join(out,'video.mp4')],{encoding:'utf8'});
      expect(JSON.parse(probe.stdout).streams).toEqual(expect.arrayContaining([expect.objectContaining({codec_name:'h264',width:720,height:1280})]));
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  },120000);
});
