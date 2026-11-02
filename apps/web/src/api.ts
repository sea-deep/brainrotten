/** Companion API client. Provider credentials never enter this module. */
import {completeGoogleRedirect,currentProfile,ensureAccessToken,isSignedIn,signOut} from './googleAuth.js';
import { StudioConfigSchema, LearningPackSchema, VideoReviewSchema, VideoLibrarySchema, ScriptValidationSchema, ReviewConflictError,type VideoReviewPatch,type LibraryQuery, VideoJobSchema,ImageSearchResultSchema,McpSetupSchema, type GenerateVideoInput, type StudioConfig, type VideoJob,type ImageSearchResult,type CognitoSettings } from '@brainrot/contracts';

const HOSTED=import.meta.env['VITE_HOSTED']==='true';
const BASE=String(import.meta.env['VITE_API_BASE_URL']??'/api/v1').replace(/\/$/,'');

let sessionToken: string | null = null;
const signedMedia=new Map<string,{at:number;job:VideoJob}>();

export async function getLearningSessions(cursor?:string){const {SessionPageSchema}=await import('@brainrot/contracts');return SessionPageSchema.parse(await studioRequest('/sessions?limit=10'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));}
export async function getLearningSession(id:string){const {SessionDetailSchema}=await import('@brainrot/contracts');return SessionDetailSchema.parse(await studioRequest('/sessions/'+encodeURIComponent(id)));}
export async function saveSessionResponse(id:string,patch:import('@brainrot/contracts').SessionReviewPatch){
  const {SessionReviewSchema}=await import('@brainrot/contracts');return SessionReviewSchema.parse(await studioRequest('/sessions/'+encodeURIComponent(id)+'/review',{method:'PUT',body:JSON.stringify(patch)}));
}

export async function bootstrap(): Promise<void> {
  if(HOSTED){sessionToken=await ensureAccessToken();if(!sessionToken)throw new Error('Sign in with Google to use the trial.');return;}
  if (sessionToken) return;
  try {
    const res = await fetch(`${BASE}/bootstrap`, { method: 'GET', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Bootstrap failed: ${res.status}`);
    const data = (await res.json()) as { token: string };
    sessionToken = data.token;
  } catch (err) {
    throw new Error(`Cannot connect to companion: ${String(err)}`, { cause: err });
  }
}

async function studioRequest(path: string, init: RequestInit = {}, retried = false): Promise<unknown> {
  await bootstrap();
  const res = await fetch(`${BASE}${path}`, { ...init, credentials: HOSTED?'omit':'same-origin', headers: { ...authHeaders(), ...init.headers } });
  if (res.status === 401 && !HOSTED && !retried) { sessionToken = null; return studioRequest(path, init, true); }
  if (!res.ok) {
    const body=await res.json().catch(()=>null) as {review?:unknown;error?:string|{message?:string};message?:string}|null;
    if(res.status===409&&body?.review){const review=VideoReviewSchema.safeParse(body.review);if(review.success)throw new ReviewConflictError(review.data);}
    const message=typeof body?.error==='string'?body.error:body?.error?.message??body?.message??`Request failed (${res.status}).`;
    throw new Error(message);
  }
  return res.json();
}

export async function getStudioConfig(): Promise<StudioConfig> {
  const config=StudioConfigSchema.parse(HOSTED?await(await fetch(`${BASE}/studio/config`)).json():await studioRequest('/studio/config'));
  const returnTo=await completeGoogleRedirect(config);
  // Studio handles the callback; send visitors who started elsewhere (landing, MCP page) back there.
  if(returnTo&&!returnTo.startsWith('/studio'))window.location.replace(returnTo);
  return config;
}
export async function getTrialQuota():Promise<{used:number;limit:number;remaining:number}|null>{if(!HOSTED||!isSignedIn())return null;const result=await studioRequest('/me') as{quota:{used:number;limit:number;remaining:number}};return result.quota;}
export async function listVideos(): Promise<VideoJob[]> {
  if(HOSTED&&!isSignedIn())return [];
  const body = await studioRequest('/videos') as { jobs: unknown[] };
  return body.jobs.map(raw=>{
    const job=VideoJobSchema.parse(raw);if(job.mediaExpired){signedMedia.delete(job.jobId);return job;}if(!HOSTED||job.state!=='ready')return job;
    const cached=signedMedia.get(job.jobId);if(cached&&Date.now()-cached.at<2700000)return{...job,videoUrl:cached.job.videoUrl,...(cached.job.posterUrl?{posterUrl:cached.job.posterUrl}:{}),...(cached.job.audioUrl?{audioUrl:cached.job.audioUrl}:{}),...(cached.job.downloadUrl?{downloadUrl:cached.job.downloadUrl}:{})};
    signedMedia.set(job.jobId,{at:Date.now(),job});return job;
  });
}
export async function generateVideo(input: GenerateVideoInput): Promise<VideoJob> {
  return VideoJobSchema.parse(await studioRequest('/videos', { method: 'POST', body: JSON.stringify(input) }));
}
export async function saveKeys(keys:{paper?:string;gemini?:string;elevenlabs?:string;brave?:string}):Promise<StudioConfig>{
  const result=await studioRequest('/studio/keys',{method:'POST',body:JSON.stringify(keys)}) as {config:unknown};
  return StudioConfigSchema.parse(result.config);
}
export async function getVideo(jobId: string): Promise<VideoJob> { return VideoJobSchema.parse(await studioRequest(`/videos/${encodeURIComponent(jobId)}`)); }
export async function getLearningPack(jobId:string){return LearningPackSchema.parse(await studioRequest(`/videos/${encodeURIComponent(jobId)}/learning`));}
export async function searchImage(query:string):Promise<ImageSearchResult>{return ImageSearchResultSchema.parse(await studioRequest('/images/search',{method:'POST',body:JSON.stringify({query})}));}
export async function getMcpSetup(){return McpSetupSchema.parse(await studioRequest('/studio/setup'));}
export async function revealMcpToken(rotate=false):Promise<string>{const result=await studioRequest('/studio/mcp-token',{method:'POST',body:JSON.stringify({action:rotate?'rotate':'reveal'})}) as{token:string};return result.token;}
export async function configureCognito(input:CognitoSettings):Promise<StudioConfig>{return StudioConfigSchema.parse(await studioRequest('/studio/auth/config',{method:'POST',body:JSON.stringify(input)}));}
export async function getAccount():Promise<{sub:string;email?:string;name?:string}|null>{
  if(HOSTED){const profile=currentProfile();return profile?{sub:'hosted-session',...(profile.name?{name:profile.name}:{}),...(profile.email?{email:profile.email}:{})}:null;}const token=await ensureAccessToken();if(!token)return null;
  try{return await studioRequest('/studio/auth/session',{method:'POST',body:JSON.stringify({accessToken:token})}) as{sub:string;email?:string;name?:string};}catch(error){signOut();throw error;}
}
export type { GenerateVideoInput, StudioConfig, VideoJob };

function authHeaders(): Record<string, string> {
  if (!sessionToken) throw new Error('Not bootstrapped');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionToken}`,
  };
}

export interface ApiJobSummary {
  jobId: string;
  lessonId: string;
  state: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  submissionId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ApiLessonDetail {
  job: ApiJobSummary;
  manifest: import('@brainrot/contracts').PlaybackManifestV1 | null;
  staleSourceIds: string[];
}

export async function listJobs(): Promise<ApiJobSummary[]> {
  const res = await fetch(`${BASE}/lessons`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`List jobs failed: ${res.status}`);
  const data = (await res.json()) as { jobs: ApiJobSummary[] };
  return data.jobs;
}

export async function getLessonDetail(jobId: string): Promise<ApiLessonDetail> {
  const res = await fetch(`${BASE}/lessons/${jobId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Get lesson failed: ${res.status}`);
  return res.json() as Promise<ApiLessonDetail>;
}

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json() as Promise<{ status: string }>;
}

export async function saveVoiceBackend(backend:NonNullable<StudioConfig['voiceBackend']>):Promise<StudioConfig>{return StudioConfigSchema.parse(await studioRequest('/studio/voice',{method:'POST',body:JSON.stringify({backend})}));}

export async function getExamples():Promise<VideoJob[]>{try{const response=await fetch('/examples/index.json',{signal:AbortSignal.timeout(5000)});if(!response.ok)return[];return VideoJobSchema.array().max(32).parse(await response.json()).filter(job=>job.state==='ready');}catch{return[];}}

export async function saveScriptProvider(provider:NonNullable<StudioConfig['scriptProvider']>):Promise<StudioConfig>{return StudioConfigSchema.parse(await studioRequest('/studio/script-provider',{method:'POST',body:JSON.stringify({provider})}));}

export async function getVideoReview(jobId:string){return VideoReviewSchema.parse(await studioRequest(`/videos/${encodeURIComponent(jobId)}/review`));}
export async function saveVideoReview(jobId:string,patch:VideoReviewPatch){return VideoReviewSchema.parse(await studioRequest(`/videos/${encodeURIComponent(jobId)}/review`,{method:'PUT',body:JSON.stringify(patch),keepalive:patch.kind==='watch'}));}
export async function getLibrary(query:Partial<LibraryQuery>={}){if(HOSTED&&!isSignedIn())return{jobs:[],nextCursor:null};const params=new URLSearchParams();for(const[key,value]of Object.entries(query))if(value!==undefined&&value!=='')params.set(key,String(value));return VideoLibrarySchema.parse(await studioRequest('/library?'+params.toString()));}
export async function validateVideo(input:unknown){return ScriptValidationSchema.parse(await studioRequest('/videos/validate',{method:'POST',body:JSON.stringify(input)}));}
