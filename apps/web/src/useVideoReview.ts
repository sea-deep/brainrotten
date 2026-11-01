import {useCallback,useEffect,useRef,useState} from 'react';
import {ReviewConflictError,type ReviewAction,type VideoReview} from '@brainrot/contracts';
import {getVideoReview,saveVideoReview} from './api.js';
export function useVideoReview(jobId:string|undefined,onChanged:()=>void){
  const[review,setReview]=useState<VideoReview|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const currentId=useRef(jobId);currentId.current=jobId;
  const cache=useRef(new Map<string,VideoReview>()),queues=useRef(new Map<string,Promise<void>>());
  const load=useCallback(async()=>{if(!jobId){setReview(null);return;}try{const result=await getVideoReview(jobId),known=cache.current.get(jobId);if(!known||result.version>=known.version)cache.current.set(jobId,result);if(currentId.current===jobId){setReview(cache.current.get(jobId)!);setError('');}}catch(e){if(currentId.current===jobId)setError(e instanceof Error?e.message:'Could not load review progress.');}},[jobId]);
  useEffect(()=>{setReview(null);setError('');void load();const visible=()=>{if(document.visibilityState!=='hidden'&&!queues.current.has(jobId??''))void load();};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};},[load,jobId]);
  const save=useCallback((action:ReviewAction):Promise<void>=>{
    if(!jobId)return Promise.resolve();
    if(currentId.current===jobId)setSaving(true);
    const previous=queues.current.get(jobId)??Promise.resolve();
    const work=previous.catch(()=>{}).then(async()=>{
      let known=cache.current.get(jobId);if(!known)known=await getVideoReview(jobId);
      let result:VideoReview;
      try{result=await saveVideoReview(jobId,{...action,expectedVersion:known.version});}
      catch(e){if(!(e instanceof ReviewConflictError))throw e;cache.current.set(jobId,e.review);
        if(action.kind==='answer'&&Object.hasOwn(e.review.answers,action.questionId)&&e.review.answers[action.questionId]?.choice===action.choice)result=e.review;
        else result=await saveVideoReview(jobId,{...action,expectedVersion:e.review.version});
      }
      cache.current.set(jobId,result);if(currentId.current===jobId){setReview(result);setError('');onChanged();}
    }).catch(e=>{if(currentId.current===jobId)setError(e instanceof Error?e.message:'Progress was not saved. Try again.');});
    queues.current.set(jobId,work);void work.finally(()=>{if(queues.current.get(jobId)===work){queues.current.delete(jobId);if(currentId.current===jobId)setSaving(false);}});return work;
  },[jobId,onChanged]);
  return{review:review?.jobId===jobId?review:null,error,saving,save,reload:load};
}
