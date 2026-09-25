import { describe, expect, it } from "vitest";
import {
  parseImportPayload,
  serializeImportPayload,
} from "@cyoda/workflow-core";
import { criterionJsonSchema, workflowJsonSchema } from "../src/index.js";

type Node = Record<string, unknown>;

function arrayCriterionNodes(schema: unknown): Node[] {
  const out: Node[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (typeof n !== "object" || n === null) return;
    const props = (n as Node)["properties"] as Node | undefined;
    if ((props?.["type"] as { const?: unknown } | undefined)?.const === "array") out.push(n as Node);
    Object.values(n as Node).forEach(visit);
  };
  visit(schema);
  return out;
}

function arrayClauses(json: unknown): Node[] {
  const out: Node[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (typeof n !== "object" || n === null) return;
    if ((n as Node)["type"] === "array") out.push(n as Node);
    Object.values(n as Node).forEach(visit);
  };
  visit(json);
  return out;
}

// Editor output for an array clause, as serializeImportPayload writes it.
const payload = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.4",
      name: "wf",
      initialState: "A",
      active: true,
      states: {
        A: {
          transitions: [
            {
              name: "go",
              next: "B",
              manual: false,
              criterion: {
                type: "group",
                operator: "AND",
                conditions: [
                  { type: "array", jsonPath: "$.tags[*]", values: ["a", null] },
                  { type: "array", jsonPath: "$.n[*]", operation: "EQUALS", values: [1] },
                ],
              },
            },
          ],
        },
        B: { transitions: [] },
      },
    },
  ],
});

describe("generated JSON schemas use the array-criterion wire key", () => {
  for (const [name, schema] of [
    ["workflowJsonSchema", workflowJsonSchema()],
    ["criterionJsonSchema", criterionJsonSchema()],
  ] as const) {
    it(`${name}: array criterion requires \`values\`, not \`value\``, () => {
      const nodes = arrayCriterionNodes(schema);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        const props = node["properties"] as Node;
        expect(props).toHaveProperty("values");
        expect(props).not.toHaveProperty("value");
        expect(node["required"]).toContain("values");
        expect(node["required"]).not.toContain("value");
      }
    });
  }

  it("every array clause the editor serializes satisfies the generated array node", () => {
    const doc = parseImportPayload(payload).document!;
    const clauses = arrayClauses(JSON.parse(serializeImportPayload(doc)));
    expect(clauses).toHaveLength(2);
    const [node] = arrayCriterionNodes(workflowJsonSchema());
    const allowed = Object.keys(node!["properties"] as Node);
    for (const clause of clauses) {
      for (const key of node!["required"] as string[]) expect(clause).toHaveProperty(key);
      for (const key of Object.keys(clause)) expect(allowed).toContain(key);
    }
  });
});
