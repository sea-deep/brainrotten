import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {StudioConfigSchema} from '@brainrot/contracts';
import {accessToken,completeGoogleRedirect,currentProfile,ensureAccessToken,googleStudioOrigin,isSignedIn,signOut} from './googleAuth.js';
const config=StudioConfigSchema.parse({mode:'hosted',paperConfigured:true,elevenlabsConfigured:true,ffmpegAvailable:true,voices:[],defaults:{style:'brainrot',durationSeconds:60},auth:{configured:true,loginUrl:'https://example.auth.us-east-1.amazoncognito.com/oauth2/authorize',clientId:'public-client'}});
beforeEach(()=>{sessionStorage.clear();localStorage.clear();history.replaceState({},'','/');});
afterEach(()=>{vi.unstubAllGlobals();});
describe('Cognito redirect boundary',()=>{
  it('uses Cognito’s localhost exception for local HTTP callbacks',()=>{expect(googleStudioOrigin('http://127.0.0.1:3001')).toBe('http://localhost:3001');expect(googleStudioOrigin('http://localhost:5173')).toBe('http://localhost:5173');expect(googleStudioOrigin('https://studio.example.com')).toBe('https://studio.example.com');});
  it('rejects mismatched OAuth state without sending the authorization code',async()=>{
    sessionStorage.setItem('brainrotten.oauth',JSON.stringify({state:'expected',verifier:'verifier',redirectUri:location.origin+'/auth/callback',createdAt:Date.now()}));history.replaceState({},'','/auth/callback?code=private-code&state=wrong');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(completeGoogleRedirect(config)).rejects.toThrow('Sign-in session expired');expect(fetch).not.toHaveBeenCalled();expect(location.search).toBe('');expect(accessToken()).toBeNull();
  });
  it('removes an expired access token',()=>{sessionStorage.setItem('brainrotten.access',JSON.stringify({token:'expired-synthetic-token',expiresAt:Date.now()-1000}));expect(accessToken()).toBeNull();expect(sessionStorage.getItem('brainrotten.access')).toBeNull();});
});
const b64=(value:object)=>btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const idToken=b64({alg:'none'})+'.'+b64({name:'Synthetic Learner',email:'learner@example.com',picture:'https://lh3.googleusercontent.com/a/synthetic'})+'.sig';
describe('signed-in session',()=>{
  const finish=async(returnTo:string)=>{
    sessionStorage.setItem('brainrotten.oauth',JSON.stringify({state:'s1',verifier:'v1',redirectUri:location.origin+'/auth/callback',createdAt:Date.now(),returnTo}));
    history.replaceState({},'','/auth/callback?code=synthetic-code&state=s1');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({access_token:'synthetic-access',expires_in:3600,refresh_token:'synthetic-refresh',id_token:idToken})));
    return completeGoogleRedirect(config);
  };
  it('returns to the page the visitor started from and shares the session across tabs',async()=>{
    expect(await finish('/mcp#python')).toBe('/mcp#python');
    expect(location.pathname).toBe('/mcp');
    expect(accessToken()).toBe('synthetic-access');expect(isSignedIn()).toBe(true);
    expect(JSON.parse(localStorage.getItem('brainrotten.session')!).refreshToken).toBe('synthetic-refresh');
    expect(currentProfile()).toEqual({name:'Synthetic Learner',email:'learner@example.com',picture:'https://lh3.googleusercontent.com/a/synthetic'});
  });
  it('never returns to another site after sign-in',async()=>{
    expect(await finish('//evil.example.com/steal')).toBe('/studio');
  });
  it('renews an expired access token silently with the refresh token',async()=>{
    await finish('/studio');
    const stored=JSON.parse(localStorage.getItem('brainrotten.session')!);localStorage.setItem('brainrotten.session',JSON.stringify({...stored,expiresAt:Date.now()-1000}));
    expect(accessToken()).toBeNull();expect(isSignedIn()).toBe(true);
    const fetch=vi.fn().mockResolvedValue(Response.json({access_token:'synthetic-renewed',expires_in:3600}));vi.stubGlobal('fetch',fetch);
    expect(await ensureAccessToken()).toBe('synthetic-renewed');
    const body=new URLSearchParams(String(fetch.mock.calls[0]![1].body));
    expect(String(fetch.mock.calls[0]![0])).toBe('https://example.auth.us-east-1.amazoncognito.com/oauth2/token');
    expect(body.get('grant_type')).toBe('refresh_token');expect(body.get('refresh_token')).toBe('synthetic-refresh');
    expect(currentProfile()?.name).toBe('Synthetic Learner');
  });
  it('signs out when the refresh token is rejected, and revokes it on sign-out',async()=>{
    await finish('/studio');
    const stored=JSON.parse(localStorage.getItem('brainrotten.session')!);localStorage.setItem('brainrotten.session',JSON.stringify({...stored,expiresAt:Date.now()-1000}));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:400})));
    expect(await ensureAccessToken()).toBeNull();expect(isSignedIn()).toBe(false);
    await finish('/studio');const revoke=vi.fn().mockResolvedValue(new Response(''));vi.stubGlobal('fetch',revoke);
    signOut();expect(isSignedIn()).toBe(false);expect(String(revoke.mock.calls[0]![0])).toContain('/oauth2/revoke');
  });
});
