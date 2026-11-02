/**
 * Speech provider interface and mock implementation.
 *
 * The live ElevenLabs adapter is explicitly unimplemented.
 * The mock provider returns synthetic timing without any network calls.
 */

export interface DialogueInput {
  segments: Array<{
    speaker: string;
    text: string;
  }>;
  /** Provider-specific voice mapping — injected at runtime, never from agent draft */
  voiceMap?: Record<string, string>;
}

export interface SpeakerSegment {
  id: string;
  speaker: string;
  startMs: number;
  endMs: number;
}

export interface SynthesisResult {
  audioBase64: string;
  audioFormat: 'mp3' | 'wav';
  durationSeconds: number;
  speakerSegments: SpeakerSegment[];
}

export interface SpeechProvider {
  synthesize(input: DialogueInput): Promise<SynthesisResult>;
}

/**
 * Mock provider — deterministic, no network calls.
 * Labeled clearly so it is never confused with real synthesis.
 */
export class MockSpeechProvider implements SpeechProvider {
  async synthesize(input: DialogueInput): Promise<SynthesisResult> {
    let cursor = 0;
    const speakerSegments: SpeakerSegment[] = input.segments.map((seg, i) => {
      const words = seg.text.split(/\s+/).filter(Boolean).length;
      const durationMs = Math.max(1000, words * 400);
      const segment: SpeakerSegment = {
        id: `seg-${i}`,
        speaker: seg.speaker,
        startMs: cursor,
        endMs: cursor + durationMs,
      };
      cursor += durationMs + 200;
      return segment;
    });

    const durationSeconds = cursor / 1000;

    // Return empty base64 audio — clearly labeled as mock
    return {
      audioBase64: '', // mock: no real audio
      audioFormat: 'mp3',
      durationSeconds,
      speakerSegments,
    };
  }
}

/**
 * ElevenLabs provider — NOT IMPLEMENTED.
 * Throws a clear error if called, rather than silently failing.
 *
 * Future: implement using the ElevenLabs dialogue-with-timestamps endpoint.
 * Character limit: stay at or below 2,000 input characters for reliable results.
 * Credential handling: inject via environment variable, never from agent input.
 */
export class ElevenLabsProvider implements SpeechProvider {
  async synthesize(_input: DialogueInput): Promise<SynthesisResult> {
    throw new Error(
      'PROVIDER_NOT_CONFIGURED: ElevenLabs synthesis is not yet implemented. ' +
      'Set ELEVENLABS_API_KEY and implement this provider for live audio generation.'
    );
  }
}
