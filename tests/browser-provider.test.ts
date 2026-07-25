import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureWeek } from "../src/browser-provider";

const directories: string[] = [];

afterAll(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true })),
  );
});

async function fakeBrowser(mode: "success" | "no-cards") {
  const directory = await mkdtemp(join(tmpdir(), "li-metrics-provider-"));
  directories.push(directory);
  const executable = join(directory, "agent-browser");
  const log = join(directory, "commands.jsonl");
  const source = `#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";
await appendFile(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const input = await Bun.file(0).text();
if (process.argv.includes("eval")) {
  if (input.includes("const analyticsLinks")) {
    const cards = ${JSON.stringify(mode)} === "no-cards" ? [] : [{
      analyticsUrl: "https://www.linkedin.com/analytics/post-summary/urn:li:activity:456/",
      cardText: "10 impressions • 2 engagements",
      commentary: "Fixture post",
      publicUrl: "https://www.linkedin.com/feed/update/urn:li:share:123/"
    }];
    process.stdout.write(JSON.stringify({ cards, showMoreText: null }));
  } else if (input === "document.body.innerText") {
    process.stdout.write(JSON.stringify("10\\nImpressions\\n8\\nMembers reached\\n2\\nSocial engagements\\nReactions\\n2\\nComments\\n0\\nReposts\\n0\\nSaves\\n0\\nSends on LinkedIn\\n0"));
  } else if (input.includes("controls.find")) {
    process.stdout.write(JSON.stringify("7 days"));
  } else {
    process.stdout.write("null");
  }
} else {
  process.stdout.write("ok");
}
`;
  await Bun.write(executable, source);
  await chmod(executable, 0o755);
  return { directory, executable, log, mode };
}

async function withFakeBrowser<T>(
  mode: "success" | "no-cards",
  callback: (fake: Awaited<ReturnType<typeof fakeBrowser>>) => Promise<T>,
): Promise<T> {
  const fake = await fakeBrowser(mode);
  return await callback(fake);
}

describe("browser capture workflow", () => {
  test("captures a localized-independent card and closes its owned tab", async () => {
    await withFakeBrowser("success", async (fake) => {
      const capture = await captureWeek(
        {
          cdpPort: 9222,
          timeoutMs: 1_000,
          namespace: "provider-test",
          binary: fake.executable,
        },
        true,
      );
      const commands = (await readFile(fake.log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);

      expect(capture.posts).toHaveLength(1);
      expect(capture.receipts[0]?.metrics.impressions).toBe(10);
      expect(
        commands.some((command) =>
          command
            .slice(-2)
            .every((value, index) => value === ["tab", "close"][index]),
        ),
      ).toBe(true);
    });
  });

  test("closes its owned tab after card loading fails", async () => {
    await withFakeBrowser("no-cards", async (fake) => {
      await expect(
        captureWeek(
          {
            cdpPort: 9222,
            timeoutMs: 1_000,
            namespace: "provider-test",
            binary: fake.executable,
          },
          false,
        ),
      ).rejects.toThrow("No post cards loaded");
      const commands = (await readFile(fake.log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);
      expect(commands.some((command) => command.includes("close"))).toBe(true);
    });
  });
});
