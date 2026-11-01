import type {ImageSearchResult} from '@brainrot/contracts';

// Same public Google Images /imgres pipeline used by sea-deep/pixd's
// ImageSearchService: https://github.com/sea-deep/pixd/blob/main/src/services/ImageSearchService.ts
// One lightweight page is enough for the renderer's one-shot selection.
export const GOOGLE_IMAGE_USER_AGENT='Nokia6230/2.0 (05.50) Profile/MIDP-2.0 Configuration/CLDC-1.1';
function titleFromPage(sourceUrl:string,query:string):string{
  try{const page=new URL(sourceUrl),parts=page.pathname.split('/').filter(Boolean);let tail=parts.pop()??'';if(/^\d+$/.test(tail))tail=parts.pop()??tail;const title=decodeURIComponent(tail).replace(/\.(html?|php|aspx?)$/i,'').replace(/[-_]+/g,' ').trim();return `${title.length>3?title:query} — ${page.hostname.replace(/^www\./,'')}`.slice(0,250);}catch{return query;}
}
function needsThumbnail(raw:string):boolean{
  try{const url=new URL(raw);return url.protocol!=='https:'||/\.(?:svg|mp4|webm|mov|m3u8|html?|php|aspx?)$/i.test(url.pathname)||/(^|\.)(?:youtube\.com|youtu\.be|tiktok\.com|facebook\.com|instagram\.com|vimeo\.com|twitch\.tv)$/.test(url.hostname);}catch{return true;}
}
export function parseGoogleImages(html:string,query:string):ImageSearchResult[]{
  const results:ImageSearchResult[]=[],seen=new Set<string>();
  for(const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)){
    const href=match[1]!.replace(/&amp;|&#0*38;|&#x0*26;/gi,'&');
    if(!href.startsWith('/imgres?')&&!href.startsWith('https://www.google.com/imgres?'))continue;
    try{
      const link=new URL(href,'https://www.google.com'),original=link.searchParams.get('imgurl'),source=link.searchParams.get('imgrefurl');
      if(!original||!/^https?:\/\//i.test(original))continue;
      const thumbnail=link.searchParams.get('tbnid'),fallback=thumbnail?`https://encrypted-tbn0.gstatic.com/images?q=tbn:${encodeURIComponent(thumbnail)}`:undefined;
      const imageUrl=needsThumbnail(original)?fallback:original;if(!imageUrl||seen.has(imageUrl))continue;
      const sourceUrl=source&&/^https?:\/\//i.test(source)?source:original;
      results.push({query,imageUrl,...(fallback?{thumbnailUrl:fallback}:{}),sourceUrl,title:titleFromPage(sourceUrl,query),provider:'google'});seen.add(imageUrl);
      if(results.length===100)break;
    }catch{/*Ignore malformed search anchors, not the query.*/}
  }
  return results;
}
export async function googleImageResults(query:string):Promise<ImageSearchResult[]>{
  const url=new URL('https://www.google.com/search');url.search=new URLSearchParams({q:query,tbm:'isch',safe:'active'}).toString();
  const response=await fetch(url,{headers:{'User-Agent':GOOGLE_IMAGE_USER_AGENT,Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Google Images is unavailable (HTTP ${response.status}). Try again later or paste an image URL.`);
  const html=await response.text();
  if(html.length>2_000_000)throw new Error('Google Images returned an unexpectedly large page.');
  if(/unusual traffic|not a robot|<form[^>]+consent\.google\.com/i.test(html))throw new Error('Google Images temporarily blocked this request. Try again later or paste an image URL.');
  return parseGoogleImages(html,query);
}
