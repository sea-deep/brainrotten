"""Local Whisper cross-attention/DTW alignment of the exact Latin script."""
import math
from functools import lru_cache
from transformers import WhisperTokenizer
from mlx_audio.stt.models.whisper.whisper import HFTokenizerWrapper
import mlx.core as mx
import numpy as np
from scipy.signal import resample_poly
from mlx_audio.stt.models.whisper.audio import log_mel_spectrogram,pad_or_trim,N_FRAMES
from mlx_audio.stt.models.whisper.timing import find_alignment

MODEL_ID='mlx-community/whisper-base-mlx'

@lru_cache(maxsize=3)
def get_tokenizer(language):
    return HFTokenizerWrapper(WhisperTokenizer.from_pretrained('openai/whisper-base'),multilingual=True,num_languages=99,language=language,task='transcribe')

def align_words(model,audio,sample_rate,text,language):
    if len(audio)/sample_rate>29:raise ValueError('Align one speech chunk shorter than 29 seconds')
    divisor=math.gcd(sample_rate,16000)
    audio16=resample_poly(np.asarray(audio),16000//divisor,sample_rate//divisor).astype(np.float32)
    mel=log_mel_spectrogram(audio16,n_mels=model.dims.n_mels)
    frame_count=mel.shape[-2]
    mel=pad_or_trim(mel,N_FRAMES,axis=-2).astype(model.dtype)
    tokenizer=get_tokenizer(language)
    timings=find_alignment(model,tokenizer,tokenizer.encode(' '+text.strip()),mel,frame_count)
    duration=len(audio)/sample_rate
    words=[];pending=[];untimed=0;total=0
    for item in timings:
        word=item.word.strip()
        if not word:continue
        total+=1
        start=max(0,min(float(item.start),duration));end=max(start,min(float(item.end),duration))
        if end<=start:
            pending.append(word);untimed+=1
            continue
        text_unit=' '.join([*pending,word]);pending=[]
        words.append({'text':text_unit,'startMs':round(start*1000),'endMs':round(end*1000),'probability':float(item.probability)})
    if pending and words:words[-1]['text']+=' '+' '.join(pending)
    if not words or untimed/max(1,total)>.25:raise ValueError('Too many unaligned words; keep the audio and review timing')
    # Zero-duration tokens stay inside an adjacent measured phrase interval. Never invent word times.
    if ''.join(''.join(word['text'].split()) for word in words)!=''.join(text.split()):raise ValueError('Alignment did not retain every script character')
    return words
