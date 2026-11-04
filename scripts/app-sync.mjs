#!/usr/bin/env node
// Updates the BrainRotGram checkout on its default branch, then checks it against
// the live backend and runs Flutter analysis/tests. Feature branches use --no-pull.
//
//   pnpm app:sync           update ../brainrotgram (clone it if missing) and run the checks
//   pnpm app:sync --no-pull  check local work without pulling
//   pnpm app:sync --skip-flutter  only run API/auth integration checks
//
// Checks: the API base URL and every API call the app makes exist in the live OpenAPI spec; the app's Cognito
// client exists with its redirect and sign-out URLs, the code flow and Google sign-in; the API's JWT authorizer
// accepts that client; the character image base URL serves images. Needs AWS read access for the Cognito checks.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=process.env.BRAINROTGRAM_DIR??path.resolve(root,'../brainrotgram');
const REPO='https://github.com/bhumikasudarshani-cmd/brainrotgram.git';
const region=process.env.AWS_REGION??'ap-south-1';
const git=(...args)=>execFileSync('git',args,{cwd:app,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}}).trim();
const results=[];const check=(ok,label)=>{results.push(ok);console.log(`${ok?'✓':'✗'} ${label}`);};

if(!process.argv.includes('--no-pull')){
  if(!fs.existsSync(path.join(app,'.git'))){
    execFileSync('git',['-c','credential.helper=','clone','-q',REPO,app],{stdio:'inherit',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
    console.log(`Cloned ${REPO} into ${app}`);
  }else{
    if(git('status','--porcelain'))throw new Error('App checkout has local changes. Use --no-pull to check local work.');
    const branch=git('branch','--show-current');
    const defaultBranch=git('symbolic-ref','--short','refs/remotes/origin/HEAD').replace(/^origin\//,'');
    if(branch!==defaultBranch)throw new Error('App checkout is on a feature branch. Use --no-pull to check local work.');
    const before=git('rev-parse','HEAD');
    git('-c','credential.helper=','pull','-q','--ff-only');
    const after=git('rev-parse','HEAD');
    console.log(before===after?'App clone already up to date.':`New app commits:\n${git('log','--oneline',`${before}..${after}`)}`);
  }
}
console.log(`App at ${git('log','-1','--format=%h %s (%cr)')}\n`);

const read=file=>fs.readFileSync(path.join(app,file),'utf8');
const constants=read('lib/api/api_constants.dart');
const value=name=>{
  const expression=constants.match(new RegExp(`${name}\\s*=([\\s\\S]*?);`))?.[1]??'';
  return expression.match(/defaultValue:\s*'([^']+)'/)?.[1]??expression.match(/'([^']+)'/)?.[1];
};
const apiBase=value('apiBaseUrl'),clientId=value('clientId'),redirect=value('redirectUri'),signOut=value('signOutUri'),issuer=value('issuer'),characters=value('characterBaseUrl');

// API calls: every _dio.<method>('/path') in the app must exist in the live spec.
const spec=await fetch(`${apiBase}/openapi.json`).then(response=>response.json()).catch(()=>null);
check(Boolean(spec?.paths),`API reachable at ${apiBase}`);
if(spec?.paths){
  const live=new Set(Object.entries(spec.paths).flatMap(([route,ops])=>Object.keys(ops).map(method=>`${method.toUpperCase()} ${route.replace(/\{[^}]+\}/g,'{}')}`)));
  const dart=fs.readdirSync(path.join(app,'lib'),{recursive:true}).filter(file=>String(file).endsWith('.dart')).map(file=>read(path.join('lib',String(file)))).join('\n');
  const calls=[...new Set([...dart.matchAll(/_dio\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map(([,method,route])=>`${method.toUpperCase()} ${route.replace(/\$\{?[A-Za-z_]+\}?/g,'{}')}`))];
  for(const call of calls)check(live.has(call),`app calls ${call}`);
}

// Sign-in: the app's Cognito client and the API authorizer.
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
try{
  const pool=issuer.split('/').pop();
  const client=aws(['cognito-idp','describe-user-pool-client','--user-pool-id',pool,'--client-id',clientId]).UserPoolClient;
  check(client.CallbackURLs?.includes(redirect),`Cognito client ${client.ClientName} allows redirect ${redirect}`);
  check(client.LogoutURLs?.includes(signOut),`Cognito client allows sign-out ${signOut}`);
  check(client.AllowedOAuthFlows?.includes('code')&&!client.ClientSecret,'Cognito client uses the code flow without a client secret (PKCE)');
  check(client.SupportedIdentityProviders?.includes('Google'),'Cognito client signs in with Google');
  const apiId=new URL(apiBase).hostname.split('.')[0];
  const authorizers=aws(['apigatewayv2','get-authorizers','--api-id',apiId]).Items??[];
  check(authorizers.some(a=>a.JwtConfiguration?.Audience?.includes(clientId)&&a.JwtConfiguration?.Issuer===issuer),'API accepts tokens from the app client');
}catch(error){check(false,`Cognito/API checks need AWS access (${String(error.message).split('\n')[0]})`);}

const image=await fetch(`${characters}/motu.png`,{method:'HEAD'}).catch(()=>null);
check(image?.ok===true,`character images served from ${characters}`);

if(!process.argv.includes('--skip-flutter')){
  if(fs.existsSync(path.join(app,'test/fixtures/api-contract.json'))){
    try{execFileSync(process.execPath,[path.join(root,'scripts/app-contract-fixtures.mjs'),'--check'],{stdio:'inherit',env:{...process.env,BRAINROTGRAM_DIR:app}});check(true,'app fixtures match canonical contracts');}
    catch{check(false,'app fixtures match canonical contracts (run pnpm build first)');}
  }else check(false,'app canonical contract fixtures exist');
  for(const args of [['analyze'],['test']]){
    try{execFileSync('flutter',args,{cwd:app,stdio:'inherit'});check(true,`flutter ${args.join(' ')}`);}
    catch{check(false,`flutter ${args.join(' ')}`);}
  }
}

const failed=results.filter(ok=>!ok).length;
console.log(failed?`\n${failed} integration problem(s).`:`\nAll ${results.length} integration checks passed.`);
process.exit(failed?1:0);
