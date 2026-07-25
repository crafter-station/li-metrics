import { createHash } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function findExecutable(command: string): string | undefined {
  if (isAbsolute(command) || command.includes("/")) {
    try {
      accessSync(command, constants.X_OK);
      return command;
    } catch {
      return undefined;
    }
  }

  const directories = (process.env.PATH ?? "").split(delimiter);
  for (const directory of directories) {
    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

export async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
