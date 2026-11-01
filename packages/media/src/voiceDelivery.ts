import type {CharacterId,ValidatedVideoInput,VideoScript} from '@brainrot/contracts';
type Line=VideoScript['dialogue'][number];
const tags:Record<NonNullable<Line['tone']>,string>={neutral:'',curious:'curious',thoughtful:'thoughtful',amused:'amused',confident:'confident',concerned:'concerned'};
export const VOICE_CONTROL_TOKEN=/^\[(?:curious|thoughtful|amused|confident|concerned)\]$/i;
export function deliveryText(line:Line):string{const tag=tags[line.tone??'neutral'];return tag?`[${tag}] ${line.text}`:line.text;}
export function deliverySettings(input:Pick<ValidatedVideoInput,'cast'|'voiceMode'|'participants'|'narrator'>):{stability:number}|undefined{
  const mode=input.voiceMode??((input.cast==='badri-budhdev'||input.narrator==='badri'||input.narrator==='budhdev'||(input.participants&&[input.participants.learner,input.participants.expert].some(id=>id==='badri'||id==='budhdev')))?undefined:'faithful');
  // Preserve the user's working Badri/Budhdev provider defaults when no override is requested.
  if(!mode)return;
  // v3 accepts stability here, but rejects the optional similarity control.
  if(mode==='faithful')return{stability:1};
  if(mode==='natural')return{stability:.5};
  return{stability:0};
}
export function dialogueRequest(dialogue:Line[],voiceIds:Record<CharacterId,string>,input:Pick<ValidatedVideoInput,'cast'|'voiceMode'|'participants'|'narrator'|'language'>){
  const settings=deliverySettings(input);
  return{model_id:'eleven_v3',language_code:input.language==='benglish'?'bn':input.language==='en'?'en':'hi',inputs:dialogue.map(line=>({text:deliveryText(line),voice_id:voiceIds[line.speaker]})),...(settings?{settings}:{})};
}
