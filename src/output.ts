export type OutputOptions = {
  json?: boolean;
  ndjson?: boolean;
};

export function emit(value: unknown, options: OutputOptions): void {
  if (options.ndjson && Array.isArray(value)) {
    for (const item of value) {
      process.stdout.write(`${JSON.stringify(item)}\n`);
    }
    return;
  }

  process.stdout.write(
    `${JSON.stringify(value, null, options.json ? 0 : 2)}\n`,
  );
}

export function emitError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({ error: { code: "LI_METRICS_ERROR", message } })}\n`,
  );
  process.exit(1);
}
