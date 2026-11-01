# Squishy Lab physics core

Repository: https://github.com/Daniele-Cangi/squishy-lab
Revision: a909820e881f50305f1e624a51b4e038d4d0a4c2
License: MIT; copyright and full license in LICENSE.

Source modules: physics/cage.ts, physics/solver.ts, physics/gesture.ts, shared/spec.ts and collection.ts. Compiled to readable ES2022 JavaScript with declarations using the repository TypeScript compiler. No analytics, AI service, audio, third-party app UI or provider integration is copied. Brainrotten now uses only the fixed-timestep `FixedClock` from physics/solver to step its own shape-matching gummy bears (`src/gummyPhysics.ts`, `src/GummyScene.tsx`). The XPBD cage and spec modules stay vendored because solver.js imports them; the homepage no longer runs the mochi soft body.
