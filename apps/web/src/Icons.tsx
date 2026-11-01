import React from 'react';
export type IconName='play'|'settings'|'download'|'close'|'plus'|'code'|'arrow'|'check'|'copy'|'key'|'search'|'user';
export function Icon({name,size=20}:{name:IconName;size?:number}):React.ReactElement{
  const paths:Record<IconName,React.ReactNode>={play:<path d="m8 5 11 7-11 7V5Z"/>,settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,download:<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,plus:<path d="M12 5v14M5 12h14"/>,code:<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14"/>,arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,check:<path d="m5 12 4 4L19 6"/>,copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/></>,key:<><circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-4-4 3-3m-1 5 3-3"/></>,search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,user:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
