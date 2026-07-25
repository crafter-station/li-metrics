import { BrowserPage } from "./agent-browser";
import {
  analyticsLinkReadyScript,
  analyticsLinkScript,
  bodyTextScript,
  contentReadyScript,
  currentFilterScript,
  detailReadyScript,
  publicPostLinkScript,
  weeklyCardsScript,
} from "./browser-scripts";
import { normalizePostInput } from "./linkedin-url";
import {
  createDashboardReceipt,
  extractUrn,
  identityFromUrls,
  parseWeeklyCard,
} from "./parse";
import type { BrowserConfig, MetricReceipt, WeeklyCapture } from "./types";

const contentAnalyticsUrl =
  "https://www.linkedin.com/analytics/creator/content/";

type RawCard = {
  analyticsUrl: string;
  cardText: string;
  commentary: string;
  publicUrl: string;
};

async function ensureSevenDays(page: BrowserPage): Promise<void> {
  const current = await page.evaluate<string | null>(currentFilterScript);
  if (/^7\s+(days|días)$/i.test(current ?? "")) {
    return;
  }
  if (!current) {
    throw new Error("Could not find the analytics date filter");
  }

  await page.find(["role", "button", "click", "--name", current]);
  await page.findAny([
    ["role", "radio", "click", "--name", "7 days"],
    ["role", "radio", "click", "--name", "7 días"],
  ]);
  await page.findAny([
    ["text", "Show results", "click", "--exact"],
    ["text", "Mostrar resultados", "click", "--exact"],
  ]);
  await page.waitForFunction(contentReadyScript);

  const selected = await page.evaluate<string | null>(currentFilterScript);
  if (!/^7\s+(days|días)$/i.test(selected ?? "")) {
    throw new Error(`Expected the 7 days filter, found ${selected ?? "none"}`);
  }
}

async function loadCards(page: BrowserPage): Promise<RawCard[]> {
  let initialCards: RawCard[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.scrollDown(1200);
    await Bun.sleep(500);
    const result = await page.evaluate<{ cards: RawCard[] }>(weeklyCardsScript);
    initialCards = result.cards;
    if (initialCards.length > 0) {
      break;
    }
  }
  if (initialCards.length === 0) {
    throw new Error("No post cards loaded in Content analytics");
  }
  let previousCount = -1;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await page.evaluate<{
      cards: RawCard[];
      showMoreText: string | null;
    }>(weeklyCardsScript);
    if (!result.showMoreText || result.cards.length === previousCount) {
      return result.cards;
    }
    previousCount = result.cards.length;
    await page.find(["text", result.showMoreText, "click", "--exact"]);
    await Bun.sleep(500);
  }

  const result = await page.evaluate<{ cards: RawCard[] }>(weeklyCardsScript);
  return result.cards;
}

async function captureDetail(
  page: BrowserPage,
  analyticsUrl: string,
  publicUrl?: string,
  commentary?: string,
): Promise<MetricReceipt> {
  await page.goto(analyticsUrl);
  await page.waitForFunction(detailReadyScript);
  const pageText = await page.evaluate<string>(bodyTextScript);
  const resolvedPublicUrl =
    publicUrl ??
    (await page.evaluate<string | null>(publicPostLinkScript)) ??
    undefined;
  const receipt = createDashboardReceipt({
    card: commentary
      ? {
          ...identityFromUrls(resolvedPublicUrl, analyticsUrl),
          commentary,
          cardText: "",
        }
      : undefined,
    identity: identityFromUrls(resolvedPublicUrl, analyticsUrl),
    observedAt: new Date().toISOString(),
    pageText,
  });
  if (
    receipt.warnings.includes("missing_impressions") &&
    receipt.warnings.includes("missing_members_reached") &&
    receipt.warnings.includes("missing_social_engagements")
  ) {
    throw new Error(
      "Unsupported LinkedIn analytics labels; supported locales: en, es",
    );
  }
  return receipt;
}

async function resolveAnalyticsUrl(
  page: BrowserPage,
  input: string,
): Promise<{ analyticsUrl: string; publicUrl?: string }> {
  const normalized = normalizePostInput(input);
  if (normalized.activityUrn) {
    return {
      analyticsUrl:
        normalized.analyticsUrl ??
        `https://www.linkedin.com/analytics/post-summary/${normalized.activityUrn}/`,
    };
  }

  const shareUrn = normalized.shareUrn;
  const publicUrl = normalized.publicUrl;
  if (!shareUrn || !publicUrl) {
    throw new Error("Could not normalize the LinkedIn post input");
  }
  await page.goto(publicUrl);
  try {
    await page.waitForFunction(analyticsLinkReadyScript);
  } catch {
    await page.goto(contentAnalyticsUrl);
    await page.waitForFunction(contentReadyScript);
    const cards = await loadCards(page);
    const match = cards.find(
      (card) => extractUrn(card.publicUrl, "share") === shareUrn,
    );
    if (!match) {
      throw new Error(`Could not resolve ${shareUrn} in Content analytics`);
    }
    return { analyticsUrl: match.analyticsUrl, publicUrl: match.publicUrl };
  }
  const analyticsUrl = await page.evaluate<string | null>(analyticsLinkScript);
  if (analyticsUrl) {
    return { analyticsUrl, publicUrl };
  }

  throw new Error(`Could not resolve analytics for ${shareUrn}`);
}

export async function captureWeek(
  config: BrowserConfig,
  includeDetails: boolean,
): Promise<WeeklyCapture> {
  const page = new BrowserPage(config);
  const observedAt = new Date().toISOString();

  try {
    await page.start(contentAnalyticsUrl);
    await page.waitForFunction(contentReadyScript);
    await page.snapshot();
    await ensureSevenDays(page);
    const cards = (await loadCards(page)).map(parseWeeklyCard);
    const receipts: MetricReceipt[] = [];

    if (includeDetails) {
      for (const card of cards) {
        receipts.push(
          await captureDetail(
            page,
            card.analyticsUrl ?? "",
            card.publicUrl,
            card.commentary,
          ),
        );
      }
    }

    return {
      period: { days: 7, label: "7 days" },
      posts: cards,
      receipts,
      observedAt,
      warnings: [],
    };
  } finally {
    await page.close();
  }
}

export async function capturePost(
  config: BrowserConfig,
  input: string,
): Promise<MetricReceipt> {
  const page = new BrowserPage(config);

  try {
    await page.start(contentAnalyticsUrl);
    await page.waitForFunction(contentReadyScript);
    await page.snapshot();
    const identity = await resolveAnalyticsUrl(page, input);
    return await captureDetail(page, identity.analyticsUrl, identity.publicUrl);
  } finally {
    await page.close();
  }
}
