import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod/v4';
import {LearningSessionSchema,SessionReviewSchema,applySessionReview,emptySessionReview,type LearningSession} from '@brainrot/contracts';
import {newLearningSession,sessionFingerprint,sessionPage} from '@brainrot/media';
export class SessionRequestConflictError extends Error{constructor(){super('Session request ID was already used for different context. Create a new checkpoint request ID.');}}
export class LearningSessions{
  private directory:string;private records=new Map<string,LearningSession>();
  constructor(dataDir:string){
    this.directory=path.join(dataDir,'learning-sessions');fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    for(const file of fs.readdirSync(this.directory)){if(!/^[a-f0-9-]{36}\.json$/.test(file))continue;try{const target=path.join(this.directory,file);if(fs.lstatSync(target).isSymbolicLink())continue;const session=LearningSessionSchema.parse(JSON.parse(fs.readFileSync(target,'utf8')));if(file!==session.sessionId+'.json')continue;this.records.set(session.sessionId,session);}catch{/* Invalid private records are retained, never exposed. */}}
  }
  get(id:string){return z.uuid().safeParse(id).success?this.records.get(id):undefined;}
  list(query:unknown){return sessionPage([...this.records.values()],query);}
  create(raw:unknown){
    const session=newLearningSession(raw,'local'),previous=this.get(session.sessionId);
    if(previous){if(sessionFingerprint(previous)!==sessionFingerprint(raw))throw new SessionRequestConflictError();return previous;}
    this.write(session.sessionId+'.json',session);this.records.set(session.sessionId,session);return session;
  }
  review(id:string){if(!this.get(id))return;const file=path.join(this.directory,id+'.review.json');if(!fs.existsSync(file))return emptySessionReview(id);return SessionReviewSchema.parse(JSON.parse(fs.readFileSync(file,'utf8')));}
  saveReview(id:string,raw:unknown){const current=this.review(id);if(!current)return;const next=applySessionReview(current,raw);this.write(id+'.review.json',next);return next;}
  private write(name:string,value:unknown){const target=path.join(this.directory,name),temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,target);}
}
