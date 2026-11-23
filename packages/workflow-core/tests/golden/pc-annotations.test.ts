// This fixture is the cyoda-go PR #385 e2e round-trip payload
// (`e2e/parity/workflow.go`, `workflowProcCriterionAnnotationsPayload`), used in
// lieu of a live-server capture from the released v0.8.2 binary. cyoda's own
// cross-backend e2e test (`RunWorkflowProcCriterionAnnotationsRoundTrip`)
// verifies this exact payload survives import->export unchanged on every
// backend, so it is authoritative for how the annotation fields round-trip.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseImportPayload, serializeImportPayload } from "../../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "pc-annotations.wire.json");

describe("golden round-trip: processor & criterion annotations (v0.8.2)", () => {
  test("parse -> serialize(0.8) reproduces the fixture's annotation fields verbatim", () => {
    const raw = readFileSync(fixturePath, "utf8");
    const fixture = JSON.parse(raw);
    const fixtureWf = fixture.workflows[0];
    const fixtureTransition = fixtureWf.states.NONE.transitions[0];
    const fixtureProcessor = fixtureTransition.processors[0];

    const { document, issues } = parseImportPayload(raw);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(document).toBeDefined();

    const out = serializeImportPayload(document!, { targetVersion: "0.9" });
    const wireWf = JSON.parse(out).workflows[0];
    const wireTransition = wireWf.states.NONE.transitions[0];
    const wireProcessor = wireTransition.processors[0];

    expect(wireWf.criterionAnnotations).toEqual(fixtureWf.criterionAnnotations);
    expect(wireTransition.criterionAnnotations).toEqual(fixtureTransition.criterionAnnotations);
    expect(wireProcessor.annotations).toEqual(fixtureProcessor.annotations);
  });
});
