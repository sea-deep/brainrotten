import {LearningPackSchema,type LearningPack,type VideoScript,type VideoFormat,type VideoLanguageSchema} from '@brainrot/contracts';
import type {z} from 'zod/v4';
import type {VoiceResult} from './providers.js';
import {captionGroups} from './render.js';

export function createLearningPack(jobId:string,script:VideoScript,voice:VoiceResult,format:VideoFormat,language:z.infer<typeof VideoLanguageSchema>):LearningPack{
  const total=Math.round(voice.durationSeconds*1000);
  const transcript=voice.segments.map((segment,index)=>({...segment,turnIndex:segment.turnIndex??index,startMs:Math.max(0,Math.min(total-1,Math.round(segment.startMs))),endMs:Math.min(total,Math.max(1,Math.round(segment.endMs)))}));
  const legacy=script.question?[{...script.question,id:'q1',explanation:script.question.explanation||'Review the explanation in the linked turns.',turnIndices:[...new Set([0,script.dialogue.length-1])]}]:[];
  const questions=(script.questions??legacy).map((question,index)=>{
    const turns=transcript.filter(turn=>question.turnIndices.includes(turn.turnIndex));
    return{...question,id:question.id??`q${index+1}`,startMs:Math.min(...turns.map(turn=>turn.startMs)),endMs:Math.max(...turns.map(turn=>turn.endMs))};
  });
  return LearningPackSchema.parse({schemaVersion:'BrainrottenLearningPackV1',jobId,format,title:script.title,language,durationSeconds:voice.durationSeconds,takeaway:script.takeaway??script.dialogue.at(-1)!.text,questions,flashcards:questions.map(q=>({id:q.id,front:q.prompt,back:`${q.choices[q.answer]} — ${q.explanation}`,startMs:q.startMs,endMs:q.endMs})),transcript,chapters:transcript.map(turn=>({id:`turn-${turn.turnIndex}`,title:script.dialogue[turn.turnIndex]?.scene?.heading??turn.text.split(/\s+/).slice(0,8).join(' '),startMs:turn.startMs,endMs:turn.endMs}))});
}
const stamp=(ms:number)=>{const n=Math.max(0,Math.round(ms));return`${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;};
export function subtitlesFor(voice:VoiceResult):string{return captionGroups(voice.words,voice.segments).map((group,index)=>`${index+1}\n${stamp(group.startMs)} --> ${stamp(group.endMs)}\n${group.words.map(word=>word.text).join(' ').replace(/[\r\n]+/g,' ').replace(/[<>]/g,'')}\n`).join('\n');}
const plain=(text:string)=>text.replace(/[\\`*_{}[\]<>#|]/g,'\\$&').replace(/[\r\n]+/g,' ');
const time=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
export function learningNotes(pack:LearningPack):string{
  return[`# ${plain(pack.title)}`,`\n${pack.format} · ${pack.language} · ${Math.round(pack.durationSeconds)} seconds`,`\n## Takeaway\n\n${plain(pack.takeaway)}`,'\n## Chapters\n',...pack.chapters.map(chapter=>`- ${time(chapter.startMs)} — ${plain(chapter.title)}`),...(pack.questions.length?['\n## Check your understanding\n',...pack.questions.flatMap((q,index)=>[`${index+1}. ${plain(q.prompt)}`,...q.choices.map((choice,i)=>`   - ${String.fromCharCode(65+i)}. ${plain(choice)}`),`\n   Answer: ${String.fromCharCode(65+q.answer)}. ${plain(q.explanation)}`,`   Replay: ${time(q.startMs)}–${time(q.endMs)}\n`])]:[]),'\n## Transcript\n',...pack.transcript.map(turn=>`**${time(turn.startMs)} · ${plain(turn.speaker)}** ${plain(turn.text)}\n`)].join('\n')+'\n';
}

/** RFC-style quoted CSV, with spreadsheet formula prefixes neutralized. */
export function flashcardsCsv(pack:LearningPack):string{
  const cell=(value:string)=>'"'+(/^\s*[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';
  const cards=pack.flashcards??pack.questions.map(q=>({front:q.prompt,back:`${q.choices[q.answer]} — ${q.explanation}`,startMs:q.startMs,endMs:q.endMs}));
  return[['Front','Back','Replay start (seconds)','Replay end (seconds)'],...cards.map(card=>[card.front,card.back,String(card.startMs/1000),String(card.endMs/1000)])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
