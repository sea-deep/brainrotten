import {THINKING_TRAPS,RETIRED_FORMATS} from '@brainrot/contracts';
import {createHash} from 'node:crypto';
import {CreateLearningSessionSchema,LearningSessionSchema,SessionListQuerySchema,SessionSummarySchema,GenerateVideoInputSchema,type CreateLearningSession,type LearningSession,type FormatRecommendationSchema} from '@brainrot/contracts';
import type {z} from 'zod/v4';

export {THINKING_TRAPS} from '@brainrot/contracts';

export function recommendSessionFormat(input:CreateLearningSession):z.infer<typeof FormatRecommendationSchema>{
  if(input.preferredFormat&&!RETIRED_FORMATS.has(input.preferredFormat))return{format:input.preferredFormat,reason:input.formatRationale??'The invoking agent selected this format from its session context.',chosenBy:'agent'};
  const context=[input.context.task,input.context.summary,...input.context.concepts].join(' ').toLowerCase();
  // Sketch boards and character skits are the default teaching formats; the others are for clear fits.
  if(input.context.decisions.length>=2||/\b(compare|comparison|options|alternatives|trade-?offs?|versus|vs)\b/.test(context))return{format:'tierlist',reason:'Several real options were weighed: rank them against one criterion so the trade-offs stick.',chosenBy:'routing-guide'};
  if(input.intent==='review'||input.context.evidence.some(item=>item.kind==='diff'))return{format:'prreview',reason:'There is a real diff to review: walk through the risky line, the fix and one follow-up.',chosenBy:'routing-guide'};
  if(input.intent==='concept')return{format:'skit',reason:'A learner character asks the concrete question and an expert character answers with connected follow-ups.',chosenBy:'routing-guide'};
  if(['architecture','debugging','change'].includes(input.intent)||/\b(request|message|flow|pipeline|dependency|dependencies|components|architecture|data flow|service|cache|database|queue)\b/.test(context))return{format:'sketch',reason:'Draw the system as it is explained: the path, the problem in red and the fix in green.',chosenBy:'routing-guide'};
  return{format:'skit',reason:'Use a learner’s concrete question and connected follow-ups to expose the mechanism and its limits.',chosenBy:'routing-guide'};
}
export function newLearningSession(raw:unknown,owner:string,now=new Date().toISOString()):LearningSession{
  const input=CreateLearningSessionSchema.parse(raw),hex=createHash('sha256').update(owner+'\0'+input.requestId).digest('hex');
  const sessionId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  return LearningSessionSchema.parse({...input,sessionId,schemaVersion:'BrainrottenSessionV1',createdAt:now,recommendation:recommendSessionFormat(input),evidenceTrust:'agent-supplied'});
}
export function sessionFingerprint(raw:unknown):string{return createHash('sha256').update(JSON.stringify(CreateLearningSessionSchema.strip().parse(raw))).digest('hex');}
export function sessionPage(sessions:LearningSession[],raw:unknown){
  const query=SessionListQuerySchema.parse(raw),sorted=[...sessions].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.sessionId.localeCompare(a.sessionId));
  const position=query.cursor?sorted.findIndex(session=>session.sessionId===query.cursor):-1;
  if(query.cursor&&position<0)throw new Error('Unknown session cursor.');
  const rows=sorted.slice(position+1,position+1+query.limit);
  return{sessions:rows.map(session=>SessionSummarySchema.parse(session)),nextCursor:position+1+rows.length<sorted.length?rows.at(-1)?.sessionId??null:null};
}
export function prepareSessionLesson(session:LearningSession,raw:unknown){
  const input=GenerateVideoInputSchema.parse(raw);
  if(input.sessionId&&input.sessionId!==session.sessionId)throw new Error('The lesson must belong to this session.');
  if(!input.script||!(input.script.questions?.length||input.script.question))throw new Error('Session lessons require a complete agent-written script and at least one comprehension question.');
  return GenerateVideoInputSchema.parse({...input,sessionId:session.sessionId,requestId:input.requestId??`session-${session.sessionId}-lesson`,quizCount:input.script.questions?.length??1});
}
export function learningGuide(session?:LearningSession){return{
  version:'BrainrottenTeachingGuideV1',purpose:'Help a person understand and question what their coding agent changed, then practice transferring that reasoning.',
  workflow:['Create a bounded session snapshot with the actual task, changes, decisions, uncertainties and selected evidence. Do not upload secrets or entire chat histories.','Read the recommendation. Choose the best available format yourself; override with preferredFormat and a concrete rationale.','Read get_video_formats and the character guide for that format. Write the complete script from your actual context. Explain why, one trade-off and one useful failure case. Never invent successful tests or measurements.','Write 1–3 unambiguous mechanism/prediction questions with answer, explanation and actual turnIndices. Questions are separate from spoken narration.','Write a prediction prompt that can be attempted before watching, and one small practice task that transfers the mechanism to a new case. Give checkable success criteria and an optional hint.','Call validate_video_script. Publish explicitly with publish_session_lesson; retain requestId on retries. A tool call can spend configured speech credits. Do not publish after every token or response.','The learner predicts, watches, answers, practices and reflects in their account. Never submit prediction/practice/reflection answers on their behalf. Do not equate watched or self-reported completion with mastery.'],
  formatRouting:[{format:'sketch',when:'Default for systems: architecture, data flow, a request path, a bug or a change across components. Draw it, mark the problem red and the fix green.'},{format:'skit',when:'Default for ideas: a concept, a misconception or a decision explained by two characters with connected follow-up questions.'},{format:'prreview',when:'An explicit code review of a real diff.'},{format:'tierlist',when:'Several options, fixes or tools were weighed against one criterion.'},{format:'groupchat',when:'Only when the story is literally a conversation between parts of the system.'}],
  teachingRules:['Use a concrete incident from the curated evidence. Mark hypothetical scenarios and unverified observations.','Keep language natural: English, Romanized Hinglish or Romanized Benglish; retain technical identifiers.','Make the learner predict a consequence, not repeat a definition. Allow thinking time and an explicit skip.','Ask for an explanation in their own words and a different small practice case. Reflection trap labels are optional self-report, never a diagnosis.','Avoid interruption: create one useful lesson at a meaningful milestone, only when requested or the user enabled that workflow.'],
  traps:THINKING_TRAPS,...(session?{session,recommendation:session.recommendation,activity:session.activity}:{}),
};}
