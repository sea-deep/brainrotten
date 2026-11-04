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
import {createRequire} from 'node:module';

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
    // Prefer packages' ES module builds: some UMD builds (jsonc-parser, used by add-mcp) load their own files at runtime.
    mainFields:['module','main'],
    banner:{js:"#!/usr/bin/env node\nimport{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);"},
    define:{__BRAINROTTEN_API__:JSON.stringify(api),__BRAINROTTEN_VERSION__:JSON.stringify(version)},
    logLevel:'warning',
  });
  fs.chmodSync(path.join(staging,'cli.mjs'),0o755);
  fs.writeFileSync(path.join(staging,'package.json'),JSON.stringify({
    name:'brainrotten-mcp',version,description:'Connect any coding agent to Brainrotten: one-minute videos that explain what your agent just did.',
    type:'module',bin:{'brainrotten-mcp':'cli.mjs'},files:['cli.mjs','README.md','LICENSE','THIRD_PARTY_NOTICES.md'],engines:{node:'>=20'},license:'MIT',
    homepage:site,repository:{type:'git',url:'git+https://github.com/sea-deep/brainrotten.git',directory:'apps/companion'},bugs:{url:'https://github.com/sea-deep/brainrotten/issues'},keywords:['mcp','model-context-protocol','claude-code','codex','cursor','kiro','ai-agent','learning','video','education'],
  },null,2)+'\n');
  fs.writeFileSync(path.join(staging,'README.md'),npmReadme());
  fs.copyFileSync(path.join(root,'LICENSE'),path.join(staging,'LICENSE'));
  // cli.mjs bundles add-mcp (Apache-2.0) and its dependencies; ship their licences with it.
  fs.writeFileSync(path.join(staging,'THIRD_PARTY_NOTICES.md'),thirdPartyNotices());
  const packed=execFileSync('npm',['pack','--silent','--pack-destination',staging],{cwd:staging,encoding:'utf8'}).trim().split('\n').pop();
  fs.mkdirSync(out,{recursive:true});
  // Versioned file for npx (it caches by URL), plus a stable alias.
  const versioned=`brainrotten-mcp-${version}.tgz`;
  fs.copyFileSync(path.join(staging,packed),path.join(out,versioned));
  fs.copyFileSync(path.join(staging,packed),path.join(out,'brainrotten-mcp.tgz'));
  // Published on npm as brainrotten-mcp; --tarball-only keeps the site link for builds that are not on npm yet.
  const command=process.argv.includes('--tarball-only')?`npx -y ${site}/install/${versioned}`:'npx -y brainrotten-mcp@latest';
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
3. Adds an MCP server named \`brainrotten\` to every coding agent it finds: Claude Code, Codex, Antigravity, Cursor, VS Code, Claude Desktop, Windsurf, Kiro, Gemini CLI, GitHub Copilot CLI, Zed, Cline, OpenCode, Goose and more (20+ agents, on macOS, Windows and Linux). Existing servers are kept; each changed file gets a \`.brainrotten-backup\` copy.

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

function npmReadme(){return `# brainrotten-mcp

Connect your coding agent to **Brainrotten**: it turns what your agent just did into a one-minute video (sketch board, character skit, PR review, tier list or group chat) with quiz questions, so you understand the change instead of just accepting it.

\`\`\`bash
npx -y brainrotten-mcp@latest setup
\`\`\`

That one command signs you in with Google in your browser (five free videos per account) and adds the \`brainrotten\` MCP server to every coding agent on your computer: **Claude Code, Codex, Antigravity, Cursor, VS Code, Claude Desktop, Windsurf, Kiro, Gemini CLI, GitHub Copilot CLI, Zed, Cline, OpenCode, Goose and more (20+ agents, on macOS, Windows and Linux)**. Existing servers are kept and each changed config gets a \`.brainrotten-backup\` copy. Restart your agent, then ask it to *"explain what we just did as a Brainrotten video"*.

**Agents:** if the user asks you to install Brainrotten, run the command above and tell them a browser window will open. On a machine without a browser add \`--no-login\`, reload MCP, and call the \`sign_in\` tool: it returns a link for the user.

| Command | What it does |
|---|---|
| \`setup [--client ids] [--no-login] [--no-open]\` | Sign in and configure agents (all found, or \`--client claude-code,cursor,…\`) |
| \`status\` | Account, free videos left, agents found |
| \`login\` / \`logout\` | Sign in again / forget this computer's sign-in |
| \`uninstall [--logout]\` | Remove Brainrotten from the agents' configs |
| \`mcp\` | The stdio MCP server agents launch |

Requires Node.js 20+. Website and full install guide: ${site}/install.md

Brainrotten is an unofficial, non-commercial fan project; characters and gameplay belong to their owners and voices are AI clones. See ${site}/credits.html.
`;}

/** Licences of the third-party code bundled into cli.mjs (add-mcp and the packages it uses). */
function thirdPartyNotices(){
  const require=createRequire(path.join(root,'apps/companion/package.json'));
  const addMcp=path.dirname(require.resolve('add-mcp/package.json'));
  const entry=(dir)=>{const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));const file=fs.readdirSync(dir).find(name=>/^licen[cs]e/i.test(name));
    return `## ${pkg.name} ${pkg.version} (${pkg.license})\n\n${pkg.repository?.url??pkg.homepage??''}\n\n${file?fs.readFileSync(path.join(dir,file),'utf8').trim():'License text not included in the package.'}\n`;};
  const deps=Object.keys(JSON.parse(fs.readFileSync(path.join(addMcp,'package.json'),'utf8')).dependencies??{}).map(name=>fs.realpathSync(path.join(path.dirname(addMcp),...name.split('/'))));
  return `# Third-party notices\n\ncli.mjs includes the following open-source packages.\n\n${[addMcp,...deps].map(entry).join('\n')}`;
}
