# fixture-repo

A tiny TypeScript repository used as the source-evidence fixture for Brainrot scaffold tests.

It contains:

- `src/fibonacci.ts` — naive and memoized Fibonacci implementations (demonstration lesson subject)
- `src/utils.ts` — small utility functions

This directory is registered as a project in the companion and its files are cited in the
example lesson produced by `pnpm demo:seed`.

## Git setup

The fixture must have at least one Git commit for `captureSnapshot` to report a base revision.
Run `pnpm demo:seed`; it initialises the Git repo automatically if needed.
