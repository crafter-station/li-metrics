export type OutputOptions = {
  json?: boolean;
  ndjson?: boolean;
};

function prettyJson(serialized: string): string {
  let result = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < serialized.length; index += 1) {
    const character = serialized[index];
    if (character === undefined) {
      continue;
    }
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === "{" || character === "[") {
      depth += 1;
      result += `${character}\n${"  ".repeat(depth)}`;
      continue;
    }
    if (character === "}" || character === "]") {
      depth -= 1;
      result += `\n${"  ".repeat(depth)}${character}`;
      continue;
    }
    if (character === ",") {
      result += `,\n${"  ".repeat(depth)}`;
      continue;
    }
    if (character === ":") {
      result += ": ";
      continue;
    }
    result += character;
  }
  return result;
}

export function emit<T>(value: T, options: OutputOptions): void {
  const serialized = JSON.stringify(value);
  process.stdout.write(
    `${options.json ? serialized : prettyJson(serialized)}\n`,
  );
}

export function emitArray<T>(values: T[], options: OutputOptions): void {
  if (options.ndjson) {
    for (const item of values) {
      process.stdout.write(`${JSON.stringify(item)}\n`);
    }
    return;
  }
  emit(values, options);
}

export function emitError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({ error: { code: "LI_METRICS_ERROR", message } })}\n`,
  );
  process.exit(1);
}
