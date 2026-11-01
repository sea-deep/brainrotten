"""Offline reference transcription; never uses the incorrect CSV translations."""
import argparse,json
from pathlib import Path
from types import SimpleNamespace
from transformers import WhisperTokenizer
from mlx_audio.stt.utils import load
from alignment import MODEL_ID
p=argparse.ArgumentParser();p.add_argument('--audio',required=True);p.add_argument('--output',required=True);a=p.parse_args()
model=load(MODEL_ID)
model._processor=SimpleNamespace(tokenizer=WhisperTokenizer.from_pretrained('openai/whisper-base'))
result=model.generate(a.audio,language='hi',temperature=0,condition_on_previous_text=False)
Path(a.output).write_text(json.dumps({'text':result.text,'language_code':result.language}))
