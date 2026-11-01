import { z } from 'zod/v4';
import { ALLOWED_SCENES, ALLOWED_SPEAKERS } from './lessonDraftSchema.js';
import { VerificationStatusSchema } from './evidenceSnapshotSchema.js';

export const MediaStatusSchema = z.enum(['mock', 'unavailable', 'live']);

export const TimedSegmentSchema = z.object({
  id: z.string().min(1).max(64),
  speaker: z.enum(ALLOWED_SPEAKERS),
  text: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

export const ManifestCitationSchema = z.object({
  citationId: z.string().uuid(),
  path: z.string().min(1).max(512), // repository-relative, no absolute paths
  symbol: z.string().max(256).nullable(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  contentHash: z.string().min(64).max(64),
  excerpt: z.string().max(500),
  verificationStatus: VerificationStatusSchema,
});

export const ManifestQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(300),
  choices: z.array(
    z.object({
      id: z.string().min(1).max(64),
      text: z.string().min(1).max(200),
    })
  ).min(2).max(4),
  correctChoiceId: z.string().min(1).max(64),
  explanation: z.string().min(1).max(400),
  citationIds: z.array(z.string().uuid()).max(10),
});

export const PlaybackManifestV1Schema = z.object({
  schemaVersion: z.literal('PlaybackManifestV1'),
  lessonId: z.string().uuid(),
  jobId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  createdAt: z.string().datetime(),
  title: z.string().min(1).max(120),
  objective: z.string().min(1).max(200),
  scene: z.enum(ALLOWED_SCENES),
  mode: MediaStatusSchema,
  durationSeconds: z.number().positive().nullable(),
  dialogue: z.array(TimedSegmentSchema),
  question: ManifestQuestionSchema,
  citations: z.array(ManifestCitationSchema),
  audioUrl: z.string().url().nullable(),
  audioFormat: z.string().nullable(),
});

export type PlaybackManifestV1 = z.infer<typeof PlaybackManifestV1Schema>;
export type TimedSegment = z.infer<typeof TimedSegmentSchema>;
export type ManifestCitation = z.infer<typeof ManifestCitationSchema>;
export type MediaStatus = z.infer<typeof MediaStatusSchema>;
