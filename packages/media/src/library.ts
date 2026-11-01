import {createHash} from 'node:crypto';
import {z} from 'zod/v4';
import {LibraryQuerySchema,LibraryItemSchema,VideoLibrarySchema,emptyVideoReview,type VideoJob,type VideoReview,type VideoLibrary} from '@brainrot/contracts';
const Cursor=z.object({v:z.literal(1),scope:z.string(),at:z.string().datetime(),id:z.string().uuid()}).strict();
export class LibraryCursorError extends Error{}
export function videoLibrary(jobs:VideoJob[],reviews:ReadonlyMap<string,VideoReview>,raw:unknown,owner:string):VideoLibrary{
  const query=LibraryQuerySchema.parse(raw),scope=createHash('sha256').update(JSON.stringify([owner,query.q.toLowerCase(),query.format,query.state,query.review])).digest('hex');
  let cursor:z.infer<typeof Cursor>|undefined;
  if(query.cursor){try{cursor=Cursor.parse(JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8')));if(cursor.scope!==scope)throw new Error('Query changed');}catch{throw new LibraryCursorError('This page belongs to a different search. Start from the first page.');}}
  const filtered=jobs.filter(job=>{
    if(query.q&&!`${job.title??''} ${job.prompt}`.toLowerCase().includes(query.q.toLowerCase()))return false;
    if(query.format&&(job.format??'skit')!==query.format||query.state&&job.state!==query.state)return false;
    const review=reviews.get(job.jobId)??emptyVideoReview(job.jobId);
    if(query.review==='bookmarked'&&!review.bookmarked)return false;
    if(query.review==='unwatched'&&(job.state!=='ready'||review.furthestMs>0||review.completed))return false;
    if(query.review==='in-progress'&&(job.state!=='ready'||review.furthestMs===0||review.completed))return false;
    if(query.review==='completed'&&!review.completed)return false;
    if(query.review==='needs-practice'&&!job.learning?.questions.some(q=>Object.hasOwn(review.answers,q.id)&&!review.answers[q.id]?.correct))return false;
    if(query.review==='unanswered'&&(!job.learning?.questions.length||job.learning.questions.every(q=>Object.hasOwn(review.answers,q.id))))return false;
    return !cursor||job.createdAt<cursor.at||job.createdAt===cursor.at&&job.jobId<cursor.id;
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.jobId.localeCompare(a.jobId));
  const page=filtered.slice(0,query.limit),last=page.at(-1);
  return VideoLibrarySchema.parse({jobs:page.map(job=>LibraryItemSchema.parse({...job,prompt:job.prompt.slice(0,300),format:job.format??'skit',review:reviews.get(job.jobId)??emptyVideoReview(job.jobId),questionCount:job.learning?.questions.length??0})),nextCursor:filtered.length>query.limit&&last?Buffer.from(JSON.stringify({v:1,scope,at:last.createdAt,id:last.jobId})).toString('base64url'):null});
}
