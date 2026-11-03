import fs from 'node:fs';
import path from 'node:path';
import {ScriptProviderPreferenceSchema,type ValidatedVideoInput} from '@brainrot/contracts';
import {providerKeys,localDataDir,loadStudioEnv} from './env.js';
import {GenerationError} from './generationError.js';

/** Everything a provider needs to write one lesson. The prompt and JSON schema are provider-neutral. */
export interface ScriptRequest{system:string;user:string;schema:Record<string,unknown>}
/**
 * A text-generation backend that can write a lesson script. To add another LLM, implement this
 * interface and append it to SCRIPT_PROVIDERS; createScript validates whatever JSON comes back.
 */
export interface ScriptProvider{
  id:string;name:string;
  isConfigured():boolean;
  /** Returns the raw model text, expected to be the script JSON. Throw GenerationError on failure. */
  generate(request:ScriptRequest):Promise<string>;
}

export const paperProvider:ScriptProvider={
  id:'paper',name:'Paper Ultramarine',
  isConfigured:()=>Boolean(providerKeys().paper),
  async generate({system,user,schema}){
    const{paper}=providerKeys();
    if(!paper)throw new GenerationError('Add PAPER_API_KEY in Settings or .env, or provide a complete script through MCP.');
    const response=await fetch('https://api.paperinstruments.com/v1/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${paper}`},signal:AbortSignal.timeout(120000),
      body:JSON.stringify({model:'ultramarine-1-flash',reasoning_effort:'high',max_completion_tokens:32768,
        messages:[{role:'system',content:system},{role:'user',content:user}],
        response_format:{type:'json_schema',json_schema:{name:'brainrotten_script',strict:true,schema}}}),
    });
    if(!response.ok)throw new GenerationError(`Paper script request failed (HTTP ${response.status}). ${response.status===401?'Check the API key.':response.status===429?'Check the API balance or rate limit.':'Retry explicitly or submit an agent-written script.'}`);
    const data=await response.json() as{choices?:Array<{message?:{content?:string}}>};
    const raw=data.choices?.[0]?.message?.content;
    if(!raw)throw new GenerationError('Paper returned no script text. Increase the output budget or shorten the topic.');
    return raw;
  },
};

export const geminiProvider:ScriptProvider={
  id:'gemini',name:'Gemini',isConfigured:()=>Boolean(providerKeys().gemini),
  async generate({system,user,schema}){
    const key=providerKeys().gemini;
    if(!key)throw new GenerationError('Add GEMINI_API_KEY in Settings or .env, or provide a complete script through MCP.');
    const model=process.env['GEMINI_MODEL']||'gemini-3.8-flash';
    if(!/^gemini-[a-zA-Z0-9._-]{1,90}$/.test(model))throw new GenerationError('GEMINI_MODEL must be a Gemini model ID.');
    const jsonSchema={...schema};delete jsonSchema['$schema'];
    let response:Response;
    try{response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(Number(process.env['GEMINI_TIMEOUT_MS'])||60000),
      body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{maxOutputTokens:16384,responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:jsonSchema}}}}),
    });}catch{throw new GenerationError('Gemini script request did not complete. Retry explicitly or submit an agent-written script.');}
    if(!response.ok)throw new GenerationError(`Gemini script request failed (HTTP ${response.status}). ${[401,403].includes(response.status)?'Check the API key and its permissions.':response.status===429?'Check the API quota or rate limit.':response.status===404?'Check GEMINI_MODEL and model access.':'Retry explicitly or submit an agent-written script.'}`);
    const data=await response.json() as {candidates?:Array<{finishReason?:string;content?:{parts?:Array<{text?:string;thought?:boolean}>}}>};
    const candidate=data.candidates?.[0];
    if(candidate?.finishReason!=='STOP')throw new GenerationError('Gemini did not return a completed script. No speech was generated. Shorten the topic or review the model response.');
    const raw=candidate.content?.parts?.filter(part=>!part.thought).map(part=>part.text??'').join('');
    if(!raw?.trim())throw new GenerationError('Gemini returned no script text. No speech was generated.');
    return raw;
  },
};
/** Auto tries these in order (see withScriptFallback). An explicit choice never falls back. */
export const SCRIPT_PROVIDERS:ScriptProvider[]=[geminiProvider,paperProvider];
export function scriptProviderPreference():NonNullable<ValidatedVideoInput['scriptProvider']>{
  loadStudioEnv();let value:unknown=process.env['BRAINROTTEN_SCRIPT_PROVIDER']??'auto';
  if(process.env['BRAINROT_SKIP_ENV']!=='1'&&process.env['BRAINROTTEN_MODE']!=='hosted'){try{value=JSON.parse(fs.readFileSync(path.join(localDataDir(),'script-provider.json'),'utf8')).provider??value;}catch{/*Environment/default.*/}}
  return ScriptProviderPreferenceSchema.parse(value);
}
export function saveScriptProvider(provider:NonNullable<ValidatedVideoInput['scriptProvider']>):void{
  if(process.env['BRAINROTTEN_MODE']==='hosted')throw new GenerationError('Script provider settings are local-only.');
  ScriptProviderPreferenceSchema.parse(provider);fs.mkdirSync(localDataDir(),{recursive:true,mode:0o700});fs.writeFileSync(path.join(localDataDir(),'script-provider.json'),JSON.stringify({provider}),{mode:0o600});
}
/** Configured providers to try, in order: every configured one for auto, only the chosen one otherwise. */
export function scriptProviderChain(preference=scriptProviderPreference()):ScriptProvider[]{return SCRIPT_PROVIDERS.filter(provider=>(preference==='auto'||provider.id===preference)&&provider.isConfigured());}
/**
 * Runs one script attempt per provider in the chain until one succeeds. In auto mode a failed or invalid Gemini
 * script falls back to Paper (and so on); an explicitly chosen provider never falls back. Throws the last error.
 */
export async function withScriptFallback<T>(preference:ValidatedVideoInput['scriptProvider']|undefined,attempt:(provider:ScriptProvider)=>Promise<T>):Promise<T>{
  const chain=scriptProviderChain(preference??scriptProviderPreference());
  if(!chain.length)throw new GenerationError('Add the selected Gemini/Paper key in Settings or .env, choose a configured script provider, or provide a complete script through MCP.');
  let last:unknown;
  for(const provider of chain){
    try{return await attempt(provider);}
    catch(error){last=error;if(provider!==chain.at(-1))console.warn(`[brainrotten] ${provider.name} script failed (${error instanceof Error?error.message:'unknown error'}); trying ${chain[chain.indexOf(provider)+1]!.name}.`);}
  }
  throw last;
}
export function activeScriptProvider(preference=scriptProviderPreference()):ScriptProvider|undefined{return SCRIPT_PROVIDERS.find(provider=>(preference==='auto'||provider.id===preference)&&provider.isConfigured());}
