import {GenerateVideoInputSchema} from '@brainrot/contracts';
import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {resolveVisuals,timeVisuals,resolveBackground,generateVideoArtifact} from './engine.js';
afterEach(()=>vi.unstubAllGlobals());
describe('completed-video visual repair',()=>{
  it('keeps multiple reference images distinct and times them without overlap inside one turn',async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-sequence-'));try{const cache=new Map<string,string>();for(const [position,color]of ['red','blue'].entries()){const file=path.join(directory,position+'.png');await sharp({create:{width:12,height:12,channels:3,background:color}}).png().toFile(file);cache.set(`0:${position}`,file);}const fetch=vi.fn().mockRejectedValue(new Error('Offline fixture'));vi.stubGlobal('fetch',fetch);const resolved=await resolveVisuals({title:'Two states',dialogue:[{speaker:'motu',text:'The GPU and system RAM are separate.',brollSequence:[{kind:'image',query:'GPU',caption:'GPU'},{kind:'image',query:'RAM',caption:'RAM'}]},{speaker:'patlu',text:'Compare their separate capacities.'}]},path.join(directory,'out'),directory,cache);expect(resolved.items).toHaveLength(2);expect(new Set(resolved.items.map(item=>item.cue.imagePath)).size).toBe(2);const cues=timeVisuals(resolved.items,{audioPath:'fixture',durationSeconds:8,words:[],segments:[{speaker:'motu',turnIndex:0,text:'First',startMs:0,endMs:6000},{speaker:'patlu',turnIndex:1,text:'Second',startMs:6000,endMs:8000}]});expect(cues.map(cue=>[cue.startMs,cue.endMs])).toEqual([[0,3000],[3000,6000]]);expect(fetch).not.toHaveBeenCalled();}finally{await fs.rm(directory,{recursive:true,force:true});}});
  it('reuses the selected image without searching again and keeps the new caption',async()=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-reuse-'));
    try{
      const original=path.join(directory,'selected.png');await sharp({create:{width:12,height:12,channels:3,background:'#9466aa'}}).png().toFile(original);
      const fetch=vi.fn().mockRejectedValue(new Error('No network permitted in this repair'));vi.stubGlobal('fetch',fetch);
      const result=await resolveVisuals({title:'Cached result',dialogue:[{speaker:'jhaplu',text:'Cache-e ager copy ache.',broll:{kind:'image',query:'not queried',caption:'Ager copy'}},{speaker:'taplu',text:'Write-er pore entry delete kor.'}]},path.join(directory,'repair'),directory,new Map([[0,original]]));
      expect(fetch).not.toHaveBeenCalled();expect(result.items[0]!.cue.caption).toBe('Ager copy');expect(await fs.readFile(result.items[0]!.cue.imagePath!)).toEqual(await fs.readFile(original));expect(result.credits).toEqual([]);
    }finally{await fs.rm(directory,{recursive:true,force:true});}
  });
});

describe('supplied gameplay only',()=>{
  it('fails before any paid request when required footage is absent',async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-bg-'));try{expect(()=>resolveBackground('minecraft-lava','11111111-1111-4111-8111-111111111111',directory)).toThrow('missing');}finally{await fs.rm(directory,{recursive:true,force:true});}});
  it('uses a supplied clip with its original source and never generates a fallback',async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-bg-'));try{await fs.writeFile(path.join(directory,'minecraft-lava.mp4'),'fixture');await fs.writeFile(path.join(directory,'sources.json'),JSON.stringify({clips:[{id:'minecraft-lava',title:'User clip',sourceUrl:'https://www.youtube.com/watch?v=LofyMQts7hY',attribution:'User-supplied source'}]}));const selected=resolveBackground('minecraft-lava','11111111-1111-4111-8111-111111111111',directory);expect(selected.file).toBe(path.join(directory,'minecraft-lava.mp4'));expect(selected.credits[0]!.url).toContain('LofyMQts7hY');}finally{await fs.rm(directory,{recursive:true,force:true});}});
  it('rejects a legacy animated-background input before scripting or speech',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const input={...GenerateVideoInputSchema.parse({prompt:'Cache'}),background:'procedural'} as unknown as ReturnType<typeof GenerateVideoInputSchema.parse>;await expect(generateVideoArtifact(input,{jobId:'11111111-1111-4111-8111-111111111111',dataDir:'/unused',outputDir:'/unused'})).rejects.toThrow('supplied gameplay');expect(fetch).not.toHaveBeenCalled();});
});
