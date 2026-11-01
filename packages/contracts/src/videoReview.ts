import {z} from 'zod/v4';
import {VideoJobSchema,type VideoJob} from './videoSchema.js';
import {VideoFormatSchema} from './videoFormats.js';
const QuestionId=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/);
export const VideoReviewSchema=z.object({
  schemaVersion:z.literal('BrainrottenReviewV1'),jobId:z.string().uuid(),version:z.number().int().nonnegative(),
  positionMs:z.number().int().min(0).max(180000),furthestMs:z.number().int().min(0).max(180000),completed:z.boolean(),bookmarked:z.boolean(),
  answers:z.record(QuestionId,z.object({choice:z.number().int().min(0).max(3),correct:z.boolean(),attempts:z.number().int().positive(),answeredAt:z.string().datetime()})),
  updatedAt:z.string().datetime().nullable(),
});
export const ReviewConflictSchema=z.object({message:z.string(),review:VideoReviewSchema});
const revision={expectedVersion:z.number().int().nonnegative()};
export const VideoReviewPatchSchema=z.discriminatedUnion('kind',[
  z.object({...revision,kind:z.literal('watch'),positionMs:z.number().int().min(0).max(180000),completed:z.boolean().optional()}).strict(),
  z.object({...revision,kind:z.literal('answer'),questionId:QuestionId,choice:z.number().int().min(0).max(3)}).strict(),
  z.object({...revision,kind:z.literal('bookmark'),value:z.boolean()}).strict(),
  z.object({...revision,kind:z.literal('reset-answers')}).strict(),
]);
export type VideoReview=z.infer<typeof VideoReviewSchema>;
export type VideoReviewPatch=z.infer<typeof VideoReviewPatchSchema>;
export type ReviewAction=VideoReviewPatch extends infer T?T extends {expectedVersion:number}?Omit<T,'expectedVersion'>:never:never;
export const emptyVideoReview=(jobId:string):VideoReview=>VideoReviewSchema.parse({schemaVersion:'BrainrottenReviewV1',jobId,version:0,positionMs:0,furthestMs:0,completed:false,bookmarked:false,answers:{},updatedAt:null});
export class ReviewConflictError extends Error{constructor(public review:VideoReview){super('Review changed on another screen. Refresh and retry.');}}
export class ReviewInputError extends Error{}
/** Deterministic grading and field-specific patches. Callers cannot provide correctness or ownership. */
export function applyVideoReview(current:VideoReview,raw:unknown,job:VideoJob,now=new Date().toISOString()):VideoReview{
  const patch=VideoReviewPatchSchema.parse(raw);
  if(current.jobId!==job.jobId)throw new ReviewInputError('Review does not belong to this video.');
  if(patch.expectedVersion!==current.version)throw new ReviewConflictError(current);
  let next:VideoReview={...current,answers:{...current.answers},version:current.version+1,updatedAt:now};
  if(patch.kind==='bookmark')next.bookmarked=patch.value;
  if(patch.kind==='reset-answers')next.answers={};
  if(patch.kind==='watch'){
    const duration=Math.round((job.durationSeconds??job.learning?.durationSeconds??0)*1000);
    if(job.state!=='ready'||duration<=0)throw new ReviewInputError('Video is not ready for playback progress.');
    next.positionMs=Math.min(duration,patch.positionMs);next.furthestMs=Math.max(current.furthestMs,next.positionMs);
    next.completed=current.completed||patch.completed===true||next.furthestMs>=duration*.9;
  }
  if(patch.kind==='answer'){
    const question=job.state==='ready'?job.learning?.questions.find(q=>q.id===patch.questionId):undefined;
    if(!question||patch.choice>=question.choices.length)throw new ReviewInputError('Choose a valid answer to a question in this video.');
    const previous=Object.hasOwn(current.answers,patch.questionId)?current.answers[patch.questionId]:undefined;
    next.answers[patch.questionId]={choice:patch.choice,correct:patch.choice===question.answer,attempts:(previous?.attempts??0)+1,answeredAt:now};
  }
  next=VideoReviewSchema.parse(next);return next;
}
export const LibraryQuerySchema=z.object({
  q:z.string().trim().max(120).default(''),format:VideoFormatSchema.optional(),
  state:z.enum(['queued','processing','ready','failed','needs_review']).optional(),
  review:z.enum(['all','unwatched','in-progress','completed','bookmarked','unanswered','needs-practice']).default('all'),
  limit:z.coerce.number().int().min(1).max(50).default(12),cursor:z.string().max(1000).optional(),
});
export type LibraryQuery=z.infer<typeof LibraryQuerySchema>;
export const LibraryItemSchema=VideoJobSchema.pick({jobId:true,title:true,prompt:true,state:true,stage:true,progress:true,createdAt:true,updatedAt:true,posterUrl:true,durationSeconds:true,mediaExpired:true,mediaExpiresAt:true,format:true,language:true,voiceBackend:true,error:true}).extend({review:VideoReviewSchema,questionCount:z.number().int().min(0).max(3)});
export type LibraryItem=z.infer<typeof LibraryItemSchema>;
export const VideoLibrarySchema=z.object({jobs:z.array(LibraryItemSchema).max(50),nextCursor:z.string().nullable()});
export type VideoLibrary=z.infer<typeof VideoLibrarySchema>;
export const ScriptValidationSchema=z.object({valid:z.boolean(),issues:z.array(z.object({path:z.string(),message:z.string()})),warnings:z.array(z.string()),format:VideoFormatSchema.optional(),spokenCharacters:z.number().int().nonnegative(),estimatedSeconds:z.number().nonnegative(),speakers:z.array(z.string()),generationReady:z.boolean()});
export type ScriptValidation=z.infer<typeof ScriptValidationSchema>;
