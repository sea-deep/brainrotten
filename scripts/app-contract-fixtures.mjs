#!/usr/bin/env node
// Synthetic wire examples, parsed by the canonical contracts before export.
// Run after pnpm build. Check mode never changes the app checkout.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {VideoJobSchema, VideoReviewSchema, VideoLibrarySchema} from '../packages/contracts/dist/index.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=process.env.BRAINROTGRAM_DIR??path.resolve(root,'../brainrotgram');
const file=path.join(app,'test/fixtures/api-contract.json');
const jobId='00000000-0000-4000-8000-000000000001';
const now='2026-11-04T00:00:00.000Z';
const review=VideoReviewSchema.parse({schemaVersion:'BrainrottenReviewV1',jobId,version:2,positionMs:185600,furthestMs:215600,completed:true,bookmarked:true,answers:{'pause-1':{choice:1,correct:true,attempts:2,answeredAt:now}},updatedAt:now});
const video=VideoJobSchema.parse({jobId,state:'ready',stage:'ready',progress:100,prompt:'Synthetic contract fixture',title:'Fixture',format:'sketch',createdAt:now,updatedAt:now,videoUrl:'https://example.invalid/video.mp4',error:null,durationSeconds:215.6});
const processing=VideoJobSchema.parse({...video,state:'processing',stage:'voicing',progress:22.5,videoUrl:null,durationSeconds:null});
const {videoUrl,...libraryJob}=video;
const library=VideoLibrarySchema.parse({jobs:[{...libraryJob,review,questionCount:1}],nextCursor:null});
const fixtures={video,processing,review,library,errors:{gateway:{message:'Unauthorized'},quota:{code:'trial_limit_reached',message:'You have used all 5 lifetime trial videos.',retryable:false,requestId:'fixture-quota'},unavailable:{code:'internal_error',message:'The hosted service is temporarily unavailable.',retryable:true,requestId:'fixture-unavailable'}}};
const expected=JSON.stringify(fixtures,null,2)+'\n';
if(process.argv.includes('--check')){
  if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==expected)throw new Error('App contract fixtures differ. Run node scripts/app-contract-fixtures.mjs, then review the fixture and app parsers together.');
  console.log('App fixtures match the canonical contracts.');
}else{
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,expected);console.log('Exported synthetic app contract fixtures.');
}
