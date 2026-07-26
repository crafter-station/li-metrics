import type { Colors } from "./human-output";

function wrap(open: string, close: string, enabled: boolean) {
  if (!enabled) {
    return (value: string | number) => String(value);
  }
  return (value: string | number) => `${open}${String(value)}${close}`;
}

export function nativeColors(): Colors {
  const enabled = Boolean(
    !process.env.NO_COLOR &&
      !process.argv.includes("--no-color") &&
      (process.env.FORCE_COLOR ||
        process.argv.includes("--color") ||
        (process.stdout.isTTY && process.env.TERM !== "dumb")),
  );
  return {
    bold: wrap("\u001b[1m", "\u001b[22m", enabled),
    dim: wrap("\u001b[2m", "\u001b[22m", enabled),
    red: wrap("\u001b[31m", "\u001b[39m", enabled),
    green: wrap("\u001b[32m", "\u001b[39m", enabled),
    yellow: wrap("\u001b[33m", "\u001b[39m", enabled),
    cyan: wrap("\u001b[36m", "\u001b[39m", enabled),
  };
}
