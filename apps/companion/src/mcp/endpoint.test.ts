import {describe,it,expect} from 'vitest';
import {mcpEndpoint} from './endpoint.js';
describe('MCP endpoint credential boundary',()=>{
  it('defaults to the same-user local service',()=>{expect(mcpEndpoint({},3001)).toEqual({baseUrl:'http://127.0.0.1:3001/api/v1',remote:false});});
  it('never substitutes the local token for a hosted credential',()=>{expect(()=>mcpEndpoint({BRAINROTTEN_API_URL:'https://api.example.com/api/v1',BRAINROTTEN_MCP_TOKEN:'a'.repeat(64)},3001)).toThrow('BRAINROTTEN_API_TOKEN');});
  it('requires HTTPS and rejects URL credentials and token header injection',()=>{for(const url of ['http://api.example.com','https://user:secret@api.example.com','https://api.example.com?token=x'])expect(()=>mcpEndpoint({BRAINROTTEN_API_URL:url,BRAINROTTEN_API_TOKEN:'test'},3001)).toThrow();expect(()=>mcpEndpoint({BRAINROTTEN_API_URL:'https://api.example.com',BRAINROTTEN_API_TOKEN:'x\r\ny'},3001)).toThrow();});
  it('uses only the explicitly supplied hosted token',()=>{expect(mcpEndpoint({BRAINROTTEN_API_URL:'https://api.example.com/api/v1/',BRAINROTTEN_API_TOKEN:'synthetic-hosted-token',BRAINROTTEN_MCP_TOKEN:'local-secret'},3001)).toEqual({baseUrl:'https://api.example.com/api/v1',remote:true,token:'synthetic-hosted-token'});});
});
