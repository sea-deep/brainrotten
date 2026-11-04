import {MAX_VIDEO_SECONDS} from './duration.js';
import { z } from 'zod/v4';
import {VideoFormatSchema,VideoSceneSchema,DiagramSchema,JourneyStepSchema,ReviewQuestionSchema,LearningPackSchema} from './videoFormats.js';

export const CharacterIdSchema = z.enum(['oggy', 'jack', 'badri', 'budhdev', 'jhaplu', 'paplu', 'taplu','motu','patlu','chingum','ghasitaram','jhatka','john']);
export type CharacterId = z.infer<typeof CharacterIdSchema>;
export const CastIdSchema = z.enum(['auto','custom','oggy-jack', 'badri-budhdev', 'jhaplu-paplu-taplu','motu-patlu']);
export const ParticipantsSchema=z.object({learner:CharacterIdSchema.describe('The chosen learner: asks focused questions throughout the video'),expert:CharacterIdSchema.describe('The chosen expert: gives direct substantive answers throughout the video')}).refine(pair=>pair.learner!==pair.expert,'Choose two different characters');
export type Participants=z.infer<typeof ParticipantsSchema>;
export const CAST_MEMBERS:Record<z.infer<typeof CastIdSchema>,readonly CharacterId[]>={auto:CharacterIdSchema.options,custom:CharacterIdSchema.options,'oggy-jack':['oggy','jack'],'badri-budhdev':['badri','budhdev'],'jhaplu-paplu-taplu':['jhaplu','paplu','taplu'],'motu-patlu':['motu','patlu']};
export const VideoLanguageSchema=z.enum(['en','hinglish','benglish']);
export const ScriptProviderIdSchema=z.enum(['paper','gemini']);
export const ScriptProviderPreferenceSchema=z.enum(['auto','paper','gemini']);
export const ScriptSettingsSchema=z.object({provider:ScriptProviderPreferenceSchema}).strict();
export const ProviderKeysSchema=z.object({paper:z.string().trim().min(10).max(500).optional(),gemini:z.string().trim().min(10).max(500).optional(),elevenlabs:z.string().trim().min(10).max(500).optional(),brave:z.string().trim().min(10).max(500).optional()}).strict();
// Historical exports keep their original language metadata.
const PlaybackLanguageSchema=z.enum(['en','hinglish','benglish','hi']);
export const CharacterGuideInputSchema=z.object({cast:CastIdSchema.default('auto'),participants:ParticipantsSchema.optional(),language:VideoLanguageSchema.default('hinglish')});
export const FormatGuideInputSchema=z.object({format:VideoFormatSchema.optional(),language:VideoLanguageSchema.default('hinglish')});
export const BackgroundIdSchema = z.enum(['auto', 'minecraft-lava', 'minecraft-end', 'subway-surfers', 'gta-stunts']);
export const ImageBrollSchema=z.object({
  kind:z.literal('image'),query:z.string().trim().min(1).max(200).optional(),url:z.url().optional(),thumbnailUrl:z.url().optional(),caption:z.string().max(100).default(''),sourceUrl:z.url().optional(),title:z.string().max(300).optional(),
}).refine(v=>Boolean(v.query||v.url),'Provide an image query or URL');
export const ImageSearchInputSchema=z.object({query:z.string().trim().min(2).max(200)});
export const ImageSearchProviderSchema=z.enum(['google','brave','commons']);
export const ImageSearchResultSchema=z.object({query:z.string(),imageUrl:z.url(),thumbnailUrl:z.url().optional(),sourceUrl:z.url(),title:z.string(),provider:ImageSearchProviderSchema});
export type ImageSearchResult=z.infer<typeof ImageSearchResultSchema>;
export const CognitoSettingsSchema=z.object({domain:z.url().refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&/^[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/.test(u.hostname);}catch{return false;}},'Use the Cognito HTTPS domain, without an authorize path'),userPoolId:z.string().regex(/^[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/),clientId:z.string().regex(/^[a-z0-9]{10,128}$/)});
export type CognitoSettings=z.infer<typeof CognitoSettingsSchema>;
export const McpSetupSchema=z.object({command:z.string(),entryPath:z.string(),projectPath:z.string(),owner:z.literal('Cflash'),tokenConfigured:z.boolean()});
export const BrollSchema=z.union([
  z.object({kind:z.literal('code'),code:z.string().min(1).max(4000),language:z.string().max(30).default('text')}),ImageBrollSchema,
]);
export type Broll = z.infer<typeof BrollSchema>;
export const VoiceBackendSchema=z.enum(['elevenlabs','maya-local']);
export const SpeechSettingsSchema=z.object({backend:VoiceBackendSchema});
export const VoiceToneSchema=z.enum(['neutral','curious','thoughtful','amused','confident','concerned']);
export const VoiceModeSchema=z.enum(['faithful','natural','expressive']);
const IconSchema=z.string().trim().regex(/^[A-Za-z0-9 .+-]{1,60}$/).describe('A Lucide icon name ("database", "zap", "user") or a Simple Icons brand ("github", "postgresql")');
/** Reactions a member can tap under a chat message. A fixed set keeps rendering reliable. */
export const ChatReactionSchema=z.enum(['😂','💀','😭','👍','🔥','😳','🙏','❤️','🤡','👀']);
const EMOJI=/\p{Extended_Pictographic}/u;
export const CHAT_CODE_ROWS=8,CHAT_CODE_COLUMNS=34;
/** Per-message group-chat options. Spoken text stays speakable; display is what the bubble shows. */
export const ChatLineSchema=z.object({
  display:z.string().trim().min(1).max(200).optional().describe('Texting-style bubble text (slang, emoji, lowercase). Defaults to the spoken text.'),
  reaction:ChatReactionSchema.optional().describe('One reaction tapped under this message by another member.'),
  code:z.string().min(1).max(320).optional().describe('A short code snippet sent as its own monospace bubble right after the text. At most 8 lines, 34 columns.'),
}).superRefine((chat,ctx)=>{
  if(chat.code){const rows=chat.code.split('\n');if(rows.length>CHAT_CODE_ROWS||rows.some(row=>row.length>CHAT_CODE_COLUMNS))ctx.addIssue({code:'custom',path:['code'],message:'Keep chat code to 8 lines of at most 34 characters so it stays readable on a phone'});}
});
/**
 * Fits a chat code bubble into CHAT_CODE_ROWS x CHAT_CODE_COLUMNS: long lines wrap at a space or punctuation
 * (continuations indented two more spaces), unbreakable runs are cut with "…", and extra rows end in "…".
 * Returns the code unchanged when it already fits.
 */
export function fitChatCode(code:string):string{
  const rows=code.replace(/\t/g,'  ').split('\n').map(row=>row.trimEnd());
  while(rows.length&&!rows.at(-1))rows.pop();
  if(rows.length<=CHAT_CODE_ROWS&&rows.every(row=>row.length<=CHAT_CODE_COLUMNS))return rows.join('\n')||code;
  const out:string[]=[];
  for(const row of rows){
    const indent=row.match(/^\s*/)![0];let rest=row;
    while(rest.length>CHAT_CODE_COLUMNS){
      const window=rest.slice(0,CHAT_CODE_COLUMNS+1);
      // Prefer a space or a comma/bracket; split inside a dotted name only when nothing else fits.
      const soft=Math.max(window.lastIndexOf(' '),...[',','(','{','[',';'].map(mark=>window.lastIndexOf(mark)+1));
      const cut=soft>indent.length+2?soft:window.lastIndexOf('.')+1;
      if(cut<=indent.length+2){out.push(rest.slice(0,CHAT_CODE_COLUMNS-1)+'…');rest='';break;}
      out.push(rest.slice(0,cut).trimEnd());
      rest=(indent+'  '+rest.slice(cut).trimStart()).slice(0,400);
      if(rest.trim()==='')rest='';
    }
    if(rest)out.push(rest);
  }
  if(out.length>CHAT_CODE_ROWS){out.length=CHAT_CODE_ROWS-1;out.push('…');}
  return out.join('\n');
}
/** Applies fitChatCode to every chat code bubble in raw (unparsed) script JSON, before schema validation. */
export function fitChatCodeInRawScript(raw:unknown):number{
  let fitted=0;
  const dialogue=(raw as {dialogue?:unknown})?.dialogue;
  if(Array.isArray(dialogue))for(const line of dialogue){const chat=(line as {chat?:{code?:unknown}})?.chat;
    if(chat&&typeof chat.code==='string'){const next=fitChatCode(chat.code);if(next!==chat.code){chat.code=next;fitted++;}}}
  return fitted;
}
export const GroupChatSchema=z.object({
  title:z.string().trim().min(1).max(32).describe('Group name, e.g. "checkout-prod 💀"'),
  members:z.array(z.object({
    speaker:CharacterIdSchema.describe('Voice only: a ready cloned voice that reads this member\'s messages. Characters are never drawn in group chats.'),
    name:z.string().trim().min(1).max(20).describe('Who this member is, shown in the chat, e.g. "Redis Cache", "Payment API", "Postgres", "the intern"'),
    icon:IconSchema.describe('Avatar icon: a Lucide name ("database", "zap", "smartphone") or a Simple Icons brand ("postgresql", "redis", "stripe"). get_video_formats lists suggestions.'),
    you:z.boolean().optional().describe('At most one member is "you": right-aligned green bubbles'),
  })).min(2).max(4),
}).superRefine((chat,ctx)=>{
  if(new Set(chat.members.map(m=>m.speaker)).size!==chat.members.length)ctx.addIssue({code:'custom',path:['members'],message:'Each member needs a different character voice'});
  if(new Set(chat.members.map(m=>m.name.toLowerCase())).size!==chat.members.length)ctx.addIssue({code:'custom',path:['members'],message:'Member names must be distinct'});
  if(chat.members.filter(m=>m.you).length>1)ctx.addIssue({code:'custom',path:['members'],message:'Only one member can be "you"'});
});
export type GroupChat=z.infer<typeof GroupChatSchema>;
/** Pause & Predict: after this line is spoken the video freezes on a question; the next line reveals the answer. */
export const PauseSchema=z.object({
  prompt:z.string().trim().min(5).max(140),
  choices:z.array(z.string().trim().min(1).max(60)).min(2).max(4),
  answer:z.number().int().min(0).max(3),
  seconds:z.number().int().min(3).max(10).optional().describe('Optional minimum thinking time. Brainrotten extends it to fit the reading time of the question and choices.'),
}).superRefine((pause,ctx)=>{
  if(pause.answer>=pause.choices.length)ctx.addIssue({code:'custom',path:['answer'],message:'Answer must reference a choice'});
  if(new Set(pause.choices.map(c=>c.toLowerCase())).size!==pause.choices.length)ctx.addIssue({code:'custom',path:['choices'],message:'Choices must be distinct'});
});
export const ReviewToneSchema=z.enum(['praise','question','nit','roast','blocker']);
/** Per-comment PR options: which diff lines the comment is attached to and how it reads. */
export const PrLineSchema=z.object({
  file:z.number().int().min(0).max(2).optional().describe('Index into script.pr.files; omit for the final summary comment'),
  lines:z.tuple([z.number().int().min(0),z.number().int().min(0)]).optional().describe('Inclusive [start, end] indices into that file\'s lines, at most 8 lines'),
  display:z.string().trim().min(1).max(220).optional().describe('Comment text as written in the review (markdown-free, emoji fine). Defaults to the spoken text.'),
  tone:ReviewToneSchema.default('question'),
});
export const DiffLineSchema=z.object({kind:z.enum(['add','del','ctx']),code:z.string().max(46).describe('One line of the real diff, at most 46 characters so it fits a phone')});
export const PrReviewSchema=z.object({
  title:z.string().trim().min(3).max(64),
  repo:z.string().trim().regex(/^[A-Za-z0-9_.-]{1,24}\/[A-Za-z0-9_.-]{1,32}$/).optional().describe('owner/name, shown in the header'),
  author:z.object({name:z.string().trim().min(1).max(24),icon:IconSchema}).describe('Who opened the PR, e.g. the user\'s agent ("claude-code", icon "anthropic") or the user'),
  reviewers:z.array(z.object({speaker:CharacterIdSchema.describe('Voice only; never drawn'),name:z.string().trim().min(1).max(24),icon:IconSchema})).min(1).max(2),
  files:z.array(z.object({path:z.string().trim().min(1).max(56),language:z.string().trim().max(20).default('text'),lines:z.array(DiffLineSchema).min(1).max(24)})).min(1).max(3),
  verdict:z.enum(['approve','request-changes','comment']),
}).superRefine((pr,ctx)=>{
  if(new Set(pr.reviewers.map(r=>r.speaker)).size!==pr.reviewers.length)ctx.addIssue({code:'custom',path:['reviewers'],message:'Each reviewer needs a different voice'});
  if(new Set(pr.reviewers.map(r=>r.name.toLowerCase())).size!==pr.reviewers.length)ctx.addIssue({code:'custom',path:['reviewers'],message:'Reviewer names must be distinct'});
  pr.files.forEach((file,index)=>{if(!file.lines.some(line=>line.kind!=='ctx'))ctx.addIssue({code:'custom',path:['files',index,'lines'],message:'Each file needs at least one added or removed line'});});
});
export type PrReview=z.infer<typeof PrReviewSchema>;
const SketchIdSchema=z.string().regex(/^[a-z][a-z0-9_-]{0,23}$/);
/** Sketch board: the system as nodes and edges. Layout, shapes, colors and drawing are Brainrotten's job. */
export const SketchSchema=z.object({
  nodes:z.array(z.object({id:SketchIdSchema,label:z.string().trim().min(1).max(28),kind:z.enum(['actor','service','store','queue','external']).default('service'),icon:IconSchema.optional()})).min(2).max(8),
  edges:z.array(z.object({from:SketchIdSchema,to:SketchIdSchema,label:z.string().trim().min(1).max(18).optional()})).max(10).default([]),
}).superRefine((sketch,ctx)=>{
  const ids=new Set(sketch.nodes.map(n=>n.id));
  if(ids.size!==sketch.nodes.length)ctx.addIssue({code:'custom',path:['nodes'],message:'Node ids must be distinct'});
  const pairs=new Set<string>();
  sketch.edges.forEach((edge,index)=>{
    if(!ids.has(edge.from)||!ids.has(edge.to)||edge.from===edge.to)ctx.addIssue({code:'custom',path:['edges',index],message:'Connect two different existing node ids'});
    const key=edge.from+'>'+edge.to;if(pairs.has(key))ctx.addIssue({code:'custom',path:['edges',index],message:'Edges must be distinct'});pairs.add(key);
  });
});
export type Sketch=z.infer<typeof SketchSchema>;
/** Per-line sketch beat: what appears, what is highlighted, and an optional handwritten note. Ids are node ids or "from>to" edges. */
export const SketchLineSchema=z.object({
  show:z.array(z.string().max(50)).max(6).optional().describe('Elements that appear on this line (node ids or "from>to")'),
  focus:z.array(z.string().max(50)).max(4).optional().describe('Elements to highlight while this line is spoken'),
  mark:z.enum(['problem','fix']).optional().describe('Color the focused elements as the problem (red) or the fix (green)'),
  note:z.object({text:z.string().trim().min(1).max(40),near:z.string().max(50)}).optional().describe('A short red marker note next to an element'),
});
export const TierSchema=z.enum(['S','A','B','C','D','F']);
/** Tier list: one criterion and the items to rank. The board, colors and tiles are Brainrotten's job. */
export const TierListSchema=z.object({
  criterion:z.string().trim().min(3).max(60).describe('What the ranking measures, shown on screen the whole time, e.g. "survives a lost response"'),
  items:z.array(z.object({id:SketchIdSchema,label:z.string().trim().min(1).max(24),icon:IconSchema.optional()})).min(3).max(8),
}).superRefine((list,ctx)=>{if(new Set(list.items.map(i=>i.id)).size!==list.items.length)ctx.addIssue({code:'custom',path:['items'],message:'Item ids must be distinct'});});
export const TierLineSchema=z.object({
  place:z.object({item:SketchIdSchema,tier:TierSchema}).optional().describe('Put this item in a tier on this line'),
  focus:SketchIdSchema.optional().describe('Hold up an item being discussed before it is placed'),
});
export const ScriptLineSchema = z.object({
  speaker: CharacterIdSchema,
  text: z.string().trim().min(1).max(650),
  tone:VoiceToneSchema.optional().describe('Subtle delivery cue, separate from spoken/caption text. Omit for the reference voice’s normal tone.'),
  scene:VideoSceneSchema.optional(),
  broll: BrollSchema.optional(),
  brollSequence:z.array(BrollSchema).min(1).max(4).optional().describe('Ordered reference images/code for this spoken turn. Replaces broll when present; split the turn time among the inserts. Use distinct relevant views for comparisons and changes.'),
  chat:ChatLineSchema.optional().describe('Group chat formats only.'),
  pr:PrLineSchema.optional().describe('PR review format only.'),
  sketch:SketchLineSchema.optional().describe('Sketch board format only.'),
  tier:TierLineSchema.optional().describe('Tier list format only.'),
  pause:PauseSchema.optional().describe('Pause & Predict after this line; the next line must reveal the answer.'),
});
export const VideoScriptSchema = z.object({
  title:z.string().min(1).max(100),
  participants:ParticipantsSchema.optional(),
  narrator:CharacterIdSchema.optional(),
  chat:GroupChatSchema.optional().describe('Group chat formats only: group name and members.'),
  pr:PrReviewSchema.optional().describe('PR review format only: the pull request, its real diff and reviewers.'),
  sketch:SketchSchema.optional().describe('Sketch board format only: the nodes and edges to draw.'),
  tierlist:TierListSchema.optional().describe('Tier list format only: the criterion and items.'),
  dialogue:z.array(ScriptLineSchema).min(2).max(60),
  takeaway:z.string().max(240).optional(),
  questions:z.array(ReviewQuestionSchema).min(1).max(3).optional(),
  question:z.object({prompt:z.string().min(1).max(240), choices:z.array(z.string().min(1).max(160)).min(2).max(4), answer:z.number().int().min(0).max(3), explanation:z.string().max(300)})
    .refine(q=>q.answer<q.choices.length,'Answer must reference a choice').optional(),
}).refine(s=>s.dialogue.reduce((n,line)=>n+line.text.length,0)<=10000,'Dialogue must stay within 10,000 characters').superRefine((script,ctx)=>{
  const pauses=script.dialogue.flatMap((line,index)=>line.pause?[index]:[]);
  if(pauses.length>2)ctx.addIssue({code:'custom',path:['dialogue'],message:'Use at most two Pause & Predict moments'});
  pauses.filter(index=>index<2).forEach(index=>ctx.addIssue({code:'custom',path:['dialogue',index,'pause'],message:'Give the viewer context first: a pause needs at least two earlier lines (put it on the third line or later).'}));
  if(pauses.includes(script.dialogue.length-1))ctx.addIssue({code:'custom',path:['dialogue',script.dialogue.length-1,'pause'],message:'A pause needs a following line that reveals the answer'});
  const ids=new Set<string>();
  script.questions?.forEach((question,index)=>{
    if(question.turnIndices.some(turn=>turn>=script.dialogue.length))ctx.addIssue({code:'custom',path:['questions',index,'turnIndices'],message:'Replay references must point to a spoken turn'});
    const id=question.id??`q${index+1}`;if(ids.has(id))ctx.addIssue({code:'custom',path:['questions',index,'id'],message:'Question IDs must be distinct'});ids.add(id);
  });
});
export const QuestionAnswerScriptSchema=VideoScriptSchema.safeExtend({participants:ParticipantsSchema,dialogue:z.array(ScriptLineSchema).min(4,'Include a follow-up question and its answer').max(60)}).superRefine((script,ctx)=>{
  if(script.dialogue.length%2!==0)ctx.addIssue({code:'custom',path:['dialogue'],message:'Use complete learner/expert exchanges'});
  // The historical exported name stays stable. A skit may open with a concrete
  // mishap rather than a question; later learner turns still ask follow-ups.
  script.dialogue.forEach((line,index)=>{const expected=index%2===0?script.participants.learner:script.participants.expert;if(line.speaker!==expected)ctx.addIssue({code:'custom',path:['dialogue',index,'speaker'],message:index%2===0?'The learner introduces the problem or asks a follow-up':'The expert responds to the learner'});if(index>0&&index%2===0&&!line.text.includes('?'))ctx.addIssue({code:'custom',path:['dialogue',index,'text'],message:'A learner follow-up must include a question'});});
});
export type QuestionAnswerScript=z.infer<typeof QuestionAnswerScriptSchema>;
export function questionAnswerScript(script:z.infer<typeof VideoScriptSchema>,requested?:Participants):QuestionAnswerScript{
  if(requested&&script.participants&&(requested.learner!==script.participants.learner||requested.expert!==script.participants.expert))throw new Error('Script participants must match the requested learner and expert');
  const speakers=[...new Set(script.dialogue.map(line=>line.speaker))];
  const participants=requested??script.participants??(speakers.length===2?{learner:speakers[0],expert:speakers[1]}:undefined);
  return QuestionAnswerScriptSchema.parse({...script,participants});
}
export const NarratedScriptSchema=VideoScriptSchema.safeExtend({
  narrator:CharacterIdSchema,dialogue:z.array(ScriptLineSchema.extend({scene:VideoSceneSchema})).min(4).max(12),
}).superRefine((script,ctx)=>{
  if(script.participants)ctx.addIssue({code:'custom',path:['participants'],message:'Narrated stories use one narrator, not learner/expert participants'});
  if(script.dialogue.some(line=>line.speaker!==script.narrator))ctx.addIssue({code:'custom',path:['dialogue'],message:'Every spoken turn must use the chosen narrator'});
  if(script.dialogue[0]?.scene.beat!=='setup'||script.dialogue.at(-1)?.scene.beat!=='resolve')ctx.addIssue({code:'custom',path:['dialogue'],message:'Open with setup and end with resolve'});
  if(!script.dialogue.some(line=>line.scene.beat==='investigate')||!script.dialogue.some(line=>line.scene.beat==='escalate'))ctx.addIssue({code:'custom',path:['dialogue'],message:'Include investigation and a consequence or counterexample'});
});
export const WhiteboardScriptSchema=NarratedScriptSchema.safeExtend({dialogue:z.array(ScriptLineSchema.extend({scene:VideoSceneSchema.extend({diagram:DiagramSchema})})).min(4).max(12)});
export const PovScriptSchema=NarratedScriptSchema.safeExtend({dialogue:z.array(ScriptLineSchema.extend({scene:VideoSceneSchema.extend({journey:JourneyStepSchema})})).min(4).max(12)});
/** A WhatsApp-style group: 2–4 voiced members, one message per spoken turn. */
export const GroupChatScriptSchema=VideoScriptSchema.safeExtend({
  chat:GroupChatSchema,
  dialogue:z.array(ScriptLineSchema.extend({text:z.string().trim().min(1).max(240)})).min(4).max(16),
}).superRefine((script,ctx)=>{
  if(script.participants)ctx.addIssue({code:'custom',path:['participants'],message:'Group chats use chat.members, not learner/expert participants'});
  if(script.narrator)ctx.addIssue({code:'custom',path:['narrator'],message:'Group chats use chat.members, not a narrator'});
  const members=new Set(script.chat.members.map(m=>m.speaker));
  script.dialogue.forEach((line,index)=>{
    if(!members.has(line.speaker))ctx.addIssue({code:'custom',path:['dialogue',index,'speaker'],message:'Every message must come from a chat member'});
    if(line.scene)ctx.addIssue({code:'custom',path:['dialogue',index,'scene'],message:'Group chat messages do not use narrated scenes'});
    if(EMOJI.test(line.text))ctx.addIssue({code:'custom',path:['dialogue',index,'text'],message:'Spoken text is read aloud: put emoji in chat.display or chat.reaction instead'});
  });
  if(new Set(script.dialogue.map(line=>line.speaker)).size<2)ctx.addIssue({code:'custom',path:['dialogue'],message:'At least two members must speak'});
});
/** A GitHub-style pull request review: reviewers comment on the real diff, then give a verdict. */
export const PrReviewScriptSchema=VideoScriptSchema.safeExtend({
  pr:PrReviewSchema,
  dialogue:z.array(ScriptLineSchema.extend({text:z.string().trim().min(1).max(260)})).min(3).max(12),
}).superRefine((script,ctx)=>{
  if(script.participants)ctx.addIssue({code:'custom',path:['participants'],message:'PR reviews use pr.reviewers, not learner/expert participants'});
  if(script.narrator)ctx.addIssue({code:'custom',path:['narrator'],message:'PR reviews use pr.reviewers, not a narrator'});
  if(script.chat)ctx.addIssue({code:'custom',path:['chat'],message:'PR reviews do not use chat members'});
  const voices=new Set(script.pr.reviewers.map(r=>r.speaker));let anchored=0;
  script.dialogue.forEach((line,index)=>{
    if(!voices.has(line.speaker))ctx.addIssue({code:'custom',path:['dialogue',index,'speaker'],message:'Every comment must come from a reviewer'});
    if(line.scene||line.chat)ctx.addIssue({code:'custom',path:['dialogue',index],message:'PR comments do not use scenes or chat options'});
    if(EMOJI.test(line.text))ctx.addIssue({code:'custom',path:['dialogue',index,'text'],message:'Spoken text is read aloud: put emoji in pr.display instead'});
    const pr=line.pr;if(pr?.file===undefined)return;
    const file=script.pr.files[pr.file];
    if(!file){ctx.addIssue({code:'custom',path:['dialogue',index,'pr','file'],message:'Comment points to a file that does not exist'});return;}
    anchored++;
    if(pr.lines){const[start,end]=pr.lines;if(end<start||end>=file.lines.length||end-start>7)ctx.addIssue({code:'custom',path:['dialogue',index,'pr','lines'],message:`Use an ordered range inside the file (0–${file.lines.length-1}) of at most 8 lines`});}
  });
  if(anchored===0)ctx.addIssue({code:'custom',path:['dialogue'],message:'At least one comment must point at real diff lines'});
});
/** An Excalidraw-style sketch narrated by one voice, built up line by line. */
export const SketchScriptSchema=VideoScriptSchema.safeExtend({
  narrator:CharacterIdSchema.describe('The presenter\'s voice only; never drawn'),
  sketch:SketchSchema,
  dialogue:z.array(ScriptLineSchema.extend({text:z.string().trim().min(1).max(300)})).min(4).max(12),
}).superRefine((script,ctx)=>{
  if(script.participants)ctx.addIssue({code:'custom',path:['participants'],message:'Sketch boards use one narrator voice'});
  if(script.chat||script.pr)ctx.addIssue({code:'custom',path:['sketch'],message:'Sketch boards do not use chat or PR blocks'});
  const ids=new Set([...script.sketch.nodes.map(n=>n.id),...script.sketch.edges.map(e=>e.from+'>'+e.to)]);
  script.dialogue.forEach((line,index)=>{
    if(line.speaker!==script.narrator)ctx.addIssue({code:'custom',path:['dialogue',index,'speaker'],message:'Every line uses the narrator voice'});
    if(line.scene||line.chat||line.pr)ctx.addIssue({code:'custom',path:['dialogue',index],message:'Sketch lines use sketch beats, not scenes, chat or PR options'});
    const refs=[...(line.sketch?.show??[]),...(line.sketch?.focus??[]),...(line.sketch?.note?[line.sketch.note.near]:[])];
    refs.filter(ref=>!ids.has(ref)).forEach(ref=>ctx.addIssue({code:'custom',path:['dialogue',index,'sketch'],message:`Unknown sketch element "${ref}". Use a node id or "from>to" for an edge`}));
    if(line.sketch?.mark&&!line.sketch.focus?.length)ctx.addIssue({code:'custom',path:['dialogue',index,'sketch','mark'],message:'mark colors the focused elements; add focus'});
  });
});
/** A TierMaker-style ranking narrated by one voice: every item is placed exactly once. */
export const TierListScriptSchema=VideoScriptSchema.safeExtend({
  narrator:CharacterIdSchema.describe('The presenter\'s voice only; never drawn'),
  tierlist:TierListSchema,
  dialogue:z.array(ScriptLineSchema.extend({text:z.string().trim().min(1).max(300)})).min(4).max(12),
}).superRefine((script,ctx)=>{
  if(script.participants||script.chat||script.pr||script.sketch)ctx.addIssue({code:'custom',path:['tierlist'],message:'Tier lists use one narrator and the tierlist block only'});
  const ids=new Set(script.tierlist.items.map(i=>i.id)),placed=new Set<string>();
  script.dialogue.forEach((line,index)=>{
    if(line.speaker!==script.narrator)ctx.addIssue({code:'custom',path:['dialogue',index,'speaker'],message:'Every line uses the narrator voice'});
    if(line.scene||line.chat||line.pr||line.sketch)ctx.addIssue({code:'custom',path:['dialogue',index],message:'Tier list lines use tier beats only'});
    const place=line.tier?.place,focus=line.tier?.focus;
    if(focus&&!ids.has(focus))ctx.addIssue({code:'custom',path:['dialogue',index,'tier','focus'],message:`Unknown item "${focus}"`});
    if(!place)return;
    if(!ids.has(place.item))ctx.addIssue({code:'custom',path:['dialogue',index,'tier','place'],message:`Unknown item "${place.item}"`});
    else if(placed.has(place.item))ctx.addIssue({code:'custom',path:['dialogue',index,'tier','place'],message:`"${place.item}" is already placed; place each item once`});
    placed.add(place.item);
  });
  const missing=[...ids].filter(id=>!placed.has(id));
  if(missing.length)ctx.addIssue({code:'custom',path:['dialogue'],message:`Place every item by the end. Missing: ${missing.join(', ')}`});
});
type AnyScript=z.infer<typeof VideoScriptSchema>;
/**
 * Mechanical fixes the harness applies instead of rejecting: clamp ranges, drop duplicates and
 * dangling references, move pauses that come too early. Content and meaning are left alone.
 * Returns the fixed script and a human-readable list of what changed.
 */
export function normalizeScript(input:AnyScript,format:z.infer<typeof VideoFormatSchema>):{script:AnyScript;fixes:string[]}{
  const fixes:string[]=[],script:AnyScript=structuredClone(input),lines=script.dialogue;
  lines.forEach((line,index)=>{
    if(line.pause&&(index<2||index===lines.length-1)){delete line.pause;fixes.push(`Removed the pause on line ${index}: pauses need two earlier lines and a following reveal.`);}
  });
  if(format==='groupchat')lines.forEach((line,index)=>{
    if(EMOJI.test(line.text)){const spoken=line.text.replace(/\p{Extended_Pictographic}\uFE0F?/gu,'').replace(/\s{2,}/g,' ').trim();if(spoken){line.chat={...line.chat,display:line.chat?.display??line.text};line.text=spoken;fixes.push(`Moved emoji out of spoken text on line ${index}.`);}}
  });
  if(format==='prreview'&&script.pr){
    const files=script.pr.files;
    // Models often paste raw diff lines; the sign column is drawn by the renderer.
    let signs=0;for(const file of files)for(const row of file.lines){const sign=row.kind==='add'?'+':row.kind==='del'?'-':'';if(sign&&row.code.startsWith(sign)){row.code=row.code.slice(1);signs++;}}
    if(signs)fixes.push(`Removed ${signs} leading +/- sign(s) from diff lines; the review draws them.`);
    lines.forEach((line,index)=>{
      if(EMOJI.test(line.text)){const spoken=line.text.replace(/\p{Extended_Pictographic}\uFE0F?/gu,'').replace(/\s{2,}/g,' ').trim();if(spoken){line.pr={tone:'question',...line.pr,display:line.pr?.display??line.text};line.text=spoken;fixes.push(`Moved emoji out of spoken text on line ${index}.`);}}
      const pr=line.pr;if(!pr||pr.file===undefined)return;
      const file=files[pr.file];
      if(!file){delete pr.file;delete pr.lines;fixes.push(`Line ${index} pointed at a missing file; it is now a summary comment.`);return;}
      if(pr.lines){const last=file.lines.length-1;let[start,end]=pr.lines;const before=`${start}-${end}`;
        start=Math.max(0,Math.min(start,last));end=Math.max(start,Math.min(end,last));if(end-start>7)end=start+7;
        if(`${start}-${end}`!==before){pr.lines=[start,end];fixes.push(`Clamped line ${index}'s range to ${start}–${end} of ${file.path}.`);}}
    });
  }
  if(format==='sketch'&&script.sketch){
    const ids=new Set(script.sketch.nodes.map(n=>n.id)),seen=new Set<string>();
    const edges=script.sketch.edges.filter(edge=>{const key=edge.from+'>'+edge.to;const keep=ids.has(edge.from)&&ids.has(edge.to)&&edge.from!==edge.to&&!seen.has(key);seen.add(key);return keep;});
    if(edges.length!==script.sketch.edges.length){fixes.push(`Removed ${script.sketch.edges.length-edges.length} duplicate or invalid edge(s).`);script.sketch.edges=edges;}
    const known=new Set([...ids,...edges.map(e=>e.from+'>'+e.to)]);
    lines.forEach((line,index)=>{const beat=line.sketch;if(!beat)return;
      for(const key of['show','focus'] as const){const list=beat[key];if(list){const kept=list.filter(ref=>known.has(ref));if(kept.length!==list.length){fixes.push(`Dropped unknown ${key} reference(s) on line ${index}.`);beat[key]=kept;}}}
      if(beat.note&&!known.has(beat.note.near)){delete beat.note;fixes.push(`Dropped a note on line ${index} that pointed at an unknown element.`);}
      if(beat.mark&&!beat.focus?.length){delete beat.mark;fixes.push(`Dropped a mark on line ${index} that had nothing focused.`);}
    });
  }
  if(format==='tierlist'&&script.tierlist){
    const placed=new Set<string>();
    lines.forEach((line,index)=>{const place=line.tier?.place;if(!place)return;
      if(placed.has(place.item)){delete line.tier!.place;fixes.push(`Ignored a repeat placement of "${place.item}" on line ${index}.`);}else placed.add(place.item);});
  }
  return{script,fixes};
}
export function scriptForFormat(script:z.infer<typeof VideoScriptSchema>,format:z.infer<typeof VideoFormatSchema>='skit',requested?:Participants,narrator?:CharacterId):VideoScript{
  script=normalizeScript(script,format).script;
  if(format==='skit')return questionAnswerScript(script,requested);
  if(format==='groupchat')return GroupChatScriptSchema.parse(script);
  if(format==='prreview')return PrReviewScriptSchema.parse(script);
  if(format==='tierlist'){const voices=[...new Set(script.dialogue.map(line=>line.speaker))];if(narrator&&script.narrator&&narrator!==script.narrator)throw new Error('Script narrator must match the requested voice');return TierListScriptSchema.parse({...script,narrator:narrator??script.narrator??(voices.length===1?voices[0]:undefined)});}
  if(format==='sketch'){const voices=[...new Set(script.dialogue.map(line=>line.speaker))];if(narrator&&script.narrator&&narrator!==script.narrator)throw new Error('Script narrator must match the requested voice');return SketchScriptSchema.parse({...script,narrator:narrator??script.narrator??(voices.length===1?voices[0]:undefined)});}
  const voices=[...new Set(script.dialogue.map(line=>line.speaker))];
  if(narrator&&script.narrator&&narrator!==script.narrator)throw new Error('Script narrator must match the requested voice');
  return (format==='pov'?PovScriptSchema:format==='whiteboard'?WhiteboardScriptSchema:NarratedScriptSchema).parse({...script,narrator:narrator??script.narrator??(voices.length===1?voices[0]:undefined)});
}
export const GenerateVideoInputSchema = z.object({
  sessionId:z.string().uuid().optional().describe('An existing caller-owned learning session. Links the video to that session and account.'),
  scriptProvider:ScriptProviderPreferenceSchema.optional().describe('Script model: auto prefers configured Gemini, otherwise Paper. Explicit selection never falls back. Complete agent scripts bypass both.'),
  prompt:z.string().trim().min(3).max(32000).optional(),
  script:VideoScriptSchema.optional(),
  style:z.enum(['brainrot','calm']).default('brainrot'),
  durationSeconds:z.number().int().min(15).max(180).default(60),
  cast:CastIdSchema.default('auto'),
  participants:ParticipantsSchema.optional().describe('The invoking agent chooses any two ready characters: learner asks, expert answers. Supports cross-show pairs.'),
  language:VideoLanguageSchema.default('hinglish'),
  speechSpeed:z.number().min(1).max(1.3).default(1.12),
  voiceBackend:VoiceBackendSchema.optional().describe('Use maya-local for prepared local reference cloning, or elevenlabs for provider clones. No automatic paid fallback.'),
  voiceMode:VoiceModeSchema.optional().describe('faithful prioritizes a steady reference voice; natural allows subtle acting; expressive allows more variation. Badri/Budhdev retain their working defaults when omitted.'),
  broll:z.boolean().default(true),
  background:BackgroundIdSchema.default('auto'),
  title:z.string().max(100).optional(),
  imageBroll:ImageBrollSchema.optional(),
  requestId:z.string().min(1).max(128).optional(),
  voiceIds:z.partialRecord(CharacterIdSchema,z.string().regex(/^[\w-]{1,100}$/)).optional(),
  format:VideoFormatSchema.default('skit'),
  narrator:CharacterIdSchema.optional(),
  quizCount:z.number().int().min(0).max(3).default(0).describe('Optional comprehension questions generated with the script, never spoken. Agent scripts supply their own questions.'),
}).refine(v=>Boolean(v.prompt||v.script),'Provide a prompt or a complete script')
  .superRefine((v,ctx)=>{
    const allowed=CAST_MEMBERS[v.cast];
    if(v.format!=='skit'&&v.participants)ctx.addIssue({code:'custom',path:['participants'],message:v.format==='groupchat'?'Group chats use script.chat.members':v.format==='prreview'?'PR reviews use script.pr.reviewers':'Choose narrator for a narrated format'});
    if((v.format==='groupchat'||v.format==='prreview')&&v.narrator)ctx.addIssue({code:'custom',path:['narrator'],message:v.format==='groupchat'?'Group chats use script.chat.members, not a narrator':'PR reviews use script.pr.reviewers, not a narrator'});
    if(v.narrator&&!allowed.includes(v.narrator))ctx.addIssue({code:'custom',path:['narrator'],message:'Narrator must belong to the selected roster'});
    if(v.participants&&(!allowed.includes(v.participants.learner)||!allowed.includes(v.participants.expert)))ctx.addIssue({code:'custom',path:['participants'],message:'Participants must belong to the selected roster'});
    if(!v.script)return;
    if(v.script.dialogue.some(line=>!allowed.includes(line.speaker)))ctx.addIssue({code:'custom',path:['script','dialogue'],message:'Script speakers must match the selected cast'});
    if(v.quizCount>0&&(v.script.questions?.length??(v.script.question?1:0))!==v.quizCount)ctx.addIssue({code:'custom',path:['script','questions'],message:'Supply the requested number of questions with an agent-written script'});
    if(['groupchat','prreview','sketch','tierlist'].includes(v.format)){const result=(v.format==='groupchat'?GroupChatScriptSchema:v.format==='prreview'?PrReviewScriptSchema:v.format==='tierlist'?TierListScriptSchema:SketchScriptSchema).safeParse((()=>{const fixed=normalizeScript(v.script,v.format).script;return v.format==='sketch'||v.format==='tierlist'?{...fixed,narrator:v.narrator??fixed.narrator??(new Set(fixed.dialogue.map(l=>l.speaker)).size===1?fixed.dialogue[0]?.speaker:undefined)}:fixed;})());if(!result.success)result.error.issues.forEach(issue=>ctx.addIssue({code:'custom',path:['script',...issue.path.map(String)],message:issue.message}));}
    else if(v.format!=='skit'){try{scriptForFormat(v.script,v.format,undefined,v.narrator);}catch{ctx.addIssue({code:'custom',path:['script'],message:'Use one narrator and 4–12 scenes: setup, investigate, escalate, resolve'});}}
  });
export const VideoJobSchema=z.object({
  sessionId:z.string().uuid().optional(),
  jobId:z.string().uuid(),state:z.enum(['queued','processing','ready','failed','needs_review']),
  stage:z.enum(['queued','scripting','voicing','rendering','ready','failed']),progress:z.number().min(0).max(100),
  prompt:z.string(),title:z.string().nullable(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
  mediaExpired:z.boolean().optional(),mediaExpiresAt:z.string().datetime().optional(),videoUrl:z.string().nullable(),downloadUrl:z.string().optional(),posterUrl:z.string().nullable().optional(),audioUrl:z.string().nullable().optional(),error:z.string().nullable(),
  script:VideoScriptSchema.optional(),durationSeconds:z.number().nullable().optional(),
  cast:CastIdSchema.optional(),language:PlaybackLanguageSchema.optional(),
  participants:ParticipantsSchema.optional(),
  voiceBackend:VoiceBackendSchema.optional(),
  voiceNames:z.record(z.string(),z.string()).optional(),backgroundName:z.string().optional(),
  sourceCredits:z.array(z.object({title:z.string(),url:z.string(),attribution:z.string()})).optional(),
  format:VideoFormatSchema.optional(),narrator:CharacterIdSchema.optional(),learning:LearningPackSchema.optional(),
  outputs:z.object({learningUrl:z.string(),notesUrl:z.string(),captionsUrl:z.string(),flashcardsUrl:z.string().optional()}).optional(),
});
export const StudioConfigSchema=z.object({
  formats:z.array(z.object({id:VideoFormatSchema,name:z.string(),description:z.string(),speakers:z.number().int(),visuals:z.string(),ready:z.boolean().optional()})).optional(),
  scriptProvider:ScriptProviderPreferenceSchema.optional(),scriptConfigured:z.boolean().optional(),geminiConfigured:z.boolean().optional(),scriptProviders:z.array(z.object({id:ScriptProviderIdSchema,name:z.string(),ready:z.boolean()})).optional(),
  voiceBackend:VoiceBackendSchema.optional(),voiceConfigured:z.boolean().optional(),speechBackends:z.array(z.object({id:VoiceBackendSchema,name:z.string(),ready:z.boolean()})).optional(),
  paperConfigured:z.boolean(),elevenlabsConfigured:z.boolean(),ffmpegAvailable:z.boolean(),imageSearchProvider:ImageSearchProviderSchema.default('google'),
  voices:z.array(z.object({id:z.string(),name:z.string(),role:CharacterIdSchema,description:z.string()})),
  characters:z.array(z.object({id:CharacterIdSchema,name:z.string(),imageUrl:z.string(),voiceReady:z.boolean()})).default([]),
  casts:z.array(z.object({id:CastIdSchema,name:z.string(),characters:z.array(CharacterIdSchema)})).default([]),
  defaults:z.object({style:z.literal('brainrot'),durationSeconds:z.number(),cast:CastIdSchema.optional(),language:z.string().optional(),speechSpeed:z.number().optional()}),
  backgrounds:z.array(z.object({id:BackgroundIdSchema,name:z.string()})).optional(),
  mode:z.enum(['local','hosted']).default('local'),
  mediaOrigins:z.array(z.string().url()).optional(),
  auth:z.object({configured:z.boolean(),loginUrl:z.string().optional(),issuer:z.string().optional(),clientId:z.string().optional(),agentClientId:z.string().optional(),userPoolId:z.string().optional(),domain:z.string().optional()}).optional(),
});
export type VideoScript=z.infer<typeof VideoScriptSchema>;
export type GenerateVideoInput=z.input<typeof GenerateVideoInputSchema>;
export type ValidatedVideoInput=z.output<typeof GenerateVideoInputSchema>;
export type VideoJob=z.infer<typeof VideoJobSchema>;
export type StudioConfig=z.infer<typeof StudioConfigSchema>;

export const VideoManifestV2Schema=z.object({
  schemaVersion:z.literal('BrainrottenPlaybackManifestV2'),voiceBackend:VoiceBackendSchema.optional(),jobId:z.string().uuid(),title:z.string(),cast:CastIdSchema,participants:ParticipantsSchema.optional(),language:PlaybackLanguageSchema,speechSpeed:z.number().min(1).max(1.3),durationSeconds:z.number().positive().max(MAX_VIDEO_SECONDS),script:VideoScriptSchema,
  segments:z.array(z.object({speaker:CharacterIdSchema,turnIndex:z.number().int().nonnegative().optional(),text:z.string(),startMs:z.number().nonnegative(),endMs:z.number().nonnegative()})),
  words:z.array(z.object({speaker:CharacterIdSchema,turnIndex:z.number().int().nonnegative().optional(),text:z.string(),startMs:z.number().nonnegative(),endMs:z.number().nonnegative()})),
  broll:z.array(z.object({kind:z.enum(['code','image']),startMs:z.number().nonnegative(),endMs:z.number().nonnegative(),code:z.string().optional(),language:z.string().optional(),caption:z.string().optional(),imageFile:z.string().regex(/^[\w.-]+$/).optional()})),
  sourceCredits:z.array(z.object({title:z.string(),url:z.string().url(),attribution:z.string()})),
});
export const VideoManifestV3Schema=VideoManifestV2Schema.extend({schemaVersion:z.literal('BrainrottenPlaybackManifestV3'),format:VideoFormatSchema,learning:LearningPackSchema}).superRefine((manifest,ctx)=>{
  if(manifest.learning.jobId!==manifest.jobId||manifest.learning.format!==manifest.format||Math.abs(manifest.learning.durationSeconds-manifest.durationSeconds)>.001)ctx.addIssue({code:'custom',path:['learning'],message:'Learning metadata must belong to this video and format'});
  try{scriptForFormat(manifest.script,manifest.format,manifest.participants);}catch{ctx.addIssue({code:'custom',path:['script'],message:'Script must match the playback format'});}
});
export const VideoManifestSchema=z.discriminatedUnion('schemaVersion',[VideoManifestV2Schema,VideoManifestV3Schema]);
export type VideoManifest=z.infer<typeof VideoManifestSchema>;

/** Preserve old retry fingerprints when additive default fields are introduced. */
export function videoRequestPayload(input:ValidatedVideoInput):Record<string,unknown>{
  const{format,quizCount,...rest}=input;
  return{...rest,...(format==='skit'?{}:{format}),...(quizCount===0?{}:{quizCount})};
}
