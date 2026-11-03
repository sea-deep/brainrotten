#!/usr/bin/env node
// Renders the repository's social preview / README banner (1280×640) with the same Satori + resvg engine as the videos.
// Usage: node scripts/make-social-card.mjs [out.png]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'packages/media/package.json'));
const satoriModule=await import(require.resolve('satori'));const satori=[satoriModule.default?.default,satoriModule.default,satoriModule].find(candidate=>typeof candidate==='function');
const {Resvg}=require('@resvg/resvg-js');
const out=path.resolve(root,process.argv[2]??'apps/web/public/og.png');

const font=file=>fs.readFileSync(path.join(root,'apps/web/public/fonts',file));
const poster=slug=>'data:image/png;base64,'+fs.readFileSync(path.join(root,'apps/web/public/examples',slug,'poster.png')).toString('base64');
const h=(type,style,...children)=>({type,props:{style:{display:'flex',...style},children:children.flat().filter(Boolean)}});
const text=(style,value)=>({type:'div',props:{style:{display:'flex',...style},children:value}});
const img=(src,style)=>({type:'img',props:{src,style}});

const ink='#30263c',cream='#faf5ee',lavender='#e9dff6',purple='#684393',coral='#f0b19b',yellow='#f1d181';
const brain=`data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><path d="M22 9C16 2 5 9 9 16 1 19 4 31 11 31c-2 9 9 14 14 7 8 7 18-1 14-8 9-4 6-16-1-17-1-9-12-12-16-4Z" fill="#f0b19b" stroke="#30263c" stroke-width="2.6" stroke-linejoin="round"/><path d="m21 17 12 7-12 7V17Z" fill="#30263c"/><path d="M13 16c5 0 6-4 5-7M10 27c6-2 8 1 7 6" stroke="#30263c" stroke-width="2.2" stroke-linecap="round"/></svg>').toString('base64')}`;
const chip=(label,bg)=>text({padding:'7px 14px',borderRadius:999,background:bg,fontSize:19,color:ink,marginRight:8,marginBottom:8},label);
const phone=(slug,rotate,left,top,z)=>h('div',{position:'absolute',left,top,width:250,height:444,borderRadius:28,border:`7px solid ${ink}`,background:ink,overflow:'hidden',transform:`rotate(${rotate}deg)`,boxShadow:'0 24px 48px rgba(48,38,60,0.28)',zIndex:z},img(poster(slug),{width:236,height:420,objectFit:'cover'}));

const tree=h('div',{width:1280,height:640,background:cream,position:'relative',fontFamily:'Uncut Sans',color:ink},
  h('div',{position:'absolute',left:0,top:0,width:1280,height:640,background:`radial-gradient(circle at 88% 30%, ${lavender} 0%, ${cream} 55%)`}),
  h('div',{position:'absolute',left:76,top:70,width:620,flexDirection:'column'},
    h('div',{alignItems:'center'},img(brain,{width:68,height:68,marginRight:16}),text({fontFamily:'Basteleur',fontSize:76,letterSpacing:-2},'brainrotten')),
    text({fontSize:44,lineHeight:1.18,marginTop:30,fontWeight:600,letterSpacing:-0.5},'Your coding agent’s work, explained in a one-minute video.'),
    text({fontSize:24,lineHeight:1.45,marginTop:18,color:'#5d4f69'},'With a quiz, so you understand the change instead of just accepting it.'),
    h('div',{flexWrap:'wrap',marginTop:30,width:600},chip('Sketch board',lavender),chip('Character skit',yellow),chip('PR review',coral),chip('Tier list',lavender),chip('Group chat',yellow)),
    text({fontSize:21,marginTop:22,color:purple,fontFamily:'Uncut Sans'},'MCP · REST API · Studio · npx brainrotten-mcp')),
  phone('k8s-oomkilled',-8,730,120,1),
  phone('flask-cors-preflight',8,975,115,1),
  phone('django-n-plus-one',0,852,90,2),
);

const svg=await satori(tree,{width:1280,height:640,fonts:[
  {name:'Basteleur',data:font('Basteleur-Bold.ttf'),weight:700,style:'normal'},
  {name:'Uncut Sans',data:font('UncutSans-Variable.ttf'),weight:400,style:'normal'},
]});
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,new Resvg(svg,{fitTo:{mode:'width',value:1280}}).render().asPng());
console.log(`${path.relative(root,out)} (${Math.round(fs.statSync(out).size/1024)} KB)`);
