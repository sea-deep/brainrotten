import type {StudioConfig} from '@brainrot/contracts';
// PKCE state lives in this tab only; the signed-in session is shared by tabs and renewed with the refresh token.
const SESSION='brainrotten.oauth',STORE='brainrotten.session',LEGACY='brainrotten.access',DRAFT='brainrotten.draft';
export type Profile={name?:string|undefined;email?:string|undefined;picture?:string|undefined};
type Stored={accessToken:string;expiresAt:number;refreshToken?:string|undefined;tokenUrl:string;clientId:string;profile:Profile};
const listeners=new Set<()=>void>();
export function onSessionChange(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}
const notify=()=>listeners.forEach(listener=>listener());
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===STORE)notify();});

export function googleStudioOrigin(origin=window.location.origin):string{const url=new URL(origin);if(url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname))url.hostname='localhost';return url.origin;}
function read():Stored|null{
  try{sessionStorage.removeItem(LEGACY);const value=JSON.parse(localStorage.getItem(STORE)??'null') as Stored|null;if(value&&typeof value.accessToken==='string'&&typeof value.tokenUrl==='string')return value;}catch{/*storage blocked or malformed*/}
  try{localStorage.removeItem(STORE);}catch{/*storage blocked*/}return null;
}
function write(value:Stored|null){try{if(value)localStorage.setItem(STORE,JSON.stringify(value));else localStorage.removeItem(STORE);}catch{/*storage blocked: the session lasts for this page only*/}notify();}
/** A valid access token, or null when it has expired (use ensureAccessToken to renew). */
export function accessToken():string|null{const value=read();return value&&value.expiresAt>Date.now()+30000?value.accessToken:null;}
export function isSignedIn():boolean{const value=read();return Boolean(value&&(value.refreshToken||value.expiresAt>Date.now()+30000));}
export function currentProfile():Profile|null{return isSignedIn()?read()?.profile??{}:null;}

let refreshing:Promise<string|null>|undefined;
/** Returns a valid access token, renewing it silently with the refresh token when needed. */
export async function ensureAccessToken():Promise<string|null>{
  const now=accessToken();if(now)return now;
  const value=read();if(!value?.refreshToken)return null;
  refreshing??=(async()=>{
    try{
      const response=await fetch(value.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:value.clientId,refresh_token:value.refreshToken!})});
      if(!response.ok){if(response.status===400||response.status===401)write(null);return null;}
      const result=await response.json() as{access_token?:string;expires_in?:number;id_token?:string};
      if(!result.access_token||!Number.isFinite(result.expires_in))return null;
      write({...value,accessToken:result.access_token,expiresAt:Date.now()+Math.min(Number(result.expires_in),86400)*1000,profile:result.id_token?profileFrom(result.id_token):value.profile});
      return result.access_token;
    }catch{return null;}finally{refreshing=undefined;}
  })();
  return refreshing;
}
export function signOut():void{
  const value=read();write(null);sessionStorage.removeItem(SESSION);
  if(value?.refreshToken)void fetch(value.tokenUrl.replace(/\/oauth2\/token$/,'/oauth2/revoke'),{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:value.refreshToken,client_id:value.clientId})}).catch(()=>{});
}
function profileFrom(idToken:string):Profile{
  try{const part=idToken.split('.')[1]!;const claims=JSON.parse(decodeURIComponent(escape(atob(part.replace(/-/g,'+').replace(/_/g,'/'))))) as Record<string,unknown>;
    const text=(key:string)=>typeof claims[key]==='string'?claims[key] as string:undefined;const picture=text('picture');
    return{name:text('name')??text('given_name'),email:text('email'),picture:picture?.startsWith('https://')?picture:undefined};}catch{return{};}
}
const safePath=(value:string|undefined|null)=>value&&value.startsWith('/')&&!value.startsWith('//')&&!value.startsWith('/auth/callback')?value:'/studio';
/** Keeps unsent Studio text across the Google round trip. */
export function saveDraft(draft:Record<string,unknown>):void{try{sessionStorage.setItem(DRAFT,JSON.stringify(draft));}catch{/*storage blocked*/}}
export function takeDraft<T>():T|null{try{const value=sessionStorage.getItem(DRAFT);sessionStorage.removeItem(DRAFT);return value?JSON.parse(value) as T:null;}catch{return null;}}

const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function signInWithGoogle(config:StudioConfig,returnTo=window.location.pathname+window.location.search):Promise<void>{
  if(!config.auth?.configured||!config.auth.loginUrl||!config.auth.clientId)throw new Error('Google sign-in is not configured.');
  const origin=googleStudioOrigin();if(origin!==window.location.origin){window.location.assign(`${origin}/studio?sign-in=google`);return;}
  const url=new URL(config.auth.loginUrl);if(url.protocol!=='https:')throw new Error('Sign-in requires a secure Cognito domain.');
  const verifier=random(),state=random(),redirectUri=`${origin}/auth/callback`;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  sessionStorage.setItem(SESSION,JSON.stringify({verifier,state,redirectUri,createdAt:Date.now(),returnTo:safePath(returnTo)}));
  url.search=new URLSearchParams({response_type:'code',client_id:config.auth.clientId,redirect_uri:redirectUri,scope:'openid email profile',identity_provider:'Google',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  window.location.assign(url.toString());
}
let completing:Promise<string|null>|undefined;
/** Finishes the Google redirect. Returns the path the visitor started from, or null when there was no redirect. */
export async function completeGoogleRedirect(config:StudioConfig):Promise<string|null>{
  if(window.location.pathname!=='/auth/callback')return null;
  completing??=(async()=>{
    const params=new URLSearchParams(window.location.search);
    const code=params.get('code');
    if(params.get('error')){sessionStorage.removeItem(SESSION);history.replaceState({},'', '/studio');throw new Error('Google sign-in was cancelled or rejected.');}
    if(!code)return null;
    type Saved={verifier:string;state:string;redirectUri:string;createdAt:number;returnTo?:string};
    let saved:Saved|null=null;
    try{saved=JSON.parse(sessionStorage.getItem(SESSION)??'null') as Saved|null;}catch{/*reject malformed state*/}
    sessionStorage.removeItem(SESSION);
    const returnTo=safePath(saved?.returnTo);
    history.replaceState({},'',returnTo);
    if(!saved||params.get('state')!==saved.state||Date.now()-saved.createdAt>600000||!config.auth?.loginUrl||!config.auth.clientId)throw new Error('Sign-in session expired. Continue with Google again.');
    const endpoint=new URL('/oauth2/token',config.auth.loginUrl);if(endpoint.protocol!=='https:')throw new Error('Invalid sign-in configuration.');
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.auth.clientId,code,redirect_uri:saved.redirectUri,code_verifier:saved.verifier})});
    if(!response.ok)throw new Error('Could not finish sign-in. Continue with Google again.');
    const result=await response.json() as{access_token?:string;expires_in?:number;refresh_token?:string;id_token?:string};
    if(!result.access_token||!Number.isFinite(result.expires_in)||Number(result.expires_in)<=0)throw new Error('Sign-in returned no valid session.');
    write({accessToken:result.access_token,expiresAt:Date.now()+Math.min(Number(result.expires_in),86400)*1000,refreshToken:result.refresh_token,tokenUrl:endpoint.toString(),clientId:config.auth.clientId,profile:result.id_token?profileFrom(result.id_token):{}});
    return returnTo;
  })();
  // The callback URL is replaced once this finishes, so later calls return null early.
  try{return await completing;}finally{completing=undefined;}
}
