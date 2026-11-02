import type {VideoFormat} from '@brainrot/contracts';

/** Landing-page examples. Each one was written by the coding agent from a real session in this repository. */
export type RealExample={slug:string;format:VideoFormat;formatName:string;when:string;title:string;session:string;agentDid:string;seconds:number;voices:string};
export const REAL_EXAMPLES:RealExample[]=[
  {slug:'session-sketch-lambda',format:'sketch',formatName:'Sketch board',when:'Systems, request paths and bugs across components',
    title:'Lambda ko handler kyun nahi mila?',session:'The hosted API returned 500 on every request: the Lambda image could not find its handler.',
    agentDid:'Found that the runtime client ignores the command argument and added a bootstrap that sets _HANDLER first.',seconds:66,voices:'Jack'},
  {slug:'session-skit-cognito',format:'skit',formatName:'Character skit',when:'A concept, a misconception or a decision',
    title:'Login ho gaya, phir bhi invalid?',session:'Google sign-in worked, but the terminal login said “Invalid Cognito sign-in configuration”.',
    agentDid:'Traced it to an issuer check that only allowed lowercase, while the real pool ID has capitals.',seconds:58,voices:'Jhaplu & Paplu'},
  {slug:'session-prreview-cognito',format:'prreview',formatName:'PR review',when:'Reviewing a real diff line by line',
    title:'Accept real Cognito pool IDs',session:'The fix for that login bug: one regex line and a test with the real pool ID.',
    agentDid:'Reviewed its own diff: why the old line failed, why the new one stays safe, and what the test proves.',seconds:57,voices:'Dr Jhatka & John'},
  {slug:'session-tierlist-hosting',format:'tierlist',formatName:'Tier list',when:'Several options were weighed',
    title:'Naya AWS account, website kahan host karein?',session:'CloudFront refused to start on a brand-new AWS account, so the site needed another home.',
    agentDid:'Ranked the hosting options it tried by one rule: live today, with Google sign-in.',seconds:59,voices:'Badri'},
  {slug:'session-groupchat-coldstart',format:'groupchat',formatName:'Group chat',when:'The parts of a system “talking” to each other',
    title:'Pehli request pe 18 second kyun?',session:'The first request after a quiet spell took about 18 seconds while the Lambdas started cold.',
    agentDid:'Added a five-minute warmup schedule; both handlers return early on the ping.',seconds:51,voices:'Taplu, Jack, John & Budhdev'},
];
