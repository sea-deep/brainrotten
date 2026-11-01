import fs from 'node:fs';
import path from 'node:path';
import {CognitoJwtVerifier} from 'aws-jwt-verify';
import {CognitoSettingsSchema,type CognitoSettings} from '@brainrot/contracts';
export function readCognitoSettings(dataDir:string):CognitoSettings|undefined{
  try{return CognitoSettingsSchema.parse(JSON.parse(fs.readFileSync(path.join(dataDir,'cognito.json'),'utf8')));}catch{/*environment fallback*/}
  const pool=process.env['COGNITO_USER_POOL_ID']??process.env['COGNITO_ISSUER']?.split('/').pop();
  const parsed=CognitoSettingsSchema.safeParse({domain:process.env['COGNITO_DOMAIN'],clientId:process.env['COGNITO_CLIENT_ID'],userPoolId:pool});return parsed.success?parsed.data:undefined;
}
export function saveCognitoSettings(dataDir:string,raw:unknown):CognitoSettings{
  const settings=CognitoSettingsSchema.parse(raw);fs.mkdirSync(dataDir,{recursive:true,mode:0o700});fs.writeFileSync(path.join(dataDir,'cognito.json'),JSON.stringify(settings),{mode:0o600});return settings;
}
export function cognitoPublicConfig(settings:CognitoSettings|undefined){if(!settings)return{configured:false};const region=settings.userPoolId.split('_')[0];return{configured:true,domain:settings.domain,userPoolId:settings.userPoolId,loginUrl:`${settings.domain.replace(/\/$/,'')}/oauth2/authorize`,clientId:settings.clientId,issuer:`https://cognito-idp.${region}.amazonaws.com/${settings.userPoolId}`};}
const verifiers=new Map<string,ReturnType<typeof CognitoJwtVerifier.create>>();
export async function verifyCognitoSession(settings:CognitoSettings,accessToken:string):Promise<{sub:string;email?:string;name?:string}>{
  const key=`${settings.userPoolId}/${settings.clientId}`;let verifier=verifiers.get(key);
  if(!verifier){verifier=CognitoJwtVerifier.create({userPoolId:settings.userPoolId,clientId:settings.clientId,tokenUse:'access'});verifiers.set(key,verifier);}
  const claims=await verifier.verify(accessToken);
  const response=await fetch(new URL('/oauth2/userInfo',settings.domain),{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Cognito rejected this sign-in session.');
  const user=await response.json() as{sub?:string;email?:string;name?:string};if(user.sub!==claims.sub)throw new Error('The sign-in identity did not match.');
  return{sub:claims.sub,...(typeof user.email==='string'?{email:user.email.slice(0,250)}:{}),...(typeof user.name==='string'?{name:user.name.slice(0,150)}:{})};
}
