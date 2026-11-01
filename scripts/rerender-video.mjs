// Rebuild visuals from an existing completed MP3. Never calls Paper or ElevenLabs.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {VideoManifestSchema} from '../packages/contracts/dist/index.js';
import {prepareBroll,renderVideo,resolveBackground,workspaceRoot,learningNotes,subtitlesFor,flashcardsCsv} from '../packages/media/dist/index.js';
const id=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(id??''))throw new Error('Usage: pnpm video:rerender <job UUID>');
const dir=path.join(process.env.BRAINROT_DATA_DIR??path.join(os.homedir(),'.local/share/brainrot'),'videos-v2',id);
const record=JSON.parse(await fs.readFile(path.join(dir,'job.json'),'utf8'));
const manifest=VideoManifestSchema.parse(JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8')));
const audioPath=path.join(dir,'audio.mp3');await fs.access(audioPath);
const voice={audioPath,durationSeconds:manifest.durationSeconds,segments:manifest.segments,words:manifest.words};
const staging=await fs.mkdtemp(path.join(dir,'.rerender-'));
const cachedImages=new Map();
for(const [index,line]of manifest.script.dialogue.entries()){const visuals=line.brollSequence??(line.broll?[line.broll]:[]);for(const[position,visual]of visuals.entries()){if(visual.kind!=='image')continue;const name=visuals.length===1?`broll-${index}.png`:`broll-${index}-${position}.png`;const cue=manifest.broll.find(c=>c.kind==='image'&&c.imageFile===name);if(cue?.imageFile){const file=path.join(dir,cue.imageFile);try{await fs.access(file);cachedImages.set(`${index}:${position}`,file);}catch{/*Fetch the explicitly requested original if its local copy is missing.*/}}}}
const visuals=record.input.broll?await prepareBroll(manifest.script,voice,staging,cachedImages):{cues:[],credits:[]};
const sources=JSON.parse(await fs.readFile(path.join(workspaceRoot,'apps/companion/assets/gameplay/sources.json'),'utf8'));
const credit=manifest.sourceCredits.find(c=>sources.clips.some(s=>s.sourceUrl===c.url));
const bg=credit?sources.clips.find(s=>s.sourceUrl===credit.url):null;
const format=manifest.schemaVersion==='BrainrottenPlaybackManifestV3'?manifest.format:'skit';
const supplied=format==='skit'?resolveBackground(bg?.id??'auto',id):null;
const backgroundPath=supplied?.file;
const result=await renderVideo({...voice,jobId:id,title:manifest.title,format,script:manifest.script,style:record.input.style,broll:visuals.cues,outputDir:staging,backgroundPath,onProgress:p=>{if(Math.floor(p*100)%20===0)process.stderr.write(`Rendering ${Math.floor(p*100)}%\n`);}});
for(const name of await fs.readdir(staging))await fs.rename(path.join(staging,name),path.join(dir,name));
await fs.rm(staging,{recursive:true,force:true});
manifest.broll=visuals.cues.map(({imagePath,...cue})=>({...cue,...(imagePath?{imageFile:path.basename(imagePath)}:{})}));
manifest.sourceCredits=[...new Map([...(cachedImages.size?manifest.sourceCredits:[]),...(supplied?.credits??[]),...visuals.credits].map(item=>[item.url,item])).values()];
record.job.sourceCredits=manifest.sourceCredits;record.job.backgroundName=supplied?.name??(format==='whiteboard'?'Whiteboard diagrams':'Case file');record.input.background=bg?.id??'auto';
const revision=Date.now();record.job.updatedAt=new Date(revision).toISOString();
record.job.videoUrl=`/api/v1/videos/${id}/video?v=${revision}`;
record.job.posterUrl=`/api/v1/videos/${id}/poster?v=${revision}`;
if(manifest.schemaVersion==='BrainrottenPlaybackManifestV3'){record.job.learning=manifest.learning;record.job.outputs={learningUrl:`/api/v1/videos/${id}/learning`,notesUrl:`/api/v1/videos/${id}/notes`,captionsUrl:`/api/v1/videos/${id}/captions`,flashcardsUrl:`/api/v1/videos/${id}/flashcards`};await fs.writeFile(path.join(dir,'learning.json'),JSON.stringify(manifest.learning,null,2));await fs.writeFile(path.join(dir,'notes.md'),learningNotes(manifest.learning));await fs.writeFile(path.join(dir,'captions.srt'),subtitlesFor(voice));await fs.writeFile(path.join(dir,'flashcards.csv'),flashcardsCsv(manifest.learning));}
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(dir,'job.json'),JSON.stringify(record,null,2),{mode:0o600});
console.log(path.join(dir,path.basename(result.videoPath)));
