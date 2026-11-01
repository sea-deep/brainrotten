export const EDITORS=[
  {id:'standard',name:'Standard JSON',file:'Your MCP client configuration',instructions:'Add a stdio MCP server with the command and args below. Any client that supports local MCP processes can connect. The same-user companion supplies authorization automatically.',docs:'https://modelcontextprotocol.io/docs/develop/connect-local-servers'},
  {id:'claude',name:'Claude Code',file:'~/.claude.json',instructions:'Open your personal ~/.claude.json. Merge the brainrotten entry into mcpServers, then run /mcp in Claude Code and reconnect.',docs:'https://code.claude.com/docs/en/mcp'},
  {id:'kiro',name:'Kiro',file:'~/.kiro/settings/mcp.json',instructions:'Open MCP Servers from Kiro’s agent panel, choose User configuration, and add this entry. Save, then reconnect Brainrotten.',docs:'https://kiro.dev/docs/mcp/configuration/'},
  {id:'antigravity',name:'Antigravity',file:'~/.gemini/config/mcp_config.json',instructions:'In the agent panel, open ⋯ → MCP Servers → Manage MCP Servers → View raw config. Add this entry, save, and refresh the server list.',docs:'https://antigravity.google/docs/mcp'},
  {id:'cursor',name:'Cursor',file:'~/.cursor/mcp.json',instructions:'Open your personal ~/.cursor/mcp.json, add this entry, then open Cursor Settings → Tools & MCP and enable Brainrotten.',docs:'https://cursor.com/docs/mcp'},
  {id:'codex',name:'Codex',file:'~/.codex/config.toml',instructions:'Add this TOML to your personal ~/.codex/config.toml. Trust your project and reconnect the MCP server in Codex.',docs:'https://developers.openai.com/codex/mcp/'},
] as const;
export type EditorId=typeof EDITORS[number]['id'];
export function editorConfig(editor:EditorId,command:string,entryPath:string,token:string):string{
  const credential=token;
  if(editor==='codex')return `[mcp_servers.brainrotten]\ncommand = ${JSON.stringify(command)}\nargs = [${JSON.stringify(entryPath)}]${credential?`\n\n[mcp_servers.brainrotten.env]\nBRAINROTTEN_MCP_TOKEN = ${JSON.stringify(credential)}`:''}`;
  return JSON.stringify({mcpServers:{brainrotten:{...(editor==='claude'?{type:'stdio'}:{}),command,args:[entryPath],...(credential?{env:{BRAINROTTEN_MCP_TOKEN:credential}}:{}),...(editor==='kiro'?{disabled:false,autoApprove:[]}:{})}}},null,2);
}
