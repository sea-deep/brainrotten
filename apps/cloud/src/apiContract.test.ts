import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {APIGatewayProxyEventV2} from 'aws-lambda';
import {handler} from './api.js';

// The HTTP contract a client relies on: status codes, the error body shape and the headers on every response.
beforeEach(()=>{
  vi.stubEnv('HOSTED_ENABLED','true');vi.stubEnv('DYNAMODB_TABLE','test-only');
  vi.stubEnv('JOB_QUEUE_URL','https://sqs.us-east-1.amazonaws.com/123456789012/test-queue');
  vi.stubEnv('COGNITO_ISSUER','https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TESTPOOL');vi.stubEnv('COGNITO_CLIENT_ID','test-client-id');
});
type Result={statusCode:number;headers:Record<string,string>;body:string};
const call=async(method:string,path:string,{body,type='application/json',signedIn=true}:{body?:string;type?:string|null;signedIn?:boolean}={})=>{
  const event={rawPath:`/api/v1${path}`,body,headers:type?{'content-type':type}:{},requestContext:{requestId:'req-123',http:{method},
    ...(signedIn?{authorizer:{jwt:{claims:{iss:process.env['COGNITO_ISSUER'],client_id:'test-client-id',token_use:'access',sub:'alice'}}}}:{})}} as unknown as APIGatewayProxyEventV2;
  const result=await handler(event) as Result;return{...result,json:JSON.parse(result.body) as Record<string,unknown>};
};

describe('API contract',()=>{
  it('puts nosniff and the request ID on every response, success or error',async()=>{
    for(const result of [await call('GET','/health'),await call('GET','/nope')]){
      expect(result.headers['x-content-type-options']).toBe('nosniff');
      expect(result.headers['x-request-id']).toBe('req-123');
    }
  });
  it('gives every error the documented shape: code, message, retryable and requestId',async()=>{
    const result=await call('GET','/videos',{signedIn:false});
    expect(result.statusCode).toBe(401);
    expect(result.json).toEqual({code:'unauthorized',message:expect.any(String),retryable:false,requestId:'req-123'});
  });
  it('answers malformed JSON with 400 invalid_json',async()=>{
    const result=await call('POST','/videos/validate',{body:'{bad'});
    expect(result.statusCode).toBe(400);expect(result.json).toMatchObject({code:'invalid_json',retryable:false});
  });
  it('answers a missing body with 400 and a non-JSON content type with 415',async()=>{
    expect((await call('POST','/videos/validate')).json).toMatchObject({code:'missing_body'});
    const result=await call('POST','/videos/validate',{body:'hello',type:'text/plain'});
    expect(result.statusCode).toBe(415);expect(result.json).toMatchObject({code:'unsupported_media_type'});
  });
  it('answers an oversized body with 413',async()=>{
    const result=await call('POST','/videos/validate',{body:JSON.stringify({prompt:'x'.repeat(200_000)})});
    expect(result.statusCode).toBe(413);expect(result.json).toMatchObject({code:'payload_too_large'});
  });
  it('accepts JSON with a charset and keeps validation failures as 200 with issues',async()=>{
    const result=await call('POST','/videos/validate',{body:JSON.stringify({format:'nope',prompt:1}),type:'application/json; charset=utf-8'});
    expect(result.statusCode).toBe(200);expect(result.json).toMatchObject({valid:false});
  });
  it('marks server-side failures as retryable and client mistakes as not',async()=>{
    const {RETRYABLE}=await import('./api.js');
    expect([429,500,502,503,504].every(code=>RETRYABLE.has(code))).toBe(true);
    expect([400,401,403,404,409,413,415,422].some(code=>RETRYABLE.has(code))).toBe(false);
  });
});
