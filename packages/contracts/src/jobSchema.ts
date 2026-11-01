import { z } from 'zod/v4';

export const JobStateSchema = z.enum([
  'queued',
  'processing',
  'ready',
  'failed',
  'needs_review',
]);

export const JobModeSchema = z.enum(['mock', 'live']);

export const JobRecordSchema = z.object({
  jobId: z.string().uuid(),
  lessonId: z.string().uuid(),
  projectId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  submissionId: z.string().min(1).max(128),
  payloadHash: z.string().min(64).max(64),
  state: JobStateSchema,
  mode: JobModeSchema,
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  errorCode: z.string().max(64).nullable(),
  errorMessage: z.string().max(500).nullable(), // safe, no credentials
  manifestPath: z.string().nullable(),
});

export const JobStatusResponseSchema = z.object({
  jobId: z.string().uuid(),
  lessonId: z.string().uuid(),
  state: JobStateSchema,
  mode: JobModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  manifestUrl: z.string().nullable(), // relative URL, no absolute paths
  errorCode: z.string().max(64).nullable(),
  errorMessage: z.string().max(500).nullable(),
  staleSourceIds: z.array(z.string().uuid()).optional(),
});

// Structured error returned at all external boundaries
export const StructuredErrorSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

export type JobRecord = z.infer<typeof JobRecordSchema>;
export type JobState = z.infer<typeof JobStateSchema>;
export type JobMode = z.infer<typeof JobModeSchema>;
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
export type StructuredError = z.infer<typeof StructuredErrorSchema>;
