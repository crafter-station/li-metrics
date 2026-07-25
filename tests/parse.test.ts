import { describe, expect, test } from "bun:test";
import {
  extractUrn,
  parseDisplayNumber,
  parsePostAnalyticsText,
  parseWeeklyCard,
} from "../src/parse";

describe("LinkedIn analytics parsing", () => {
  test("parses live post analytics text", () => {
    const parsed = parsePostAnalyticsText(`
Post analytics
3,015
Impressions
Discovery
In-network (followers and connections)
46%
Out-of-network
54%
1,830
Members reached
Profile activity
28
Profile viewers from this post
2
Followers gained from this post
75
Social engagements
Reactions
63
Comments
4
Reposts
4
Saves
3
Sends on LinkedIn
1
`);

    expect(parsed.metrics).toEqual({
      impressions: 3015,
      membersReached: 1830,
      profileViews: 28,
      followersGained: 2,
      socialEngagements: 75,
      reactions: 63,
      comments: 4,
      reposts: 4,
      saves: 3,
      sends: 1,
      inNetworkPercent: 46,
      outOfNetworkPercent: 54,
    });
    expect(parsed.warnings).toEqual([]);
  });

  test("maps public slug and analytics URLs without assuming equal IDs", () => {
    const card = parseWeeklyCard({
      analyticsUrl:
        "https://www.linkedin.com/analytics/post-summary/urn:li:activity:7485680138597240832/",
      publicUrl:
        "https://www.linkedin.com/posts/railly-hugo_vercel-share-7485567442413494273-DJ8g",
      cardText: "3K impressions • 99 engagements",
      commentary: "Volví a YouTube",
    });

    expect(card.shareUrn).toBe("urn:li:share:7485567442413494273");
    expect(card.activityUrn).toBe("urn:li:activity:7485680138597240832");
    expect(card.cardImpressionsDisplay).toBe("3K");
    expect(card.cardEngagementsDisplay).toBe("99");
  });

  test("parses a Spanish analytics interface", () => {
    const parsed = parsePostAnalyticsText(`
Análisis de la publicación
3.015
Impresiones
En la red (seguidores y contactos)
46%
Fuera de la red
54%
1.830
Miembros alcanzados
28
Visualizaciones del perfil desde esta publicación
2
Seguidores conseguidos con esta publicación
75
Interacciones sociales
Reacciones
63
Comentarios
4
Republicaciones
4
Guardados
3
Envíos en LinkedIn
1
`);

    expect(parsed.metrics).toEqual({
      impressions: 3015,
      membersReached: 1830,
      profileViews: 28,
      followersGained: 2,
      socialEngagements: 75,
      reactions: 63,
      comments: 4,
      reposts: 4,
      saves: 3,
      sends: 1,
      inNetworkPercent: 46,
      outOfNetworkPercent: 54,
    });
    expect(parsed.warnings).toEqual([]);
  });

  test("parses compact numbers and URNs", () => {
    expect(parseDisplayNumber("2.5K")).toBe(2500);
    expect(extractUrn("urn:li:share:123", "share")).toBe("urn:li:share:123");
  });
});
