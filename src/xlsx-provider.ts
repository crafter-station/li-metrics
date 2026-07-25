import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { extractUrn } from "./parse";
import { findExecutable, sha256Bytes, sha256Text } from "./runtime";
import type { DemographicEntry, MetricReceipt, MetricValues } from "./types";

export type XlsxLimits = {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxEntries: number;
  maxRows: number;
};

export const defaultXlsxLimits: XlsxLimits = {
  maxCompressedBytes: 25 * 1024 * 1024,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxEntries: 1_000,
  maxRows: 10_000,
};

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (uint32(bytes, offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("Invalid XLSX archive: missing central directory");
}

export function inspectXlsxArchive(
  bytes: Uint8Array,
  limits: XlsxLimits = defaultXlsxLimits,
): void {
  if (bytes.byteLength > limits.maxCompressedBytes) {
    throw new Error(
      `XLSX exceeds compressed size limit of ${limits.maxCompressedBytes} bytes`,
    );
  }

  const endOffset = findEndOfCentralDirectory(bytes);
  const entries = uint16(bytes, endOffset + 10);
  const centralOffset = uint32(bytes, endOffset + 16);
  if (entries === 0xffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 XLSX archives are not supported");
  }
  if (entries > limits.maxEntries) {
    throw new Error(`XLSX exceeds entry limit of ${limits.maxEntries}`);
  }

  let offset = centralOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < entries; index += 1) {
    if (
      offset + 46 > bytes.byteLength ||
      uint32(bytes, offset) !== 0x02014b50
    ) {
      throw new Error("Invalid XLSX archive: malformed central directory");
    }
    totalUncompressedBytes += uint32(bytes, offset + 24);
    if (totalUncompressedBytes > limits.maxUncompressedBytes) {
      throw new Error(
        `XLSX exceeds uncompressed size limit of ${limits.maxUncompressedBytes} bytes`,
      );
    }
    const filenameLength = uint16(bytes, offset + 28);
    const extraLength = uint16(bytes, offset + 30);
    const commentLength = uint16(bytes, offset + 32);
    offset += 46 + filenameLength + extraLength + commentLength;
  }
}

type Cell = string | number | boolean | null;

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function sharedStrings(xml: string): string[] {
  const values: string[] = [];
  let remainingItems = xml;
  let item = remainingItems.match(/<si\b[^>]*>([\s\S]*?)<\/si>/);
  while (item) {
    const fragments: string[] = [];
    const body = item[1] ?? "";
    let remainingText = body;
    let fragment = remainingText.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
    while (fragment) {
      fragments.push(decodeXml(fragment[1] ?? ""));
      remainingText = remainingText.slice(
        remainingText.indexOf(fragment[0] ?? "") + (fragment[0]?.length ?? 0),
      );
      fragment = remainingText.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
    }
    values.push(fragments.join(""));
    remainingItems = remainingItems.slice(
      remainingItems.indexOf(item[0] ?? "") + (item[0]?.length ?? 0),
    );
    item = remainingItems.match(/<si\b[^>]*>([\s\S]*?)<\/si>/);
  }
  return values;
}

function columnIndex(reference: string): number {
  let result = 0;
  for (let index = 0; index < reference.length; index += 1) {
    result = result * 26 + reference.charCodeAt(index) - 64;
  }
  return result - 1;
}

function worksheetRows(xml: string, strings: string[]): Cell[][] {
  const rows: Cell[][] = [];
  let remainingRows = xml;
  let rowMatch = remainingRows.match(/<row\b[^>]*>([\s\S]*?)<\/row>/);
  while (rowMatch) {
    const row: Cell[] = [];
    const rowXml = rowMatch[1] ?? "";
    let remainingCells = rowXml;
    let cellMatch = remainingCells.match(/<c\b([^>]*)>([\s\S]*?)<\/c>/);
    while (cellMatch) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = attributes.match(/\br="([A-Z]+)\d+"/)?.[1];
      const raw =
        body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ??
        body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1];
      if (reference && raw !== undefined) {
        const type = attributes.match(/\bt="([^"]+)"/)?.[1];
        let value: Cell = decodeXml(raw);
        if (type === "s") {
          const stringIndex = Number.parseInt(raw, 10);
          value =
            stringIndex >= 0 && stringIndex < strings.length
              ? (strings[stringIndex] ?? "")
              : "";
        } else if (type === "b") {
          value = raw === "1";
        } else if (!type || type === "n") {
          const numericValue = Number.parseFloat(raw);
          value = Number.isFinite(numericValue) ? numericValue : decodeXml(raw);
        }
        const index = columnIndex(reference);
        while (row.length <= index) {
          row.push(null);
        }
        row[index] = value;
      }
      remainingCells = remainingCells.slice(
        remainingCells.indexOf(cellMatch[0] ?? "") +
          (cellMatch[0]?.length ?? 0),
      );
      cellMatch = remainingCells.match(/<c\b([^>]*)>([\s\S]*?)<\/c>/);
    }
    rows.push(row);
    remainingRows = remainingRows.slice(
      remainingRows.indexOf(rowMatch[0] ?? "") + (rowMatch[0]?.length ?? 0),
    );
    rowMatch = remainingRows.match(/<row\b[^>]*>([\s\S]*?)<\/row>/);
  }
  return rows;
}

function cell(row: Cell[], index: number): Cell | undefined {
  return index < row.length ? row[index] : undefined;
}

function readXlsxRows(path: string, maxBuffer: number): Cell[][] {
  const unzip = findExecutable("unzip");
  if (!unzip) {
    throw new Error("unzip executable is required to import XLSX files");
  }
  const stringsXml = execFileSync(unzip, ["-p", path, "xl/sharedStrings.xml"], {
    encoding: "utf8",
    maxBuffer,
  });
  const worksheetXml = execFileSync(
    unzip,
    ["-p", path, "xl/worksheets/sheet1.xml"],
    {
      encoding: "utf8",
      maxBuffer,
    },
  );
  return worksheetRows(worksheetXml, sharedStrings(stringsXml));
}

function numeric(value: Cell | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function text(value: Cell | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return value ? "true" : "false";
}

export async function importXlsx(
  path: string,
  limits: XlsxLimits = defaultXlsxLimits,
): Promise<MetricReceipt> {
  const absolutePath = resolve(path);
  const fileStat = await stat(absolutePath);
  if (fileStat.size > limits.maxCompressedBytes) {
    throw new Error(
      `XLSX exceeds compressed size limit of ${limits.maxCompressedBytes} bytes`,
    );
  }
  const bytes = await readFile(absolutePath);
  inspectXlsxArchive(bytes, limits);
  const rows = readXlsxRows(absolutePath, limits.maxUncompressedBytes);
  if (rows.length > limits.maxRows) {
    throw new Error(`XLSX exceeds row limit of ${limits.maxRows}`);
  }
  const values = new Map<string, string>();
  const demographics: DemographicEntry[] = [];
  let demographicsStarted = false;

  for (const row of rows) {
    const label = text(cell(row, 0));
    if (!label) {
      continue;
    }
    if (
      label.toLowerCase() === "category" &&
      text(cell(row, 1))?.toLowerCase() === "value"
    ) {
      demographicsStarted = true;
      continue;
    }
    if (demographicsStarted) {
      const value = text(cell(row, 1));
      const percentage = text(cell(row, 2));
      if (value && percentage) {
        demographics.push({ category: label, value, percentage });
      }
      continue;
    }
    const value = text(cell(row, 1));
    if (value !== undefined) {
      values.set(label.toLowerCase(), value);
    }
  }

  const postUrl = text(values.get("post url"));
  const metrics: MetricValues = {
    impressions: numeric(values.get("impressions")),
    membersReached: numeric(values.get("members reached")),
    profileViews: numeric(values.get("profile viewers from this post")),
    followersGained: numeric(values.get("followers gained from this post")),
    socialEngagements: numeric(values.get("social engagements")),
    reactions: numeric(values.get("reactions")),
    comments: numeric(values.get("comments")),
    reposts: numeric(values.get("reposts")),
    saves: numeric(values.get("saves")),
    sends: numeric(values.get("sends on linkedin")),
    linkEngagements: numeric(values.get("link engagements")),
    premiumCtaEngagements: numeric(
      values.get("premium custom button engagements"),
    ),
  };
  const filename = basename(absolutePath);
  const filenameId = filename.match(/_(\d+)\.xlsx$/i)?.[1];
  const observedAt = new Date(fileStat.mtimeMs).toISOString();
  const sourceSha256 = sha256Bytes(bytes);
  const basis = JSON.stringify({
    filename,
    sourceSha256,
    metrics,
  });
  const warnings: string[] = [];
  if (!postUrl || !extractUrn(postUrl, "share")) {
    warnings.push("missing_share_urn");
  }

  return {
    receiptVersion: 1,
    receiptId: sha256Text(basis),
    post: {
      shareUrn: extractUrn(postUrl, "share"),
      publicUrl: postUrl,
      publishedDate: text(values.get("post date")),
      publishedTime: text(values.get("post publish time")),
    },
    window: {
      kind: "xlsx-export",
      label: "LinkedIn single post export",
    },
    metrics,
    demographics,
    provider: {
      name: "linkedin-xlsx",
      estimated: true,
    },
    observedAt,
    provenance: {
      source: absolutePath,
      sourceSha256,
      sourceFilenameId: filenameId,
    },
    warnings,
  };
}
