import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {GummyScene} from './GummyScene.js';
import {AgentFlow} from './AgentFlow.js';

const media=(reduce:boolean)=>vi.fn((query:string)=>({matches:reduce&&query.includes('reduce'),media:query,addEventListener(){},removeEventListener(){}}));
beforeEach(()=>{localStorage.clear();vi.stubGlobal('IntersectionObserver',class{observe(){}unobserve(){}disconnect(){}});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('gummy bear hero',()=>{
  it('keeps a persistent pause control and remembers the choice',()=>{
    vi.stubGlobal('matchMedia',media(false));
    render(<GummyScene/>);
    const button=screen.getByRole('button',{name:'Pause gummy bear animation'});expect(button).toHaveAttribute('aria-pressed','false');
    fireEvent.click(button);
    expect(screen.getByRole('button',{name:'Resume gummy bear animation'})).toHaveAttribute('aria-pressed','true');
    expect(localStorage.getItem('brainrotten.gummies.paused')).toBe('1');
  });
  it('starts paused when the visitor prefers reduced motion',()=>{
    vi.stubGlobal('matchMedia',media(true));
    render(<GummyScene/>);
    expect(screen.getByRole('button',{name:'Resume gummy bear animation'})).toBeInTheDocument();
    expect(screen.getByRole('img',{name:/gummy bears/i})).toHaveAttribute('src','/models/gummy-preview.webp');
  });
});

describe('agent walkthrough',()=>{
  it('starts with only the first step visible',()=>{
    vi.stubGlobal('matchMedia',media(false));
    render(<AgentFlow/>);
    expect(document.querySelectorAll('.flow-card.is-pending')).toHaveLength(4);
    expect(screen.getByLabelText('Step 1: your agent')).toHaveClass('is-active');
  });
  it('shows the finished state without animating under reduced motion',()=>{
    vi.stubGlobal('matchMedia',media(true));
    render(<AgentFlow/>);
    expect(screen.getByLabelText('Step 3: Brainrotten MCP')).toHaveTextContent('ready');
    expect(document.querySelectorAll('.flow-card.is-pending')).toHaveLength(0);
    expect(document.querySelectorAll('.flow-learned li.is-shown')).toHaveLength(3);
  });
});
