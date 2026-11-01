import { describe, it, expect } from 'vitest';
import { MockSpeechProvider, ElevenLabsProvider } from './speechProvider.js';

describe('MockSpeechProvider', () => {
  it('returns synthetic timing without network calls', async () => {
    const provider = new MockSpeechProvider();
    const result = await provider.synthesize({
      segments: [
        { speaker: 'rookie', text: 'Hello world this is a test' },
        { speaker: 'debugger', text: 'Yes that is correct' },
      ],
    });
    expect(result.durationSeconds).toBeGreaterThan(0);
    expect(result.speakerSegments).toHaveLength(2);
    expect(result.audioBase64).toBe(''); // mock: no real audio
    expect(result.audioFormat).toBe('mp3');
    // Segments are sequential (no overlap)
    expect(result.speakerSegments[1]!.startMs).toBeGreaterThan(result.speakerSegments[0]!.startMs);
  });
});

describe('ElevenLabsProvider', () => {
  it('throws PROVIDER_NOT_CONFIGURED rather than silently failing', async () => {
    const provider = new ElevenLabsProvider();
    await expect(
      provider.synthesize({ segments: [{ speaker: 'rookie', text: 'test' }] })
    ).rejects.toThrow('PROVIDER_NOT_CONFIGURED');
  });
});
