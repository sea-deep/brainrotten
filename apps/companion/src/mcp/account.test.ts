import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {accountAccessToken,readAccountProfile,accountApiUrl,removeAccountProfile} from './account.js';
let directory:string;
const base={apiUrl:'https://brainrotten.example/api/v1',domain:'https://example.auth.us-east-1.amazoncognito.com',issuer:'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',clientId:'abc123def456',accessToken:'synthetic-access-token-old',refreshToken:'synthetic-refresh-token-old',expiresAt:1};
const jwt=(overrides:Record<string,unknown>={})=>'e30.'+Buffer.from(JSON.stringify({token_use:'access',iss:base.issuer,client_id:base.clientId,sub:'alice',exp:Math.floor(Date.now()/1000)+3600,...overrides})).toString('base64url')+'.synthetic';
beforeEach(async()=>{directory=await fs.mkdtemp(path.join(os.tmpdir(),'brainrotten-account-'));await fs.writeFile(path.join(directory,'account-connection.json'),JSON.stringify(base),{mode:0o600});});
afterEach(async()=>{vi.unstubAllGlobals();await fs.rm(directory,{recursive:true,force:true});});
describe('private account connection',()=>{
  it('accepts real Cognito pool IDs with capital letters and rejects non-Cognito issuers',async()=>{
    const write=(issuer:string)=>fs.writeFile(path.join(directory,'account-connection.json'),JSON.stringify({...base,issuer,expiresAt:Date.now()+3600000}),{mode:0o600});
    await write('https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_QIYaO2Hex');
    expect(readAccountProfile(directory).issuer).toContain('QIYaO2Hex');
    await write('https://evil.example.com/ap-south-1_QIYaO2Hex');
    expect(()=>readAccountProfile(directory)).toThrow('Sign in first');
  });
  it('refreshes once across concurrent tool calls and saves a rotated token privately',async()=>{const token=jwt(),fetch=vi.fn().mockResolvedValue(Response.json({access_token:token,refresh_token:'synthetic-refresh-token-new'}));vi.stubGlobal('fetch',fetch);const results=await Promise.all([accountAccessToken(directory),accountAccessToken(directory)]);expect(results).toEqual([token,token]);expect(fetch).toHaveBeenCalledTimes(1);expect(String(fetch.mock.calls[0]![1].body)).toContain('grant_type=refresh_token');expect(readAccountProfile(directory).refreshToken).toBe('synthetic-refresh-token-new');if(process.platform!=='win32')expect((await fs.stat(path.join(directory,'account-connection.json'))).mode&0o777).toBe(0o600);expect(await fs.stat(path.join(directory,'account-refresh.lock')).catch(()=>null)).toBeNull();});
  it('fails without falling back to a local token when refresh is revoked',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('sensitive provider response',{status:400})));await expect(accountAccessToken(directory)).rejects.toThrow('expired or was revoked');expect(readAccountProfile(directory).refreshToken).toBe(base.refreshToken);});
  it('does not send a different account/service token to an already connected API',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(accountAccessToken(directory,'https://other.example/api/v1')).rejects.toThrow('connection changed');expect(fetch).not.toHaveBeenCalled();expect(()=>accountApiUrl('http://example.com')).toThrow();expect(()=>accountApiUrl('https://user:secret@example.com')).toThrow();});
  it('rejects a mismatched client token and removes the local connection on logout',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({access_token:jwt({client_id:'other-client'})})));await expect(accountAccessToken(directory)).rejects.toThrow('does not match');removeAccountProfile(directory);expect(()=>readAccountProfile(directory)).toThrow('Sign in first');});
});
