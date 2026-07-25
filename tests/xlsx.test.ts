import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  defaultXlsxLimits,
  importXlsx,
  inspectXlsxArchive,
} from "../src/xlsx-provider";

const directories: string[] = [];

afterAll(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true })),
  );
});

describe("XLSX imports", () => {
  test("imports the current LinkedIn single-post schema", async () => {
    const directory = await mkdtemp(join(tmpdir(), "li-metrics-"));
    directories.push(directory);
    const path = join(
      directory,
      "SinglePostAnalytics_Railly Hugo_7485680138597240832.xlsx",
    );
    const rows = [
      [
        "Post URL",
        "https://www.linkedin.com/posts/railly-hugo_test-share-7485567442413494273-DJ8g",
      ],
      ["Post Date", "7/22/2026"],
      ["Post Publish Time", "10:00 AM"],
      ["Impressions", "3000"],
      ["Members reached", "1829"],
      ["Profile viewers from this post", "28"],
      ["Followers gained from this post", "2"],
      ["Social engagements", "103"],
      ["Reactions", "90"],
      ["Comments", "5"],
      ["Reposts", "4"],
      ["Saves", "3"],
      ["Sends on LinkedIn", "1"],
      ["Link engagements", "0"],
      ["Premium custom button engagements", "0"],
      ["Category", "Value", "%"],
      ["Job title", "Software Engineer", "10%"],
    ];
    const escapeXml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const sheetRows = rows
      .map((row, rowIndex) => {
        const cells = row
          .map((value, columnIndex) => {
            const column = String.fromCharCode(65 + columnIndex);
            return `<c r="${column}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
          })
          .join("");
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join("");
    const files = {
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
      "xl/workbook.xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Analytics" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      ),
      "xl/sharedStrings.xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>',
      ),
      "xl/styles.xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
      ),
    };
    const archive = zipSync(files);
    inspectXlsxArchive(archive.buffer, defaultXlsxLimits);
    await Bun.write(path, archive);

    const imported = await importXlsx(path);

    expect(imported.post.shareUrn).toBe("urn:li:share:7485567442413494273");
    expect(imported.post.publishedDate).toBe("7/22/2026");
    expect(imported.metrics.profileViews).toBe(28);
    expect(imported.metrics.sends).toBe(1);
    expect(imported.demographics).toEqual([
      { category: "Job title", value: "Software Engineer", percentage: "10%" },
    ]);
    expect(imported.warnings).toEqual([]);

    await expect(
      importXlsx(path, { ...defaultXlsxLimits, maxCompressedBytes: 1 }),
    ).rejects.toThrow("compressed size limit");
    await expect(
      importXlsx(path, { ...defaultXlsxLimits, maxRows: 1 }),
    ).rejects.toThrow("row limit");

    const oversized = new Uint8Array(archive);
    const view = new DataView(
      oversized.buffer,
      oversized.byteOffset,
      oversized.byteLength,
    );
    for (let index = 0; index <= oversized.byteLength - 46; index += 1) {
      if (view.getUint32(index, true) === 0x02014b50) {
        view.setUint32(
          index + 24,
          defaultXlsxLimits.maxUncompressedBytes + 1,
          true,
        );
        break;
      }
    }
    expect(() =>
      inspectXlsxArchive(oversized.buffer, defaultXlsxLimits),
    ).toThrow("uncompressed size limit");
  });
});
