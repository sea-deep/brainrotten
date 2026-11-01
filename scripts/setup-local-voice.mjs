// Explicit owner setup; normal startup/tests never install or download models.
import {spawnSync} from 'node:child_process';import path from 'node:path';import {localVoicePaths,workspaceRoot} from '../packages/media/dist/index.js';
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('This MLX backend needs Apple Silicon macOS. Use ElevenLabs here, or deploy Maya’s separate CUDA runtime on a GPU server.');
const p=localVoicePaths(),env={...process.env,HF_HUB_DISABLE_XET:'1'};
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',env,cwd:workspaceRoot});if(result.error)throw new Error('Cannot run '+command+'. Install uv and retry.');if(result.status!==0)throw new Error('Local voice setup stopped; existing engines and recordings were preserved.');}
run('uv',['venv','--python','3.11','--allow-existing',path.join(p.root,'.venv')]);
run('uv',['pip','install','--python',p.python,'-r','tools/local-voice/requirements.lock']);
run(p.python,['tools/local-voice/setup.py','--root',p.root]);
run(process.execPath,['scripts/prepare-local-references.mjs',...(process.argv.includes('--scribe')?['--scribe']:[])]);
run(p.python,['tools/local-voice/setup.py','--root',p.root,'--verify']);
console.log('Select Maya 2 · local in Studio Settings. ElevenLabs remains available and no defaults were changed.');
