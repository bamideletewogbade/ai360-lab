import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Workbook } from "@oai/artifact-tool";

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(outputDir, "ai360-pilot-invite-import-2026-08-28.csv");
const previewPath = path.join(outputDir, "ai360-pilot-invite-import-preview.png");

const sources = [
  {
    path: "C:/Users/HP/Downloads/ai360-free-intro-2026-08-28.csv",
    cohort: "intro-2026-07-25",
  },
  {
    path: "C:/Users/HP/Downloads/ai360-free-intro-2026-08-28 (1).csv",
    cohort: "intro-2026-08-01",
  },
  {
    path: "C:/Users/HP/Downloads/ai360-free-intro-2026-08-28 (2).csv",
    cohort: "intro-2026-08-08",
  },
];

function clean(value) {
  return String(value ?? "").trim();
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const peopleByEmail = new Map();
const cohortCounts = new Map();
let sourceRowCount = 0;

for (const source of sources) {
  const csvText = await fs.readFile(source.path, "utf8");
  const sourceWorkbook = await Workbook.fromCSV(csvText, { sheetName: "Source" });
  const values = sourceWorkbook.worksheets.getItem("Source").getUsedRange(true).values;
  const headers = values[0].map(clean);
  const emailIndex = headers.indexOf("Email");
  const nameIndex = headers.indexOf("Name");

  if (emailIndex < 0 || nameIndex < 0) {
    throw new Error(`Required Email/Name columns are missing from ${source.path}`);
  }

  for (const row of values.slice(1)) {
    if (row.every((value) => clean(value) === "")) continue;
    sourceRowCount += 1;
    const email = clean(row[emailIndex]).toLowerCase();
    const name = clean(row[nameIndex]).replace(/\s+/g, " ");

    if (!email || !name) {
      throw new Error(`A source row is missing an email or name in ${source.path}`);
    }
    if (peopleByEmail.has(email)) {
      throw new Error(`Duplicate email across source exports: ${email}`);
    }

    peopleByEmail.set(email, { email, name, cohort: source.cohort });
    cohortCounts.set(source.cohort, (cohortCounts.get(source.cohort) ?? 0) + 1);
  }
}

const people = [...peopleByEmail.values()].sort(
  (a, b) => a.cohort.localeCompare(b.cohort) || a.name.localeCompare(b.name),
);

if (sourceRowCount !== 60 || people.length !== 60) {
  throw new Error(`Expected 60 unique recipients, got ${people.length} from ${sourceRowCount} rows`);
}

const matrix = [
  ["Email", "Name", "Cohort"],
  ...people.map(({ email, name, cohort }) => [email, name, cohort]),
];
const finalCsv = matrix.map((row) => row.map(escapeCsv).join(",")).join("\r\n") + "\r\n";
await fs.writeFile(outputPath, finalCsv, "utf8");

const verifyWorkbook = await Workbook.fromCSV(finalCsv, { sheetName: "Pilot invite import" });
const verifySheet = verifyWorkbook.worksheets.getItem("Pilot invite import");
verifySheet.freezePanes.freezeRows(1);
verifySheet.showGridLines = false;
verifySheet.getRange("A1:C61").format.borders = {
  preset: "all",
  style: "thin",
  color: "#D9E2F3",
};
verifySheet.getRange("A1:C1").format.fill = "#17365D";
verifySheet.getRange("A1:C1").format.font = { bold: true, color: "#FFFFFF" };
verifySheet.getRange("A1:C1").format.rowHeight = 24;
verifySheet.getRange("A2:C61").format.rowHeight = 19;
verifySheet.getRange("A:A").format.columnWidth = 36;
verifySheet.getRange("B:B").format.columnWidth = 28;
verifySheet.getRange("C:C").format.columnWidth = 22;

const inspection = await verifyWorkbook.inspect({
  kind: "sheet",
  include: "values",
  sheetId: "Pilot invite import",
  range: "A1:C61",
  maxChars: 1200,
});
const preview = await verifyWorkbook.render({
  sheetName: "Pilot invite import",
  range: "A1:C16",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

console.log(JSON.stringify({
  outputPath,
  previewPath,
  sourceRows: sourceRowCount,
  uniqueRecipients: people.length,
  cohortCounts: Object.fromEntries(cohortCounts),
  inspected: Boolean(inspection),
}, null, 2));
