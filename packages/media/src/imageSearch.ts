import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {lookup} from 'node:dns';
import {Agent,fetch as publicFetch} from 'undici';
import ipaddr from 'ipaddr.js';
import sharp from 'sharp';
import {ImageSearchInputSchema,ImageSearchResultSchema,ImageSearchProviderSchema,type ImageSearchResult} from '@brainrot/contracts';
import {providerKeys,localDataDir} from './env.js';
import {googleImageResults} from './googleImages.js';

export function imageSearchProvider(){return ImageSearchProviderSchema.parse(process.env['BRAINROTTEN_IMAGE_SEARCH_PROVIDER']??'google');}

export function isPublicAddress(address:string):boolean{
  try{let ip=ipaddr.parse(address);if(ip.kind()==='ipv6'&&(ip as ipaddr.IPv6).isIPv4MappedAddress())ip=(ip as ipaddr.IPv6).toIPv4Address();return ip.range()==='unicast';}catch{return false;}
}
export function publicImageUrl(raw:string):URL{
  const url=new URL(raw);const host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||host==='localhost'||/\.(local|localhost|internal)$/i.test(host)||(ipaddr.isValid(host)&&!isPublicAddress(host)))throw new Error('Use a public HTTPS image URL.');
  return url;
}
// Check the address used by the socket, including every redirect, rather than only preflighting DNS.
const imageAgent=new Agent({connect:{autoSelectFamily:false,lookup:(hostname,_options,callback)=>{lookup(hostname,(error,address,family)=>{if(error){callback(error,'',0);return;}if(!isPublicAddress(address)){callback(new Error('Private image addresses are not allowed.'),'',0);return;}callback(null,address,family);});}}});

export async function searchBrollImage(raw:unknown,dataDir=localDataDir()):Promise<ImageSearchResult>{
  const {query}=ImageSearchInputSchema.parse(raw);const {brave}=providerKeys(),provider=imageSearchProvider();
  const hash=createHash('sha256').update(`image-search-v4:${provider}:${query.toLowerCase()}`).digest('hex');
  const cache=path.join(dataDir,'image-search',`${hash}.json`);
  try{const stat=await fs.stat(cache);if(Date.now()-stat.mtimeMs<86400000)return ImageSearchResultSchema.parse(JSON.parse(await fs.readFile(cache,'utf8')));}catch{/*new query*/}
  let result:ImageSearchResult;
  if(provider==='google'){
    const candidates=await googleImageResults(query),first=candidates.find(item=>{try{publicImageUrl(item.imageUrl);return true;}catch{return false;}});
    if(!first)throw new Error('No Google image found. Try a specific object or interface query, or paste an image URL.');
    result=first;
  }else if(provider==='brave'){
    if(!brave)throw new Error('The Brave Search key is missing. Use the default Google image search or configure your key.');
    const url=new URL('https://api.search.brave.com/res/v1/images/search');url.search=new URLSearchParams({q:query,count:'1',safesearch:'strict'}).toString();
    const response=await fetch(url,{headers:{'X-Subscription-Token':brave,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Image search failed (${response.status}). Check the Brave Search key in Settings.`);
    const body=await response.json() as{results?:Array<{title?:string;url?:string;properties?:{url?:string};thumbnail?:{src?:string}}>};
    const first=body.results?.[0],imageUrl=first?.properties?.url??first?.thumbnail?.src;
    if(!first||!imageUrl)throw new Error('No image found. Try a short generic query.');
    result={query,imageUrl,sourceUrl:first.url??imageUrl,title:first.title??query,provider};
  }else{
    const url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:`${query} filetype:bitmap`,gsrnamespace:'6',gsrlimit:'1',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'900'}).toString();
    const response=await fetch(url,{headers:{'User-Agent':'Brainrotten/0.3 (single-result educational image search)'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`Image search failed (${response.status}).`);
    const body=await response.json() as{query?:{pages?:Record<string,{title:string;imageinfo?:Array<{thumburl?:string;url?:string;descriptionurl?:string}>}>}};
    const first=Object.values(body.query?.pages??{})[0],info=first?.imageinfo?.[0],imageUrl=info?.thumburl??info?.url;
    if(!first||!imageUrl)throw new Error('No image found. Use a shorter query, paste an image URL, or add a Brave Search key for broader web results.');
    result={query,imageUrl,sourceUrl:info?.descriptionurl??imageUrl,title:first.title.replace(/^File:/,''),provider};
  }
  publicImageUrl(result.imageUrl);result=ImageSearchResultSchema.parse(result);
  await fs.mkdir(path.dirname(cache),{recursive:true,mode:0o700});await fs.writeFile(cache,JSON.stringify(result),{mode:0o600});return result;
}

export async function downloadBrollImage(raw:string,outputFile:string):Promise<void>{
  let url=publicImageUrl(raw);
  for(let redirect=0;redirect<4;redirect++){
    const response=await publicFetch(url,{dispatcher:imageAgent,redirect:'manual',headers:{'User-Agent':'Brainrotten/0.3'},signal:AbortSignal.timeout(15000)});
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('Image redirect has no destination.');url=publicImageUrl(new URL(location,url).toString());continue;}
    if(!response.ok||!/^image\/(png|jpeg|jpg|webp|gif|avif)(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw new Error('The selected image could not be downloaded.');}
    if(Number(response.headers.get('content-length'))>8000000){await response.body?.cancel();throw new Error('Image exceeds the 8 MB download limit.');}
    const chunks:Buffer[]=[];let total=0;
    if(!response.body)throw new Error('The image response was empty.');
    for await(const chunk of response.body){total+=chunk.length;if(total>8000000){await response.body.cancel().catch(()=>{});throw new Error('Image exceeds the 8 MB download limit.');}chunks.push(Buffer.from(chunk));}
    const source=Buffer.concat(chunks),metadata=await sharp(source,{limitInputPixels:25000000}).metadata();if(!['png','jpeg','webp','gif','avif','heif'].includes(metadata.format??''))throw new Error('Use a PNG, JPEG, WebP, GIF, or AVIF image.');
    await sharp(source,{limitInputPixels:25000000}).rotate().resize({width:1400,height:1000,fit:'inside',withoutEnlargement:true}).png().toFile(outputFile);return;
  }
  throw new Error('The image redirected too many times.');
}

/** A blocked original may use Google's thumbnail of that SAME result. Never search/rank a replacement. */
export async function downloadBrollReference(result:{imageUrl:string;thumbnailUrl?:string|undefined},outputFile:string,download=downloadBrollImage):Promise<void>{
  publicImageUrl(result.imageUrl);if(result.thumbnailUrl)publicImageUrl(result.thumbnailUrl);
  try{await download(result.imageUrl,outputFile);}catch(error){if(!result.thumbnailUrl||result.thumbnailUrl===result.imageUrl)throw error;await download(result.thumbnailUrl,outputFile);}
}
