#!/usr/bin/env node
// Bundles the standalone MCP installer into one file and packs it as an npm tarball that the website
// serves at /install/brainrotten-mcp.tgz, so agents can run: npx -y <site>/install/brainrotten-mcp.tgz setup
// Also writes install.md and llms.txt (instructions agents can follow) next to the install folder.
// Usage: node scripts/build-mcp-package.mjs [--api-url https://…/api/v1] [--site-url https://…] [--out apps/web/public/install]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;};
const api=arg('--api-url')??process.env.BRAINROTTEN_API_URL??'https://fqfewiusg8.execute-api.ap-south-1.amazonaws.com/api/v1';
const out=path.resolve(root,arg('--out')??'apps/web/public/install');
const guides=path.resolve(root,arg('--guides')??path.join(out,'..'));
const site=(arg('--site-url')??process.env.VITE_SITE_URL??'https://d3sk6lwsh4ufyv.cloudfront.net').replace(/\/$/,'');
const version=JSON.parse(fs.readFileSync(path.join(root,'apps/companion/package.json'),'utf8')).version;
if(!/^https:\/\//.test(api))throw new Error('The API URL must be https.');

const staging=fs.mkdtempSync(path.join(os.tmpdir(),'brainrotten-mcp-'));
try{
  await build({
    entryPoints:[path.join(root,'apps/companion/dist/standalone/cli.js')],
    outfile:path.join(staging,'cli.mjs'),
    bundle:true,platform:'node',format:'esm',target:'node20',minify:true,legalComments:'eof',
    banner:{js:"#!/usr/bin/env node\nimport{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);"},
    define:{__BRAINROTTEN_API__:JSON.stringify(api),__BRAINROTTEN_VERSION__:JSON.stringify(version)},
    logLevel:'warning',
  });
  fs.chmodSync(path.join(staging,'cli.mjs'),0o755);
  fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify({
    name:'brainrotten-mcp',version,description:'Connect any coding agent to Brainrotten: one-minute videos that explain what your agent just did.',
    type:'module',bin:{'brainrotten-mcp':'cli.mjs'},files:['cli.mjs','README.md'],engines:{node:'>=20'},license:'UNLICENSED',
  },null,2)+'\n');
  fs.writeFileSync(path.join(staging,'README.md'),`# brainrotten-mcp\n\nOne command connects your coding agent to Brainrotten:\n\n    npx -y ${api.replace(/\/api\/v1$/,'')} (see the website install page for the exact link)\n\nRun \`brainrotten-mcp --help\` for commands. Unofficial, non-commercial fan project; see the website credits.\n`);
  const packed=execFileSync('npm',['pack','--silent','--pack-destination',staging],{cwd:staging,encoding:'utf8'}).trim().split('\n').pop();
  fs.mkdirSync(out,{recursive:true});
  // Versioned file for npx (it caches by URL), plus a stable alias.
  const versioned=`brainrotten-mcp-${version}.tgz`;
  fs.copyFileSync(path.join(staging,packed),path.join(out,versioned));
  fs.copyFileSync(path.join(staging,packed),path.join(out,'brainrotten-mcp.tgz'));
  const command=`npx -y ${site}/install/${versioned}`;
  fs.mkdirSync(guides,{recursive:true});
  fs.writeFileSync(path.join(guides,'install.md'),installGuide(command));
  fs.writeFileSync(path.join(guides,'llms.txt'),llms(command));
  const size=fs.statSync(path.join(out,'brainrotten-mcp.tgz')).size;
  console.log(`brainrotten-mcp ${version} → ${path.relative(root,path.join(out,'brainrotten-mcp.tgz'))} (${Math.round(size/1024)} KB, API ${api})`);
}finally{fs.rmSync(staging,{recursive:true,force:true});}

function installGuide(command){return `# Install Brainrotten MCP

Brainrotten turns what a coding agent just did into a one-minute video (sketch board, character skit, PR review, tier list or group chat) with quiz questions. Five free videos per Google account.

## For coding agents

If the user asks you to install, add or connect Brainrotten (or "brainrotten mcp"), run this in their terminal. It needs Node.js 20 or newer.

\`\`\`bash
${command} setup
\`\`\`

What it does:

1. Copies one file to \`~/.local/share/brainrot/bin/brainrotten-mcp.mjs\`.
2. Opens the user's browser for Google sign-in and waits until they finish (up to 5 minutes). Tell the user a browser window is opening.
3. Adds an MCP server named \`brainrotten\` to every coding agent it finds: Claude Code, Codex, Cursor, VS Code, Claude Desktop, Windsurf, Kiro, Gemini CLI and OpenCode. Existing servers are kept; each changed file gets a \`.brainrotten-backup\` copy.

Options:

- Only your own agent: add \`--client <id>\` (\`claude-code\`, \`codex\`, \`cursor\`, \`vscode\`, \`claude-desktop\`, \`windsurf\`, \`kiro\`, \`gemini\`, \`opencode\`, comma-separated, or \`all\`).
- No browser on this machine (SSH, container): add \`--no-login\`. After the MCP server loads, call its \`sign_in\` tool; it returns a link to give the user.

After setup, the MCP server must be (re)loaded: tell the user to restart their agent or reload MCP servers (Claude Code: \`/mcp\`; VS Code and Cursor: reload the window). Then the \`brainrotten\` tools are available. If any tool answers "Not signed in", call \`sign_in\`.

Check: \`${command} status\`. Remove: \`${command} uninstall\`.

## For people

Paste this into your terminal, sign in with Google when the browser opens, then restart your coding agent:

\`\`\`bash
${command} setup
\`\`\`

Then ask your agent: "explain what we just did as a Brainrotten video".

Brainrotten is an unofficial, non-commercial fan project. See ${site}/credits.html.
`;}
function llms(command){return `# Brainrotten

> Turns a coding agent's real work into one-minute learning videos with quizzes. MCP server, REST API and Python SDK.

- [Install the MCP server (one command)](${site}/install.md): \`${command} setup\`
- [REST API reference](${site}/api)
- [Credits and terms](${site}/credits.html)
`;}
