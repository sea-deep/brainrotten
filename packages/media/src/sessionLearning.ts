import {THINKING_TRAPS} from '@brainrot/contracts';
import {createHash} from 'node:crypto';
import {CreateLearningSessionSchema,LearningSessionSchema,SessionListQuerySchema,SessionSummarySchema,GenerateVideoInputSchema,type CreateLearningSession,type LearningSession,type FormatRecommendationSchema} from '@brainrot/contracts';
import type {z} from 'zod/v4';

export {THINKING_TRAPS} from '@brainrot/contracts';

export function recommendSessionFormat(input:CreateLearningSession):z.infer<typeof FormatRecommendationSchema>{
  if(input.preferredFormat)return{format:input.preferredFormat,reason:input.formatRationale??'The invoking agent selected this format from its session context.',chosenBy:'agent'};
  const context=[input.context.task,input.context.summary,...input.context.concepts].join(' ').toLowerCase();
  if(/\b(request|message|packet|transaction|allocation)\b/.test(context)&&/\b(flow|journey|through|trace|pipeline)\b/.test(context))return{format:'pov',reason:'Follow one item through changing components and state; show where its behavior changes.',chosenBy:'routing-guide'};
  if(input.intent==='debugging')return{format:'casefile',reason:'A concrete failure benefits from symptom, investigation, consequence and a qualified fix.',chosenBy:'routing-guide'};
  if(input.intent==='architecture'||/\b(dependency|dependencies|components|architecture)\b/.test(context))return{format:'whiteboard',reason:'Relationships and trade-offs are easier to inspect as a small changing graph.',chosenBy:'routing-guide'};
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
  formatRouting:[{format:'skit',when:'A misconception, decision or learner question needs follow-ups.'},{format:'casefile',when:'A failure needs diagnosis, a test, a consequence and a fix.'},{format:'whiteboard',when:'Relationships, dependencies or trade-offs need a small changing graph.'},{format:'pov',when:'One request, message, write or allocation moves through components and state.'}],
  teachingRules:['Use a concrete incident from the curated evidence. Mark hypothetical scenarios and unverified observations.','Keep language natural: English, Romanized Hinglish or Romanized Benglish; retain technical identifiers.','Make the learner predict a consequence, not repeat a definition. Allow thinking time and an explicit skip.','Ask for an explanation in their own words and a different small practice case. Reflection trap labels are optional self-report, never a diagnosis.','Avoid interruption: create one useful lesson at a meaningful milestone, only when requested or the user enabled that workflow.'],
  traps:THINKING_TRAPS,...(session?{session,recommendation:session.recommendation,activity:session.activity}:{}),
};}
