import { inflateRawSync } from "node:zlib";

/**
 * Minimal XLSX reader: just enough to turn AMFI's TER spreadsheet into rows.
 *
 * An XLSX is a ZIP of XML. Reading it needs a ZIP directory walk and a raw
 * inflate, both of which Node gives us, so this is ~100 lines instead of a
 * dependency. That matters here: the popular `xlsx` package has a history of
 * prototype-pollution advisories and no longer publishes to npm, and `exceljs`
 * is a large dependency for one file with fifteen columns.
 *
 * Deliberately NOT a general XLSX implementation. It handles what AMFI emits:
 * a single sheet, inline strings, no shared-strings table, no formulas.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** Locate the End of Central Directory record, which sits at the tail. */
const findEndOfCentralDirectory = (buffer) => {
  // The comment field can be up to 64 KB, so scan back that far and no more.
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= earliest; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new Error("Not a ZIP archive: no end-of-central-directory record");
};

/** @returns {Map<string, Buffer>} entry name to its uncompressed bytes */
export const readZipEntries = (buffer, wanted) => {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);

  const entries = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(pointer) !== CENTRAL_SIGNATURE) {
      throw new Error(`Corrupt ZIP: bad central directory header at ${pointer}`);
    }

    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);

    if (!wanted || wanted(name)) {
      // The local header repeats the name and extra fields, and its lengths
      // are the authoritative ones for locating the data.
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const raw = buffer.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) entries.set(name, raw);
      else if (method === 8) entries.set(name, inflateRawSync(raw));
      else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

export const decodeXmlText = (text) =>
  String(text ?? "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

/**
 * Parse one worksheet into an array of string arrays.
 *
 * Cells are placed by their column reference (A1, B1...) rather than by the
 * order they appear, because a blank cell is simply omitted from the XML. Going
 * by order would silently shift every value after a gap into the wrong column,
 * which is the same class of bug as the AMFI NAV column shift.
 */
export const parseWorksheet = (xml) => {
  const text = typeof xml === "string" ? xml : xml.toString("utf8");
  const rows = [];

  for (const rowMatch of text.matchAll(/<row\b[^>]*>(.*?)<\/row>/gs)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";

      const reference = /r="([A-Z]+)\d+"/.exec(attributes)?.[1];
      const index = reference ? columnToIndex(reference) : cells.length;

      const inline = /<is>.*?<t[^>]*>(.*?)<\/t>/s.exec(body);
      const value = /<v>(.*?)<\/v>/s.exec(body);
      cells[index] = decodeXmlText(inline?.[1] ?? value?.[1] ?? "");
    }
    // Fill holes left by omitted cells so callers can index positionally.
    for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }

  return rows;
};

/** "A" -> 0, "Z" -> 25, "AA" -> 26 */
export const columnToIndex = (reference) => {
  let index = 0;
  for (const character of reference) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
};

/** Excel serial date to ISO. Day 1 is 1900-01-01, with the 1900 leap bug. */
export const serialToISODate = (serial) => {
  const number = Number(serial);
  if (!Number.isFinite(number) || number <= 0) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(number) * 86400000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

/** Read the first worksheet of an XLSX buffer as rows of strings. */
export const readSheetRows = (buffer) => {
  const entries = readZipEntries(buffer, (name) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(name)
  );
  if (entries.size === 0) throw new Error("XLSX contains no worksheet");
  const [, sheet] = [...entries].sort(([a], [b]) => a.localeCompare(b))[0];
  return parseWorksheet(sheet);
};
