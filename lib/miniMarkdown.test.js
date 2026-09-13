import { describe, it, expect } from "vitest";
import { parseInline, parseBlocks } from "./miniMarkdown.js";
const text = (v) => ({ type: "text", value: v });

describe("parseInline", () => {
  it("renders bold, which is what the model actually emits", () => {
    expect(parseInline("The **SBI NIFTY INDEX FUND** lots")).toEqual([
      text("The "), { type: "bold", value: "SBI NIFTY INDEX FUND" }, text(" lots"),
    ]);
  });
  it("handles italics in both spellings", () => {
    expect(parseInline("*one*")).toEqual([{ type: "italic", value: "one" }]);
    expect(parseInline("_two_")).toEqual([{ type: "italic", value: "two" }]);
  });
  it("handles __bold__ as well as **bold**", () => {
    expect(parseInline("__loud__")).toEqual([{ type: "bold", value: "loud" }]);
  });
  it("renders inline code", () => {
    expect(parseInline("set `GROQ_API_KEY` first")).toEqual([
      text("set "), { type: "code", value: "GROQ_API_KEY" }, text(" first"),
    ]);
  });
  // Ordering guard: bold must not win inside backticks.
  it("leaves asterisks inside code literal", () => {
    expect(parseInline("`a ** b`")).toEqual([{ type: "code", value: "a ** b" }]);
  });
  it("leaves a lone asterisk alone", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([text("2 * 3 = 6")]);
  });
  it("leaves unclosed markers alone rather than eating the rest", () => {
    expect(parseInline("**unclosed")).toEqual([text("**unclosed")]);
  });
  it("handles several spans in one line", () => {
    expect(parseInline("**a** and *b* and `c`")).toEqual([
      { type: "bold", value: "a" }, text(" and "),
      { type: "italic", value: "b" }, text(" and "),
      { type: "code", value: "c" },
    ]);
  });
  it("survives empty input", () => {
    expect(parseInline("")).toEqual([text("")]);
  });
});

describe("parseBlocks", () => {
  it("splits paragraphs on blank lines", () => {
    const b = parseBlocks("First para.\n\nSecond para.");
    expect(b).toHaveLength(2);
    expect(b[1].spans[0].value).toBe("Second para.");
  });
  it("joins wrapped lines into one paragraph", () => {
    const b = parseBlocks("a line\nand its continuation");
    expect(b).toHaveLength(1);
    expect(b[0].spans[0].value).toBe("a line and its continuation");
  });
  it("parses bullet lists", () => {
    const [b] = parseBlocks("- one\n- two");
    expect(b.type).toBe("list");
    expect(b.ordered).toBe(false);
    expect(b.items).toHaveLength(2);
  });
  it("parses numbered lists", () => {
    const [b] = parseBlocks("1. first\n2. second");
    expect(b.ordered).toBe(true);
  });
  it("does not merge a bullet list into a numbered one", () => {
    const b = parseBlocks("- a\n1. b");
    expect(b).toHaveLength(2);
  });
  it("keeps inline formatting inside list items", () => {
    const [b] = parseBlocks("- **SBI CONTRA FUND** is 20%");
    expect(b.items[0][0]).toEqual({ type: "bold", value: "SBI CONTRA FUND" });
  });
  it("strips heading markers and keeps the text", () => {
    const [b] = parseBlocks("## Summary");
    expect(b.type).toBe("p");
    expect(b.spans[0].value).toBe("Summary");
  });
  // Replies arrive token by token, so every prefix must parse.
  it("parses every prefix of a streaming reply without throwing", () => {
    const full = "Your **XIRR** is 1.05%.\n\n- `H1` is 42%\n- H2 is 20%";
    for (let i = 1; i <= full.length; i += 1) {
      expect(() => parseBlocks(full.slice(0, i))).not.toThrow();
    }
  });
  it("returns nothing for empty input", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks(null)).toEqual([]);
  });
});
