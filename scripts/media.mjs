#!/usr/bin/env node
// Third-party media (character cutouts and voices, gameplay clips, example videos and posters) is never committed.
// It lives in the private media bucket (stack brainrotten-ci, output MediaBucketName) under the same paths it has
// in this working tree, and this script copies it in or out. Needs AWS credentials that can read the bucket.
//
//   node scripts/media.mjs pull          what builds need: cutouts, gameplay clips, posters and the social image
//   node scripts/media.mjs pull --all    everything, also voice clip lists, references, example and archived videos
//   node scripts/media.mjs pull --only assets/characters,apps/web/public   only folders and files under these paths
//   node scripts/media.mjs push          upload local media that is new or changed (same size counts as unchanged)
//
// Bucket: MEDIA_BUCKET, or looked up from the brainrotten-ci stack.
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const region=process.env.AWS_REGION??'ap-south-1';
const aws=(args,stdio='inherit')=>execFileSync('aws',[...args,'--region',region],{cwd:root,stdio,encoding:'utf8'});
const bucket=process.env.MEDIA_BUCKET||aws(['cloudformation','describe-stacks','--stack-name','brainrotten-ci','--query',"Stacks[0].Outputs[?OutputKey=='MediaBucketName'].OutputValue",'--output','text'],['ignore','pipe','inherit']).trim();
if(!bucket||bucket==='None')throw new Error('No media bucket: set MEDIA_BUCKET or deploy infra/ci/template.yaml.');

const MEDIA='--include=*.png --include=*.mp4'.split(' ');
// [local folder, sync filters for "pull" (builds), extra filters for "pull --all" and "push"]
const FOLDERS=[
  ['assets/characters',['--exclude=*/voices/*','--exclude=*/references/*'],[]],
  ['assets/gameplay',[],[]],
  ['apps/web/public/examples',['--exclude=*',...MEDIA,'--exclude=*.mp4'],['--exclude=*',...MEDIA]],
  ['apps/web/public/flow',[],[]],
  ['examples/website-archive',null,['--exclude=*',...MEDIA]],
];
const FILES=['apps/web/public/og.png','.github/social-preview.png'];

const command=process.argv[2],all=process.argv.includes('--all');
const onlyIndex=process.argv.indexOf('--only'),only=onlyIndex>0?process.argv[onlyIndex+1].split(','):null;
const wanted=target=>!only||only.some(prefix=>target===prefix||target.startsWith(prefix.replace(/\/?$/,'/')));
if(command==='pull'){
  for(const [folder,filters,full] of FOLDERS){
    const use=all?full:filters;if(!use||!wanted(folder))continue;
    aws(['s3','sync',`s3://${bucket}/${folder}`,folder,...use,'--only-show-errors']);console.log(`pulled ${folder}`);
  }
  for(const file of FILES)if((file==='apps/web/public/og.png'||all)&&wanted(file)){aws(['s3','cp',`s3://${bucket}/${file}`,file,'--only-show-errors']);console.log(`pulled ${file}`);}
}else if(command==='push'){
  for(const [folder,,full] of FOLDERS){aws(['s3','sync',folder,`s3://${bucket}/${folder}`,...full,'--size-only','--only-show-errors']);console.log(`pushed ${folder}`);}
  for(const file of FILES){aws(['s3','cp',file,`s3://${bucket}/${file}`,'--only-show-errors']);console.log(`pushed ${file}`);}
}else{
  console.error('Usage: node scripts/media.mjs pull [--all] | push');process.exit(1);
}
