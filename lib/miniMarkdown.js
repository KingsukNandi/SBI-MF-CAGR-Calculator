/**
 * Minimal markdown → structured tokens, for rendering LLM chat replies.
 *
 * Models emit `**bold**`, `*italic*` and `` `code` `` whether or not you ask
 * them to, and showing the raw asterisks looks broken. This handles exactly
 * that much, plus bullet and numbered lists.
 *
 * It returns plain data that the component turns into React elements — no HTML
 * string is ever produced, so there is no injection surface. That is the whole
 * reason for not reaching for a markdown library here: a chat bubble needs four
 * constructs, and this costs nothing and cannot render a <script>.
 */

/**
 * Split one line into inline spans.
 * Order matters: code first, so `**` inside backticks stays literal.
 */
export const parseInline = (text) => {
  const spans = [];
  // A single regex keeps the alternatives mutually exclusive, so a `**` inside
  // backticks can never be matched as bold.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const [raw] = match;
    if (match[1]) {
      spans.push({ type: "code", value: raw.slice(1, -1) });
    } else if (match[2] || match[3]) {
      spans.push({ type: "bold", value: raw.slice(2, -2) });
    } else {
      spans.push({ type: "italic", value: raw.slice(1, -1) });
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    spans.push({ type: "text", value: text.slice(lastIndex) });
  }

  return spans.length ? spans : [{ type: "text", value: text }];
};

/**
 * Split a reply into blocks: paragraphs and lists.
 * Streaming-safe — partial input yields partial blocks, never throws.
 */
export const parseBlocks = (markdown) => {
  const lines = String(markdown ?? "").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", spans: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    // Strip heading markers rather than rendering headings: a chat bubble has
    // no use for an <h2>, but the text after it is still wanted.
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);

    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const content = bullet ? bullet[1] : numbered[2];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { type: "list", ordered, items: [] };
      }
      list.items.push(parseInline(content));
      continue;
    }

    flushList();
    paragraph.push(heading ? heading[1] : trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
};
