import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {GenerateVideoInputSchema,SketchScriptSchema,VideoManifestSchema,scriptForFormat,type VideoScript} from '@brainrot/contracts';
import {createScript,synthesizeDialogue} from './providers.js';
import {renderFrameSvg,getRenderReadiness} from './render.js';
import {generateVideoArtifact} from './engine.js';
import {buildSketch,sketchFont} from './sketchFrames.js';
import {sketchExample} from './formatGuides.js';
import {validateVideoRequest} from './validation.js';
import {recommendSessionFormat} from './sessionLearning.js';
vi.mock('./providers.js',async original=>({...await original<typeof import('./providers.js')>(),availableVoices:()=>[{role:'patlu'}],synthesizeDialogue:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});

const example=sketchExample('hinglish',['patlu']);
const script=scriptForFormat(example.script as never,'sketch',undefined,'patlu') as VideoScript;
const segments=script.dialogue.map((line,i)=>({speaker:line.speaker,text:line.text,turnIndex:i,startMs:i*1000,endMs:i*1000+800}));

describe('sketch board format',()=>{
  it('ships a valid example and rejects unknown element references',()=>{
    expect(GenerateVideoInputSchema.safeParse(example).success).toBe(true);
    expect(validateVideoRequest(example,{characters:[{id:'patlu',voiceReady:true}]} as never).issues).toEqual([]);
    const bad={...script,dialogue:script.dialogue.map((line,i)=>i?line:{...line,sketch:{show:['ghost']}})};
    expect(JSON.stringify(SketchScriptSchema.safeParse(bad).error?.issues)).toContain('Unknown sketch element');
    expect(SketchScriptSchema.safeParse({...script,sketch:{...script.sketch,edges:[{from:'phone',to:'phone'}]}}).success).toBe(false);
  });
  it('builds up elements on their first mention and keeps edges hidden until mentioned',()=>{
    const board=buildSketch(script),long=()=>9999;
    expect(board.height).toBeGreaterThanOrEqual(620);expect(board.height).toBeLessThanOrEqual(900);
    const first=board.markup(0,long),third=board.markup(2,long),last=board.markup(6,long);
    expect(first).toContain('User app');expect(first).not.toContain('Redis cache');
    expect(third).toContain('Postgres');expect(third).not.toContain('invalidate');
    expect(last).toContain('invalidate');expect(last).toContain('DEL on update');expect(last).toContain('#2f9e44');
    expect(board.markup(5,long)).toContain('#e03131');
    // A new element fades in at the start of its line.
    expect(board.markup(1,()=>0)).not.toContain('Redis cache');expect(board.markup(1,()=>160)).toMatch(/Redis cache/);expect(board.markup(1,()=>160)).toContain('opacity="0.5"');
  });
  it('composes the board as a centered card over gameplay',async()=>{
    const font=await sketchFont();await expect(fs.stat(font)).resolves.toBeTruthy();
    const svg=renderFrameSvg({segments,words:[],title:script.title,style:'brainrot',durationSeconds:8,format:'sketch',script,sketchBoard:buildSketch(script)},2.2);
    expect(svg).toContain('data-format="sketch"');expect(svg).toContain('clip-path="url(#card)"');expect(svg).not.toContain('data-caption-turn');
  });
  it('generates a sketch from a topic with one presenter voice',async()=>{
    vi.stubEnv('BRAINROT_SKIP_ENV','1');vi.stubEnv('PAPER_API_KEY','synthetic-paper-key');
    const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:JSON.stringify(script)}}]}));vi.stubGlobal('fetch',fetch);
    const result=await createScript(GenerateVideoInputSchema.parse({format:'sketch',prompt:'Explain stale cache prices',quizCount:1,durationSeconds:56}),['patlu','jack']);
    expect(result.sketch?.nodes).toHaveLength(4);
    const body=JSON.parse(fetch.mock.calls[0]![1].body),schema=body.response_format.json_schema.schema;
    expect(body.messages[0].content).toContain('Excalidraw-style sketch board');
    expect(schema.properties.narrator.enum).toEqual(['patlu']);expect(schema.required).toEqual(expect.arrayContaining(['sketch','questions']));
  });
  it('routes architecture sessions to the sketch board',()=>{
    const session={requestId:'arch-0001',title:'Cache',projectName:'Shop',agent:'MCP',intent:'architecture' as const,objective:'See how the cache sits between API and database.',context:{task:'Map the price path',summary:'API reads Redis, then Postgres.',changes:[],concepts:[],decisions:[],uncertainties:[],evidence:[]},activity:{predictionPrompt:'Where would a stale price come from?',practice:{prompt:'Draw the read path for a new product.',successCriteria:'Cache, database and invalidation are all shown.'},reflectionPrompt:'What did you assume about the cache lifetime?'}};
    expect(recommendSessionFormat(session as never).format).toBe('sketch');
  });
  it('renders an actual sketch MP4 with a pause over supplied gameplay without network calls',async()=>{
    if(!getRenderReadiness().ready)return;
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-sketch-'));
    try{
      const audioPath=path.join(dir,'fixture.mp3');expect(spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=8','-y',audioPath]).status).toBe(0);
      vi.mocked(synthesizeDialogue).mockResolvedValue({audioPath,durationSeconds:8,segments,words:[]});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
      const out=path.join(dir,'out');
      const result=await generateVideoArtifact(GenerateVideoInputSchema.parse({...example,background:'minecraft-end'}),{jobId:'66666666-6666-4666-8666-666666666666',dataDir:dir,outputDir:out});
      expect(fetch).not.toHaveBeenCalled();expect(result.learning.questions.map(q=>q.id)).toEqual(['q1','pause-4']);
      const manifest=VideoManifestSchema.parse(JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8')));
      expect(manifest).toMatchObject({format:'sketch',script:{sketch:{nodes:expect.any(Array)}}});
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',path.join(out,'video.mp4')],{encoding:'utf8'});
      expect(JSON.parse(probe.stdout).streams).toEqual(expect.arrayContaining([expect.objectContaining({codec_name:'h264',width:720,height:1280})]));
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  },120000);
});
