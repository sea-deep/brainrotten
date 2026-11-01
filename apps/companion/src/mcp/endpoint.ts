/** Remote use is explicit. The private local token is never a remote credential. */
export function mcpEndpoint(env:NodeJS.ProcessEnv,port:number):{baseUrl:string;remote:boolean;token?:string}{
  const raw=env['BRAINROTTEN_API_URL'];
  if(!raw)return{baseUrl:`http://127.0.0.1:${port}/api/v1`,remote:false};
  let url:URL;try{url=new URL(raw);}catch{throw new Error('BRAINROTTEN_API_URL must be an HTTPS API base URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Hosted MCP requires an HTTPS API base URL without credentials, query, or fragment.');
  const token=env['BRAINROTTEN_API_TOKEN'];
  if(!token||/[\r\n]/.test(token))throw new Error('Set BRAINROTTEN_API_TOKEN to your hosted Cognito access token. The local private token cannot authorize hosted requests.');
  return{baseUrl:url.toString().replace(/\/$/,''),remote:true,token};
}
