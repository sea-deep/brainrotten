import {afterEach,describe,expect,it,vi} from 'vitest';
import {SCRIPT_PROVIDERS,activeScriptProvider,geminiProvider,type ScriptProvider} from './scriptProviders.js';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('script providers',()=>{
  it('registers Paper as the default provider',()=>{expect(SCRIPT_PROVIDERS.map(provider=>provider.id)).toContain('paper');});
  it('picks the first configured provider in registry order',()=>{
    const fake:ScriptProvider={id:'fake',name:'Fake',isConfigured:()=>true,generate:async()=>'{}'};
    SCRIPT_PROVIDERS.unshift(fake);
    try{expect(activeScriptProvider()?.id).toBe('fake');}finally{SCRIPT_PROVIDERS.shift();}
  });
  it('returns nothing when no provider is configured',()=>{
    const saved=[...SCRIPT_PROVIDERS];SCRIPT_PROVIDERS.splice(0,SCRIPT_PROVIDERS.length,{id:'off',name:'Off',isConfigured:()=>false,generate:async()=>''});
    try{expect(activeScriptProvider()).toBeUndefined();}finally{SCRIPT_PROVIDERS.splice(0,SCRIPT_PROVIDERS.length,...saved);}
  });
});

describe('Gemini structured script generation',()=>{
  const request={system:'Natural Hinglish skit.',user:'GPU memory versus RAM',schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{title:{type:'string'}}}};
  it('prefers configured Gemini in auto mode but preserves explicit Paper selection',()=>{vi.stubEnv('GEMINI_API_KEY','synthetic-gemini');vi.stubEnv('PAPER_API_KEY','synthetic-paper');expect(activeScriptProvider('auto')?.id).toBe('gemini');expect(activeScriptProvider('paper')?.id).toBe('paper');});
  it('does not silently fall back when explicitly selected Gemini has no key',async()=>{vi.stubEnv('GEMINI_API_KEY','');vi.stubEnv('PAPER_API_KEY','synthetic-paper');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(activeScriptProvider('gemini')).toBeUndefined();await expect(geminiProvider.generate(request)).rejects.toThrow('GEMINI_API_KEY');expect(fetch).not.toHaveBeenCalled();});
  it('sends a header-authenticated schema request and excludes thought parts from the result',async()=>{vi.stubEnv('GEMINI_API_KEY','synthetic-gemini');vi.stubEnv('GEMINI_MODEL','gemini-3.8-flash');const fetch=vi.fn().mockResolvedValue(Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:'{"title":'},{text:'"GPU"}'}]}}]}));vi.stubGlobal('fetch',fetch);expect(await geminiProvider.generate(request)).toBe('{"title":"GPU"}');const [url,options]=fetch.mock.calls[0]!;expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');expect(url).not.toContain('synthetic-gemini');expect(options.headers['x-goog-api-key']).toBe('synthetic-gemini');const body=JSON.parse(options.body);expect(body.systemInstruction.parts[0].text).toBe(request.system);expect(body.generationConfig.responseFormat.text.schema).not.toHaveProperty('$schema');expect(body.generationConfig.responseFormat.text.schema.properties).toEqual(request.schema.properties);});
  it.each(['MAX_TOKENS','SAFETY','RECITATION'])('rejects incomplete or blocked %s output before speech',async finishReason=>{vi.stubEnv('GEMINI_API_KEY','synthetic-gemini');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({candidates:[{finishReason,content:{parts:[{text:'{"title":"partial'}]}}]})));await expect(geminiProvider.generate(request)).rejects.toThrow('completed script');});
  it('does not expose provider error text or API keys',async()=>{vi.stubEnv('GEMINI_API_KEY','synthetic-gemini');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('provider echoes synthetic-gemini',{status:403})));await expect(geminiProvider.generate(request)).rejects.toThrow('permissions');await expect(geminiProvider.generate(request)).rejects.not.toThrow('synthetic-gemini');});
});
