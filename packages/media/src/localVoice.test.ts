import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {GenerateVideoInputSchema,type VideoScript} from '@brainrot/contracts';
let dir:string;
function wav(seconds:number):Buffer{const samples=Math.floor(seconds*24000),buffer=Buffer.alloc(44+samples*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(24000,24);buffer.writeUInt32LE(48000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);return buffer;}
const script:VideoScript={title:'Cache',dialogue:[{speaker:'motu',text:'Why is this value old?'},{speaker:'patlu',text:'The cache holds a separate copy.'},{speaker:'motu',text:'When should that copy change?'},{speaker:'patlu',text:'Invalidate it after the database write succeeds.'}]};
beforeEach(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-local-speech-'));vi.resetModules();vi.stubEnv('BRAINROT_SKIP_ENV','1');vi.stubEnv('BRAINROTTEN_SPEECH_BACKEND','maya-local');vi.stubEnv('BRAINROTTEN_ROOT',path.join(dir,'workspace'));vi.stubEnv('BRAINROTTEN_LOCAL_VOICE_DIR',path.join(dir,'local'));vi.stubEnv('BRAINROT_DATA_DIR',path.join(dir,'data'));vi.stubEnv('ELEVENLABS_API_KEY','');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('No paid provider or download in tests')));});
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await fs.rm(dir,{recursive:true,force:true});});
describe('explicit local reference speech',()=>{
  it('keeps punctuation with its measured word without crossing a speaker turn',async()=>{const {mergeLocalPunctuation}=await import('./localVoice.js');const result=mergeLocalPunctuation([{text:'Why',speaker:'motu',turnIndex:0,startMs:0,endMs:400},{text:'?',speaker:'motu',turnIndex:0,startMs:400,endMs:450},{text:'Yes',speaker:'patlu',turnIndex:1,startMs:500,endMs:900},{text:'.',speaker:'patlu',turnIndex:1,startMs:900,endMs:950}]);expect(result.map(w=>w.text)).toEqual(['Why?','Yes.']);expect(result[0]!.endMs).toBe(450);expect(result[1]!.turnIndex).toBe(1);});
  it('fails a cold local engine without loading a model or falling back to ElevenLabs',async()=>{const {synthesizeDialogue}=await import('./providers.js');await expect(synthesizeDialogue(script,GenerateVideoInputSchema.parse({script}),path.join(dir,'data'))).rejects.toThrow('not prepared');expect(fetch).not.toHaveBeenCalled();});
  it('routes through the local worker, preserves script/speaker timing, and reuses completed speech',async()=>{
    const {localVoicePaths,LOCAL_VOICE_REVISION,LOCAL_VOICE_SOURCES}=await import('./localVoice.js');const p=localVoicePaths();
    for(const file of [p.python,p.worker,path.join(p.model,'config.json'),path.join(dir,'workspace',LOCAL_VOICE_SOURCES.motu),path.join(dir,'workspace',LOCAL_VOICE_SOURCES.patlu)])await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(p.worker,'# synthetic worker fixture');await fs.writeFile(path.join(p.model,'config.json'),'{}');await fs.writeFile(p.marker,JSON.stringify({modelRevision:LOCAL_VOICE_REVISION,precision:'bf16',conditioning:'icl_spk'}));
    await fs.writeFile(path.join(dir,'workspace',LOCAL_VOICE_SOURCES.motu),wav(.3));await fs.writeFile(path.join(dir,'workspace',LOCAL_VOICE_SOURCES.patlu),wav(.3));
    const referenceDir=path.join(p.root,'references');await fs.mkdir(referenceDir,{recursive:true});const refs:Record<string,unknown>={};for(const [id,source]of [['motu',LOCAL_VOICE_SOURCES.motu],['patlu',LOCAL_VOICE_SOURCES.patlu]]){const data=await fs.readFile(path.join(dir,'workspace',source!));await fs.writeFile(path.join(referenceDir,id+'.wav'),data);const hash=createHash('sha256').update(data).digest('hex');refs[id!]={file:id+'.wav',text:'Synthetic reference words.',language:'hi',sourceHash:hash,referenceHash:hash};}await fs.writeFile(path.join(referenceDir,'index.json'),JSON.stringify({voices:refs}));
    // Synthetic offline worker fixture: this tests orchestration, not model quality.
    await fs.writeFile(p.python,`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const req=JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--request')+1]));const out=process.argv[process.argv.indexOf('--output')+1];fs.appendFileSync(path.join(out,'invocations'),'1');
fs.copyFileSync(${JSON.stringify(path.join(dir,'fixture.wav'))},path.join(out,'source.wav'));
const segments=req.dialogue.map((line,i)=>({...line,turnIndex:i,startMs:i*1000,endMs:(i+1)*1000}));const words=segments.flatMap(s=>s.text.split(' ').map((text,i,all)=>({speaker:s.speaker,turnIndex:s.turnIndex,text,startMs:s.startMs+i*1000/all.length,endMs:s.startMs+(i+1)*1000/all.length})));
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({durationSeconds:4,segments,words}));
`,{mode:0o700});await fs.writeFile(path.join(dir,'fixture.wav'),wav(4));
    const {synthesizeDialogue}=await import('./providers.js');const input=GenerateVideoInputSchema.parse({script,voiceBackend:'maya-local'}),data=path.join(dir,'data');const first=await synthesizeDialogue(script,input,data),second=await synthesizeDialogue(script,input,data);
    expect(first.audioPath).toBe(second.audioPath);expect(first.segments.map(s=>s.speaker)).toEqual(['motu','patlu','motu','patlu']);expect(first.durationSeconds).toBeCloseTo(4/1.12);expect((await fs.readFile(path.join(path.dirname(first.audioPath),'invocations'),'utf8'))).toBe('1');expect(fetch).not.toHaveBeenCalled();
  });
});
