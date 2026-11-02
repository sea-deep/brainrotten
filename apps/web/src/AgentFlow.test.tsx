import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AgentFlow} from './AgentFlow.js';

let reduced=false,top=0;
const HEIGHT=3000,VIEW=800;
beforeEach(()=>{
  reduced=false;top=0;
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 0;});
  vi.stubGlobal('cancelAnimationFrame',()=>{});
  Object.defineProperty(window,'innerHeight',{configurable:true,value:VIEW});
  vi.spyOn(HTMLElement.prototype,'offsetHeight','get').mockReturnValue(HEIGHT);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>({top,bottom:top+HEIGHT,left:0,right:0,width:0,height:HEIGHT,x:0,y:top,toJSON(){}}) as DOMRect);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
/** Scrolls so that this share (0–1) of the pinned section has passed. */
const scrollTo=(share:number)=>act(()=>{top=-share*(HEIGHT-VIEW);window.dispatchEvent(new Event('scroll'));});
const flow=()=>document.querySelector('.flow')!;

describe('scroll-driven walkthrough',()=>{
  it('starts at the request and pins the section while scrolling',()=>{
    render(<AgentFlow/>);
    expect(document.querySelector('.flow-section')).toHaveClass('is-scrubbed');
    expect(flow()).toHaveAttribute('data-phase','0');
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  it('moves one step per stretch of scroll and rewinds when scrolling back',()=>{
    render(<AgentFlow/>);
    scrollTo(.15);expect(flow()).toHaveAttribute('data-phase','1');
    scrollTo(.3);expect(flow()).toHaveAttribute('data-phase','2');
    expect(screen.getByLabelText('Step 3: Brainrotten MCP')).toHaveTextContent('queued');
    scrollTo(.5);expect(flow()).toHaveAttribute('data-phase','3');
    scrollTo(.05);expect(flow()).toHaveAttribute('data-phase','0');
    expect(screen.queryByText('Queued job 7f3c. Back to the deploy.')).toBeNull();
  });

  it('holds the finished state for the last part of the scroll',()=>{
    render(<AgentFlow/>);
    scrollTo(.9);
    expect(flow()).toHaveAttribute('data-phase','4');
    expect(flow()).toHaveAttribute('data-complete','true');
    expect(document.querySelectorAll('.flow-learned li.is-shown')).toHaveLength(3);
    expect(screen.getByText('Next: keep-warm schedule')).toBeInTheDocument();
    scrollTo(1);expect(flow()).toHaveAttribute('data-complete','true');
  });

  it('keeps terminal rows stable while the story advances',()=>{
    render(<AgentFlow/>);
    scrollTo(.2);const queued=screen.getByText('Queued job 7f3c. Back to the deploy.');
    scrollTo(.3);expect(screen.getByText('Queued job 7f3c. Back to the deploy.')).toBe(queued);
  });

  it('lets the step rail scroll to a step',()=>{
    const scroll=vi.fn();vi.stubGlobal('scrollTo',scroll);
    render(<AgentFlow/>);
    fireEvent.click(screen.getByRole('button',{name:/Render/}));
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({behavior:'smooth'}));
  });

  it('shows the finished state without pinning when motion is reduced',()=>{
    reduced=true;
    render(<AgentFlow/>);
    expect(document.querySelector('.flow-section')).not.toHaveClass('is-scrubbed');
    expect(flow()).toHaveAttribute('data-phase','4');
    expect(document.querySelectorAll('.flow-card.is-pending')).toHaveLength(0);
  });
});
