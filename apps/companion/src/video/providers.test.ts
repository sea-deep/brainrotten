import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateVideoInputSchema, type VideoScript } from '@brainrot/contracts';
import { createScript, GenerationError, parseTiming } from './providers.js';

const script: VideoScript = {
  title: 'Retries have a budget',
  dialogue: [
    { speaker: 'oggy', text: 'Hello, world!' },
    { speaker: 'jack', text: 'Try again.' },
  ],
  takeaway: 'Retry a bounded number of times.',
  question: {
    prompt: 'What happens when the attempts run out?',
    choices: ['Try forever', 'Return the error'],
    answer: 1,
    explanation: 'A bounded retry loop stops after its last attempt.',
  },
};

const qaDialogue:VideoScript['dialogue']=[{...script.dialogue[0]!,text:'Why should a retry loop stop?'},script.dialogue[1]!,{speaker:'oggy',text:'What happens when its budget runs out?'},{speaker:'jack',text:'Return the last error to the caller.'}];
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  // Never load the user's .env or let a test reach a real provider.
  vi.stubEnv('BRAINROT_SKIP_ENV', '1');
  vi.stubEnv('PAPER_API_KEY', 'paper-synthetic-test-key');
  vi.stubEnv('PAPERINSTRUMENTS_API_KEY', 'paper-synthetic-fallback');
  vi.stubEnv('ELEVENLABS_API_KEY', 'elevenlabs-synthetic-test-key');
  fetchMock.mockReset().mockRejectedValue(new Error('Unexpected provider request in an offline test'));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('agent-authored and Paper-authored scripts', () => {
  it('accepts a complete agent script without a Paper key or request', async () => {
    vi.stubEnv('PAPER_API_KEY', '');
    vi.stubEnv('PAPERINSTRUMENTS_API_KEY', '');
    const result = await createScript(GenerateVideoInputSchema.parse({ script:{...script,dialogue:qaDialogue} }));
    expect(result).toEqual({...script,participants:{learner:'oggy',expert:'jack'},dialogue:qaDialogue});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails missing script-provider configuration before attempting a request', async () => {
    vi.stubEnv('PAPER_API_KEY', '');
    vi.stubEnv('PAPERINSTRUMENTS_API_KEY', '');
    await expect(createScript(GenerateVideoInputSchema.parse({ prompt: 'Explain bounded retries' })))
      .rejects.toThrow('selected Gemini/Paper key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns validated structured output from a mocked Paper response', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: JSON.stringify({...script,dialogue:qaDialogue}) } }] }));
    const result = await createScript(GenerateVideoInputSchema.parse({ prompt: 'Explain retry budgets', style: 'calm' }));
    expect(result).toEqual({...script,participants:{learner:'oggy',expert:'jack'},dialogue:qaDialogue});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.paperinstruments.com/v1/chat/completions');
    const body = JSON.parse(String(options?.body)) as {
      model: string;
      response_format: { type: string };
      messages: Array<{ content: string }>;
    };
    expect(body.model).toBe('ultramarine-1-flash');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.messages.at(-1)?.content).toContain('Explain retry budgets');
  });

  it.each([
    '{invalid-json',
    JSON.stringify({ ...script, dialogue: [] }),
    JSON.stringify({ ...script, question: { ...script.question, answer: 3 } }),
  ])('rejects invalid returned content before synthesis can begin', async (content) => {
    fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ message: { content } }] }));
    await expect(createScript(GenerateVideoInputSchema.parse({ prompt: 'Explain retry budgets' })))
      .rejects.toThrow('did not match the selected cast or script contract');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a missing completion instead of fabricating a lesson', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: 'length', message: {} }] }));
    await expect(createScript(GenerateVideoInputSchema.parse({ prompt: 'Explain retries' })))
      .rejects.toThrow('returned no script text');
  });

  it.each([401, 429, 503])('reports a Paper HTTP %i without retrying', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response('provider rejected request', { status }));
    await expect(createScript(GenerateVideoInputSchema.parse({ prompt: 'Explain retries' })))
      .rejects.toThrow(`HTTP ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('speech timing → speaker-aware captions', () => {
  it('separates touching Bengali dialogue turns using provider character ranges',()=>{
    const first='কেন দেখাচ্ছে?',second='Cache-এ আলাদা copy আছে।',characters=Array.from(first+second),boundary=Array.from(first).length;
    const result=parseTiming({title:'Benglish',dialogue:[{speaker:'paplu',text:first},{speaker:'jhaplu',text:second}]},{characters,character_start_times_seconds:characters.map((_,i)=>i/10),character_end_times_seconds:characters.map((_,i)=>(i+1)/10)},[{dialogue_input_index:0,start_time_seconds:0,end_time_seconds:boundary/10+.2,character_start_index:0,character_end_index:boundary},{dialogue_input_index:1,start_time_seconds:boundary/10,end_time_seconds:characters.length/10,character_start_index:boundary,character_end_index:characters.length}]);
    expect(result.words.map(w=>w.text)).toEqual(['কেন','দেখাচ্ছে?','Cache-এ','আলাদা','copy','আছে।']);expect(result.words.map(w=>w.turnIndex)).toEqual([0,0,1,1,1,1]);expect(result.words[1]!.speaker).toBe('paplu');expect(result.words[2]!.speaker).toBe('jhaplu');
  });
  it('preserves punctuation, word boundaries, and speaker timing', () => {
    const characters = Array.from('Hello, world! Try again.');
    const alignment = {
      characters,
      character_start_times_seconds: characters.map((_, index) => index / 10),
      character_end_times_seconds: characters.map((_, index) => (index + 1) / 10),
    };
    const result = parseTiming(script, alignment, [
      { dialogue_input_index: 0, start_time_seconds: 0, end_time_seconds: 1.3 },
      { dialogue_input_index: 1, start_time_seconds: 1.4, end_time_seconds: 2.4 },
    ]);
    expect(result.segments).toEqual([
      { speaker: 'oggy', turnIndex:0, text: 'Hello, world!', startMs: 0, endMs: 1300 },
      { speaker: 'jack', turnIndex:1, text: 'Try again.', startMs: 1400, endMs: 2400 },
    ]);
    expect(result.words).toEqual([
      { text: 'Hello,', startMs: 0, endMs: 600, speaker: 'oggy', turnIndex:0 },
      { text: 'world!', startMs: 700, endMs: 1300, speaker: 'oggy', turnIndex:0 },
      { text: 'Try', startMs: 1400, endMs: 1700, speaker: 'jack', turnIndex:1 },
      { text: 'again.', startMs: 1800, endMs: 2400, speaker: 'jack', turnIndex:1 },
    ]);
  });

  it('joins Unicode characters correctly and splits Unicode whitespace', () => {
    const unicodeScript = { ...script, dialogue: [
      { speaker: 'oggy' as const, text: 'Café 👋🏽' },
      { speaker: 'jack' as const, text: 'नमस्ते दुनिया' },
    ] };
    const characters = Array.from('Café\u00a0👋🏽\nनमस्ते\u2009दुनिया');
    const alignment = {
      characters,
      character_start_times_seconds: characters.map((_, index) => index / 5),
      character_end_times_seconds: characters.map((_, index) => (index + 1) / 5),
    };
    const secondStart = characters.indexOf('न') / 5;
    const result = parseTiming(unicodeScript, alignment, [
      { dialogue_input_index: 0, start_time_seconds: 0, end_time_seconds: secondStart - 0.2 },
      { dialogue_input_index: 1, start_time_seconds: secondStart, end_time_seconds: characters.length / 5 },
    ]);
    expect(result.words.map(word => word.text)).toEqual(['Café', '👋🏽', 'नमस्ते', 'दुनिया']);
    expect(result.words.map(word => word.speaker)).toEqual(['oggy', 'oggy', 'jack', 'jack']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a short interjection with its actual speaker at a close turn boundary', () => {
    const exchange = { ...script, dialogue: [
      { speaker: 'oggy' as const, text: 'Yes.' },
      { speaker: 'jack' as const, text: 'No.' },
    ] };
    const result = parseTiming(exchange, {
      characters: Array.from('Yes. No.'),
      character_start_times_seconds: [0, 0.2, 0.4, 0.6, 0.9, 0.91, 0.95, 1],
      character_end_times_seconds: [0.2, 0.4, 0.6, 0.9, 0.91, 0.95, 1, 1.05],
    }, [
      { dialogue_input_index: 0, start_time_seconds: 0, end_time_seconds: 0.9 },
      { dialogue_input_index: 1, start_time_seconds: 0.91, end_time_seconds: 1.05 },
    ]);
    expect(result.words).toEqual([
      { text: 'Yes.', startMs: 0, endMs: 900, speaker: 'oggy', turnIndex:0 },
      { text: 'No.', startMs: 910, endMs: 1050, speaker: 'jack', turnIndex:1 },
    ]);
  });

  it.each([
    { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] },
    { characters: ['a', 'b'], character_start_times_seconds: [0], character_end_times_seconds: [0.1, 0.2] },
    { characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [] },
  ])('rejects incomplete character alignment as an uncertain generated-audio outcome', (alignment) => {
    let failure: unknown;
    try { parseTiming(script, alignment, []); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(GenerationError);
    expect((failure as GenerationError).uncertain).toBe(true);
  });

  it('rejects a missing dialogue speaker window', () => {
    expect(() => parseTiming(script, {
      characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [0.1],
    }, [{ dialogue_input_index: 0, start_time_seconds: 0, end_time_seconds: 0.1 }]))
      .toThrow('speaker timing segment is missing');
  });
});
