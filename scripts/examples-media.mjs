#!/usr/bin/env node
// Website example videos are not in git: they live in the private media bucket (scripts/media.mjs), at
// apps/web/public/examples/<slug>/video.mp4. examples/website-media.json records each video's size and SHA-256,
// so the site deploy copies only new or changed videos, bucket to bucket, without downloading them.
//
//   node scripts/examples-media.mjs manifest  record the local videos listed in index.json (then: pnpm media:push)
//   node scripts/examples-media.mjs deploy --bucket <site bucket> --media-bucket <media bucket> --region <region> [--prune]
//                                             copy new or changed videos to the site bucket (prints their paths
//                                             for CloudFront invalidation); --prune also removes unlisted ones
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestFile=path.join(root,'examples/website-media.json');
const dir=path.join(root,'apps/web/public/examples');
const arg=name=>{const index=process.argv.indexOf(name);return index>0?process.argv[index+1]:undefined;};
const log=text=>process.stderr.write(text+'\n');
const key=slug=>`apps/web/public/examples/${slug}/video.mp4`;

const command=process.argv[2];
if(command==='manifest'){
  const slugs=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8')).map(entry=>entry.videoUrl.split('/')[2]);
  const videos=Object.fromEntries(slugs.map(slug=>{const data=fs.readFileSync(path.join(root,key(slug)));return [slug,{size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')}];}));
  fs.writeFileSync(manifestFile,JSON.stringify({videos},null,2)+'\n');
  log(`${slugs.length} videos recorded in examples/website-media.json; upload them with: pnpm media:push`);
}else if(command==='deploy'){
  const {videos}=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const bucket=arg('--bucket'),media=arg('--media-bucket'),region=arg('--region');
  if(!bucket||!media||!region)throw new Error('deploy needs --bucket, --media-bucket and --region');
  const aws=(...args)=>execFileSync('aws',[...args,'--region',region],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const keys=JSON.parse(aws('s3api','list-objects-v2','--bucket',bucket,'--prefix','examples/','--query','Contents[].Key','--output','json')||'null')??[];
  for(const [slug,entry] of Object.entries(videos)){
    const target=`examples/${slug}/video.mp4`;
    if(keys.includes(target)&&JSON.parse(aws('s3api','head-object','--bucket',bucket,'--key',target,'--output','json')).Metadata?.sha256===entry.sha256){log(`${slug}: unchanged`);continue;}
    const source=JSON.parse(aws('s3api','head-object','--bucket',media,'--key',key(slug),'--output','json'));
    if(source.ContentLength!==entry.size)throw new Error(`${slug}: the media bucket copy does not match examples/website-media.json; run pnpm media:push`);
    aws('s3','cp',`s3://${media}/${key(slug)}`,`s3://${bucket}/${target}`,'--cache-control','public,max-age=86400','--content-type','video/mp4','--metadata-directive','REPLACE','--metadata',`sha256=${entry.sha256}`,'--only-show-errors');
    log(`${slug}: copied`);console.log(`/${target}`);
  }
  if(process.argv.includes('--prune'))for(const stale of keys.filter(name=>name.endsWith('/video.mp4')&&!videos[name.split('/')[1]])){
    aws('s3','rm',`s3://${bucket}/${stale}`,'--only-show-errors');log(`${stale}: removed (not listed)`);
  }
}else{
  log('Usage: node scripts/examples-media.mjs manifest | deploy --bucket <name> --media-bucket <name> --region <region> [--prune]');process.exit(1);
}
