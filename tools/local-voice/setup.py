"""Explicit download/warm-up/check command. Never imported by Studio startup."""
import argparse,gc,hashlib,json,os,shutil
from pathlib import Path
from huggingface_hub import snapshot_download

REVISION='880744846e630eee8c80a21527fd93c9e8217931'
SHA='a6f3488abb925ec758a3e6908ffa105f4b2db93662e1471be6819111196c7f8c'
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--verify',action='store_true');a=p.parse_args();root=Path(a.root);target=root/'models/maya2-native-bf16'
if not a.verify:
    source=Path(snapshot_download('maya-research/maya2-native',revision=REVISION,allow_patterns=['*.json','*.safetensors','backbone/*.json','voices/*.json']))
    with (source/'model-00001-of-00002.safetensors').open('rb') as file:
        if hashlib.file_digest(file,'sha256').hexdigest()!=SHA:raise RuntimeError('Checkpoint checksum mismatch')
    target.mkdir(parents=True,exist_ok=True)
    for file in source.rglob('*'):
        if not file.is_file():continue
        output=target/file.relative_to(source);output.parent.mkdir(parents=True,exist_ok=True)
        if output.exists():continue
        if file.suffix=='.safetensors':
            try:os.link(file.resolve(),output)
            except OSError:shutil.copyfile(file,output)
        else:shutil.copyfile(file,output)
    from mlx_audio.tts.utils import load
    from mlx_audio.codec.models.ecapa_tdnn.speaker import EcapaSpeakerEmbeddingExtractor
    model=load(str(target),strict=True);model._load_codec();EcapaSpeakerEmbeddingExtractor.from_pretrained(model.config.speaker_encoder_repo)
    del model;gc.collect()
    from mlx_audio.stt.utils import load as load_stt
    from transformers import WhisperTokenizer
    from alignment import MODEL_ID
    load_stt(MODEL_ID);WhisperTokenizer.from_pretrained('openai/whisper-base')
    print('Pinned full-precision model, reference encoder, codec and local aligner prepared.',flush=True)
else:
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load
    from mlx_audio.stt.utils import load as load_stt
    from alignment import align_words,MODEL_ID
    references=json.loads((root/'references/index.json').read_text())['voices']
    reference=references.get('motu') or next(iter(references.values()))
    model=load(str(target),strict=True);checks=root/'checks';checks.mkdir(exist_ok=True);pieces=[]
    prompts={'en':'Why does the cache still return the old value after an update?','hi':'Update ho gaya, phir cache se purana result kyun aa raha hai?','bn':'Database-e update hoye gechhe, kintu cache theke purono result aschhe keno?'}
    for language,text in prompts.items():
        mx.random.seed(42)
        result=next(model.generate(text,lang_code=language,ref_audio=str(root/'references'/reference['file']),ref_text=reference['text'],ref_lang=reference['language'],conditioning='icl_spk',normalize=False,max_tokens=360,temperature=.65,depth_temperature=.5))
        audio=np.asarray(result.audio);peak=float(np.max(np.abs(audio)))
        if not np.isfinite(audio).all() or peak<.005 or result.token_count>=360:raise RuntimeError('Local speech check failed')
        if peak>.97:audio*=.97/peak
        sf.write(checks/(language+'.wav'),audio,result.sample_rate);pieces.append((language,text,audio,result.sample_rate))
    del model;gc.collect();mx.clear_cache();aligner=load_stt(MODEL_ID)
    for language,text,audio,sr in pieces:align_words(aligner,audio,sr,text,language)
    marker={'modelRevision':REVISION,'precision':'bf16','conditioning':'icl_spk','preparedLanguages':list(prompts),'checks':['waveform','reference conditioning','exact-script local alignment'],'note':'Technical readiness; voice likeness and pronunciation require listening review.'}
    (root/'ready.json').write_text(json.dumps(marker,indent=2));(root/'ready.json').chmod(0o600)
    print('Local speech and alignment checks passed. Both engines remain available.',flush=True)
