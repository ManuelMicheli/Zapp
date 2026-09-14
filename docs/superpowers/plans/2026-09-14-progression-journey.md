# Cinematic Progression Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the compact profile progression panel with the approved eight-rank poster-wall journey and real card-flip reveals.

**Architecture:** Keep points, milestones, privacy, and actions in the existing pure progression model. A focused client journey component owns rank preview and animation state; a module-scoped profile baseline detects real rank increases without persisting user data. Local poster files provide the decorative wall.

**Tech Stack:** Next.js 15, React, TypeScript, CSS Modules, Vitest.

**Spec:** `artifacts/profile-progression-design/percorso-muro.template.html`

## Global Constraints

- Eight thresholds: `0, 150, 500, 1200, 2500, 4000, 6000, 8500`.
- Unlock counts: `4, 8, 13, 18, 24, 30, 35, 40`.
- Preserve existing points, caps, milestones, verification, privacy, and profile actions.
- Keep all 40 gray placeholders visible; poster images are decorative.
- Store progression baselines in memory only, scoped by profile id.
- First render never celebrates an already attained level.

---

### Task 1: Pure rank model

**Files:**

- Modify: `src/lib/profile/progression.ts`
- Modify: `src/lib/profile/progression.test.ts`

**Interfaces:**

- Produces: exported `PROGRESSION_LEVELS`, level `unlockCount`, and unchanged `buildProgression(counts)` semantics outside rank thresholds.

- [x] Add boundary tests for every threshold and unlock count.
- [x] Run `pnpm exec vitest run src/lib/profile/progression.test.ts` and confirm the new expectations fail.
- [x] Add the eight production levels and unlock counts.
- [x] Run the focused test again and confirm it passes.

### Task 2: Poster journey and profile integration

**Files:**

- Create: `src/components/profile/ProgressionJourney.tsx`
- Create: `src/components/profile/ProgressionJourney.module.css`
- Modify: `src/components/profile/ProfileProgression.tsx`
- Modify: `src/app/(app)/profile/page.tsx`
- Modify: `src/app/(app)/u/[username]/page.tsx`
- Create: `public/profile-progression/*.jpg`

**Interfaces:**

- Consumes: `ProfileProgression`, `profileId`, and `isOwn`.
- Produces: accessible rank preview with previous, next, and return-to-current controls; deterministic poster wall; staggered 3D flips for changed tiles.

- [x] Copy the 40 optimized approved poster originals to the public folder.
- [x] Build the journey with container-query wall layouts, local overlay, progress semantics, and decorative images.
- [x] Add module-scoped attained-rank baselines and cancel stale animation state during rapid navigation.
- [x] Preserve the existing milestone details and action links below the card.
- [x] Pass `profileId` from both profile routes.

### Task 3: Verification

**Files:**

- Create only ignored browser harness artifacts if needed.

- [x] Run focused Vitest, TypeScript, and ESLint checks.
- [x] Render the actual React component at 390 px and 736 px.
- [x] Verify intermediate `rotateY`, newly changed indices, reverse navigation, rapid navigation, and reduced-motion behavior.
- [x] Review the diff for unrelated changes and report the in-memory first-visit limitation.
