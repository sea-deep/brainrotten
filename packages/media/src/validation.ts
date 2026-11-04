import {estimateSpokenSeconds,maxSecondsFor,targetWordsFor} from '@brainrot/contracts';
import {GenerateVideoInputSchema,ScriptValidationSchema,scriptForFormat,normalizeScript,CAST_MEMBERS,retiredFormatMessage,type StudioConfig,type ScriptValidation} from '@brainrot/contracts';
import {z} from 'zod/v4';
import {requireLatinScript} from './providers.js';
import {unknownChatIcons} from './chatIcons.js';
/** Local schema/readiness inspection only. Never searches, scripts, synthesizes or renders. */
export function validateVideoRequest(raw:unknown,config:StudioConfig):ScriptValidation{
  const parsed=GenerateVideoInputSchema.safeParse(raw),issues:Array<{path:string;message:string}>=[],warnings:string[]=[];
  if(!parsed.success)return ScriptValidationSchema.parse({valid:false,generationReady:false,issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message})),warnings,spokenCharacters:0,estimatedSeconds:0,speakers:[]});
  const input=parsed.data;
  const scriptReady=input.scriptProvider&&input.scriptProvider!=='auto'?config.scriptProviders?.some(p=>p.id===input.scriptProvider&&p.ready)??false:input.scriptProvider==='auto'?config.paperConfigured||Boolean(config.geminiConfigured):config.scriptConfigured??(config.paperConfigured||Boolean(config.geminiConfigured));
  const retired=retiredFormatMessage(input.format);if(retired)issues.push({path:'format',message:retired});
  if(config.mode==='hosted'&&input.voiceIds)issues.push({path:'voiceIds',message:'Hosted generation uses project voices. Use local Studio for custom voice IDs.'});
  if(config.mode==='hosted'&&input.voiceBackend==='maya-local')issues.push({path:'voiceBackend',message:'Maya runs locally. Hosted generation uses ElevenLabs.'});
  if(input.script){const fixes=normalizeScript(input.script,input.format).fixes;if(fixes.length)warnings.push(`Auto-fixed before rendering: ${fixes.join(' ')}`);}
  if(input.script){try{input.script=scriptForFormat(input.script,input.format,input.participants,input.narrator);}catch(error){if(error instanceof z.ZodError)issues.push(...error.issues.map(i=>({path:'script.'+i.path.join('.'),message:i.message})));else issues.push({path:'script',message:'Script roles must match the requested speakers.'});}
    try{requireLatinScript(input.script);}catch{issues.push({path:'script',message:'Use Latin letters for English, Hinglish and Benglish text.'});}
  }
  const speakers=[...new Set(input.script?.dialogue.map(line=>line.speaker)??(input.narrator?[input.narrator]:input.participants?[input.participants.learner,input.participants.expert]:[]))];
  const estimatedSeconds=input.script?estimateSpokenSeconds(input.script,input.speechSpeed):0,spokenCharacters=input.script?.dialogue.reduce((n,line)=>n+line.text.length,0)??0;
  if(input.script){const estimated=estimatedSeconds,limit=maxSecondsFor(input.durationSeconds);if(estimated>limit)issues.push({path:'script.dialogue',message:`Too long: about ${estimated} seconds to speak for a ${input.durationSeconds}-second video (at most ${limit}). Use about ${targetWordsFor(input.durationSeconds,input.speechSpeed)} words.`});}
  if(!input.script&&!scriptReady)warnings.push('The selected script provider needs a key. A complete script bypasses that provider.');
  if(!config.ffmpegAvailable)warnings.push('FFmpeg is unavailable.');
  const backend=input.voiceBackend??config.voiceBackend??'elevenlabs',voiceReady=backend==='elevenlabs'?config.elevenlabsConfigured:config.speechBackends?.some(b=>b.id===backend&&b.ready)??false;
  if(!voiceReady)warnings.push('The selected speech backend is not ready.');
  const missing=speakers.filter(id=>!input.voiceIds?.[id]&&!config.characters.some(c=>c.id===id&&c.voiceReady));
  const enoughVoices=speakers.length>0||config.characters.filter(c=>c.voiceReady&&CAST_MEMBERS[input.cast].includes(c.id)).length>=(input.format==='skit'||input.format==='groupchat'?2:1);
  if(!enoughVoices)warnings.push('Prepare enough character voices for this format.');
  if(missing.length)warnings.push(`Voices need setup: ${missing.join(', ')}.`);
  if(input.script?.chat||input.script?.pr||input.script?.sketch||input.script?.tierlist){const unknown=unknownChatIcons([...(input.script.chat?.members.map(m=>m.icon)??[]),...(input.script.pr?[input.script.pr.author.icon,...input.script.pr.reviewers.map(r=>r.icon)]:[]),...(input.script.sketch?.nodes.flatMap(n=>n.icon?[n.icon]:[])??[]),...(input.script.tierlist?.items.flatMap(i=>i.icon?[i.icon]:[])??[])]);if(unknown.length)issues.push({path:'script.chat.members',message:`Unknown icon(s): ${unknown.join(', ')}. Use a Lucide name ("database", "zap") or a Simple Icons brand ("postgresql", "redis").`});}
  if(input.format==='groupchat'&&input.script){
    const long=input.script.dialogue.filter(line=>(line.chat?.display??line.text).length>140).length;
    if(long)warnings.push(`${long} message(s) are over 140 characters. Long bubbles push the thread off screen; split them into shorter texts.`);
    if(input.script.dialogue.filter(line=>line.chat?.reaction).length>3)warnings.push('More than three reactions makes reactions feel random. Keep them for real punchlines.');
  }
  if(input.broll)warnings.push('Image references and code cards are resolved during generation, before paid speech. This check does not verify external image availability or factual claims.');
  const ready=issues.length===0&&Boolean(config.ffmpegAvailable)&&voiceReady&&missing.length===0&&enoughVoices&&(Boolean(input.script)||scriptReady)&&estimatedSeconds<=maxSecondsFor(input.durationSeconds);
  return ScriptValidationSchema.parse({valid:issues.length===0,generationReady:ready,issues,warnings,format:input.format,spokenCharacters,estimatedSeconds,speakers});
}
