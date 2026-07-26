import { describe, expect, test } from "bun:test";
import { helpText, parseCliArgs } from "../src/cli-parser";

describe("CLI argument parser", () => {
  test("accepts global and local options in any position", () => {
    const parsed = parseCliArgs(
      [
        "posts",
        "--json",
        "week",
        "--cdp=9333",
        "--timeout",
        "15000",
        "--receipt-dir",
        "/tmp/receipts",
        "--days=7",
        "--no-details",
      ],
      "/default",
    );

    expect(parsed.positionals).toEqual(["posts", "week"]);
    expect(parsed.options).toEqual({
      json: true,
      ndjson: false,
      cdp: "9333",
      timeout: "15000",
      receiptDir: "/tmp/receipts",
    });
    expect(parsed.days).toBe("7");
    expect(parsed.details).toBe(false);
  });

  test("preserves arguments after the option terminator", () => {
    const parsed = parseCliArgs(
      ["import", "xlsx", "--dry-run", "--", "-metrics.xlsx"],
      "/default",
    );

    expect(parsed.positionals).toEqual(["import", "xlsx", "-metrics.xlsx"]);
    expect(parsed.dryRun).toBe(true);
  });

  test("rejects unknown options and missing values", () => {
    expect(() => parseCliArgs(["--wat"], "/default")).toThrow("Unknown option");
    expect(() => parseCliArgs(["--cdp"], "/default")).toThrow("Missing value");
    expect(() => parseCliArgs(["--json", "--ndjson"], "/default")).toThrow(
      "--json and --ndjson cannot be used together",
    );
  });

  test("renders command-specific help", () => {
    expect(helpText(["post", "metrics"], "/default")).toContain(
      "li-metrics post metrics <post>",
    );
  });
});
