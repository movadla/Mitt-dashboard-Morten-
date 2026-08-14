import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { RECEIVABLES } from "@/lib/widgets";
import { computeAging } from "@/lib/receivablesAging";
import { getMainBuilding } from "@/lib/receivableBuilding";
import { getReceivableRisks, type ReceivableRiskLevel } from "@/lib/receivableRisk";
import { getAllComments } from "@/lib/comments";
import { getLatestTwoSnapshots, type ReceivableSnapshot, type ReceivableSnapshotRow } from "@/lib/receivablesSnapshots";
import { localDateString } from "@/lib/payday";

export const dynamic = "force-dynamic";

const RISK_NO: Record<ReceivableRiskLevel, number> = { lav: 1, medium: 2, hoy: 3 };
const RISK_FILL: Record<ReceivableRiskLevel, string> = {
  lav: "FFC6EFCE",
  medium: "FFFFEB9C",
  hoy: "FFFFC7CE",
};
const HEADER_FILL = "FF144623";

const MAIN_HEADERS = [
  "Kunde",
  "Totalt utestående",
  "Ikke forfalt",
  "Utestående 0-30 dager",
  "Utestående 31-60 dager",
  "Utestående 61-90 dager",
  "Utestående 91+ dager",
  "Forfalt",
  "Forfalt 30+",
  "Bygg",
  "Risiko",
  "Ny kommentar",
];

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
}

function addKundefordringerSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  asOfDateISO: string,
  risks: Record<string, ReceivableRiskLevel>,
  latestComment: Record<string, string>,
) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(MAIN_HEADERS);
  styleHeaderRow(sheet.getRow(1));
  sheet.columns = MAIN_HEADERS.map((h) => ({ width: Math.max(14, h.length + 2) }));

  for (const r of RECEIVABLES) {
    const aging = computeAging(r, asOfDateISO);
    const risk = risks[r.id] ?? null;
    const row = sheet.addRow([
      r.leietaker,
      r.utestaende,
      aging.ikkeForfalt || null,
      aging.d0_30 || null,
      aging.d31_60 || null,
      aging.d61_90 || null,
      aging.d91Plus || null,
      aging.forfalt || null,
      aging.forfalt30Plus || null,
      getMainBuilding(r.leietaker),
      risk ? RISK_NO[risk] : null,
      latestComment[r.id] ?? "",
    ]);
    if (risk) {
      row.getCell(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: RISK_FILL[risk] } };
    }
    for (let c = 2; c <= 9; c++) row.getCell(c).numFmt = "#,##0";
  }
  return sheet;
}

function groupByRisk(rows: ReceivableSnapshotRow[]) {
  const groups: Record<number, { forfalt: number; forfalt91: number; utestaende: number }> = {
    1: { forfalt: 0, forfalt91: 0, utestaende: 0 },
    2: { forfalt: 0, forfalt91: 0, utestaende: 0 },
    3: { forfalt: 0, forfalt91: 0, utestaende: 0 },
  };
  const total = { forfalt: 0, forfalt91: 0, utestaende: 0 };
  for (const row of rows) {
    const riskNo = row.risiko ? RISK_NO[row.risiko] : null;
    total.forfalt += row.forfalt;
    total.forfalt91 += row.forfalt91;
    total.utestaende += row.utestaende;
    if (riskNo) {
      groups[riskNo].forfalt += row.forfalt;
      groups[riskNo].forfalt91 += row.forfalt91;
      groups[riskNo].utestaende += row.utestaende;
    }
  }
  return { groups, total };
}

function addStatusTable(sheet: ExcelJS.Worksheet, title: string, snapshot: ReceivableSnapshot) {
  sheet.addRow([title]);
  const headerRow = sheet.addRow(["", "Forfalt", "91+ dager", "Totalt utestående"]);
  headerRow.font = { bold: true };
  const { groups, total } = groupByRisk(snapshot.rader);
  for (const riskNo of [1, 2, 3]) {
    const g = groups[riskNo];
    sheet.addRow([riskNo, g.forfalt || 0, g.forfalt91 || 0, g.utestaende || 0]);
  }
  const totalRow = sheet.addRow(["Grand Total", total.forfalt, total.forfalt91, total.utestaende]);
  totalRow.font = { bold: true };
  sheet.addRow([]);
}

function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return (to - from) / from;
}

export async function GET() {
  try {
    const today = localDateString();
    const risks = await getReceivableRisks();
    const allComments = await getAllComments();
    const latestComment: Record<string, string> = {};
    for (const r of RECEIVABLES) {
      const list = allComments[`receivable:${r.id}`];
      if (list && list.length > 0) {
        const latest = [...list].sort((a, b) => b.opprettet.localeCompare(a.opprettet))[0];
        latestComment[r.id] = latest.tekst;
      }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "mitt-dashboard";
    workbook.created = new Date(today);

    addKundefordringerSheet(workbook, "Kundefordringer", today, risks, latestComment);

    const { previous, latest } = await getLatestTwoSnapshots();

    if (latest) {
      const snapshotSheet = workbook.addWorksheet(`Kundefordringer ${latest.dato}`);
      snapshotSheet.addRow(["Kunde", "Totalt utestående", "Ikke forfalt", "Forfalt", "Forfalt 91+ dager", "Risiko"]);
      styleHeaderRow(snapshotSheet.getRow(1));
      snapshotSheet.columns = [{ width: 32 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 10 }];
      for (const row of latest.rader) {
        const excelRow = snapshotSheet.addRow([
          row.leietaker,
          row.utestaende,
          row.ikkeForfalt || null,
          row.forfalt || null,
          row.forfalt91 || null,
          row.risiko ? RISK_NO[row.risiko] : null,
        ]);
        if (row.risiko) {
          excelRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: RISK_FILL[row.risiko] } };
        }
        for (let c = 2; c <= 5; c++) excelRow.getCell(c).numFmt = "#,##0";
      }

      const analyseSheet = workbook.addWorksheet(`Analyse ${latest.dato}`);
      analyseSheet.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, { width: 12 }];
      if (previous) addStatusTable(analyseSheet, `Status ${previous.dato}`, previous);
      addStatusTable(analyseSheet, `Status ${latest.dato}`, latest);

      if (previous) {
        analyseSheet.addRow(["Utvikling siden sist"]);
        const devHeader = analyseSheet.addRow(["", previous.dato, latest.dato, "%"]);
        devHeader.font = { bold: true };
        const prevGroups = groupByRisk(previous.rader).groups;
        const latestGroups = groupByRisk(latest.rader).groups;
        for (const riskNo of [2, 3]) {
          const from = prevGroups[riskNo].forfalt;
          const to = latestGroups[riskNo].forfalt;
          const row = analyseSheet.addRow([`Forfalt (Risiko ${riskNo})`, from, to, pctChange(from, to)]);
          row.getCell(4).numFmt = "0%";
        }
        for (const riskNo of [2, 3]) {
          const from = prevGroups[riskNo].forfalt91;
          const to = latestGroups[riskNo].forfalt91;
          const row = analyseSheet.addRow([`91+ dager (Risiko ${riskNo})`, from, to, pctChange(from, to)]);
          row.getCell(4).numFmt = "0%";
        }
      } else {
        analyseSheet.addRow(["Ingen tidligere periode å sammenligne med ennå — trykk «Start ny periode» igjen senere for å få en sammenligning."]);
      }
    } else {
      const infoSheet = workbook.addWorksheet("Kundefordringer (periode)");
      infoSheet.addRow(["Ingen periode er lagret ennå. Trykk «Start ny periode» på Kundefordringer-kortet for å lagre dagens status som første periode."]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Kundefordringer_${today}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
