/**
 * Session authentication.
 *
 * On first start a random 256-bit hex token is written to <dataDir>/session.token
 * with mode 0o600. The same token is required in the Authorization header for
 * all mutation routes and for the API calls from the React player.
 *
 * Tokens never enter logs or URL query strings. Only the owner session can reveal or rotate the separate MCP credential.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

export class SessionAuth {
  private token: string;
  private tokenPath: string;
  private mcpTokenPath:string;
  private mcpToken:string;

  constructor(dataDir: string) {
    this.tokenPath = path.join(dataDir, 'session.token');
    this.token = this.loadOrCreate();
    this.mcpTokenPath=path.join(dataDir,'mcp-token');
    let saved='';try{saved=fs.readFileSync(this.mcpTokenPath,'utf8').trim();}catch{/*first setup*/}
    const configured=process.env['BRAINROTTEN_MCP_TOKEN'];
    this.mcpToken=/^[a-f0-9]{64}$/.test(saved)?saved:configured&&/^[a-f0-9]{64}$/.test(configured)?configured:crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(this.mcpTokenPath,this.mcpToken+'\n',{mode:0o600});
  }

  private loadOrCreate(): string {
    try {
      const existing = fs.readFileSync(this.tokenPath, 'utf-8').trim();
      if (/^[a-f0-9]{64}$/.test(existing)) return existing;
    } catch {
      // File doesn't exist yet
    }
    const token = crypto.randomBytes(32).toString('hex');
    const dir = path.dirname(this.tokenPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.tokenPath, token + '\n', { mode: 0o600 });
    logger.info('Generated new session token', { path: this.tokenPath });
    return token;
  }

  getToken(): string {
    return this.token;
  }

  getTokenPath(): string {
    return this.tokenPath;
  }

  getMcpToken():string{return this.mcpToken;}
  rotateMcpToken():string{this.mcpToken=crypto.randomBytes(32).toString('hex');fs.writeFileSync(this.mcpTokenPath,this.mcpToken+'\n',{mode:0o600});return this.mcpToken;}
  private credential(req:Request):string|undefined{
    const authorization=req.headers['authorization'];
    if(authorization)return authorization.startsWith('Bearer ')?authorization.slice(7):undefined;
    return req.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith('brainrot_session='))?.slice('brainrot_session='.length);
  }
  private matches(candidate:string|undefined,expected:string):boolean{return Boolean(candidate&&/^[a-f0-9]{64}$/.test(candidate)&&crypto.timingSafeEqual(Buffer.from(candidate),Buffer.from(expected)));}
  private authenticate(req:Request,res:Response,next:NextFunction,ownerOnly:boolean):void{
    const candidate=this.credential(req);
    if(!this.matches(candidate,this.token)&&(ownerOnly||!this.matches(candidate,this.mcpToken))){res.status(401).json({code:'UNAUTHORIZED',message:ownerOnly?'Use the local Studio session to change settings.':'A valid private connection token is required.',retryable:false});return;}
    next();
  }
  requireAuth=(req:Request,res:Response,next:NextFunction):void=>this.authenticate(req,res,next,false);
  requireOwner=(req:Request,res:Response,next:NextFunction):void=>this.authenticate(req,res,next,true);

  /**
   * Validate Origin/Host for mutation routes.
   * Only loopback origins (localhost / 127.0.0.1) are allowed.
   */
  requireLoopbackOrigin = (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers['origin'];
    const host = req.headers['host'];
    if (origin) {
      try {
        const url = new URL(origin);
        const allowed = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (!allowed) {
          res.status(403).json({
            code: 'FORBIDDEN_ORIGIN',
            message: 'Cross-origin mutations are not allowed',
            retryable: false,
          });
          return;
        }
      } catch {
        res.status(403).json({
          code: 'FORBIDDEN_ORIGIN',
          message: 'Invalid Origin header',
          retryable: false,
        });
        return;
      }
    }
    // host must be localhost or 127.0.0.1
    if (host) {
      const hostname = host.split(':')[0];
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        res.status(403).json({
          code: 'FORBIDDEN_HOST',
          message: 'Only loopback hosts are permitted',
          retryable: false,
        });
        return;
      }
    }
    next();
  };
}
