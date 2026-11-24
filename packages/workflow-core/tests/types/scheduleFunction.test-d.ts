/**
 * Type-level regression test for the public export surface of
 * @cyoda/workflow-core.
 *
 * `ScheduleFunction` (the per-entity Function callout that computes a
 * scheduled transition's firing time, cyoda-go 0.8.3) was defined and used
 * internally by `TransitionSchedule` in `types/workflow.ts` but never
 * re-exported from the package's public surface (`src/types/index.ts` /
 * `src/index.ts`), unlike its sibling `TransitionSchedule`. A consumer
 * needing the type had to derive it structurally instead of importing it.
 *
 * This file is a `*.test-d.ts` file: it runs under Vitest's `typecheck` pool
 * (enabled package-locally in vitest.config.ts, no repo-wide tsconfig
 * change) rather than the esbuild-transform pool `*.test.ts` files use.
 * Unlike a plain `.test.ts` file — which type-strips without checking that a
 * named type import actually exists — `vitest run` genuinely runs `tsc`
 * against this file, so deleting `ScheduleFunction` from either re-export
 * list makes this fail with "has no exported member 'ScheduleFunction'".
 * There are no runtime assertions here; `expectTypeOf` checks resolve
 * entirely at compile time.
 */
import { describe, expectTypeOf, test } from "vitest";
import type { ScheduleFunction, TransitionSchedule } from "../../src/index.js";

describe("public export surface", () => {
  test("ScheduleFunction is importable from the package root and matches TransitionSchedule.function", () => {
    expectTypeOf<TransitionSchedule["function"]>().toEqualTypeOf<ScheduleFunction | undefined>();

    expectTypeOf<ScheduleFunction>().toEqualTypeOf<{
      name: string;
      resultKind: "Schedule";
      calculationNodesTags: string;
      attachEntity?: boolean;
      context?: string;
      responseTimeoutMs?: number;
      retryPolicy?: string;
    }>();
  });
});
