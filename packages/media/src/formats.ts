import {CREATABLE_FORMATS} from '@brainrot/contracts';
/** Native render layouts need no artwork download or generation. */
export function formatCapabilities(){return CREATABLE_FORMATS.map(format=>({...format,ready:true}));}
