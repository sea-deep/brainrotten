import type {CharacterId,ValidatedVideoInput,VideoScript} from '@brainrot/contracts';
type Line=VideoScript['dialogue'][number];
const tags:Record<NonNullable<Line['tone']>,string>={neutral:'',curious:'curious',thoughtful:'thoughtful',amused:'amused',confident:'confident',concerned:'concerned'};
export const VOICE_CONTROL_TOKEN=/^\[(?:curious|thoughtful|amused|confident|concerned)\]$/i;
export function deliveryText(line:Line):string{const tag=tags[line.tone??'neutral'];return tag?`[${tag}] ${line.text}`:line.text;}
/** The ElevenLabs model every video is spoken with. Eleven v4 keeps Instant Voice Clones much closer to their reference. */
export const SPEECH_MODEL='eleven_v4';
export type DeliverySettings={stability:number;similarity_boost:number};
/**
 * v4 takes two controls: stability (lower = more varied acting) and similarity (higher = closer to the cloned voice).
 * faithful, the default for every character, is the setting chosen by ear in the v3/v4 listening test (scripts/voice-ab-test.mjs).
 */
export function deliverySettings(input:Pick<ValidatedVideoInput,'voiceMode'>):DeliverySettings{
  if(input.voiceMode==='natural')return{stability:.35,similarity_boost:.85};
  if(input.voiceMode==='expressive')return{stability:.15,similarity_boost:.8};
  return{stability:.5,similarity_boost:.9};
}
export function dialogueRequest(dialogue:Line[],voiceIds:Record<CharacterId,string>,input:Pick<ValidatedVideoInput,'cast'|'voiceMode'|'participants'|'narrator'|'language'>){
  const settings=deliverySettings(input);
  return{model_id:SPEECH_MODEL,language_code:input.language==='benglish'?'bn':input.language==='en'?'en':'hi',inputs:dialogue.map(line=>({text:deliveryText(line),voice_id:voiceIds[line.speaker]})),settings};
}
