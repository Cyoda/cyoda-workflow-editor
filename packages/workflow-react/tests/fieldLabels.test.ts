import { describe, expect, it } from "vitest";
import type { FieldHint } from "@cyoda/workflow-core";
import {
  buildFieldLabels,
  deriveLeafName,
  readablePath,
} from "../src/inspector/criteria/fieldLabels.js";

describe("deriveLeafName", () => {
  it("returns the final object segment", () => {
    expect(deriveLeafName("$.customer.status")).toBe("status");
  });

  it("keeps array indices attached to the leaf", () => {
    expect(deriveLeafName("$.a.b[0].currency")).toBe("currency");
    expect(deriveLeafName("$.list[*]")).toBe("list[*]");
    expect(deriveLeafName("$.list[0]")).toBe("list[0]");
  });

  it("falls back to the raw path for the bare root", () => {
    expect(deriveLeafName("$")).toBe("$");
  });
});

describe("readablePath", () => {
  it("strips the $ root and joins segments", () => {
    expect(readablePath("$.settlement.instructions[0].currency")).toBe(
      "settlement.instructions[0].currency",
    );
  });

  it("returns the raw path for the bare root", () => {
    expect(readablePath("$")).toBe("$");
  });
});

describe("buildFieldLabels", () => {
  const hints: FieldHint[] = [
    { jsonPath: "$.amount", type: "number" },
    { jsonPath: "$.customer.status", type: "string" },
  ];

  it("uses the leaf name as primary and the raw path as secondary", () => {
    const labels = buildFieldLabels(hints);
    expect(labels.get("$.customer.status")).toEqual({
      primary: "status",
      secondary: "$.customer.status",
    });
  });

  it("disambiguates duplicate leaf names with the readable path", () => {
    const dup: FieldHint[] = [
      { jsonPath: "$.settlement.ssi[0].currency", type: "string" },
      { jsonPath: "$.trade.currency", type: "string" },
    ];
    const labels = buildFieldLabels(dup);
    expect(labels.get("$.settlement.ssi[0].currency")?.primary).toBe(
      "settlement.ssi[0].currency",
    );
    expect(labels.get("$.trade.currency")?.primary).toBe("trade.currency");
  });
});
