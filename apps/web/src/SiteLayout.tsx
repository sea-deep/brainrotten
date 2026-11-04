import React,{useEffect,useState} from 'react';
import {Icon} from './Icons.js';
import {ANDROID_DOWNLOAD_URL} from './mobileApp.js';
import {currentProfile,isSignedIn,onSessionChange,signInWithGoogle,type Profile} from './googleAuth.js';
import {getStudioConfig,getTrialQuota} from './api.js';

const HOSTED=import.meta.env['VITE_HOSTED']==='true';

export function BrainMark({size=36}:{size?:number}):React.ReactElement{
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M22 9C16 2 5 9 9 16 1 19 4 31 11 31c-2 9 9 14 14 7 8 7 18-1 14-8 9-4 6-16-1-17-1-9-12-12-16-4Z" fill="#f0b19b" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"/><path d="m21 17 12 7-12 7V17Z" fill="currentColor"/><path d="M13 16c5 0 6-4 5-7M10 27c6-2 8 1 7 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>;
}

/** Hosted account state for the public pages: who is signed in and how many free videos are left. */
function useSiteAccount(){
  const[profile,setProfile]=useState<Profile|null>(()=>HOSTED?currentProfile():null),[left,setLeft]=useState<number|null>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!HOSTED)return;
    const sync=()=>{const next=currentProfile();setProfile(next);if(next)void getTrialQuota().then(quota=>setLeft(quota?.remaining??null)).catch(()=>setLeft(null));else setLeft(null);};
    sync();return onSessionChange(sync);
  },[]);
  const signIn=async()=>{setBusy(true);try{await signInWithGoogle(await getStudioConfig(),location.pathname+location.hash);}catch{location.assign('/studio');}finally{setBusy(false);}};
  return{profile,left,busy,signIn};
}

/** Studio passes its own account state and actions; every other page reads the hosted session itself. */
export type HeaderAccount={signedIn:boolean;name?:string|undefined;picture?:string|undefined;left:number|null;onSignIn:()=>void;onSignOut:()=>void};

function AccountChip({account}:{account?:HeaderAccount|undefined}):React.ReactElement{
  const site=useSiteAccount(),[menu,setMenu]=useState(false);
  useEffect(()=>{if(!menu)return;const close=(event:MouseEvent|KeyboardEvent)=>{if(event instanceof KeyboardEvent?event.key==='Escape':!(event.target as Element).closest?.('.account-chip'))setMenu(false);};addEventListener('click',close);addEventListener('keydown',close);return()=>{removeEventListener('click',close);removeEventListener('keydown',close);};},[menu]);
  if(!account&&!HOSTED)return <a className="site-cta" href="/setup" aria-current={location.pathname==='/setup'?'page':undefined}>Setup <Icon name="arrow" size={15}/></a>;
  const signedIn=account?account.signedIn:Boolean(site.profile&&isSignedIn());
  if(!signedIn)return <button type="button" className="site-cta" onClick={()=>account?account.onSignIn():void site.signIn()} disabled={!account&&site.busy}><GoogleMark/>{!account&&site.busy?'Opening…':'Sign in'}</button>;
  const name=account?account.name:site.profile?.name??site.profile?.email,picture=account?account.picture:site.profile?.picture,left=account?account.left:site.left;
  const face=picture?<img src={picture} alt="" width="26" height="26" referrerPolicy="no-referrer"/>:<span className="avatar" aria-hidden="true">{(name??'?').trim().charAt(0).toUpperCase()}</span>;
  const label=<span>{left!==null?`${left} left`:'Studio'}</span>;
  // Outside Studio the chip opens Studio; inside Studio it opens a small account menu with Sign out.
  if(!account)return <a className="site-cta is-account" href="/studio" aria-label={`Open Studio${left!==null?`, ${left} free videos left`:''}`}>{face}{label}</a>;
  return <div className="account-chip">
    <button type="button" className="site-cta is-account" aria-haspopup="menu" aria-expanded={menu} aria-label={`Account${left!==null?`, ${left} free videos left`:''}`} onClick={()=>setMenu(value=>!value)}>{face}{label}</button>
    {menu&&<div className="account-popover" role="menu"><p>{name??'Signed in'}{left!==null&&<small>{left} free video{left===1?'':'s'} left</small>}</p><button type="button" role="menuitem" onClick={()=>{setMenu(false);account.onSignOut();}}>Sign out</button></div>}
  </div>;
}
const GoogleMark=()=><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>;

/**
 * The one header every page uses: a sticky strip in the page colour (nothing scrolls into view above the pill)
 * holding the pill at the same size and place on every page. Studio adds its tabs, account state and (locally) a
 * Settings item in the menu; everything else is identical.
 */
type HeaderProps={studio?:{tab:'studio'|'mcp';onSelect:(tab:'studio'|'mcp')=>void};account?:HeaderAccount;menuItem?:{label:string;active:boolean;onClick:()=>void}|undefined};
export function SiteHeader({studio,account,menuItem}:HeaderProps):React.ReactElement{
  const[open,setOpen]=useState(false);
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};addEventListener('keydown',close);return()=>removeEventListener('keydown',close);},[open]);
  const here=(path:string)=>location.pathname===path?'page' as const:undefined;
  return <div className="site-header-bar"><header className={`site-header floating-pill${open?' is-open':''}`}>
    <a className="site-brand" href="/" aria-label="Brainrotten home"><BrainMark/><span>brainrotten</span></a>
    <nav id="site-nav" aria-label={studio?'Workspace':'Main navigation'}>
      {studio?<><button aria-current={studio.tab==='studio'?'page':undefined} onClick={()=>{studio.onSelect('studio');setOpen(false);}}>Studio</button><button aria-current={studio.tab==='mcp'?'page':undefined} onClick={()=>{studio.onSelect('mcp');setOpen(false);}}>MCP</button></>:<><a href="/studio" aria-current={here('/studio')}>Studio</a><a href="/mcp" aria-current={here('/mcp')}>MCP</a></>}
      <a href="/#android-app">App</a><a href="/api" aria-current={here('/api')}>API</a><a href="/examples" aria-current={here('/examples')}>Examples</a>{(HOSTED||studio)&&<a href="/setup" aria-current={here('/setup')}>Setup</a>}{menuItem&&<button type="button" aria-expanded={menuItem.active} onClick={()=>{menuItem.onClick();setOpen(false);}}>{menuItem.label}</button>}
    </nav>
    <div className="header-actions"><AccountChip account={account}/></div>
    <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="site-nav" aria-label={open?'Close menu':'Open menu'} onClick={()=>setOpen(value=>!value)}><span/><span/></button>
  </header></div>;
}

const FOOTER_LINKS:Array<[string,Array<[string,string]>]>=[
  ['Make',[['Studio','/studio'],['Examples','/examples'],['Android app',ANDROID_DOWNLOAD_URL]]],
  ['Connect',[['MCP server','/mcp'],['Python SDK','/mcp#python'],['REST API','/api']]],
  ['Run',[['Local setup','/setup#local'],['Deploy on AWS','/setup#aws']]],
];
export function SiteFooter():React.ReactElement{
  return <footer className="site-footer">
    <div className="footer-top">
      <a className="footer-brand" href="/" aria-label="Brainrotten home"><BrainMark size={44}/><span>brainrotten</span></a>
      <nav className="footer-columns" aria-label="Footer navigation">{FOOTER_LINKS.map(([title,links])=><div key={title}><h2>{title}</h2><ul>{links.map(([label,href])=><li key={href}><a href={href}>{label}</a></li>)}</ul></div>)}</nav>
    </div>
    <p className="footer-legal">Unofficial, non-commercial fan project. Characters and gameplay belong to their owners; voices are AI clones. Not affiliated with Xilam, Cosmos-Maya, Viacom18, Paperboat or the game studios. <a href="/credits.html">Credits</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a></p>
    <div className="footer-bottom"><span>English · Hinglish · Benglish</span><span className="footer-credit">by <mark>the brainrotted</mark></span><a href="#top" onClick={event=>{event.preventDefault();scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}>Back to top ↑</a></div>
  </footer>;
}

export function SiteLayout({children}:{children:React.ReactNode}):React.ReactElement{
  return <div className="site-shell"><a className="skip-link" href="#site-content">Skip to content</a><SiteHeader/><main id="site-content">{children}</main><SiteFooter/></div>;
}
