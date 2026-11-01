import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {StudioConfigSchema} from '@brainrot/contracts';
import {accessToken,completeGoogleRedirect,googleStudioOrigin} from './googleAuth.js';
const config=StudioConfigSchema.parse({mode:'hosted',paperConfigured:true,elevenlabsConfigured:true,ffmpegAvailable:true,voices:[],defaults:{style:'brainrot',durationSeconds:60},auth:{configured:true,loginUrl:'https://example.auth.us-east-1.amazoncognito.com/oauth2/authorize',clientId:'public-client'}});
beforeEach(()=>{sessionStorage.clear();history.replaceState({},'','/');});
afterEach(()=>{vi.unstubAllGlobals();});
describe('Cognito redirect boundary',()=>{
  it('uses Cognito’s localhost exception for local HTTP callbacks',()=>{expect(googleStudioOrigin('http://127.0.0.1:3001')).toBe('http://localhost:3001');expect(googleStudioOrigin('http://localhost:5173')).toBe('http://localhost:5173');expect(googleStudioOrigin('https://studio.example.com')).toBe('https://studio.example.com');});
  it('rejects mismatched OAuth state without sending the authorization code',async()=>{
    sessionStorage.setItem('brainrotten.oauth',JSON.stringify({state:'expected',verifier:'verifier',redirectUri:location.origin+'/auth/callback',createdAt:Date.now()}));history.replaceState({},'','/auth/callback?code=private-code&state=wrong');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(completeGoogleRedirect(config)).rejects.toThrow('Sign-in session expired');expect(fetch).not.toHaveBeenCalled();expect(location.search).toBe('');expect(accessToken()).toBeNull();
  });
  it('removes an expired access token',()=>{sessionStorage.setItem('brainrotten.access',JSON.stringify({token:'expired-synthetic-token',expiresAt:Date.now()-1000}));expect(accessToken()).toBeNull();expect(sessionStorage.getItem('brainrotten.access')).toBeNull();});
});
