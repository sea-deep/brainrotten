import React from 'react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {LandingPage} from './LandingPage.js';
import {editorConfig} from './editorConfig.js';
vi.mock('./GummyScene.js',()=>({GummyScene:()=>null}));
vi.mock('./AgentFlow.js',()=>({AgentFlow:()=>null}));
beforeEach(()=>{vi.stubGlobal('IntersectionObserver',class{observe(){}unobserve(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('production landing page',()=>{
  it('keeps playback explicit and switches only between selected ElevenLabs voices',()=>{
    render(<LandingPage/>);expect(document.querySelector('video')).toBeNull();
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Stop doomscrolling. Understand what your agent just changed.');
    fireEvent.click(screen.getByRole('button',{name:'Databases'}));
    expect(screen.getByText(/Jhaplu & Paplu · Hinglish/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Play saved example/}));
    expect(document.querySelector('video')?.getAttribute('src')).toBe('/examples/hinglish-database-replica-eleven/video.mp4');
    expect(document.querySelectorAll('img[src*="-maya"]')).toHaveLength(0);
  });
  it('changes the interface instructions and destination together',()=>{
    render(<LandingPage/>);fireEvent.click(screen.getByRole('tab',{name:'API'}));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('POST /api/v1/videos');
    expect(screen.getByRole('link',{name:'Read the API docs'})).toHaveAttribute('href','/api');
    fireEvent.keyDown(screen.getByRole('tab',{name:'API'}),{key:'ArrowRight'});
    expect(screen.getByRole('tab',{name:'Studio'})).toHaveAttribute('aria-selected','true');
  });
  it('does not insert a placeholder token that breaks automatic local authorization',()=>{
    const config=JSON.parse(editorConfig('standard','node','/installed/brainrotten/apps/companion/dist/mcp.js',''));
    expect(config.mcpServers.brainrotten.env).toBeUndefined();
    expect(config.mcpServers.brainrotten.args).toEqual(['/installed/brainrotten/apps/companion/dist/mcp.js']);
    expect(JSON.parse(editorConfig('standard','node','/mcp.js','synthetic-token')).mcpServers.brainrotten.env.BRAINROTTEN_MCP_TOKEN).toBe('synthetic-token');
  });
});
