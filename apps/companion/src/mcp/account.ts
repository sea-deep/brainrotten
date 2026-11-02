import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {z} from 'zod/v4';
import {setTimeout as delay} from 'node:timers/promises';
const ProfileSchema=z.object({apiUrl:z.url(),domain:z.url(),issuer:z.url(),clientId:z.string().regex(/^[a-z0-9]{10,128}$/),accessToken:z.string().min(20).max(16000),refreshToken:z.string().min(20).max(16000),expiresAt:z.number().positive()});
type AccountProfile=z.infer<typeof ProfileSchema>;
export const AGENT_CALLBACK='http://localhost:43891/callback';
export function accountApiUrl(raw:string){const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use the hosted HTTPS API URL without credentials or query parameters.');return url.toString().replace(/\/$/,'');}
function file(dataDir:string){return path.join(dataDir,'account-connection.json');}
export function readAccountProfile(dataDir:string):AccountProfile{
  try{const profile=ProfileSchema.parse(JSON.parse(fs.readFileSync(file(dataDir),'utf8')));accountApiUrl(profile.apiUrl);const domain=new URL(profile.domain);if(domain.protocol!=='https:'||domain.username||domain.password||domain.search||domain.hash||domain.pathname!=='/')throw new Error();if(!/^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/.test(profile.issuer))throw new Error();return profile;}
  catch{throw new Error('Sign in first with pnpm brainrotten login --api-url https://YOUR_API/api/v1.');}
}
function writeProfile(dataDir:string,profile:AccountProfile){fs.mkdirSync(dataDir,{recursive:true,mode:0o700});const target=file(dataDir),temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(ProfileSchema.parse(profile)),{mode:0o600});fs.chmodSync(temp,0o600);fs.renameSync(temp,target);}
function claims(token:string):Record<string,unknown>{try{return JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString('utf8')) as Record<string,unknown>;}catch{throw new Error('The sign-in service returned an invalid access token.');}}
function receivedProfile(profile:Pick<AccountProfile,'apiUrl'|'domain'|'issuer'|'clientId'>,response:Record<string,unknown>,previousRefresh?:string):AccountProfile{
  const token=String(response['access_token']??''),metadata=claims(token);
  // Only metadata checks here. API Gateway verifies the signature and ownership on every API call.
  if(metadata['token_use']!=='access'||metadata['iss']!==profile.issuer||metadata['client_id']!==profile.clientId||typeof metadata['sub']!=='string')throw new Error('The account token does not match this service/client.');
  const expiry=Number(metadata['exp'])*1000;if(!Number.isFinite(expiry)||expiry<=Date.now()+30000)throw new Error('The account token is already expired.');
  return ProfileSchema.parse({...profile,accessToken:token,refreshToken:response['refresh_token']??previousRefresh,expiresAt:expiry});
}
async function tokenRequest(domain:string,body:URLSearchParams){
  const response=await fetch(domain+'/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString(),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Account authorization expired or was revoked. Sign in again; no generation was requested.');
  return await response.json() as Record<string,unknown>;
}
const refreshing=new Map<string,Promise<string>>();
export async function accountAccessToken(dataDir:string,expectedApiUrl?:string):Promise<string>{
  const profile=readAccountProfile(dataDir);if(expectedApiUrl&&profile.apiUrl!==expectedApiUrl)throw new Error('The saved account connection changed. Reconnect this MCP process before using it.');if(profile.expiresAt>Date.now()+60000)return profile.accessToken;
  const existing=refreshing.get(dataDir);if(existing)return existing;
  const pending=(async()=>{
    const lock=path.join(dataDir,'account-refresh.lock'),deadline=Date.now()+45000;let acquired=false;
    while(!acquired){try{fs.mkdirSync(lock,{mode:0o700});acquired=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;try{if(Date.now()-fs.statSync(lock).mtimeMs>90000)fs.rmdirSync(lock);}catch{/* Another process released the lock. */}if(Date.now()>deadline)throw new Error('Another agent is refreshing this account. Retry shortly.',{cause:error});await delay(100);}}
    try{const latest=readAccountProfile(dataDir);if(latest.apiUrl!==profile.apiUrl)throw new Error('Account connection changed. Reconnect your agent.');if(latest.expiresAt>Date.now()+60000)return latest.accessToken;const response=await tokenRequest(latest.domain,new URLSearchParams({grant_type:'refresh_token',client_id:latest.clientId,refresh_token:latest.refreshToken}));const next=receivedProfile(latest,response,latest.refreshToken);const current=readAccountProfile(dataDir);if(current.apiUrl!==latest.apiUrl||current.refreshToken!==latest.refreshToken)throw new Error('Account connection changed during refresh. Reconnect your agent.');writeProfile(dataDir,next);return next.accessToken;}
    finally{fs.rmdirSync(lock);}
  })();
  refreshing.set(dataDir,pending);try{return await pending;}finally{refreshing.delete(dataDir);}
}
export function removeAccountProfile(dataDir:string){fs.rmSync(file(dataDir),{force:true});}
export async function accountLogin(api:string,dataDir:string,openBrowser=true,onUrl?:(url:string)=>void):Promise<void>{
  const apiUrl=accountApiUrl(api),response=await fetch(apiUrl+'/studio/config',{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Cannot read the hosted sign-in configuration.');
  const config=await response.json() as {auth?:{configured?:boolean;domain?:string;issuer?:string;agentClientId?:string}};
  const auth=config.auth;if(!auth?.configured||!auth.domain||!auth.issuer||!auth.agentClientId)throw new Error('Configure the hosted Cognito agent app client first; see the account setup guide.');
  const domain=new URL(auth.domain);if(domain.protocol!=='https:'||domain.username||domain.password||domain.pathname!=='/'||domain.search||domain.hash||!/^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/.test(auth.issuer)||!/^[a-z0-9]{10,128}$/.test(auth.agentClientId))throw new Error('Invalid Cognito sign-in configuration.');
  const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url');
  const authorize=new URL(domain.origin+'/oauth2/authorize');
  authorize.search=new URLSearchParams({client_id:auth.agentClientId,response_type:'code',scope:'openid email profile',redirect_uri:AGENT_CALLBACK,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
  await new Promise<void>((resolve,reject)=>{
    let handled=false;
    const finish=(error?:unknown)=>{clearTimeout(timer);server.closeAllConnections();server.close();if(error)reject(error);else resolve();};
    const server=createServer(async(req,res)=>{
      const callback=new URL(req.url??'/',AGENT_CALLBACK);
      if(callback.pathname!=='/callback'){res.writeHead(404).end();return;}
      const receivedState=callback.searchParams.get('state')??'';
      if(handled||!/^[a-f0-9]{64}$/.test(receivedState)||receivedState.length!==state.length||!timingSafeEqual(Buffer.from(receivedState),Buffer.from(state))){res.writeHead(400,{'content-type':'text/plain'}).end('Invalid login state.');return;}
      handled=true;
      const code=callback.searchParams.get('code');if(!code||code.length>4096){res.writeHead(400).end('Sign-in was cancelled.');finish(new Error('Sign-in was cancelled.'));return;}
      try{const tokens=await tokenRequest(domain.origin,new URLSearchParams({grant_type:'authorization_code',client_id:auth.agentClientId!,redirect_uri:AGENT_CALLBACK,code,code_verifier:verifier}));writeProfile(dataDir,receivedProfile({apiUrl,domain:domain.origin,issuer:auth.issuer!,clientId:auth.agentClientId!},tokens));res.once('finish',()=>finish());res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','content-security-policy':"default-src 'none'"}).end('Connected to Brainrotten. You can close this tab and reconnect your agent.');}
      catch{res.once('finish',()=>finish(new Error('Could not finish account sign-in.')));res.writeHead(400,{'content-type':'text/plain'}).end('Could not finish sign-in. Return to the terminal and try again.');}
    });
    const timer=setTimeout(()=>finish(new Error('Sign-in timed out after five minutes.')),300000);
    server.once('error',()=>finish(new Error('The account callback port is unavailable. Close another login attempt and retry.')));
    server.listen(43891,'127.0.0.1',()=>{
      process.stderr.write('Continue in your browser: '+authorize.toString()+'\n');onUrl?.(authorize.toString());
      if(openBrowser){const command=process.platform==='darwin'?'open':process.platform==='win32'?'explorer':'xdg-open';const child=spawn(command,[authorize.toString()],{stdio:'ignore'});child.on('error',()=>{});child.unref();}
    });
  });
}
