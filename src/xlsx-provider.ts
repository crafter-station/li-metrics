import { basename, resolve } from "node:path";
import { readSheet } from "read-excel-file/node";
import { extractUrn } from "./parse";
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

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("Invalid XLSX archive: missing central directory");
}

export function inspectXlsxArchive(
  bytes: ArrayBuffer,
  limits: XlsxLimits = defaultXlsxLimits,
): void {
  if (bytes.byteLength > limits.maxCompressedBytes) {
    throw new Error(
      `XLSX exceeds compressed size limit of ${limits.maxCompressedBytes} bytes`,
    );
  }

  const view = new DataView(bytes);
  const endOffset = findEndOfCentralDirectory(view);
  const entries = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
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
      offset + 46 > view.byteLength ||
      view.getUint32(offset, true) !== 0x02014b50
    ) {
      throw new Error("Invalid XLSX archive: malformed central directory");
    }
    totalUncompressedBytes += view.getUint32(offset + 24, true);
    if (totalUncompressedBytes > limits.maxUncompressedBytes) {
      throw new Error(
        `XLSX exceeds uncompressed size limit of ${limits.maxUncompressedBytes} bytes`,
      );
    }
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + filenameLength + extraLength + commentLength;
  }
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value).trim() || undefined;
}

export async function importXlsx(
  path: string,
  limits: XlsxLimits = defaultXlsxLimits,
): Promise<MetricReceipt> {
  const absolutePath = resolve(path);
  const stat = await Bun.file(absolutePath).stat();
  if (stat.size > limits.maxCompressedBytes) {
    throw new Error(
      `XLSX exceeds compressed size limit of ${limits.maxCompressedBytes} bytes`,
    );
  }
  const bytes = await Bun.file(absolutePath).arrayBuffer();
  inspectXlsxArchive(bytes, limits);
  const rows = await readSheet(absolutePath);
  if (rows.length > limits.maxRows) {
    throw new Error(`XLSX exceeds row limit of ${limits.maxRows}`);
  }
  const values = new Map<string, unknown>();
  const demographics: DemographicEntry[] = [];
  let demographicsStarted = false;

  for (const row of rows) {
    const label = text(row[0]);
    if (!label) {
      continue;
    }
    if (
      label.toLowerCase() === "category" &&
      text(row[1])?.toLowerCase() === "value"
    ) {
      demographicsStarted = true;
      continue;
    }
    if (demographicsStarted) {
      const value = text(row[1]);
      const percentage = text(row[2]);
      if (value && percentage) {
        demographics.push({ category: label, value, percentage });
      }
      continue;
    }
    values.set(label.toLowerCase(), row[1]);
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
  const observedAt = stat.mtime.toISOString();
  const sourceSha256 = new Bun.CryptoHasher("sha256")
    .update(bytes)
    .digest("hex");
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
    receiptId: new Bun.CryptoHasher("sha256").update(basis).digest("hex"),
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
