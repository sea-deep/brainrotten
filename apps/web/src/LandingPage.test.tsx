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
  it('shows examples per format, lets you pick a stack, and keeps playback explicit',()=>{
    render(<LandingPage/>);expect(document.querySelector('video')).toBeNull();
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Stop doomscrolling. Understand what your agent just changed.');
    expect(screen.getAllByRole('tab',{name:/Sketch board|Character skit|PR review|Tier list|Group chat/})).toHaveLength(5);
    expect(screen.getByRole('tab',{name:/Sketch board/})).toHaveAttribute('aria-selected','true');
    fireEvent.click(screen.getByRole('tab',{name:/PR review/}));
    expect(screen.getByRole('tabpanel',{name:/PR review/})).toHaveTextContent('Stop the useEffect request loop');
    expect(screen.getByText(/What the agent did/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'TypeScript + Redis'}));
    expect(screen.getByRole('tabpanel',{name:/PR review/})).toHaveTextContent('Rate limiter ka race fix');
    fireEvent.click(screen.getByRole('button',{name:/Play example/}));
    expect(document.querySelector('video')?.getAttribute('src')).toBe('/examples/redis-rate-limiter/video.mp4');
    fireEvent.keyDown(screen.getByRole('tab',{name:/PR review/}),{key:'ArrowRight'});
    expect(screen.getByRole('tab',{name:/Tier list/})).toHaveAttribute('aria-selected','true');
    expect(document.querySelector('video')).toBeNull();
  });
  it('sends Studio links to Studio without forcing a Google redirect',()=>{
    render(<LandingPage/>);
    for(const link of screen.getAllByRole('link',{name:/Open Studio/}))expect(link).toHaveAttribute('href','/studio');
  });
  it('changes the interface instructions and destination together',()=>{
    render(<LandingPage/>);expect(screen.getByRole('tab',{name:'MCP'})).toHaveAttribute('aria-selected','true');
    fireEvent.click(screen.getByRole('tab',{name:'API'}));
    expect(screen.getByRole('tabpanel',{name:'API'})).toHaveTextContent('POST /api/v1/videos');
    expect(screen.getByRole('link',{name:'Read the API docs'})).toHaveAttribute('href','/api');
    fireEvent.keyDown(screen.getByRole('tab',{name:'API'}),{key:'ArrowRight'});
    expect(screen.getByRole('tab',{name:'MCP'})).toHaveAttribute('aria-selected','true');
    fireEvent.click(screen.getByRole('tab',{name:'Python'}));
    expect(screen.getByRole('tabpanel',{name:'Python'})).toHaveTextContent('make_video');
  });
  it('does not insert a placeholder token that breaks automatic local authorization',()=>{
    const config=JSON.parse(editorConfig('standard','node','/installed/brainrotten/apps/companion/dist/mcp.js',''));
    expect(config.mcpServers.brainrotten.env).toBeUndefined();
    expect(config.mcpServers.brainrotten.args).toEqual(['/installed/brainrotten/apps/companion/dist/mcp.js']);
    expect(JSON.parse(editorConfig('standard','node','/mcp.js','synthetic-token')).mcpServers.brainrotten.env.BRAINROTTEN_MCP_TOKEN).toBe('synthetic-token');
  });
  it('writes an OpenCode local MCP entry',()=>{
    const config=JSON.parse(editorConfig('opencode','/opt/homebrew/bin/node','/mcp.js','synthetic-token'));
    expect(config.mcp.brainrotten).toEqual({type:'local',command:['/opt/homebrew/bin/node','/mcp.js'],enabled:true,environment:{BRAINROTTEN_MCP_TOKEN:'synthetic-token'}});
  });
});
