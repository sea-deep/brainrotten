#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function main(){
  const output=process.argv[2];if(!output)throw new Error('Usage: node scripts/export-provider-secret.mjs /private/folder/providers.json');
  if(process.env.BRAINROT_SKIP_ENV!=='1'){try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}}
  const directory=process.env.BRAINROT_DATA_DIR??path.join(os.homedir(),'.local/share/brainrot');
  const saved=await fs.readFile(path.join(directory,'provider-keys.json'),'utf8').then(JSON.parse).catch(()=>({}));
  const registry=JSON.parse(await fs.readFile(path.join(directory,'character-voices.json'),'utf8'));
  const characters=['oggy','jack','badri','budhdev','jhaplu','paplu','taplu','motu','patlu','chingum','ghasitaram','jhatka','john'];
  const voices=Object.fromEntries(characters.map(id=>{const voice=registry[id];if(!voice?.id||voice.status!=='ready')throw new Error(`The ${id} clone is not ready.`);return[id,{id:voice.id,name:voice.name,status:'ready'}];}));
  const secret={ELEVENLABS_API_KEY:saved.elevenlabs||process.env.ELEVENLABS_API_KEY,GEMINI_API_KEY:saved.gemini||process.env.GEMINI_API_KEY||undefined,PAPER_API_KEY:saved.paper||process.env.PAPER_API_KEY||process.env.PAPERINSTRUMENTS_API_KEY||undefined,GEMINI_MODEL:process.env.GEMINI_MODEL||undefined,CHARACTER_VOICES_JSON:voices};
  if(!secret.ELEVENLABS_API_KEY||!(secret.GEMINI_API_KEY||secret.PAPER_API_KEY))throw new Error('Configure ElevenLabs and Gemini or Paper before exporting the hosted provider secret.');
  await fs.writeFile(path.resolve(output),JSON.stringify(secret,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log('Private provider JSON written with mode 0600. Upload it to Secrets Manager; do not put it in the website bucket.');
}
main().catch(error=>{console.error(error.code==='EEXIST'?'Output exists. Choose a new private filename.':error instanceof Error?error.message:'Export failed.');process.exitCode=1;});
