import { defineConfig } from 'vite';
import { readFileSync, readdirSync, createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute URL for link previews (og:image); set VITE_SITE_URL when building the public site.
const siteUrl=(process.env['VITE_SITE_URL']??'').replace(/\/$/,'');
// Version of the one-command MCP installer published with the site (scripts/build-mcp-package.mjs).
const mcpVersion=JSON.parse(readFileSync(new URL('../companion/package.json',import.meta.url),'utf8')).version as string;

// Character cutouts live once, in assets/characters/<show>/<id>.png (third-party, see NOTICE.md). They are not in git:
// `pnpm media:pull` downloads them from the private media bucket. Without them the site builds, minus the cutouts.
// Serve them at /characters/<id>.png in dev and copy them into the build, instead of keeping a second copy here.
const charactersDir=new URL('../../assets/characters/',import.meta.url).pathname;
function characterFiles():Map<string,string>{
  const files=new Map<string,string>();
  if(!existsSync(charactersDir))return files;
  for(const show of readdirSync(charactersDir,{withFileTypes:true}))if(show.isDirectory())
    for(const file of readdirSync(path.join(charactersDir,show.name)))if(file.endsWith('.png'))files.set(file,path.join(charactersDir,show.name,file));
  return files;
}
function characterImages():Plugin{
  return{
    name:'brainrotten-characters',
    configureServer(server){server.middlewares.use('/characters',(req,res,next)=>{const file=characterFiles().get(decodeURIComponent((req.url??'').replace(/^\//,'').split('?')[0]!));if(!file)return next();res.setHeader('content-type','image/png');createReadStream(file).pipe(res);});},
    generateBundle(){for(const[name,file]of characterFiles())this.emitFile({type:'asset',fileName:`characters/${name}`,source:readFileSync(file)});},
  };
}

export default defineConfig({
  define: {__MCP_VERSION__: JSON.stringify(mcpVersion)},
  plugins: [react(),characterImages(),{name:'site-url',transformIndexHtml:html=>html.replaceAll('__SITE_URL__',siteUrl)}],
  server: {
    // Only allow loopback during development
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // Proxy /api requests to the companion
      '/api/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false, // keep the loopback origin
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
