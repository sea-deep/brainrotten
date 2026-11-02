import React from 'react';
import { createRoot } from 'react-dom/client';
import {ExamplesApp} from './ExamplesApp.js';
import { App } from './App.js';
import './styles.css';
import './site.css';
import './landing.css';
import {LandingPage} from './LandingPage.js';
import {DocsPage} from './DocsPage.js';
import {SiteLayout} from './SiteLayout.js';
import {CursorEffects} from './CursorEffects.js';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

export function SiteRouter():React.ReactElement {
  const path=location.pathname.replace(/\/$/,'')||'/';
  const staticDemo=import.meta.env['VITE_EXAMPLES_ONLY']==='true';
  if(path==='/')return <LandingPage/>;
  if(path==='/examples')return <SiteLayout><div className="examples-page"><ExamplesApp/></div></SiteLayout>;
  if(path==='/studio'||path==='/auth/callback')return staticDemo?<DocsPage kind="studio"/>:<App/>;
  if(path==='/mcp'||path==='/api'||path==='/setup')return <DocsPage kind={path.slice(1) as 'mcp'|'api'|'setup'}/>;
  return <DocsPage kind="missing"/>;
}

createRoot(container).render(
  <React.StrictMode>
    <SiteRouter/><CursorEffects/>
  </React.StrictMode>
);
