/**
 * Personal data scrubbing for anything leaving the browser for a third-party
 * model.
 *
 * The structured payload is built from a fixed allow-list of derived numbers,
 * so it cannot leak by construction. This module guards the paths that carry
 * FREE TEXT, where a user can type or paste anything:
 *
 *   - the question typed into the chat box
 *   - prior assistant and user turns replayed as history
 *   - scheme names, which come from the user's own CSV when nothing matched
 *
 * Patterns target Indian identifiers specifically, because that is what this
 * app's users hold. Scrubbing is applied on the client before sending AND
 * again on the server, so a tampered or replayed request cannot bypass it.
 */

const PATTERNS = [
  // Permanent Account Number: 5 letters, 4 digits, 1 letter.
  { label: "PAN", re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, token: "[PAN REDACTED]" },

  // Aadhaar: 12 digits, commonly written in 4-4-4 groups. Deliberately checked
  // before the generic long-number rule so it gets the more specific label.
  {
    label: "Aadhaar",
    re: /\b[2-9][0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{4}\b/g,
    token: "[AADHAAR REDACTED]",
  },

  // IFSC: 4 letters, a literal 0, then 6 alphanumerics.
  { label: "IFSC", re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, token: "[IFSC REDACTED]" },

  { label: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, token: "[EMAIL REDACTED]" },

  // Indian mobile numbers, with or without +91 / 0 prefix.
  {
    label: "phone",
    re: /(?:\+?91[ -]?|\b0)?[6-9][0-9]{4}[ -]?[0-9]{5}\b/g,
    token: "[PHONE REDACTED]",
  },

  // Bank account and card-like digit runs. Last, so the specific rules above
  // claim their matches first.
  { label: "account number", re: /\b[0-9]{9,18}\b/g, token: "[NUMBER REDACTED]" },
];

/**
 * Remove anything that looks like a personal identifier.
 * @returns {{text: string, found: string[]}} scrubbed text and what was hit
 */
export const scrubText = (input) => {
  let text = String(input ?? "");
  const found = [];

  for (const { label, re, token } of PATTERNS) {
    // Reset lastIndex: these are module-level /g regexes reused across calls.
    re.lastIndex = 0;
    if (re.test(text)) {
      found.push(label);
      re.lastIndex = 0;
      text = text.replace(re, token);
    }
  }

  return { text, found };
};

/** True when the input contains anything that looks like a personal identifier. */
export const containsPII = (input) => scrubText(input).found.length > 0;

/**
 * Scheme names reach the payload from the user's CSV when AMFI matched
 * nothing, so they are free text too. Keep it to characters a fund name
 * actually uses and cap the length.
 */
export const scrubSchemeName = (name) => {
  const { text } = scrubText(name);
  return text
    .replace(/[^\w\s&().\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
};

/**
 * Why a row could not be priced, as a fixed phrase.
 *
 * The UI builds reasons like `Unreadable date "13/45/2021"`, which embeds raw
 * cell content from the user's file. The model only needs the category.
 */
export const categoriseReason = (reason) => {
  const text = String(reason ?? "").toLowerCase();
  if (text.includes("date")) return "unreadable date";
  if (text.includes("current nav")) return "current NAV unavailable";
  if (text.includes("purchase nav")) return "purchase NAV missing";
  if (text.includes("amount")) return "amount missing";
  if (text.includes("ambiguous")) return "scheme matched more than one plan";
  if (text.includes("not found")) return "scheme not found in AMFI";
  return "could not be priced";
};
