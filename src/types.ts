export type MetricValues = {
  impressions?: number;
  membersReached?: number;
  profileViews?: number;
  followersGained?: number;
  socialEngagements?: number;
  reactions?: number;
  comments?: number;
  reposts?: number;
  saves?: number;
  sends?: number;
  linkClicks?: number;
  linkEngagements?: number;
  premiumCtaEngagements?: number;
  inNetworkPercent?: number;
  outOfNetworkPercent?: number;
};

export type PostIdentity = {
  shareUrn?: string;
  activityUrn?: string;
  publicUrl?: string;
  analyticsUrl?: string;
};

export type WeeklyCard = PostIdentity & {
  commentary: string;
  cardText: string;
  cardImpressionsDisplay?: string;
  cardEngagementsDisplay?: string;
};

export type DemographicEntry = {
  category: string;
  value: string;
  percentage: string;
};

export type MetricReceipt = {
  receiptVersion: 1;
  receiptId: string;
  post: PostIdentity & {
    commentary?: string;
    postedLabel?: string;
    publishedDate?: string;
    publishedTime?: string;
  };
  window: {
    kind: "dashboard-selection" | "lifetime" | "xlsx-export";
    label?: string;
    start?: string;
    end?: string;
    endExclusive?: boolean;
  };
  metrics: MetricValues;
  demographics?: DemographicEntry[];
  provider: {
    name: "linkedin-dashboard" | "linkedin-xlsx";
    estimated: true;
    revisionDetected?: boolean;
  };
  observedAt: string;
  provenance: {
    source: string;
    sourceSha256?: string;
    sourceFilenameId?: string;
  };
  warnings: string[];
};

export type WeeklyCapture = {
  period: {
    days: 7;
    label: string;
  };
  posts: WeeklyCard[];
  receipts: MetricReceipt[];
  observedAt: string;
  warnings: string[];
};

export type BrowserConfig = {
  cdpPort: number;
  timeoutMs: number;
  namespace?: string;
  binary?: string;
};

export type ReconciliationDifference = {
  metric: keyof MetricValues;
  from: number;
  to: number;
  delta: number;
  direction: "up" | "down";
};

export type ReconciliationResult = {
  identity: PostIdentity;
  receiptIds: string[];
  differences: ReconciliationDifference[];
  revisionDetected: boolean;
};
