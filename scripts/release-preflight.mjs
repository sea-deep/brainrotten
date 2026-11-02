#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const aws=process.argv.includes('--aws');
let failed=false;
const check=(label,ok)=>{console.log(`${ok?'OK':'MISSING'}  ${label}`);failed ||= !ok;};
check('Node 26+',Number(process.versions.node.split('.')[0])>=26);
check('pnpm',spawnSync('pnpm',['--version'],{stdio:'ignore'}).status===0);
check('3 approved ElevenLabs examples',JSON.parse(fs.readFileSync(path.join(root,'apps/web/public/examples/index.json'),'utf8')).length===3);
for(const filename of ['infra/site/template.yaml','infra/sam/template.yaml','apps/cloud/Dockerfile'])check(filename,fs.existsSync(path.join(root,filename)));
if(aws){
  for(const[tool,args]of [['aws',['--version']],['sam',['--version']],['docker',['info']]])check(tool,spawnSync(tool,args,{stdio:'ignore'}).status===0);
  check('AWS account authentication',spawnSync('aws',['sts','get-caller-identity'],{stdio:'ignore'}).status===0);
}
console.log('This check does not deploy, synthesize audio, print credentials, or verify a live trial.');
process.exitCode=failed?1:0;
