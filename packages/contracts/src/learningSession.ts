import {z} from 'zod/v4';
import {VideoFormatSchema} from './videoFormats.js';
import {VideoJobSchema,GenerateVideoInputSchema} from './videoSchema.js';

export const ThinkingTrapSchema=z.enum(['forming','dislodging','assumption','location','achievement','progression','interruption','mislead']);
export const THINKING_TRAPS=[
  {id:'forming',name:'Wrong approach',prompt:'Does this approach fit the actual requirement?'},
  {id:'dislodging',name:'Stuck on a strategy',prompt:'What evidence would make you change strategy?'},
  {id:'assumption',name:'Solving a different problem',prompt:'Restate what the user actually asked for.'},
  {id:'location',name:'Skipped a foundation',prompt:'Which loop, condition or invariant have you not checked?'},
  {id:'achievement',name:'Patching instead of restructuring',prompt:'Would a structural change remove these repeated fixes?'},
  {id:'progression',name:'Code moved faster than understanding',prompt:'Can you trace the logic without asking the agent?'},
  {id:'interruption',name:'Suggestions broke your train of thought',prompt:'Pause suggestions and finish your own reasoning first.'},
  {id:'mislead',name:'Trusted a plausible suggestion',prompt:'What evidence supports the agent’s explanation?'},
] as const;
export const SessionContextSchema=z.object({
  task:z.string().trim().min(3).max(2000),summary:z.string().trim().min(3).max(4000),
  changes:z.array(z.string().trim().min(1).max(600)).max(12).default([]),
  concepts:z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  decisions:z.array(z.object({choice:z.string().trim().min(1).max(300),reason:z.string().trim().min(1).max(600),tradeoff:z.string().trim().max(400).optional()})).max(6).default([]),
  uncertainties:z.array(z.string().trim().min(1).max(400)).max(6).default([]),
  evidence:z.array(z.object({kind:z.enum(['code','diff','test-output','agent-note']),label:z.string().trim().min(1).max(120),content:z.string().trim().min(1).max(4000)})).max(8).default([]),
}).refine(value=>JSON.stringify(value).length<=24000,'Keep the curated session context below 24,000 characters.');
export const LearningActivitySchema=z.object({
  predictionPrompt:z.string().trim().min(10).max(400),
  practice:z.object({prompt:z.string().trim().min(10).max(800),successCriteria:z.string().trim().min(10).max(600),hint:z.string().trim().max(400).optional()}),
  reflectionPrompt:z.string().trim().min(10).max(400).default('What did you assume, and what would you check before accepting a similar AI change?'),
});
export const CreateLearningSessionSchema=z.object({
  requestId:z.string().trim().min(8).max(128),title:z.string().trim().min(3).max(140),
  projectName:z.string().trim().min(1).max(100),agent:z.string().trim().min(1).max(80),
  intent:z.enum(['change','debugging','architecture','concept','review']).default('change'),
  objective:z.string().trim().min(10).max(400),context:SessionContextSchema,activity:LearningActivitySchema,
  preferredFormat:VideoFormatSchema.optional(),formatRationale:z.string().trim().min(10).max(400).optional(),
}).strict();
export type CreateLearningSession=z.infer<typeof CreateLearningSessionSchema>;
export const FormatRecommendationSchema=z.object({format:VideoFormatSchema,reason:z.string().min(1).max(600),chosenBy:z.enum(['routing-guide','agent'])});
export const LearningSessionSchema=CreateLearningSessionSchema.safeExtend({
  schemaVersion:z.literal('BrainrottenSessionV1'),sessionId:z.string().uuid(),
  createdAt:z.string().datetime(),recommendation:FormatRecommendationSchema,
  evidenceTrust:z.literal('agent-supplied'),
});
export type LearningSession=z.infer<typeof LearningSessionSchema>;
export const SessionReviewSchema=z.object({
  schemaVersion:z.literal('BrainrottenSessionReviewV1'),sessionId:z.string().uuid(),version:z.number().int().nonnegative(),
  prediction:z.object({text:z.string().max(2000),confidence:z.number().int().min(1).max(5).nullable(),skipped:z.boolean()}).nullable(),
  practice:z.object({attempt:z.string().max(4000),completed:z.boolean()}).nullable(),
  reflection:z.object({explanation:z.string().max(3000),confidence:z.number().int().min(1).max(5),traps:z.array(ThinkingTrapSchema).max(8),nextAction:z.string().max(1000)}).nullable(),
  updatedAt:z.string().datetime().nullable(),
});
export type SessionReview=z.infer<typeof SessionReviewSchema>;
const expected={expectedVersion:z.number().int().nonnegative()};
export const SessionReviewPatchSchema=z.discriminatedUnion('kind',[
  z.object({...expected,kind:z.literal('predict'),text:z.string().trim().max(2000),confidence:z.number().int().min(1).max(5).nullable(),skipped:z.boolean()}).strict().refine(value=>value.skipped||value.text.length>=3&&value.confidence!==null,'Write a prediction and choose confidence, or explicitly skip.'),
  z.object({...expected,kind:z.literal('practice'),attempt:z.string().trim().max(4000),completed:z.boolean()}).strict().refine(value=>!value.completed||value.attempt.length>=3,'Record an attempt before marking practice complete.'),
  z.object({...expected,kind:z.literal('reflect'),explanation:z.string().trim().min(3).max(3000),confidence:z.number().int().min(1).max(5),traps:z.array(ThinkingTrapSchema).max(8).refine(value=>new Set(value).size===value.length,'Choose each trap once.'),nextAction:z.string().trim().max(1000)}).strict(),
]);
export type SessionReviewPatch=z.infer<typeof SessionReviewPatchSchema>;
export function emptySessionReview(sessionId:string):SessionReview{return{schemaVersion:'BrainrottenSessionReviewV1',sessionId,version:0,prediction:null,practice:null,reflection:null,updatedAt:null};}
export class SessionReviewConflictError extends Error{constructor(public review:SessionReview){super('Learning responses changed elsewhere. Reload and retry this step.');}}
export function applySessionReview(current:SessionReview,raw:unknown,now=new Date().toISOString()):SessionReview{
  const patch=SessionReviewPatchSchema.parse(raw);if(patch.expectedVersion!==current.version)throw new SessionReviewConflictError(current);
  const next={...current,version:current.version+1,updatedAt:now};
  if(patch.kind==='predict')next.prediction={text:patch.text,confidence:patch.confidence,skipped:patch.skipped};
  if(patch.kind==='practice')next.practice={attempt:patch.attempt,completed:patch.completed};
  if(patch.kind==='reflect')next.reflection={explanation:patch.explanation,confidence:patch.confidence,traps:patch.traps,nextAction:patch.nextAction};
  return SessionReviewSchema.parse(next);
}
export const SessionListQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(20).default(10),cursor:z.string().uuid().optional()});
export const SessionSummarySchema=LearningSessionSchema.pick({sessionId:true,title:true,projectName:true,agent:true,intent:true,objective:true,createdAt:true,recommendation:true}).strip();
export const SessionPageSchema=z.object({sessions:z.array(SessionSummarySchema).max(20),nextCursor:z.string().uuid().nullable()});
export type SessionPage=z.infer<typeof SessionPageSchema>;
export const SessionDetailSchema=z.object({session:LearningSessionSchema,review:SessionReviewSchema,videos:z.array(VideoJobSchema)});
export type SessionDetail=z.infer<typeof SessionDetailSchema>;
export const GetSessionInputSchema=z.object({sessionId:z.string().uuid()});
export const PublishSessionLessonSchema=z.object({sessionId:z.string().uuid(),video:GenerateVideoInputSchema});
export const LearningGuideSchema=z.object({
  version:z.literal('BrainrottenTeachingGuideV1'),purpose:z.string(),workflow:z.array(z.string()),
  formatRouting:z.array(z.object({format:VideoFormatSchema,when:z.string()})),teachingRules:z.array(z.string()),
  traps:z.array(z.object({id:ThinkingTrapSchema,name:z.string(),prompt:z.string()})),
  session:LearningSessionSchema.optional(),recommendation:FormatRecommendationSchema.optional(),activity:LearningActivitySchema.optional(),
});
