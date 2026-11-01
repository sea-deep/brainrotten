import React,{useEffect,useRef,useState} from 'react';
import {followingDotCursor} from 'cursor-effects';
/** A sourced following-dot cursor plus the user-approved click feedback. */
export function CursorEffects():React.ReactElement{
  const[pops,setPops]=useState<Array<{id:number;x:number;y:number}>>([]),next=useRef(0);
  useEffect(()=>{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(pointer: fine)');
    let effect:{destroy:()=>void}|undefined;
    const timers=new Set<ReturnType<typeof setTimeout>>();
    const sync=()=>{effect?.destroy();effect=undefined;if(fine.matches&&!reduced.matches)effect=followingDotCursor({color:'#8060b1'});};
    const click=(event:PointerEvent)=>{
      if(event.pointerType!=='mouse'||!fine.matches||reduced.matches||event.button!==0||(event.target as Element)?.closest('input,textarea,select,[contenteditable=true]'))return;
      const id=next.current++;setPops(current=>[...current.slice(-3),{id,x:event.clientX,y:event.clientY}]);
      const timer=setTimeout(()=>{setPops(current=>current.filter(pop=>pop.id!==id));timers.delete(timer);},480);timers.add(timer);
    };
    sync();fine.addEventListener('change',sync);reduced.addEventListener('change',sync);window.addEventListener('pointerdown',click,{passive:true});
    return()=>{effect?.destroy();fine.removeEventListener('change',sync);reduced.removeEventListener('change',sync);window.removeEventListener('pointerdown',click);for(const timer of timers)clearTimeout(timer);};
  },[]);
  return <div className="cursor-pop-layer" aria-hidden="true">{pops.map(pop=><svg className="cursor-pop" key={pop.id} style={{left:pop.x,top:pop.y}} width="50" height="50" viewBox="0 0 50 50"><g strokeWidth="3" strokeLinecap="round"><path d="m25 4 0 7M25 39v7M4 25h7m28 0h7" stroke="#9a6bba"/><path d="m10 10 5 5m20 20 5 5M10 40l5-5m20-20 5-5" stroke="#c16e52"/></g></svg>)}</div>;
}
