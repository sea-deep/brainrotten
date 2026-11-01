import type {StudioConfig} from '@brainrot/contracts';
const SESSION='brainrotten.oauth',TOKEN='brainrotten.access';
export function googleStudioOrigin(origin=window.location.origin):string{const url=new URL(origin);if(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname))url.hostname='localhost';return url.origin;}
export function accessToken():string|null{try{const value=JSON.parse(sessionStorage.getItem(TOKEN)??'null') as{token:string;expiresAt:number}|null;if(value&&value.expiresAt>Date.now()+30000)return value.token;}catch{/*expired or malformed session*/}sessionStorage.removeItem(TOKEN);return null;}
export function isSignedIn():boolean{return Boolean(accessToken());}
export function signOut():void{sessionStorage.removeItem(TOKEN);sessionStorage.removeItem(SESSION);}
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function signInWithGoogle(config:StudioConfig):Promise<void>{
  if(!config.auth?.configured||!config.auth.loginUrl||!config.auth.clientId)throw new Error('Google sign-in is not configured.');
  const origin=googleStudioOrigin();if(origin!==window.location.origin){window.location.assign(`${origin}/studio?sign-in=google`);return;}
  const url=new URL(config.auth.loginUrl);if(url.protocol!=='https:')throw new Error('Sign-in requires a secure Cognito domain.');
  const verifier=random(),state=random(),redirectUri=`${origin}/auth/callback`;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  sessionStorage.setItem(SESSION,JSON.stringify({verifier,state,redirectUri,createdAt:Date.now()}));
  url.search=new URLSearchParams({response_type:'code',client_id:config.auth.clientId,redirect_uri:redirectUri,scope:'openid email profile',identity_provider:'Google',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  window.location.assign(url.toString());
}
let completing:Promise<void>|undefined;
export async function completeGoogleRedirect(config:StudioConfig):Promise<void>{
  if(window.location.pathname!=='/auth/callback')return;
  completing??=(async()=>{
    const params=new URLSearchParams(window.location.search);
    const code=params.get('code');
    if(params.get('error')){sessionStorage.removeItem(SESSION);history.replaceState({},'', '/studio');throw new Error('Google sign-in was cancelled or rejected.');}
    if(!code)return;
    type Saved={verifier:string;state:string;redirectUri:string;createdAt:number};
    let saved:Saved|null=null;
    try{saved=JSON.parse(sessionStorage.getItem(SESSION)??'null') as Saved|null;}catch{/*reject malformed state*/}
    sessionStorage.removeItem(SESSION);
    history.replaceState({},'', '/studio');
    if(!saved||params.get('state')!==saved.state||Date.now()-saved.createdAt>600000||!config.auth?.loginUrl||!config.auth.clientId)throw new Error('Sign-in session expired. Continue with Google again.');
    const endpoint=new URL('/oauth2/token',config.auth.loginUrl);if(endpoint.protocol!=='https:')throw new Error('Invalid sign-in configuration.');
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.auth.clientId,code,redirect_uri:saved.redirectUri,code_verifier:saved.verifier})});
    if(!response.ok)throw new Error('Could not finish sign-in. Continue with Google again.');
    const result=await response.json() as{access_token?:string;expires_in?:number};
    if(!result.access_token||!Number.isFinite(result.expires_in)||Number(result.expires_in)<=0)throw new Error('Sign-in returned no valid session.');
    sessionStorage.setItem(TOKEN,JSON.stringify({token:result.access_token,expiresAt:Date.now()+Math.min(Number(result.expires_in),86400)*1000}));
  })();
  try{await completing;}catch(error){completing=undefined;throw error;}
}
