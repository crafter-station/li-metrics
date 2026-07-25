import { extractUrn } from "./parse";

export type NormalizedPostInput = {
  shareUrn?: string;
  activityUrn?: string;
  publicUrl?: string;
  analyticsUrl?: string;
};

export function isLinkedInHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "linkedin.com" || normalized.endsWith(".linkedin.com");
}

export function normalizePostInput(input: string): NormalizedPostInput {
  const trimmed = input.trim();
  const shareUrn = extractUrn(trimmed, "share");
  const activityUrn = extractUrn(trimmed, "activity");

  if (!shareUrn && !activityUrn) {
    throw new Error("Input must contain a LinkedIn share or activity URN");
  }

  if (/^https?:/i.test(trimmed)) {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !isLinkedInHostname(url.hostname)) {
      throw new Error("Post URLs must use HTTPS on linkedin.com");
    }
    return {
      shareUrn,
      activityUrn,
      publicUrl: shareUrn ? url.href : undefined,
      analyticsUrl: activityUrn ? url.href : undefined,
    };
  }

  if (shareUrn) {
    return {
      shareUrn,
      publicUrl: `https://www.linkedin.com/feed/update/${shareUrn}/`,
    };
  }

  return {
    activityUrn,
    analyticsUrl: `https://www.linkedin.com/analytics/post-summary/${activityUrn}/`,
  };
}
