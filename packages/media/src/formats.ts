import {VIDEO_FORMATS} from '@brainrot/contracts';
/** Native render layouts need no artwork download or generation. */
export function formatCapabilities(){return VIDEO_FORMATS.map(format=>({...format,ready:true}));}
