"""Explicit job worker for Maya reference cloning and local caption alignment.

Called only by the owner companion after a generation request. It never calls a
paid API, substitutes a named voice, or rewrites the Latin script.
"""
import argparse
import gc
import json
import re
from pathlib import Path
import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load as load_tts
from mlx_audio.stt.utils import load as load_stt
from alignment import align_words,MODEL_ID as ALIGNER_ID


def chunks(text,limit=180):
    words=text.split();result=[];current=[]
    for word in words:
        if current and len(' '.join([*current,word]))>limit:
            result.append(' '.join(current));current=[]
        current.append(word)
    if current:result.append(' '.join(current))
    return result


def run(request,output):
    output.mkdir(parents=True,exist_ok=True)
    model=load_tts(request['modelPath'])
    pieces=[]
    for turn,line in enumerate(request['dialogue']):
        reference=request['references'][line['speaker']]
        if not Path(reference['audioPath']).is_file():raise ValueError('A required character reference is missing')
        for index,text in enumerate(chunks(line['text'])):
            file=output/f'turn-{turn}-{index}.wav'
            if not file.exists():
                mx.random.seed(42+turn*31+index)
                result=next(model.generate(text,lang_code=request['language'],ref_audio=reference['audioPath'],ref_text=reference['text'],ref_lang=reference['language'],conditioning='icl_spk',normalize=False,max_tokens=360,temperature=.65,depth_temperature=.5))
                audio=np.asarray(result.audio)
                if not audio.size or not np.isfinite(audio).all():raise ValueError('Invalid local speech waveform')
                if len(audio)/result.sample_rate>=28.7:raise ValueError('Speech chunk reached its duration guard; review it before retrying')
                peak=float(np.max(np.abs(audio)))
                if peak<.005:raise ValueError('Local model returned near-silent audio')
                if peak>.97:audio=audio*(.97/peak)
                sf.write(file,audio,result.sample_rate)
            pieces.append({'file':file,'text':text,'turn':turn,'speaker':line['speaker']})
        print(json.dumps({'stage':'speech','completedTurns':turn+1,'totalTurns':len(request['dialogue'])}),flush=True)
    # Keep the peak memory bounded: release the speech model before loading alignment.
    del model;gc.collect();mx.clear_cache()
    aligner=load_stt(ALIGNER_ID)
    audio_parts=[];words=[];segments=[];offset=0
    for item in pieces:
        audio,sr=sf.read(item['file'],dtype='float32');duration=len(audio)/sr
        if sr!=24000:raise ValueError('Unexpected local speech sample rate')
        aligned=align_words(aligner,audio,sr,item['text'],request['language'])
        for word in aligned:words.append({'text':word['text'],'speaker':item['speaker'],'turnIndex':item['turn'],'startMs':round(word['startMs']+offset*1000),'endMs':round(word['endMs']+offset*1000)})
        if len(segments)<=item['turn']:segments.append({'speaker':item['speaker'],'turnIndex':item['turn'],'text':request['dialogue'][item['turn']]['text'],'startMs':round(offset*1000),'endMs':round((offset+duration)*1000)})
        else:segments[item['turn']]['endMs']=round((offset+duration)*1000)
        offset+=duration;audio_parts.append(audio)
    if offset/request['speechSpeed']>180:raise ValueError('Local speech exceeds three minutes; shorten the script')
    sf.write(output/'source.wav',np.concatenate(audio_parts),24000)
    receipt={'backend':'maya-local','durationSeconds':offset,'segments':segments,'words':words,'timing':'whisper-cross-attention-dtw','conditioning':'icl_spk','modelRevision':request['modelRevision']}
    (output/'result.json').write_text(json.dumps(receipt))
    print(json.dumps({'stage':'aligned','durationSeconds':offset,'timedUnits':len(words)}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--request',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
    run(json.loads(Path(args.request).read_text()),Path(args.output))
