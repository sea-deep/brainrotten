import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
export const workspaceRoot=process.env['BRAINROTTEN_ROOT']??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export function localDataDir():string{return process.env['BRAINROT_DATA_DIR']??path.join(os.homedir(),'.local/share/brainrot');}
let loaded=false;
export function loadStudioEnv():void{
  if(process.env['BRAINROT_SKIP_ENV']==='1'||loaded)return;
  loaded=true;
  const file=path.join(workspaceRoot,'.env');
  if(fs.existsSync(file))process.loadEnvFile(file);
}
export function providerKeys():{paper:string|undefined;gemini:string|undefined;elevenlabs:string|undefined;brave:string|undefined}{
  loadStudioEnv();
  let saved:{paper?:string;gemini?:string;elevenlabs?:string;brave?:string}={};
  if(process.env['BRAINROT_SKIP_ENV']!=='1'&&process.env['BRAINROTTEN_MODE']!=='hosted'){
    try{saved=JSON.parse(fs.readFileSync(path.join(localDataDir(),'provider-keys.json'),'utf8')) as typeof saved;}catch{/*environment only*/}
  }
  return{paper:saved.paper||process.env['PAPER_API_KEY']||process.env['PAPERINSTRUMENTS_API_KEY'],gemini:saved.gemini||process.env['GEMINI_API_KEY'],elevenlabs:saved.elevenlabs||process.env['ELEVENLABS_API_KEY'],brave:saved.brave||process.env['BRAVE_SEARCH_API_KEY']};
}
export function saveProviderKeys(keys:{paper?:string|undefined;gemini?:string|undefined;elevenlabs?:string|undefined;brave?:string|undefined}):void{
  if(process.env['BRAINROTTEN_MODE']==='hosted')throw new Error('Provider settings are local-only.');
  const file=path.join(localDataDir(),'provider-keys.json');
  let prior:typeof keys={};try{prior=JSON.parse(fs.readFileSync(file,'utf8')) as typeof keys;}catch{/*new settings*/}
  fs.mkdirSync(localDataDir(),{recursive:true,mode:0o700});
  fs.writeFileSync(file,JSON.stringify({...prior,...Object.fromEntries(Object.entries(keys).filter(([,value])=>Boolean(value)))}),{mode:0o600});
}
