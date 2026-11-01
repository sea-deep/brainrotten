import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {AgentFlow} from './AgentFlow.js';

let intersect:(visible:boolean)=>void;
beforeEach(()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('IntersectionObserver',class{
    constructor(callback:IntersectionObserverCallback){
      intersect=isIntersecting=>callback([{isIntersecting} as IntersectionObserverEntry],this as unknown as IntersectionObserver);
    }
    observe(){}disconnect(){}
  });
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const advance=(milliseconds:number)=>act(()=>vi.advanceTimersByTime(milliseconds));

describe('walkthrough animation stability',()=>{
  it('preserves existing terminal rows when the rolling history advances',()=>{
    render(<AgentFlow/>);
    act(()=>intersect(true));
    advance(5000);
    const queued=screen.getByText('Queued job 7f3c. Back to the webhook.');
    const editing=screen.getByText('Editing src/payments/webhook.ts');
    advance(500);
    expect(screen.getByText('Adding an idempotency key')).toBeInTheDocument();
    expect(screen.getByText('Queued job 7f3c. Back to the webhook.')).toBe(queued);
    expect(screen.getByText('Editing src/payments/webhook.ts')).toBe(editing);
    advance(2000);
    expect(screen.getByText('Queued job 7f3c. Back to the webhook.')).toBe(queued);
  });

  it('finishes once and holds every completed card without restarting',()=>{
    render(<AgentFlow/>);
    act(()=>intersect(true));
    advance(15000);
    const flow=document.querySelector('.flow')!;
    expect(flow).toHaveAttribute('data-phase','4');
    expect(flow).toHaveAttribute('data-complete','true');
    expect(document.querySelectorAll('.flow-card.is-pending')).toHaveLength(0);
    expect(document.querySelectorAll('.flow-learned li.is-shown')).toHaveLength(3);
    const lastLine=screen.getByText('Next: retry policy for refunds');
    expect(vi.getTimerCount()).toBe(0);
    advance(30000);
    act(()=>{intersect(false);intersect(true);});
    expect(flow).toHaveAttribute('data-phase','4');
    expect(screen.getByText('Next: retry policy for refunds')).toBe(lastLine);
    expect(document.querySelectorAll('.flow-card.is-pending')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes from the same progress after leaving the viewport or hiding the tab',()=>{
    render(<AgentFlow/>);
    act(()=>intersect(true));
    advance(2000);
    const flow=document.querySelector('.flow')!;
    expect(flow).toHaveAttribute('data-phase','1');
    act(()=>intersect(false));
    advance(20000);
    expect(flow).toHaveAttribute('data-phase','1');
    act(()=>intersect(true));
    advance(1000);
    expect(flow).toHaveAttribute('data-phase','1');
    vi.spyOn(document,'hidden','get').mockReturnValue(true);
    act(()=>document.dispatchEvent(new Event('visibilitychange')));
    advance(20000);
    expect(flow).toHaveAttribute('data-phase','1');
    vi.spyOn(document,'hidden','get').mockReturnValue(false);
    act(()=>document.dispatchEvent(new Event('visibilitychange')));
    advance(1000);
    expect(flow).toHaveAttribute('data-phase','2');
    expect(screen.getByLabelText('Step 3: Brainrotten MCP')).toHaveTextContent('queued');
  });
});
