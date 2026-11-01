import { z } from 'zod/v4';

// Configuration constants — keep in sync with SKILL.md
export const MAX_DIALOGUE_CHARS = 1100;
export const MAX_TITLE_CHARS = 120;
export const MAX_OBJECTIVE_CHARS = 200;
export const MAX_QUESTION_CHARS = 300;
export const MAX_CHOICE_CHARS = 200;
export const MAX_EXPLANATION_CHARS = 400;

export const ALLOWED_SPEAKERS = ['rookie', 'debugger'] as const;
export const ALLOWED_SCENES = ['default', 'minimal'] as const;

export const DialogueSegmentSchema = z.object({
  id: z.string().min(1).max(64),
  speaker: z.enum(ALLOWED_SPEAKERS),
  text: z.string().min(1).max(500),
  citationIds: z.array(z.string().min(1).max(64)).max(10),
});

export const QuestionChoiceSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(MAX_CHOICE_CHARS),
});

export const LessonQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(MAX_QUESTION_CHARS),
  choices: z.array(QuestionChoiceSchema).min(2).max(4),
  correctChoiceId: z.string().min(1).max(64),
  explanation: z.string().min(1).max(MAX_EXPLANATION_CHARS),
  citationIds: z.array(z.string().min(1).max(64)).max(10),
});

export const LessonDraftV1Schema = z
  .object({
    schemaVersion: z.literal('LessonDraftV1'),
    projectId: z.string().uuid(),
    snapshotId: z.string().uuid(),
    submissionId: z.string().min(1).max(128),
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    language: z.string().min(2).max(10), // BCP-47
    objective: z.string().min(1).max(MAX_OBJECTIVE_CHARS),
    scene: z.enum(ALLOWED_SCENES),
    dialogue: z.array(DialogueSegmentSchema).min(1).max(20),
    question: LessonQuestionSchema,
  })
  .superRefine((val, ctx) => {
    // Validate total dialogue character budget
    const totalChars = val.dialogue.reduce((sum, seg) => sum + seg.text.length, 0);
    if (totalChars > MAX_DIALOGUE_CHARS) {
      ctx.addIssue({
        code: 'custom',
        path: ['dialogue'],
        message: `Total dialogue text exceeds ${MAX_DIALOGUE_CHARS} characters (got ${totalChars})`,
      });
    }
    // Validate correctChoiceId references an existing choice
    const choiceIds = new Set(val.question.choices.map((c) => c.id));
    if (!choiceIds.has(val.question.correctChoiceId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['question', 'correctChoiceId'],
        message: `correctChoiceId "${val.question.correctChoiceId}" does not match any choice id`,
      });
    }
  });

export type LessonDraftV1 = z.infer<typeof LessonDraftV1Schema>;
export type DialogueSegment = z.infer<typeof DialogueSegmentSchema>;
export type LessonQuestion = z.infer<typeof LessonQuestionSchema>;
export type QuestionChoice = z.infer<typeof QuestionChoiceSchema>;
