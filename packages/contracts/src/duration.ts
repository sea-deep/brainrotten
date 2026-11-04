/**
 * Video length rules, shared by script writing, speech, rendering and every schema that stores a duration.
 * The length a user picks is a target, not a cutoff: a video may run somewhat longer, never past the hard
 * ceiling (rendering must finish well inside the worker's 15-minute limit).
 */
export const MAX_VIDEO_SECONDS=240;
/** The longest a video may run for a chosen length: 25% (at least 30 s) over it, never past MAX_VIDEO_SECONDS. */
export function maxSecondsFor(targetSeconds:number):number{
  return Math.min(MAX_VIDEO_SECONDS,Math.round(Math.max(targetSeconds*1.25,targetSeconds+30)));
}
/** How fast the cloned voices speak at speech speed 1.0, in words per second (cautious end of measured videos). */
export const WORDS_PER_SECOND=2.3;
/** Words to ask a script writer for so the spoken video fills about the chosen length. */
export function targetWordsFor(targetSeconds:number,speechSpeed:number):number{
  return Math.round(targetSeconds*0.92*WORDS_PER_SECOND*speechSpeed);
}
/** Estimated length of a script once spoken, including Pause & Predict thinking time (about 8 s each). */
export function estimateSpokenSeconds(script:{dialogue:ReadonlyArray<{text:string;pause?:unknown}>},speechSpeed:number):number{
  const words=script.dialogue.reduce((n,line)=>n+line.text.split(/\s+/).filter(Boolean).length,0);
  const pauses=script.dialogue.slice(0,-1).filter(line=>line.pause).length;
  return Math.round(words/(WORDS_PER_SECOND*speechSpeed)+pauses*8);
}
