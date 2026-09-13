import { describe, it, expect } from "vitest";
import {
  scrubText,
  containsPII,
  scrubSchemeName,
  categoriseReason,
} from "./pii.js";

describe("scrubText", () => {
  it("redacts a PAN", () => {
    const { text, found } = scrubText("my PAN is ABCDE1234F ok");
    expect(text).not.toContain("ABCDE1234F");
    expect(text).toContain("[PAN REDACTED]");
    expect(found).toContain("PAN");
  });

  it("redacts an Aadhaar in grouped and ungrouped form", () => {
    expect(scrubText("2345 6789 0123").text).not.toMatch(/\d{4}/);
    expect(scrubText("234567890123").text).not.toMatch(/\d{12}/);
  });

  it("redacts an email address", () => {
    const { text } = scrubText("write to me at kingsuk@example.com please");
    expect(text).not.toContain("kingsuk@example.com");
    expect(text).toContain("[EMAIL REDACTED]");
  });

  it("redacts an Indian mobile number with and without the country code", () => {
    expect(scrubText("call 9876543210").text).not.toContain("9876543210");
    expect(scrubText("call +91 9876543210").text).not.toContain("9876543210");
  });

  it("redacts an IFSC code", () => {
    const { text } = scrubText("account at SBIN0001234");
    expect(text).not.toContain("SBIN0001234");
  });

  it("redacts a long account-number-like digit run", () => {
    const { text } = scrubText("account 123456789012345");
    expect(text).not.toContain("123456789012345");
  });

  it("leaves ordinary questions untouched", () => {
    const q = "Why is my XIRR different from the CAGRs?";
    const { text, found } = scrubText(q);
    expect(text).toBe(q);
    expect(found).toEqual([]);
  });

  it("does not mangle small numbers or percentages", () => {
    const q = "is 10.53% good over 1800 days across 5 holdings?";
    expect(scrubText(q).text).toBe(q);
  });

  it("handles several identifiers in one message", () => {
    const { text, found } = scrubText("PAN ABCDE1234F, email a@b.com");
    expect(text).not.toContain("ABCDE1234F");
    expect(text).not.toContain("a@b.com");
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  // Module-level /g regexes carry lastIndex between calls if not reset.
  it("is stable across repeated calls", () => {
    const q = "my PAN is ABCDE1234F";
    const a = scrubText(q).text;
    const b = scrubText(q).text;
    const c = scrubText(q).text;
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("survives null and undefined", () => {
    expect(scrubText(null).text).toBe("");
    expect(scrubText(undefined).text).toBe("");
  });
});

describe("containsPII", () => {
  it("flags text with identifiers and clears text without", () => {
    expect(containsPII("ABCDE1234F")).toBe(true);
    expect(containsPII("what does XIRR mean")).toBe(false);
  });
});

describe("scrubSchemeName", () => {
  it("keeps a normal fund name intact", () => {
    expect(scrubSchemeName("SBI Contra Fund - Direct Plan - Growth")).toBe(
      "SBI Contra Fund - Direct Plan - Growth"
    );
  });

  it("strips identifiers pasted into a scheme name", () => {
    expect(scrubSchemeName("SBI Contra ABCDE1234F")).not.toContain("ABCDE1234F");
  });

  it("caps runaway length", () => {
    expect(scrubSchemeName("x".repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it("survives null", () => {
    expect(scrubSchemeName(null)).toBe("");
  });
});

describe("categoriseReason", () => {
  // The UI reason interpolates raw cell content from the user's file.
  it("reduces an interpolated reason to a fixed phrase", () => {
    expect(categoriseReason('Unreadable date "13/45/2021"')).toBe(
      "unreadable date"
    );
    expect(categoriseReason('Unreadable date "13/45/2021"')).not.toContain(
      "13/45/2021"
    );
  });

  it("maps the known categories", () => {
    expect(categoriseReason("Current NAV unavailable")).toBe(
      "current NAV unavailable"
    );
    expect(categoriseReason("Purchase NAV missing or not a number")).toBe(
      "purchase NAV missing"
    );
  });

  it("falls back to a safe generic phrase", () => {
    expect(categoriseReason("something totally unexpected")).toBe(
      "could not be priced"
    );
  });
});
