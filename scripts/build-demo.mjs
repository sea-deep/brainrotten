import {spawnSync} from 'node:child_process';import fs from 'node:fs';
import {videoOpenApi} from '../packages/contracts/dist/index.js';
for(const mode of ['local','hosted'])fs.writeFileSync(`apps/web/public/openapi.${mode}.json`,JSON.stringify(videoOpenApi(mode),null,2)+'\n');
if(!fs.existsSync('apps/web/public/examples/index.json'))throw new Error('Export completed example videos before building the static demo.');
const command=process.platform==='win32'?'pnpm.cmd':'pnpm';
const result=spawnSync(command,['--filter','@brainrot/web','exec','vite','build','--outDir','demo-dist'],{stdio:'inherit',env:{...process.env,VITE_EXAMPLES_ONLY:'true'}});
if(result.status!==0)process.exitCode=result.status??1;
else console.log('Static landing page, guides and saved examples: apps/web/demo-dist. No API, credentials, or model server is required for playback.');
