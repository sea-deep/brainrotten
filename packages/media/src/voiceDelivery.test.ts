import {describe,expect,it} from 'vitest';
import {GenerateVideoInputSchema,type CharacterId,type VideoScript} from '@brainrot/contracts';
import {dialogueRequest,deliverySettings,deliveryText} from './voiceDelivery.js';
import {parseTiming,splitDialogue} from './providers.js';
const voices=Object.fromEntries(['oggy','jack','badri','budhdev','jhaplu','paplu','taplu'].map(id=>[id,'synthetic-'+id])) as Record<CharacterId,string>;
describe('reference voice delivery',()=>{
  it('speaks every character on Eleven v4 with the listening-test settings',()=>{
    for(const cast of ['badri-budhdev','oggy-jack','jhaplu-paplu-taplu','auto'] as const){
      const request=dialogueRequest([{speaker:'badri',text:'Partner, cache purana hai.'}],voices,GenerateVideoInputSchema.parse({prompt:'Cache',cast}));
      expect(request.model_id).toBe('eleven_v4');expect(request.settings).toEqual({stability:.5,similarity_boost:.9});
    }
    expect(dialogueRequest([{speaker:'badri',text:'Partner.'}],voices,GenerateVideoInputSchema.parse({prompt:'Cache'})).inputs).toEqual([{voice_id:'synthetic-badri',text:'Partner.'}]);
  });
  it('lets an explicit voice mode trade closeness for acting',()=>{
    expect(deliverySettings({})).toEqual({stability:.5,similarity_boost:.9});
    expect(deliverySettings({voiceMode:'faithful'})).toEqual({stability:.5,similarity_boost:.9});
    expect(deliverySettings({voiceMode:'natural'})).toEqual({stability:.35,similarity_boost:.85});
    expect(deliverySettings({voiceMode:'expressive'})).toEqual({stability:.15,similarity_boost:.8});
  });
  it('sends a turn’s tone to speech without changing the original dialogue',()=>{const line={speaker:'oggy' as const,text:'Bhaiya, yeh kyun hua?',tone:'curious' as const};const request=dialogueRequest([line],voices,GenerateVideoInputSchema.parse({prompt:'Cache'}));expect(request.inputs[0]!.text).toBe('[curious] Bhaiya, yeh kyun hua?');expect(line.text).toBe('Bhaiya, yeh kyun hua?');});
  it('removes provider-aligned delivery tags from caption words while preserving turn boundaries',()=>{const script:VideoScript={title:'Tone',dialogue:[{speaker:'oggy',text:'Bhaiya?',tone:'curious'},{speaker:'jack',text:'Munna.',tone:'confident'}]},one='[curious] Bhaiya?',two='[confident] Munna.',characters=Array.from(one+two);const result=parseTiming(script,{characters,character_start_times_seconds:characters.map((_,i)=>i/20),character_end_times_seconds:characters.map((_,i)=>(i+1)/20)},[{dialogue_input_index:0,start_time_seconds:0,end_time_seconds:one.length/20,character_start_index:0,character_end_index:one.length},{dialogue_input_index:1,start_time_seconds:one.length/20,end_time_seconds:characters.length/20,character_start_index:one.length,character_end_index:characters.length}]);expect(result.words.map(word=>word.text)).toEqual(['Bhaiya?','Munna.']);expect(result.words.map(word=>word.turnIndex)).toEqual([0,1]);expect(result.segments.map(segment=>segment.text)).toEqual(['Bhaiya?','Munna.']);});
  it('counts tone-control characters toward the provider request limit',()=>{const script:VideoScript={title:'Long',dialogue:Array.from({length:60},()=>({speaker:'oggy',text:'word '.repeat(6).trim(),tone:'thoughtful'}))};const chunks=splitDialogue(script);expect(chunks.length).toBeGreaterThan(1);expect(chunks.flat()).toEqual(script.dialogue);expect(chunks.every(chunk=>chunk.reduce((n,line)=>n+deliveryText(line).length,0)<=1800)).toBe(true);});
});
