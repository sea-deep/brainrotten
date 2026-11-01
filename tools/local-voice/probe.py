"""Explicit local evaluation: no provider calls, no bundled stock voice fallback."""
import argparse
import json
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load

parser=argparse.ArgumentParser()
parser.add_argument('--reference',required=True)
parser.add_argument('--model',default='maya-research/maya2-native')
parser.add_argument('--conditioning',choices=['spk','icl_spk'],default='spk')
parser.add_argument('--reference-text-file')
parser.add_argument('--text',required=True)
parser.add_argument('--language',choices=['en','hi','bn'],required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
started=time.monotonic()
print('Loading Maya2 Native and its codec/speaker encoder; first run downloads weights.',flush=True)
model=load(args.model)
loaded=time.monotonic()
mx.random.seed(42)
result=next(model.generate(args.text,lang_code=args.language,ref_audio=str(Path(args.reference).resolve()),conditioning=args.conditioning,ref_text=Path(args.reference_text_file).read_text() if args.reference_text_file else None,ref_lang='hi',normalize=False,max_tokens=400,temperature=.65,depth_temperature=.5))
audio=np.asarray(result.audio)
if audio.size==0 or not np.isfinite(audio).all():raise RuntimeError('Local model returned invalid audio')
output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
peak=float(np.max(np.abs(audio)))
if peak<.005:raise RuntimeError('Local model returned near-silent audio')
if peak>.97:audio=audio*(.97/peak)
sf.write(output,audio,result.sample_rate)
report={'model':args.model,'language':args.language,'conditioning':args.conditioning,'loadSeconds':round(loaded-started,2),'generationSeconds':round(time.monotonic()-loaded,2),'audioSeconds':round(audio.size/result.sample_rate,3),'sampleRate':result.sample_rate,'peak':float(np.max(np.abs(audio))),'peakMemoryGB':round(mx.get_peak_memory()/1e9,2),'text':args.text,'output':str(output)}
output.with_suffix('.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
