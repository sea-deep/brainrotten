import { z } from 'zod/v4';

export const MAX_CITATIONS = 20;
export const MAX_EXCERPT_CHARS = 500;

export const VerificationStatusSchema = z.enum(['verified', 'stale', 'deleted']);

export const CitationSchema = z.object({
  citationId: z.string().uuid(),
  path: z.string().min(1).max(512), // repository-relative
  symbol: z.string().max(256).nullable(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  contentHash: z.string().min(64).max(64), // sha256 hex
  excerpt: z.string().max(MAX_EXCERPT_CHARS),
  verificationStatus: VerificationStatusSchema,
});

export const ComparisonModeSchema = z.enum([
  'git-head',
  'dirty-working-tree',
  'explicit-base',
]);

export const EvidenceSnapshotV1Schema = z.object({
  schemaVersion: z.literal('EvidenceSnapshotV1'),
  snapshotId: z.string().uuid(),
  projectId: z.string().uuid(),
  createdAt: z.string().datetime(),
  baseRevision: z.string().nullable(),
  comparisonMode: ComparisonModeSchema,
  citations: z.array(CitationSchema).max(MAX_CITATIONS),
});

export type EvidenceSnapshotV1 = z.infer<typeof EvidenceSnapshotV1Schema>;
export type Citation = z.infer<typeof CitationSchema>;
export type ComparisonMode = z.infer<typeof ComparisonModeSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
