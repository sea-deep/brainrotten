// Icons for group chat members: generic Lucide icons (ISC) and brand logos from Simple Icons (CC0).
// Resolved from local packages only; nothing is fetched while rendering.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Package folder from its main entry (these packages do not export package.json). */
function packageRoot(name:string):string{
  let dir=path.dirname(fileURLToPath(import.meta.resolve(name)));
  while(dir!==path.dirname(dir)){try{if(JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).name===name)return dir;}catch{/* keep walking up */}dir=path.dirname(dir);}
  throw new Error(`Cannot locate the ${name} package.`);
}
const lucideDir=path.join(packageRoot('lucide-static'),'icons');
const simpleDir=packageRoot('simple-icons');

/** Generic icons an agent can use for roles that have no brand. Any Lucide or Simple Icons name also works. */
export const GENERIC_CHAT_ICONS=['user','users','smartphone','laptop','globe','server','database','hard-drive','cpu','memory-stick','zap','layers','cloud','shield','lock','key-round','credit-card','wallet','shopping-cart','mail','bell','message-square','bot','brain','bug','git-branch','git-pull-request','terminal','timer','clock','gauge','network','router','wifi','package','container','inbox','list-ordered','workflow','webhook','search','file-text','folder','image','video','activity','triangle-alert','flame','hourglass','cookie','ticket','scale'] as const;
export const BRAND_CHAT_ICON_EXAMPLES=['postgresql','redis','mongodb','mysql','sqlite','react','nextdotjs','nodedotjs','python','docker','kubernetes','stripe','github','cloudflare','nginx','apachekafka','rabbitmq','elasticsearch','firebase','supabase','vercel','graphql','typescript','android','prisma','anthropic'] as const;

let brands:Map<string,{slug:string;hex:string;title:string}>|undefined;
function brandIndex(){
  if(brands)return brands;
  const data=JSON.parse(fs.readFileSync(path.join(simpleDir,'data/simple-icons.json'),'utf8')) as Array<{slug:string;hex:string;title:string}>;
  brands=new Map();for(const item of data){brands.set(item.slug,item);brands.set(item.title.toLowerCase().replace(/[^a-z0-9]/g,''),item);}
  return brands;
}
export type ChatIcon={kind:'generic';svg:string}|{kind:'brand';svg:string;hex:string;title:string};
const safe=(name:string)=>name.trim().toLowerCase();

/** Lucide name first ("database"), then a Simple Icons slug or title ("postgresql", "Next.js"). */
export function resolveChatIcon(name:string):ChatIcon|undefined{
  const key=safe(name);
  if(/^[a-z0-9-]{1,60}$/.test(key)){const file=path.join(lucideDir,key+'.svg');if(fs.existsSync(file))return{kind:'generic',svg:fs.readFileSync(file,'utf8')};}
  const brand=brandIndex().get(key.replace(/[^a-z0-9]/g,''));
  if(brand){const file=path.join(simpleDir,'icons',brand.slug+'.svg');if(fs.existsSync(file))return{kind:'brand',svg:fs.readFileSync(file,'utf8'),hex:'#'+brand.hex,title:brand.title};}
  return undefined;
}
export function unknownChatIcons(names:string[]):string[]{return names.filter(name=>!resolveChatIcon(name));}

function light(hex:string){const n=parseInt(hex.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255;return(.299*r+.587*g+.114*b)/255>.72;}
const inner=(svg:string)=>svg.replace(/<!--[\s\S]*?-->/g,'').replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace(/<title>[\s\S]*?<\/title>/,'');

/** A round WhatsApp-style avatar: brand logo on its brand color, or a white generic icon on the member color. */
export function iconAvatarUri(name:string,memberColor:string):string{
  const icon=resolveChatIcon(name);
  let body:string;
  if(!icon)body=`<circle cx="48" cy="48" r="48" fill="${memberColor}"/>`;
  else if(icon.kind==='brand'){const ink=light(icon.hex)?'#111b21':'#ffffff';body=`<circle cx="48" cy="48" r="48" fill="${icon.hex}"/><g transform="translate(24 24) scale(2)" fill="${ink}">${inner(icon.svg)}</g>`;}
  else body=`<circle cx="48" cy="48" r="48" fill="${memberColor}"/><g transform="translate(24 24) scale(2)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner(icon.svg)}</g>`;
  return 'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">${body}</svg>`).toString('base64');
}
