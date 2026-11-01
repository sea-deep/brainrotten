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
import {preparePrPanels,fileForComment,prPanelHeight} from './prFrames.js';
import {insertPauses,pauseQuestions,preparePauseOverlay,pauseSeconds} from './pause.js';
import {prReviewExample} from './formatGuides.js';
import {validateVideoRequest} from './validation.js';
vi.mock('./providers.js',async original=>({...await original<typeof import('./providers.js')>(),availableVoices:()=>[{role:'jhatka'},{role:'patlu'}],synthesizeDialogue:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});

const example=prReviewExample('hinglish',['jhatka','patlu']);
const script=scriptForFormat(example.script as never,'prreview') as VideoScript;
const segments=script.dialogue.map((line,i)=>({speaker:line.speaker,text:line.text,turnIndex:i,startMs:i*1000,endMs:i*1000+800}));
const id='44444444-4444-4444-8444-444444444444';

describe('PR review format',()=>{
  it('ships a valid example with a pause and real diff lines',()=>{
    expect(GenerateVideoInputSchema.safeParse(example).success).toBe(true);
    expect(script.dialogue[2]?.pause?.answer).toBe(0);expect(script.dialogue.findIndex(line=>line.pause)).toBeGreaterThanOrEqual(2);
    expect(validateVideoRequest(example,{characters:['jhatka','patlu'].map(id=>({id,voiceReady:true}))} as never).issues).toEqual([]);
  });
  it('keeps showing the last anchored file for a summary comment',()=>{
    expect(fileForComment(script.dialogue,4)).toBe(1);expect(fileForComment(script.dialogue,6)).toBe(1);expect(fileForComment(script.dialogue,0)).toBe(0);
  });
  it('pre-renders one GitHub-style panel per comment at a content-fitted height',async()=>{
    const panels=await preparePrPanels(script);
    expect(panels.height).toBe(prPanelHeight(script));expect(panels.height).toBeGreaterThanOrEqual(560);expect(panels.height).toBeLessThanOrEqual(860);
    const meta=await sharp(Buffer.from(panels.panel(0).split(',')[1]!,'base64')).metadata();
    expect([meta.width,meta.height]).toEqual([720,panels.height]);
    expect(panels.panel(0)).not.toBe(panels.panel(1));
    const svg=renderFrameSvg({segments,words:[],title:script.title,style:'brainrot',durationSeconds:6,format:'prreview',script,prPanels:panels},1.2);
    expect(svg).toContain('data-format="prreview"');expect(svg).not.toContain('data-caption-turn');
  },60000);
  it('generates a review from a topic in one request with ready reviewer voices',async()=>{
    vi.stubEnv('BRAINROT_SKIP_ENV','1');vi.stubEnv('PAPER_API_KEY','synthetic-paper-key');
    const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:JSON.stringify(script)}}]}));vi.stubGlobal('fetch',fetch);
    const result=await createScript(GenerateVideoInputSchema.parse({format:'prreview',prompt:'Review the retry fix',quizCount:1,durationSeconds:45}),['jhatka','patlu']);
    expect(result.pr?.verdict).toBe('approve');
    const body=JSON.parse(fetch.mock.calls[0]![1].body),schema=body.response_format.json_schema.schema;
    expect(body.messages[0].content).toContain('GitHub pull request review');
    expect(schema.properties).not.toHaveProperty('chat');expect(schema.required).toEqual(expect.arrayContaining(['pr','questions']));
  });
  it('rejects retired formats for new requests',()=>{
    expect(validateVideoRequest({format:'pov',prompt:'Explain retries'},{characters:[]} as never).issues[0]?.message).toContain('retired');
  });
});

describe('Pause & Predict',()=>{
  it('inserts real silence after the pause line and shifts later timing',async()=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-pause-'));
    try{
      const audioPath=path.join(dir,'in.mp3');expect(spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=5','-y',audioPath]).status).toBe(0);
      const words=[{text:'A',speaker:'jhatka' as const,turnIndex:0,startMs:100,endMs:300},{text:'B',speaker:'jhatka' as const,turnIndex:3,startMs:3100,endMs:3300}];
      expect(pauseSeconds(script.dialogue[2]!.pause!)).toBe(10);expect(pauseSeconds({prompt:'Which?',choices:['A','B'],answer:0})).toBe(5);
      const result=await insertPauses({audioPath,durationSeconds:5,segments,words},script,dir);
      expect(result.durationSeconds).toBe(15);
      expect(result.segments[2]).toMatchObject({startMs:2000,endMs:2800});expect(result.segments[3]).toMatchObject({startMs:13000,endMs:13800});
      expect(result.words[0]).toMatchObject({startMs:100});expect(result.words[1]).toMatchObject({startMs:13100});
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',result.audioPath],{encoding:'utf8'});
      expect(Number(probe.stdout)).toBeGreaterThan(14.8);
      const overlay=(await preparePauseOverlay(script,result.segments,{top:640,height:640}))!;
      expect(overlay.region).toEqual({top:640,height:640});
      expect(overlay.at(2500)).toBe('');expect(overlay.at(3000)).toMatch(/^data:image\/png/);expect(overlay.at(13500)).toMatch(/^data:image\/png/);expect(overlay.at(16000)).toBe('');
      expect(overlay.at(3000)).not.toBe(overlay.at(12500));
      const meta=await sharp(Buffer.from(overlay.at(3000).split(',')[1]!,'base64')).metadata();expect(meta.height).toBe(640);
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  },60000);
  it('turns pauses into graded learning questions linked to the reveal',()=>{
    expect(pauseQuestions(script)).toEqual([expect.objectContaining({id:'pause-2',answer:0,turnIndices:[2,3]})]);
  });
  it('renders an actual prreview MP4 with a pause and a graded pause question',async()=>{
    if(!getRenderReadiness().ready)return;
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-pr-'));
    try{
      const audioPath=path.join(dir,'fixture.mp3');expect(spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=8','-y',audioPath]).status).toBe(0);
      vi.mocked(synthesizeDialogue).mockResolvedValue({audioPath,durationSeconds:8,segments,words:[]});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
      const out=path.join(dir,'out');
      const result=await generateVideoArtifact(GenerateVideoInputSchema.parse({...example,background:'gta-stunts'}),{jobId:id,dataDir:dir,outputDir:out});
      expect(fetch).not.toHaveBeenCalled();expect(result.voice.durationSeconds).toBe(18);
      expect(result.learning.questions.map(q=>q.id)).toEqual(['q1','pause-2']);
      const manifest=VideoManifestSchema.parse(JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8')));
      expect(manifest).toMatchObject({format:'prreview',script:{pr:{verdict:'approve'}}});
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',path.join(out,'video.mp4')],{encoding:'utf8'});
      expect(JSON.parse(probe.stdout).streams).toEqual(expect.arrayContaining([expect.objectContaining({codec_name:'h264',width:720,height:1280})]));
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  },120000);
});
