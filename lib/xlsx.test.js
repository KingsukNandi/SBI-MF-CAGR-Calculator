import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  parseWorksheet,
  columnToIndex,
  serialToISODate,
  decodeXmlText,
  readZipEntries,
  readSheetRows,
} from "./xlsx.js";

/** Build a real ZIP so the reader is exercised, not mocked. */
const makeZip = (files) => {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.from(content, "utf8");
    const deflated = deflateRawSync(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(deflated.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);

  return Buffer.concat([localBuf, centralBuf, eocd]);
};

describe("columnToIndex", () => {
  it("maps single and multi-letter references", () => {
    expect(columnToIndex("A")).toBe(0);
    expect(columnToIndex("B")).toBe(1);
    expect(columnToIndex("Z")).toBe(25);
    expect(columnToIndex("AA")).toBe(26);
    expect(columnToIndex("AO")).toBe(40);
  });
});

describe("decodeXmlText", () => {
  it("decodes the five XML entities", () => {
    expect(decodeXmlText("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;")).toBe(
      `a & b <c> "d" 'e'`
    );
  });
  it("decodes numeric references", () => {
    expect(decodeXmlText("&#8377;100")).toBe("₹100");
    expect(decodeXmlText("&#x20B9;100")).toBe("₹100");
  });
  it("leaves ordinary text alone", () => {
    expect(decodeXmlText("SBI Contra Fund")).toBe("SBI Contra Fund");
  });
});

describe("parseWorksheet", () => {
  it("reads inline strings and numeric values", () => {
    const xml = `<sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Scheme</t></is></c><c r="B1"><v>1.61</v></c></row>
    </sheetData>`;
    expect(parseWorksheet(xml)).toEqual([["Scheme", "1.61"]]);
  });

  // A blank cell is omitted entirely from the XML. Placing cells in document
  // order would shift every later value one column left, which is exactly the
  // class of bug that broke the NAV parser.
  it("places cells by reference, so a gap does not shift the row", () => {
    const xml = `<sheetData>
      <row r="1"><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row>
    </sheetData>`;
    expect(parseWorksheet(xml)).toEqual([["1", "", "", "4"]]);
  });

  it("handles self-closing empty cells", () => {
    const xml = `<sheetData><row r="1"><c r="A1"/><c r="B1"><v>2</v></c></row></sheetData>`;
    expect(parseWorksheet(xml)).toEqual([["", "2"]]);
  });

  it("decodes entities inside cells", () => {
    const xml = `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Large &amp; Mid Cap</t></is></c></row></sheetData>`;
    expect(parseWorksheet(xml)[0][0]).toBe("Large & Mid Cap");
  });

  it("returns nothing for an empty sheet", () => {
    expect(parseWorksheet("<sheetData></sheetData>")).toEqual([]);
  });
});

describe("serialToISODate", () => {
  it("converts the serials AMFI actually emits", () => {
    expect(serialToISODate(46266)).toBe("2026-09-01");
    expect(serialToISODate(46265)).toBe("2026-08-31");
  });

  // Excel counts a 29 Feb 1900 that never existed, so its epoch is 1899-12-30
  // and serials below 61 land a day early. Irrelevant for TER dates, recorded
  // so nobody "fixes" the epoch and breaks every real date by one day.
  it("is off by one below serial 61, which is Excel's bug, not ours", () => {
    expect(serialToISODate(1)).toBe("1899-12-31");
  });
  it("rejects nonsense", () => {
    expect(serialToISODate(0)).toBeNull();
    expect(serialToISODate(-5)).toBeNull();
    expect(serialToISODate("not a number")).toBeNull();
    expect(serialToISODate(null)).toBeNull();
  });
});

describe("readZipEntries", () => {
  it("inflates a deflated entry", () => {
    const zip = makeZip({ "a.txt": "hello world", "b.txt": "second" });
    const entries = readZipEntries(zip);
    expect(entries.get("a.txt").toString()).toBe("hello world");
    expect(entries.get("b.txt").toString()).toBe("second");
  });

  it("honours the wanted filter, skipping the rest", () => {
    const zip = makeZip({ "keep.xml": "yes", "skip.xml": "no" });
    const entries = readZipEntries(zip, (n) => n === "keep.xml");
    expect([...entries.keys()]).toEqual(["keep.xml"]);
  });

  it("throws on something that is not a ZIP", () => {
    expect(() => readZipEntries(Buffer.from("plain text, not a zip")))
      .toThrow(/not a zip/i);
  });
});

describe("readSheetRows", () => {
  it("reads the worksheet out of a real archive", () => {
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Scheme Name</t></is></c><c r="B1" t="inlineStr"><is><t>Total TER (%)</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>SBI CONTRA FUND</t></is></c><c r="B2"><v>1.6</v></c></row>
    </sheetData></worksheet>`;
    const zip = makeZip({ "[Content_Types].xml": "<x/>", "xl/worksheets/sheet1.xml": sheet });
    expect(readSheetRows(zip)).toEqual([
      ["Scheme Name", "Total TER (%)"],
      ["SBI CONTRA FUND", "1.6"],
    ]);
  });

  it("throws when the archive has no worksheet", () => {
    expect(() => readSheetRows(makeZip({ "docProps/app.xml": "<x/>" })))
      .toThrow(/no worksheet/i);
  });
});
