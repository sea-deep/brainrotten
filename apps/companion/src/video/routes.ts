import { Router, json, type Request, type Response, type NextFunction } from 'express';
import type { SessionAuth } from '../auth.js';
import { VideoStudio } from './runtime.js';
import { z } from 'zod/v4';
import path from 'node:path';
import {saveProviderKeys,saveScriptProvider,saveSpeechBackend,searchBrollImage,workspaceRoot,localDataDir,LibraryCursorError,flashcardsCsv,GenerationError} from '@brainrot/media';
import {ImageSearchInputSchema,LibraryQuerySchema,VideoReviewPatchSchema,ReviewConflictError,ReviewInputError,SpeechSettingsSchema,ScriptSettingsSchema,ProviderKeysSchema,videoOpenApi} from '@brainrot/contracts';
import {readCognitoSettings,saveCognitoSettings,verifyCognitoSession} from '../authSettings.js';
import {CreateLearningSessionSchema,SessionReviewPatchSchema,SessionReviewConflictError} from '@brainrot/contracts';
import {learningGuide,prepareSessionLesson} from '@brainrot/media';
import {SessionRequestConflictError} from './sessions.js';

export function createStudioRouter(studio: VideoStudio, auth: SessionAuth): Router {
  const router = Router();
  router.get('/openapi.json',(_req,res)=>{res.setHeader('Cache-Control','public, max-age=300');res.json(videoOpenApi('local'));});
  router.use(['/studio', '/videos', '/characters','/images','/library','/sessions','/learning-guide'], json({limit: '128kb'}), auth.requireLoopbackOrigin, auth.requireAuth);
  router.get('/learning-guide',(_req,res)=>res.json(learningGuide()));
  router.get('/sessions',(req,res)=>{try{res.json(studio.sessions.list(req.query));}catch{res.status(400).json({message:'Check the session page and cursor.'});}});
  router.post('/sessions',(req,res)=>{const input=CreateLearningSessionSchema.safeParse(req.body);if(!input.success){res.status(422).json({message:'Provide bounded session context, a learning objective, a prediction prompt and a practice task.'});return;}try{res.status(201).json(studio.sessions.create(input.data));}catch(error){res.status(error instanceof SessionRequestConflictError?409:500).json({message:error instanceof SessionRequestConflictError?error.message:'Could not save the learning session.'});}});
  router.get('/sessions/:id',(req,res)=>{const session=studio.sessions.get(String(req.params['id']));if(!session){res.status(404).json({message:'Learning session not found.'});return;}res.setHeader('Cache-Control','no-store');res.json({session,review:studio.sessions.review(session.sessionId),videos:studio.list().filter(job=>job.sessionId===session.sessionId)});});
  router.get('/sessions/:id/guide',(req,res)=>{const session=studio.sessions.get(String(req.params['id']));if(!session){res.status(404).json({message:'Learning session not found.'});return;}res.json(learningGuide(session));});
  router.get('/sessions/:id/review',(req,res)=>{const review=studio.sessions.review(String(req.params['id']));if(!review){res.status(404).json({message:'Learning session not found.'});return;}res.setHeader('Cache-Control','no-store');res.json(review);});
  router.put('/sessions/:id/review',auth.requireOwner,(req,res)=>{const id=String(req.params['id']);if(!studio.sessions.get(id)){res.status(404).json({message:'Learning session not found.'});return;}const input=SessionReviewPatchSchema.safeParse(req.body);if(!input.success){res.status(422).json({message:'Check the learning response, confidence and version.'});return;}try{res.json(studio.sessions.saveReview(id,input.data));}catch(error){if(error instanceof SessionReviewConflictError){res.status(409).json({message:error.message,sessionReview:error.review});return;}res.status(500).json({message:'Could not save the learning response.'});}});
  router.post('/sessions/:id/videos',(req,res)=>{const session=studio.sessions.get(String(req.params['id']));if(!session){res.status(404).json({message:'Learning session not found.'});return;}try{res.status(202).json(studio.submit(prepareSessionLesson(session,req.body)));}catch(error){res.status(error instanceof GenerationError&&error.message==='Request ID already used for different content.'?409:422).json({message:error instanceof GenerationError?error.message:error instanceof z.ZodError?'Check the selected format and script.':'Provide a complete script and comprehension questions for this session.'});}});
  router.get('/studio/config', (_req, res) => { res.json(studio.config()); });
  router.get('/characters/:id/image', (req,res)=>{
    const file=studio.characterAsset(String(req.params['id']));
    if(!file){res.sendStatus(404);return;}res.sendFile(file,{dotfiles:'allow'});
  });
  router.post('/studio/keys',auth.requireOwner,(req,res)=>{
    const result=ProviderKeysSchema.safeParse(req.body);
    if(!result.success){res.status(422).json({message:'Provide a valid API key.'});return;}
    if(process.env['BRAINROTTEN_MODE']==='hosted'){res.status(403).json({message:'Configure your keys in local Studio.'});return;}
    saveProviderKeys(result.data);res.json({saved:true,config:studio.config()});
  });
  router.post('/studio/script-provider',auth.requireOwner,(req,res)=>{const parsed=ScriptSettingsSchema.safeParse(req.body);if(!parsed.success){res.status(422).json({message:'Choose Auto, Gemini or Paper.'});return;}try{saveScriptProvider(parsed.data.provider);res.json(studio.config());}catch{res.status(403).json({message:'Script provider settings are local-only.'});}});
  router.post('/studio/voice',auth.requireOwner,(req,res)=>{const parsed=SpeechSettingsSchema.safeParse(req.body);if(!parsed.success){res.status(422).json({message:'Choose a supported voice engine.'});return;}try{saveSpeechBackend(parsed.data.backend);res.json(studio.config());}catch(error){res.status(422).json({message:error instanceof Error?error.message:'Could not change the voice engine.'});}});
  router.get('/studio/setup',auth.requireOwner,(_req,res)=>{res.json({command:process.execPath,entryPath:path.join(workspaceRoot,'apps/companion/dist/mcp.js'),projectPath:workspaceRoot,owner:'Cflash',tokenConfigured:true});});
  router.post('/studio/mcp-token',auth.requireOwner,(req,res)=>{const parsed=z.object({action:z.enum(['reveal','rotate'])}).safeParse(req.body);if(!parsed.success){res.status(422).json({message:'Choose reveal or rotate.'});return;}res.setHeader('Cache-Control','no-store');res.json({token:parsed.data.action==='rotate'?auth.rotateMcpToken():auth.getMcpToken()});});
  router.post('/studio/auth/config',auth.requireOwner,(req,res)=>{try{saveCognitoSettings(localDataDir(),req.body);res.json(studio.config());}catch{res.status(422).json({message:'Check the Cognito domain, user pool ID, and public app client ID.'});}});
  router.post('/studio/auth/session',auth.requireOwner,async(req,res)=>{const parsed=z.object({accessToken:z.string().min(20).max(12000)}).safeParse(req.body),settings=readCognitoSettings(localDataDir());if(!parsed.success||!settings){res.status(422).json({message:'Configure AWS Cognito first.'});return;}try{res.json(await verifyCognitoSession(settings,parsed.data.accessToken));}catch{res.status(401).json({message:'The Google/Cognito session is invalid or expired. Sign in again.'});}});
  router.post('/images/search',async(req,res)=>{const input=ImageSearchInputSchema.safeParse(req.body);if(!input.success){res.status(422).json({message:'Enter an image search query.'});return;}try{res.json(await searchBrollImage(input.data));}catch(error){res.status(502).json({message:error instanceof Error?error.message:'Image search failed.'});}});
  router.get('/library',(req,res)=>{try{res.json(studio.library(LibraryQuerySchema.parse(req.query)));}catch(error){res.status(400).json({message:error instanceof LibraryCursorError?error.message:'Check the library filters and page size.'});}});
  router.post('/videos/validate',(req,res)=>res.json(studio.validate(req.body)));
  router.get('/videos/:id/review',(req,res)=>{const review=studio.review(String(req.params['id']));if(!review){res.status(404).json({message:'Video not found.'});return;}res.setHeader('Cache-Control','no-store');res.json(review);});
  router.put('/videos/:id/review',json({limit:'16kb'}),auth.requireLoopbackOrigin,auth.requireAuth,(req,res)=>{try{const patch=VideoReviewPatchSchema.parse(req.body),review=studio.saveReview(String(req.params['id']),patch);if(!review){res.status(404).json({message:'Video not found.'});return;}res.setHeader('Cache-Control','no-store');res.json(review);}catch(error){if(error instanceof ReviewConflictError){res.status(409).json({message:error.message,review:error.review});return;}res.status(422).json({message:error instanceof ReviewInputError?error.message:'Check the review action and version.'});}});
  router.get('/videos', (_req, res) => { res.json({jobs: studio.list()}); });
  router.post('/videos', (req, res) => {
    try { res.status(202).json(studio.submit(req.body)); }
    catch (error) {
      if (error instanceof z.ZodError) { res.status(422).json({code: 'INVALID_VIDEO_INPUT', message: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 500), retryable: false}); }
      else { const known=error instanceof Error?error.message:'',message=error instanceof GenerationError||known==='Request ID already used for different content.'||known.startsWith('The queue has four videos.')?known:'Cannot start generation. Check configuration or the service log.',conflict=message==='Request ID already used for different content.',busy=message.startsWith('The queue has four videos.');res.status(conflict?409:busy?429:400).json({code:conflict?'REQUEST_CONFLICT':busy?'QUEUE_FULL':'GENERATION_UNAVAILABLE',message,retryable:busy}); }
    }
  });
  router.get('/videos/:id', (req, res) => {
    const job = studio.get(String(req.params['id']));
    if (!job) { res.status(404).json({code: 'VIDEO_NOT_FOUND', message: 'Video job not found', retryable: false}); return; }
    res.json(job);
  });
  router.get('/videos/:id/:kind', (req, res) => {
    const kind = String(req.params['kind']);
    if (!['video', 'poster', 'audio', 'manifest', 'learning', 'notes', 'captions', 'flashcards'].includes(kind)) { res.sendStatus(404); return; }
    if(kind==='flashcards'){const job=studio.get(String(req.params['id']));if(job?.state==='ready'&&job.learning){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.type('text/csv; charset=utf-8');res.attachment(`brainrotten-${job.jobId}-flashcards.csv`);res.send(flashcardsCsv(job.learning));return;}}
    const file = studio.asset(String(req.params['id']), kind as 'video' | 'poster' | 'audio' | 'manifest' | 'learning' | 'notes' | 'captions' | 'flashcards');
    if (!file) { res.status(404).json({message: 'This media is not ready yet'}); return; }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if(kind==='notes'||kind==='captions')res.type('text/plain; charset=utf-8');
    if (req.query['download'] === '1') res.download(file, `brainrot-${req.params['id']}.${kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : kind === 'poster' ? 'png' : kind === 'notes' ? 'md' : kind === 'captions' ? 'srt' : 'json'}`, {dotfiles: 'allow'});
    else res.sendFile(file, {dotfiles: 'allow'});
  });
  router.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{const kind=typeof error==='object'&&error?('type' in error?String(error.type):''):'';res.status(kind==='entity.too.large'?413:kind==='entity.parse.failed'?400:500).json({message:kind==='entity.too.large'?'The request is too large.':kind==='entity.parse.failed'?'Invalid JSON.':'The service could not complete this request.',retryable:false});});
  return router;
}
