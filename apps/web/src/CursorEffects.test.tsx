import React from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,waitFor,cleanup} from '@testing-library/react';
import {CursorEffects} from './CursorEffects.js';
const mocks=vi.hoisted(()=>({destroy:vi.fn(),create:vi.fn()}));
vi.mock('cursor-effects',()=>({followingDotCursor:mocks.create}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
function preferences(reduce=false,fine=true){const listeners=new Map<string,()=>void>();vi.stubGlobal('matchMedia',(query:string)=>({matches:query.includes('reduced-motion')?reduce:fine,addEventListener:(_type:string,callback:()=>void)=>listeners.set(query,callback),removeEventListener:()=>{}}));mocks.create.mockReturnValue({destroy:mocks.destroy});return listeners;}
describe('library cursor preferences',()=>{
  it('creates the sourced effect and removes it on navigation/unmount',async()=>{preferences();const view=render(<CursorEffects/>);await waitFor(()=>expect(mocks.create).toHaveBeenCalledOnce());view.unmount();expect(mocks.destroy).toHaveBeenCalledOnce();});
  it('keeps the native cursor for touch and reduced motion',async()=>{preferences(true,false);render(<CursorEffects/>);await Promise.resolve();expect(mocks.create).not.toHaveBeenCalled();expect(document.body.style.cursor).not.toBe('none');});
  it('destroys the previous effect before responding to preference changes',()=>{const listeners=preferences();const view=render(<CursorEffects/>);listeners.get('(pointer: fine)')?.();listeners.get('(pointer: fine)')?.();expect(mocks.create).toHaveBeenCalledTimes(3);expect(mocks.destroy).toHaveBeenCalledTimes(2);view.unmount();expect(mocks.destroy).toHaveBeenCalledTimes(3);});
});
