import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getContractExpiry2026Snapshot } from "@/lib/contractExpiry2026";
import { localDateString } from "@/lib/payday";

export const dynamic = "force-dynamic";

const HEADER_FILL = "FF144623";
const STATUS_LABEL: Record<string, string> = { apen: "Åpen", reforhandlet: "Reforhandlet" };
const STATUS_FILL: Record<string, string> = { reforhandlet: "FFC6EFCE", apen: "FFFFEB9C" };

const HEADERS = ["Leietaker", "Bygg", "Kontraktsnøkkel", "Status", "Ny kontraktsnøkkel", "Utløpsdato", "Årsleie", "Ekstra i 2026 hvis fornyet"];
const EKSTRA_HEADERS = ["Leietaker", "Bygg", "Kontraktsnøkkel", "Utløpsdato", "Ekstra i 2026 hvis fornyet"];

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
}

export async function GET() {
  try {
    const snapshot = await getContractExpiry2026Snapshot();
    const today = localDateString();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "mitt-dashboard";
    workbook.created = new Date(today);

    const sheet = workbook.addWorksheet("Kontrakter utløper 2026");
    sheet.addRow(HEADERS);
    styleHeaderRow(sheet.getRow(1));
    sheet.columns = [{ width: 32 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 20 }];

    if (snapshot) {
      for (const c of snapshot.contracts) {
        const row = sheet.addRow([
          c.leietaker,
          c.bygg,
          c.kontraktsnokkel,
          STATUS_LABEL[c.status] ?? c.status,
          c.nyKontraktsnokkel ?? "",
          c.maxSlutt,
          c.totalArsleie,
          c.ekstraI2026,
        ]);
        row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[c.status] } };
        row.getCell(7).numFmt = "#,##0";
        row.getCell(8).numFmt = "#,##0";
      }
    }

    const ekstraSheet = workbook.addWorksheet("Ekstra 2026 pr leietaker");
    ekstraSheet.addRow(EKSTRA_HEADERS);
    styleHeaderRow(ekstraSheet.getRow(1));
    ekstraSheet.columns = [{ width: 32 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 20 }];

    if (snapshot) {
      for (const p of snapshot.ekstraI2026PerLeietaker) {
        for (const k of p.kontrakter) {
          const row = ekstraSheet.addRow([p.leietaker, k.bygg, k.kontraktsnokkel, k.maxSlutt, k.ekstraI2026]);
          row.getCell(5).numFmt = "#,##0";
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Kontrakter_utlop_2026_${today}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
