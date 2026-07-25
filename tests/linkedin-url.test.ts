import { describe, expect, test } from "bun:test";
import { isLinkedInHostname, normalizePostInput } from "../src/linkedin-url";

describe("LinkedIn post input boundary", () => {
  test("accepts canonical LinkedIn URLs and URNs", () => {
    expect(
      normalizePostInput(
        "https://www.linkedin.com/feed/update/urn:li:share:123/",
      ),
    ).toMatchObject({
      shareUrn: "urn:li:share:123",
      publicUrl: "https://www.linkedin.com/feed/update/urn:li:share:123/",
    });
    expect(normalizePostInput("urn:li:activity:456")).toEqual({
      activityUrn: "urn:li:activity:456",
      analyticsUrl:
        "https://www.linkedin.com/analytics/post-summary/urn:li:activity:456/",
    });
  });

  test("rejects non-HTTPS and non-LinkedIn origins before navigation", () => {
    expect(() =>
      normalizePostInput("https://example.com/post-share-123-X"),
    ).toThrow("Post URLs must use HTTPS on linkedin.com");
    expect(() =>
      normalizePostInput("https://linkedin.com.evil.test/post-share-123-X"),
    ).toThrow("Post URLs must use HTTPS on linkedin.com");
    expect(() =>
      normalizePostInput("http://www.linkedin.com/post-share-123-X"),
    ).toThrow("Post URLs must use HTTPS on linkedin.com");
  });

  test("allows LinkedIn-controlled subdomains only", () => {
    expect(isLinkedInHostname("www.linkedin.com")).toBe(true);
    expect(isLinkedInHostname("m.linkedin.com")).toBe(true);
    expect(isLinkedInHostname("linkedin.com.evil.test")).toBe(false);
  });
});
