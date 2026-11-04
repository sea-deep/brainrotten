import {MAX_VIDEO_SECONDS} from './duration.js';
import {z} from 'zod/v4';

export const VideoFormatSchema=z.enum(['skit','casefile','whiteboard','pov','groupchat','prreview','sketch','tierlist']);
export type VideoFormat=z.infer<typeof VideoFormatSchema>;
export const VIDEO_FORMATS=[
  {id:'skit' as const,name:'Character skit',description:'Two characters work through a situation, with connected follow-up questions.',speakers:2,visuals:'Supplied gameplay, speaking character and reference inserts.'},
  {id:'sketch' as const,name:'Sketch board',description:'A presenter sketches the system in Excalidraw style while explaining it: boxes, arrows, a red marker on the problem and the fix.',speakers:1,visuals:'Hand-drawn Excalidraw-style diagram that builds up beat by beat, over supplied gameplay.'},
  {id:'prreview' as const,name:'PR review',description:'A reviewer roasts the actual change, line by line, in a GitHub-style pull request.',speakers:2,visuals:'GitHub-style diff with focused lines, inline review comments and a verdict, over supplied gameplay.'},
  {id:'tierlist' as const,name:'Tier list',description:'A presenter ranks the options against one stated criterion, S to F, one placement and reason at a time.',speakers:1,visuals:'TierMaker-style S–F board with icon tiles and an unranked tray, over supplied gameplay.'},
  {id:'groupchat' as const,name:'Group chat',description:'The stack texts each other: the app, the API, Redis or Postgres become members of a WhatsApp-style group.',speakers:4,visuals:'WhatsApp-style group thread with icon avatars over supplied gameplay.'},
  {id:'casefile' as const,name:'Case file',description:'Follow a failure from symptom to investigation, consequence and fix.',speakers:1,visuals:'Code, reference images and a timed investigation outline.'},
  {id:'whiteboard' as const,name:'Whiteboard',description:'A narrator explains the mechanism with animated diagrams.',speakers:1,visuals:'Script-defined nodes and connections, code and reference inserts.'},
  {id:'pov' as const,name:'POV journey',description:'Follow one request, write or allocation through the system.',speakers:1,visuals:'A request passport with checkpoints, live state and explanatory inserts.'},
] as const;
/** Slide-style narrated formats stay readable for existing videos but are no longer offered for new ones. */
export const RETIRED_FORMATS=new Set<string>(['casefile','whiteboard','pov']);
export const CREATABLE_FORMATS=VIDEO_FORMATS.filter(format=>!RETIRED_FORMATS.has(format.id));
export function retiredFormatMessage(format:string):string|undefined{
  return RETIRED_FORMATS.has(format)?`The ${format} format is retired for new videos. Use ${CREATABLE_FORMATS.map(f=>f.id).join(', ')}.`:undefined;
}
export const DiagramSchema=z.object({
  nodes:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),label:z.string().trim().min(1).max(64)})).min(2).max(4),
  edges:z.array(z.object({from:z.string(),to:z.string()})).min(1).max(6),
}).superRefine((diagram,ctx)=>{
  const ids=new Set(diagram.nodes.map(node=>node.id));
  if(ids.size!==diagram.nodes.length)ctx.addIssue({code:'custom',path:['nodes'],message:'Node IDs must be distinct'});
  const edges=new Set<string>();
  diagram.edges.forEach((edge,index)=>{if(!ids.has(edge.from)||!ids.has(edge.to)||edge.from===edge.to)ctx.addIssue({code:'custom',path:['edges',index],message:'Connect two different existing node IDs'});const key=edge.from+'>'+edge.to;if(edges.has(key))ctx.addIssue({code:'custom',path:['edges',index],message:'Connections must be distinct'});edges.add(key);});
});
export type VideoDiagram=z.infer<typeof DiagramSchema>;
export const SceneBeatSchema=z.enum(['setup','investigate','escalate','resolve']);
export const JourneyStepSchema=z.object({location:z.string().trim().min(1).max(48),action:z.string().trim().min(1).max(100),status:z.enum(['running','waiting','blocked','done']),state:z.array(z.object({key:z.string().trim().min(1).max(28),value:z.string().trim().min(1).max(70)})).min(1).max(3)}).refine(step=>new Set(step.state.map(item=>item.key)).size===step.state.length,'State keys must be distinct');
export const VideoSceneSchema=z.object({beat:SceneBeatSchema,heading:z.string().trim().min(1).max(64),diagram:DiagramSchema.optional(),journey:JourneyStepSchema.optional()});
export const ReviewQuestionSchema=z.object({
  id:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/).optional(),
  prompt:z.string().trim().min(1).max(240),
  choices:z.array(z.string().trim().min(1).max(160)).min(2).max(4),
  answer:z.number().int().min(0).max(3),explanation:z.string().trim().min(1).max(400),
  turnIndices:z.array(z.number().int().min(0).max(59)).min(1).max(4),
}).superRefine((q,ctx)=>{
  if(q.answer>=q.choices.length)ctx.addIssue({code:'custom',path:['answer'],message:'Answer must reference a choice'});
  if(new Set(q.choices.map(choice=>choice.toLowerCase())).size!==q.choices.length)ctx.addIssue({code:'custom',path:['choices'],message:'Choices must be distinct'});
  if(new Set(q.turnIndices).size!==q.turnIndices.length)ctx.addIssue({code:'custom',path:['turnIndices'],message:'Replay turn references must be distinct'});
});
export const LearningPackSchema=z.object({
  schemaVersion:z.literal('BrainrottenLearningPackV1'),jobId:z.string().uuid(),format:VideoFormatSchema,
  title:z.string().min(1).max(140),language:z.enum(['en','hinglish','benglish','hi']),durationSeconds:z.number().positive().max(MAX_VIDEO_SECONDS),
  takeaway:z.string().min(1).max(650),
  chapters:z.array(z.object({id:z.string(),title:z.string(),startMs:z.number().nonnegative(),endMs:z.number().positive()})).min(1).max(60),
  questions:z.array(ReviewQuestionSchema.safeExtend({id:z.string(),startMs:z.number().nonnegative(),endMs:z.number().positive()})).max(3),
  flashcards:z.array(z.object({id:z.string(),front:z.string().max(240),back:z.string().max(600),startMs:z.number().nonnegative(),endMs:z.number().positive()})).max(3).optional(),
  transcript:z.array(z.object({turnIndex:z.number().int().nonnegative(),speaker:z.string(),text:z.string(),startMs:z.number().nonnegative(),endMs:z.number().positive()})).min(1).max(60),
}).superRefine((pack,ctx)=>{
  const limit=Math.round(pack.durationSeconds*1000),turns=new Set(pack.transcript.map(turn=>turn.turnIndex));
  for(const key of ['chapters','questions','transcript'] as const){
    const rows=pack[key];
    rows.forEach((row,index)=>{if(row.endMs<=row.startMs||row.endMs>limit)ctx.addIssue({code:'custom',path:[key,index],message:'Replay timing must be ordered and within the video'});});
    const ids=key==='transcript'?pack.transcript.map(row=>row.turnIndex):key==='chapters'?pack.chapters.map(row=>row.id):pack.questions.map(row=>row.id);
    if(new Set<string|number>(ids).size!==ids.length)ctx.addIssue({code:'custom',path:[key],message:'Entries must have distinct identifiers'});
  }
  pack.flashcards?.forEach((card,index)=>{if(card.endMs<=card.startMs||card.endMs>limit)ctx.addIssue({code:'custom',path:['flashcards',index],message:'Flashcard timing must be within the video'});});
  pack.questions.forEach((question,index)=>{if(question.turnIndices.some(turn=>!turns.has(turn)))ctx.addIssue({code:'custom',path:['questions',index,'turnIndices'],message:'Replay references must identify transcript turns'});});
});
export type LearningPack=z.infer<typeof LearningPackSchema>;
export type ReviewQuestion=z.infer<typeof ReviewQuestionSchema>;
