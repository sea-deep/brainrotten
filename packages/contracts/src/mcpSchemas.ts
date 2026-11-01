/**
 * MCP tool input/output schemas derived from the shared contracts.
 * Used by the companion MCP server and the integration tests.
 */
import { z } from 'zod/v4';
import { LessonDraftV1Schema } from './lessonDraftSchema.js';

export const GetChangeContextInputSchema = z.object({
  projectId: z.string().uuid(),
  comparisonMode: z.enum(['git-head', 'dirty-working-tree']).optional(),
});

export const SubmitLessonInputSchema = LessonDraftV1Schema;

export const GetLessonStatusInputSchema = z.object({
  jobId: z.string().uuid(),
});

export type GetChangeContextInput = z.infer<typeof GetChangeContextInputSchema>;
export type SubmitLessonInput = z.infer<typeof SubmitLessonInputSchema>;
export type GetLessonStatusInput = z.infer<typeof GetLessonStatusInputSchema>;

/** Shared job lookup for video status and learning-pack reads. */
export const GetVideoInputSchema=z.object({jobId:z.string().uuid()});
export type GetVideoInput=z.infer<typeof GetVideoInputSchema>;

export const ValidateVideoScriptInputSchema=z.object({request:z.unknown()});
