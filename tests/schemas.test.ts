import { describe, expect, test } from "bun:test";
import { operationSchemas } from "../src/schemas";

function references(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(references);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const entries = Object.entries(value);
  return entries.flatMap(([key, child]) =>
    key === "$ref" && typeof child === "string" ? [child] : references(child),
  );
}

describe("operation schemas", () => {
  test("ships self-contained JSON Schema references", () => {
    for (const schema of Object.values(operationSchemas)) {
      expect(schema.$schema).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      for (const reference of references(schema)) {
        expect(reference.startsWith("#/$defs/")).toBe(true);
        const definition = reference.slice("#/$defs/".length);
        expect(definition in schema.$defs).toBe(true);
      }
    }
  });
});
