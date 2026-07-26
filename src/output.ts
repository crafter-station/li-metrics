import { type Colors, formatError } from "./human-output";

export type OutputOptions = {
  json?: boolean;
  ndjson?: boolean;
};

export function emit<T>(value: T, options: OutputOptions, human: string): void {
  if (options.json || options.ndjson) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  process.stdout.write(`${human}\n`);
}

export function emitArray<T>(
  values: T[],
  options: OutputOptions,
  human: string,
): void {
  if (options.ndjson) {
    for (const item of values) {
      process.stdout.write(`${JSON.stringify(item)}\n`);
    }
    return;
  }
  emit(values, options, human);
}

export function emitError(
  error: unknown,
  options: OutputOptions,
  colors: Colors,
): never {
  const message = error instanceof Error ? error.message : String(error);
  if (options.json || options.ndjson) {
    process.stderr.write(
      `${JSON.stringify({ error: { code: "LI_METRICS_ERROR", message } })}\n`,
    );
  } else {
    process.stderr.write(`${formatError(message, colors)}\n`);
  }
  process.exit(1);
}
