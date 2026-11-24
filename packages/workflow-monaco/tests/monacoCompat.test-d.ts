/**
 * The real `monaco-editor` module (the version in the catalog) must satisfy
 * the structural surface this package accepts. The runtime tests use fakes,
 * so without this a monaco-editor upgrade that moves an API — as 0.56 did,
 * removing `languages.json` in favour of the top-level `json` namespace —
 * would only surface in a browser. Plain typed assignments (rather than
 * `expectTypeOf`) so a failure reads as an ordinary TS2322 naming the
 * incompatible member.
 */
import type * as monaco from "monaco-editor";
import { describe, test } from "vitest";
import type { MonacoLike, WorkflowJsonMonacoRuntime } from "../src/index.js";

declare const real: typeof monaco;

describe("monaco-editor compatibility", () => {
  test("the monaco-editor module is a MonacoLike", () => {
    const asMonacoLike: MonacoLike = real;
    void asMonacoLike;
  });

  test("the monaco-editor module is a WorkflowJsonMonacoRuntime", () => {
    const asRuntime: WorkflowJsonMonacoRuntime = real;
    void asRuntime;
  });

  test("JSON defaults live on the top-level `json` namespace", () => {
    const defaults: MonacoLike["json"] = real.json;
    void defaults;
  });
});
