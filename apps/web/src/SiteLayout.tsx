import React from 'react';
import {Icon} from './Icons.js';

export function BrainMark({size=36}:{size?:number}):React.ReactElement{
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M22 9C16 2 5 9 9 16 1 19 4 31 11 31c-2 9 9 14 14 7 8 7 18-1 14-8 9-4 6-16-1-17-1-9-12-12-16-4Z" fill="#f0b19b" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"/><path d="m21 17 12 7-12 7V17Z" fill="currentColor"/><path d="M13 16c5 0 6-4 5-7M10 27c6-2 8 1 7 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>;
}

type HeaderProps={actions?:React.ReactNode;studio?:{tab:'studio'|'mcp';onSelect:(tab:'studio'|'mcp')=>void}};
export function SiteHeader({actions,studio}:HeaderProps):React.ReactElement{
  return <header className={`site-header floating-pill${studio?' studio-header':''}`}>
    <a className="site-brand" href="/" aria-label="Brainrotten home"><BrainMark/><span>brainrotten</span></a>
    <nav aria-label={studio?'Workspace':'Main navigation'}>
      {studio?<><button aria-current={studio.tab==='studio'?'page':undefined} onClick={()=>studio.onSelect('studio')}>Studio</button><button aria-current={studio.tab==='mcp'?'page':undefined} onClick={()=>studio.onSelect('mcp')}>MCP</button></>:<><a href="/studio?sign-in=google" aria-current={location.pathname==='/studio'?'page':undefined}>Studio</a><a href="/mcp" aria-current={location.pathname==='/mcp'?'page':undefined}>MCP</a></>}
      <a href="/api" aria-current={location.pathname==='/api'?'page':undefined}>API</a><a href="/examples" aria-current={location.pathname==='/examples'?'page':undefined}>Examples</a>
    </nav>
    {actions&&<div className="header-actions">{actions}</div>}
    <a className="site-setup" href="/setup" aria-current={location.pathname==='/setup'?'page':undefined}>Setup <Icon name="arrow" size={15}/></a>
  </header>;
}

export function SiteFooter():React.ReactElement{
  return <footer className="site-footer floating-pill"><a className="footer-brand" href="/" aria-label="Brainrotten home"><BrainMark size={25}/><span>brainrotten</span></a><span className="footer-credit">by <mark>the brainrotted</mark></span><nav aria-label="Footer navigation"><a href="/examples">Examples</a><a href="/api">API</a><a href="/setup">Setup <Icon name="arrow" size={14}/></a></nav></footer>;
}

export function SiteLayout({children}:{children:React.ReactNode}):React.ReactElement{
  return <div className="site-shell"><a className="skip-link" href="#site-content">Skip to content</a><SiteHeader/><main id="site-content">{children}</main><SiteFooter/></div>;
}
