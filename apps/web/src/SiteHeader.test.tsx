import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SiteHeader} from './SiteLayout.js';
afterEach(cleanup);

describe('the shared header',()=>{
  it('shows Studio the same Sign in button as every other page',()=>{
    const onSignIn=vi.fn();
    render(<SiteHeader studio={{tab:'studio',onSelect:()=>{}}} account={{signedIn:false,left:null,onSignIn,onSignOut:()=>{}}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Sign in'}));expect(onSignIn).toHaveBeenCalled();
  });
  it('opens a small account menu in Studio with the free videos left and Sign out',()=>{
    const onSignOut=vi.fn();
    render(<SiteHeader studio={{tab:'studio',onSelect:()=>{}}} account={{signedIn:true,name:'Dipak',left:3,onSignIn:()=>{},onSignOut}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Account, 3 free videos left'}));
    expect(screen.getByRole('menu')).toHaveTextContent('Dipak3 free videos left');
    fireEvent.click(screen.getByRole('menuitem',{name:'Sign out'}));expect(onSignOut).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('puts Studio settings in the menu instead of a separate button',()=>{
    const onClick=vi.fn();
    render(<SiteHeader studio={{tab:'studio',onSelect:()=>{}}} account={{signedIn:false,left:null,onSignIn:()=>{},onSignOut:()=>{}}} menuItem={{label:'Settings',active:false,onClick}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Settings'}));expect(onClick).toHaveBeenCalled();
  });
  it('opens mobile navigation and closes it with Escape or a Studio tab',()=>{
    const onSelect=vi.fn();
    render(<SiteHeader studio={{tab:'studio',onSelect}} account={{signedIn:false,left:null,onSignIn:()=>{},onSignOut:()=>{}}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
    expect(screen.getByRole('button',{name:'Close menu'})).toHaveAttribute('aria-expanded','true');
    fireEvent.keyDown(window,{key:'Escape'});
    expect(screen.getByRole('button',{name:'Open menu'})).toHaveAttribute('aria-expanded','false');
    fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
    fireEvent.click(screen.getByRole('button',{name:'MCP'}));
    expect(onSelect).toHaveBeenCalledWith('mcp');
    expect(screen.getByRole('button',{name:'Open menu'})).toHaveAttribute('aria-expanded','false');
  });

});
