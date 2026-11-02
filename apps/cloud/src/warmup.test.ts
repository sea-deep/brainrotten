import {describe,expect,it,vi} from 'vitest';
import {db} from './store.js';
import {handler as api} from './api.js';
import {handler as worker} from './worker.js';

describe('keep-warm pings and the public format guide',()=>{
  it('answers a scheduled ping without touching the database or queue',async()=>{
    const send=vi.spyOn(db,'send');
    expect(await api({warmup:true} as never)).toEqual({statusCode:200,body:'warm'});
    expect(await worker({warmup:true} as never,{} as never,()=>{})).toEqual({batchItemFailures:[]});
    expect(send).not.toHaveBeenCalled();
  });
  it('serves format rules and a complete example without sign-in',async()=>{
    vi.stubEnv('HOSTED_ENABLED','true');
    const event=(format:string,language='hinglish')=>({rawPath:'/api/v1/formats/guide',queryStringParameters:{format,language},requestContext:{http:{method:'GET',sourceIp:'1.1.1.1'}},headers:{}}) as never;
    const sketch=await api(event('sketch')) as {statusCode:number;body:string};
    expect(sketch.statusCode).toBe(200);
    const body=JSON.parse(sketch.body);
    expect(body).toMatchObject({format:'sketch',storyExample:{format:'sketch'}});expect(body.readyVoices.length).toBeGreaterThan(0);
    const skit=JSON.parse((await api(event('skit')) as {body:string}).body);
    expect(skit.storyExample.participants).toBeDefined();expect(skit.characterGuide).toContain('Latin');
    expect((await api(event('sketch','french')) as {statusCode:number}).statusCode).toBe(400);
    vi.unstubAllEnvs();
  });
});
