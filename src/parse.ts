import type {
  MetricReceipt,
  MetricValues,
  PostIdentity,
  WeeklyCard,
} from "./types";

const integerPattern = /^-?[\d.,]+$/;

export function parseInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/\s/g, "");
  if (!integerPattern.test(normalized)) {
    return undefined;
  }

  const digits = normalized.replace(/[.,]/g, "");
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parsePercent(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseDisplayNumber(
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^([\d.,]+)\s*([KM])?$/);
  if (!match) {
    return undefined;
  }

  const base = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(base)) {
    return undefined;
  }

  const multiplier =
    match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return Math.round(base * multiplier);
}

export function extractUrn(
  value: string | undefined,
  kind: "share" | "activity",
): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    new RegExp(
      kind === "share"
        ? "(?:urn:li:share:|share-)(\\d+)"
        : "urn:li:activity:(\\d+)",
    ),
  );
  return match ? `urn:li:${kind}:${match[1]}` : undefined;
}

export function identityFromUrls(
  publicUrl?: string,
  analyticsUrl?: string,
): PostIdentity {
  return {
    shareUrn: extractUrn(publicUrl, "share"),
    activityUrn: extractUrn(analyticsUrl, "activity"),
    publicUrl,
    analyticsUrl,
  };
}

export function parseWeeklyCard(input: {
  analyticsUrl: string;
  cardText: string;
  commentary: string;
  publicUrl: string;
}): WeeklyCard {
  const impressions = input.cardText.match(/([\d.,]+[KM]?)\s+impressions/i);
  const engagements = input.cardText.match(/([\d.,]+[KM]?)\s+engagements/i);

  return {
    ...identityFromUrls(input.publicUrl, input.analyticsUrl),
    commentary: input.commentary.trim(),
    cardText: input.cardText.trim(),
    cardImpressionsDisplay: impressions?.[1],
    cardEngagementsDisplay: engagements?.[1],
  };
}

function compactLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function valueBefore(lines: string[], labels: string[]): string | undefined {
  const normalized = new Set(labels.map((label) => label.toLowerCase()));
  const index = lines.findIndex((line) => normalized.has(line.toLowerCase()));
  return index > 0 ? lines[index - 1] : undefined;
}

function valueAfter(lines: string[], labels: string[]): string | undefined {
  const normalized = new Set(labels.map((label) => label.toLowerCase()));
  const index = lines.findIndex((line) => normalized.has(line.toLowerCase()));
  return index >= 0 ? lines[index + 1] : undefined;
}

export function parsePostAnalyticsText(text: string): {
  metrics: MetricValues;
  postedLabel?: string;
  warnings: string[];
} {
  const lines = compactLines(text);
  const postedLabel = lines.find(
    (line) => line.includes("posted this •") || line.includes("publicó esto •"),
  );
  const metrics: MetricValues = {
    impressions: parseInteger(
      valueBefore(lines, ["Impressions", "Impresiones"]),
    ),
    membersReached: parseInteger(
      valueBefore(lines, ["Members reached", "Miembros alcanzados"]),
    ),
    profileViews: parseInteger(
      valueBefore(lines, [
        "Profile viewers from this post",
        "Visualizaciones del perfil desde esta publicación",
        "Visualizaciones del perfil a partir de esta publicación",
      ]),
    ),
    followersGained: parseInteger(
      valueBefore(lines, [
        "Followers gained from this post",
        "Seguidores conseguidos con esta publicación",
        "Seguidores obtenidos a partir de esta publicación",
      ]),
    ),
    socialEngagements: parseInteger(
      valueBefore(lines, ["Social engagements", "Interacciones sociales"]),
    ),
    reactions: parseInteger(valueAfter(lines, ["Reactions", "Reacciones"])),
    comments: parseInteger(valueAfter(lines, ["Comments", "Comentarios"])),
    reposts: parseInteger(valueAfter(lines, ["Reposts", "Republicaciones"])),
    saves: parseInteger(
      valueAfter(lines, ["Saves", "Guardados", "Veces guardado"]),
    ),
    sends: parseInteger(
      valueAfter(lines, ["Sends on LinkedIn", "Envíos en LinkedIn"]),
    ),
    inNetworkPercent: parsePercent(
      valueAfter(lines, [
        "In-network (followers and connections)",
        "En la red (seguidores y contactos)",
        "Dentro de la red (seguidores y contactos)",
      ]),
    ),
    outOfNetworkPercent: parsePercent(
      valueAfter(lines, ["Out-of-network", "Fuera de la red"]),
    ),
  };
  const warnings: string[] = [];

  if (metrics.impressions === undefined) {
    warnings.push("missing_impressions");
  }
  if (metrics.membersReached === undefined) {
    warnings.push("missing_members_reached");
  }
  if (metrics.socialEngagements === undefined) {
    warnings.push("missing_social_engagements");
  }

  return { metrics, postedLabel, warnings };
}

export function createDashboardReceipt(input: {
  card?: WeeklyCard;
  identity: PostIdentity;
  observedAt: string;
  pageText: string;
}): MetricReceipt {
  const parsed = parsePostAnalyticsText(input.pageText);
  const basis = JSON.stringify({
    identity: input.identity,
    observedAt: input.observedAt,
    metrics: parsed.metrics,
  });

  return {
    receiptVersion: 1,
    receiptId: new Bun.CryptoHasher("sha256").update(basis).digest("hex"),
    post: {
      ...input.identity,
      commentary: input.card?.commentary,
      postedLabel: parsed.postedLabel,
    },
    window: {
      kind: "lifetime",
    },
    metrics: parsed.metrics,
    provider: {
      name: "linkedin-dashboard",
      estimated: true,
    },
    observedAt: input.observedAt,
    provenance: {
      source: input.identity.analyticsUrl ?? "linkedin-dashboard",
    },
    warnings: parsed.warnings,
  };
}
