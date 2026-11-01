import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {stableNodePath} from './routes.js';
describe('MCP setup command',()=>{
  it('prefers an upgrade-proof Node symlink over a versioned path',()=>{
    const candidate=['/opt/homebrew/bin/node','/usr/local/bin/node'].find(p=>fs.existsSync(p));
    if(candidate)expect(stableNodePath(fs.realpathSync(candidate))).toBe(candidate);
    expect(stableNodePath('/nonexistent/node')).toBe('/nonexistent/node');
  });
});
