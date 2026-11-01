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
export const ScriptLineSchema = z.object({
  speaker: CharacterIdSchema,
  text: z.string().trim().min(1).max(650),
  tone:VoiceToneSchema.optional().describe('Subtle delivery cue, separate from spoken/caption text. Omit for the reference voice’s normal tone.'),
  scene:VideoSceneSchema.optional(),
  broll: BrollSchema.optional(),
  brollSequence:z.array(BrollSchema).min(1).max(4).optional().describe('Ordered reference images/code for this spoken turn. Replaces broll when present; split the turn time among the inserts. Use distinct relevant views for comparisons and changes.'),
});
export const VideoScriptSchema = z.object({
  title:z.string().min(1).max(100),
  participants:ParticipantsSchema.optional(),
  narrator:CharacterIdSchema.optional(),
  dialogue:z.array(ScriptLineSchema).min(2).max(60),
  takeaway:z.string().max(240).optional(),
  questions:z.array(ReviewQuestionSchema).min(1).max(3).optional(),
  question:z.object({prompt:z.string().min(1).max(240), choices:z.array(z.string().min(1).max(160)).min(2).max(4), answer:z.number().int().min(0).max(3), explanation:z.string().max(300)})
    .refine(q=>q.answer<q.choices.length,'Answer must reference a choice').optional(),
}).refine(s=>s.dialogue.reduce((n,line)=>n+line.text.length,0)<=10000,'Dialogue must stay within 10,000 characters').superRefine((script,ctx)=>{
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
export function scriptForFormat(script:z.infer<typeof VideoScriptSchema>,format:z.infer<typeof VideoFormatSchema>='skit',requested?:Participants,narrator?:CharacterId):VideoScript{
  if(format==='skit')return questionAnswerScript(script,requested);
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
    if(v.format!=='skit'&&v.participants)ctx.addIssue({code:'custom',path:['participants'],message:'Choose narrator for a narrated format'});
    if(v.narrator&&!allowed.includes(v.narrator))ctx.addIssue({code:'custom',path:['narrator'],message:'Narrator must belong to the selected roster'});
    if(v.participants&&(!allowed.includes(v.participants.learner)||!allowed.includes(v.participants.expert)))ctx.addIssue({code:'custom',path:['participants'],message:'Participants must belong to the selected roster'});
    if(!v.script)return;
    if(v.script.dialogue.some(line=>!allowed.includes(line.speaker)))ctx.addIssue({code:'custom',path:['script','dialogue'],message:'Script speakers must match the selected cast'});
    if(v.quizCount>0&&(v.script.questions?.length??(v.script.question?1:0))!==v.quizCount)ctx.addIssue({code:'custom',path:['script','questions'],message:'Supply the requested number of questions with an agent-written script'});
    if(v.format!=='skit'){try{scriptForFormat(v.script,v.format,undefined,v.narrator);}catch{ctx.addIssue({code:'custom',path:['script'],message:'Use one narrator and 4–12 scenes: setup, investigate, escalate, resolve'});}}
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
  schemaVersion:z.literal('BrainrottenPlaybackManifestV2'),voiceBackend:VoiceBackendSchema.optional(),jobId:z.string().uuid(),title:z.string(),cast:CastIdSchema,participants:ParticipantsSchema.optional(),language:PlaybackLanguageSchema,speechSpeed:z.number().min(1).max(1.3),durationSeconds:z.number().positive().max(180),script:VideoScriptSchema,
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
