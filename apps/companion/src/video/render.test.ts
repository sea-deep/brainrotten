import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';
import { escapeXml, getRenderReadiness, renderFrameSvg, renderVideo } from './render.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

const frameInput = {
  title: 'Why caches need expiration',
  style: 'brainrot' as const,
  durationSeconds: 1,
  segments: [{ speaker: 'oggy' as const, text: 'Caches keep things briefly.', startMs: 0, endMs: 1000 }],
  words: [
    { speaker: 'oggy' as const, text: 'Caches', startMs: 0, endMs: 250 },
    { speaker: 'oggy' as const, text: 'keep', startMs: 250, endMs: 500 },
    { speaker: 'oggy' as const, text: 'things', startMs: 500, endMs: 750 },
    { speaker: 'oggy' as const, text: 'briefly.', startMs: 750, endMs: 1000 },
  ],
};

describe('original vector video renderer', () => {
  it('escapes XML text and removes invalid control characters', () => {
    expect(escapeXml('<script x="a">&\u0001\'')).toBe('&lt;script x=&quot;a&quot;&gt;&amp;&apos;');
    const svg = renderFrameSvg({ ...frameInput, title: '<script>alert("hi")</script> & cache', words: [{ speaker: 'oggy', text: '<img&>', startMs: 0, endMs: 1000 }] }, 0.2);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;img&amp;&gt;');
    expect(() => new Resvg(svg).render()).not.toThrow();
  });

  it('renders multilingual text without interpreting markup', () => {
    const svg = renderFrameSvg({ ...frameInput, title: 'नमस्ते — cache & λ', words: [{ speaker: 'oggy', text: 'नमस्ते', startMs: 0, endMs: 1000 }] }, 0.5);
    expect(svg).toContain('नमस्ते');
    expect(() => new Resvg(svg).render()).not.toThrow();
  });

  it('keeps captions on their own turn when speaker windows overlap',()=>{
    const input={...frameInput,durationSeconds:2,segments:[{speaker:'oggy' as const,turnIndex:0,text:'OLD_OGGY',startMs:0,endMs:1200},{speaker:'jack' as const,turnIndex:1,text:'NEW_JACK',startMs:1000,endMs:2000}],words:[{speaker:'oggy' as const,turnIndex:0,text:'OLD_OGGY',startMs:700,endMs:1150},{speaker:'jack' as const,turnIndex:1,text:'NEW_JACK',startMs:1000,endMs:1500}]};
    const old=renderFrameSvg(input,.8),next=renderFrameSvg(input,1.05);expect(old).toContain('OLD_OGGY');expect(old).not.toContain('NEW_JACK');expect(next).toContain('NEW_JACK');expect(next).not.toContain('OLD_OGGY');expect(next).toContain('Roboto,Arial,sans-serif');expect(next).not.toContain('Space Grotesk');
  });

  it('produces portrait H264/AAC MP4 with actual local audio and a poster', async () => {
    if (!getRenderReadiness().ready) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'brainrot-render-'));
    directories.push(dir);
    const audioPath = path.join(dir, 'tone.wav');
    const tone = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-y', audioPath]);
    expect(tone.status).toBe(0);
    const progress: number[] = [];
    const output = await renderVideo({ ...frameInput, jobId: 'render-test', audioPath, outputDir: path.join(dir, 'output'), onProgress: (value) => progress.push(value) });
    expect((await stat(output.videoPath)).size).toBeGreaterThan(10_000);
    expect((await stat(output.posterPath)).size).toBeGreaterThan(10_000);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-show_entries', 'format=duration', '-of', 'json', output.videoPath], { encoding: 'utf8' });
    expect(probe.status).toBe(0);
    const metadata = JSON.parse(probe.stdout) as { streams: Array<{ codec_name: string; width?: number; height?: number }>; format: { duration: string } };
    expect(metadata.streams.some((stream) => stream.codec_name === 'h264' && stream.width === 720 && stream.height === 1280)).toBe(true);
    expect(metadata.streams.some((stream) => stream.codec_name === 'aac')).toBe(true);
    expect(Number(metadata.format.duration)).toBeGreaterThanOrEqual(0.9);
    expect(progress.at(-1)).toBe(1);
  }, 60_000);

  it('composites the transparent character/caption layer over a looping local gameplay clip', async () => {
    if (!getRenderReadiness().ready) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'brainrot-gameplay-render-'));
    directories.push(dir);
    const audioPath = path.join(dir, 'tone.wav');
    const backgroundPath = path.join(dir, 'background.mp4');
    expect(spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-y', audioPath]).status).toBe(0);
    expect(spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x2c72b5:s=360x640:d=0.5:r=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', backgroundPath]).status).toBe(0);
    const output = await renderVideo({ ...frameInput, jobId: 'background-test', audioPath, backgroundPath, outputDir: path.join(dir, 'output') });
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-show_entries', 'format=duration', '-of', 'json', output.videoPath], { encoding: 'utf8' });
    expect(probe.status).toBe(0);
    const metadata = JSON.parse(probe.stdout) as { streams: Array<{ codec_type: string; width?: number; height?: number }>; format: { duration: string } };
    expect(metadata.streams.filter((stream) => stream.codec_type === 'audio')).toHaveLength(1);
    expect(Number(metadata.format.duration)).toBeGreaterThanOrEqual(0.9);
    expect((await stat(output.posterPath)).size).toBeGreaterThan(10_000);
  }, 60_000);
});
