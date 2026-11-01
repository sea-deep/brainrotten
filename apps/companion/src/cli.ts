#!/usr/bin/env node
/**
 * CLI entry point for the companion.
 *
 * Commands:
 *   start        Start the companion HTTP server (default)
 *   seed         Register fixture repo and seed example lesson
 *   status       Show all jobs
 *   register     Register a local repository path
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BrainrotStorage, captureSnapshot, submitJob, validateDraft } from '@brainrot/core';
import { loadConfig } from './config.js';
import { startServer } from './server.js';
import { logger } from './logger.js';

const [, , command = 'start', ...args] = process.argv;

const config = loadConfig();
const dbPath = path.join(config.dataDir, 'db.sqlite');

async function main(): Promise<void> {
  switch (command) {
    case 'start': {
      const { port } = await startServer();
      logger.info(`Companion running on http://localhost:${port}`);
      break;
    }

    case 'seed': {
      await seedFixture();
      break;
    }

    case 'status': {
      showStatus();
      break;
    }

    case 'register': {
      const [repoPath, label = 'My Project'] = args;
      if (!repoPath) {
        console.error('Usage: cli.js register <path> [label]');
        process.exit(1);
      }
      registerProject(repoPath, label);
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Usage: cli.js [start|seed|status|register]');
      process.exit(1);
    }
  }
}

function showStatus(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const storage = new BrainrotStorage(dbPath);
  const jobs = storage.listJobs();
  if (jobs.length === 0) {
    console.log('No jobs found. Run: pnpm demo:seed');
  } else {
    console.log(`Found ${jobs.length} job(s):`);
    for (const job of jobs) {
      console.log(`  ${job.jobId} | ${job.state} | ${job.mode} | ${job.createdAt}`);
    }
  }
  storage.close();
}

function registerProject(repoPath: string, label: string): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const storage = new BrainrotStorage(dbPath);
  try {
    const resolved = path.resolve(repoPath);
    const existing = storage.findProjectByRepoPath(resolved);
    if (existing) {
      console.log(`Project already registered: ${existing.projectId} (${existing.label})`);
    } else {
      const project = storage.registerProject(label, resolved);
      console.log(`Registered project: ${project.projectId} (${project.label})`);
    }
  } catch (err) {
    console.error(`Failed to register: ${String(err)}`);
    process.exit(1);
  } finally {
    storage.close();
  }
}

async function seedFixture(): Promise<void> {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const storage = new BrainrotStorage(dbPath);

  try {
    // Find or register the fixture repository
    const fixtureRepoPath = path.resolve(
      new URL('../../../examples/fixture-repo', import.meta.url).pathname
    );

    if (!fs.existsSync(fixtureRepoPath)) {
      console.error(`Fixture repo not found at: ${fixtureRepoPath}`);
      console.error('Make sure you have run pnpm install first.');
      process.exit(1);
    }

    let project = storage.findProjectByRepoPath(fixtureRepoPath);
    if (!project) {
      project = storage.registerProject('Fixture Repository', fixtureRepoPath);
      console.log(`Registered fixture project: ${project.projectId}`);
    } else {
      console.log(`Using existing fixture project: ${project.projectId}`);
    }

    // Capture a snapshot
    const snapshot = captureSnapshot(project.projectId, fixtureRepoPath, 'git-head');
    storage.saveSnapshot(snapshot);
    console.log(`Captured snapshot: ${snapshot.snapshotId} (${snapshot.citations.length} citations)`);

    // Use the first citation ID if available
    const firstCitation = snapshot.citations[0];
    const citationId = firstCitation?.citationId ?? '';

    // Use a fixed submission key tied to the project (not the snapshot)
    // so it's idempotent regardless of snapshot changes
    const submissionId = `seed-fixture-${project.projectId.slice(0, 8)}`;

    // Check if we already have a job for this submission key
    const existingJob = storage.findJobBySubmissionId(submissionId);
    if (existingJob) {
      console.log(`Seed already exists: job ${existingJob.jobId} (${existingJob.state})`);
      console.log('\nSeed complete. Summary:');
      console.log(`  projectId:  ${project.projectId}`);
      console.log(`  snapshotId: ${snapshot.snapshotId}`);
      console.log(`  jobId:      ${existingJob.jobId}`);
      return;
    }
    const exampleDraft = {
      schemaVersion: 'LessonDraftV1' as const,
      projectId: project.projectId,
      snapshotId: snapshot.snapshotId,
      submissionId,
      title: 'Understanding the Fibonacci function',
      language: 'en',
      objective: 'Learn how the recursive Fibonacci implementation works and its trade-offs.',
      scene: 'default' as const,
      dialogue: [
        {
          id: 'seg-1',
          speaker: 'rookie' as const,
          text: 'Why is this Fibonacci function using recursion?',
          citationIds: citationId ? [citationId] : [],
        },
        {
          id: 'seg-2',
          speaker: 'debugger' as const,
          text: 'Recursion mirrors the mathematical definition: F(n) = F(n-1) + F(n-2). It is simple but has exponential time complexity.',
          citationIds: citationId ? [citationId] : [],
        },
        {
          id: 'seg-3',
          speaker: 'rookie' as const,
          text: 'So what would happen if we called fibonacci of 50?',
          citationIds: citationId ? [citationId] : [],
        },
        {
          id: 'seg-4',
          speaker: 'debugger' as const,
          text: 'It would be extremely slow because it recalculates the same values billions of times. Memoization or dynamic programming would fix that.',
          citationIds: citationId ? [citationId] : [],
        },
      ],
      question: {
        id: 'q-1',
        text: 'What is the time complexity of the naive recursive Fibonacci implementation?',
        choices: [
          { id: 'c-a', text: 'O(n) linear time' },
          { id: 'c-b', text: 'O(n²) quadratic time' },
          { id: 'c-c', text: 'O(2ⁿ) exponential time' },
          { id: 'c-d', text: 'O(log n) logarithmic time' },
        ],
        correctChoiceId: 'c-c',
        explanation:
          'Each call to fibonacci(n) makes two recursive calls, resulting in a binary tree of calls with O(2ⁿ) growth.',
        citationIds: citationId ? [citationId] : [],
      },
    };

    const validationResult = validateDraft(exampleDraft, snapshot);
    if (!validationResult.ok) {
      console.error('Example draft validation failed:', validationResult.error);
      process.exit(1);
    }

    const submitResult = submitJob(storage, validationResult.draft, 'mock');
    if (!submitResult.ok) {
      if (submitResult.error.code === 'IDEMPOTENCY_CONFLICT') {
        // Edge case: submissionId exists with a different payload (shouldn't happen with our guard above)
        console.log(`Note: submission key already used. Using existing job.`);
        const existingJob2 = storage.findJobBySubmissionId(submissionId);
        if (existingJob2) {
          console.log(`  jobId: ${existingJob2.jobId}`);
          return;
        }
      }
      console.error('Submit failed:', submitResult.error);
      process.exit(1);
    }

    if (submitResult.isExisting) {
      console.log(`Seed already exists: job ${submitResult.job.jobId} (${submitResult.job.state})`);
    } else {
      console.log(`Seeded lesson job: ${submitResult.job.jobId}`);
      console.log('Start the companion (pnpm dev) to process the job.');
    }

    console.log('\nSeed complete. Summary:');
    console.log(`  projectId:  ${project.projectId}`);
    console.log(`  snapshotId: ${snapshot.snapshotId}`);
    console.log(`  jobId:      ${submitResult.job.jobId}`);

  } finally {
    storage.close();
  }
}

main().catch((err) => {
  console.error('CLI error:', err);
  process.exit(1);
});
