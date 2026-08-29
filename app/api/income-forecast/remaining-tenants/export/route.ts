import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getRemainingTenantsSnapshot, type RemainingByggStatus } from "@/lib/incomeForecastRemainingTenants";
import { localDateString } from "@/lib/payday";

export const dynamic = "force-dynamic";

const HEADER_FILL = "FF144623";

const STATUS_LABEL: Record<RemainingByggStatus, string> = {
  ok: "OK",
  avsluttet: "Avsluttet, nullstilt",
  "ikke-matchet-i-nxt": "Ikke funnet i NXT",
  "forklart-omsetningsleie": "Omsetningsleie i NXT",
  "forklart-kontraktsendring": "Kontraktsendring i år",
  "forklart-engangsgebyr": "Engangsgebyr (exit fee)",
  "forklart-nxt-feilkoding": "Feilkoding i NXT",
  "intern-mustad": "Intern (Mustad selv)",
  "forklart-parkering-onepark": "Onepark-estimat lagt til",
};

const STATUS_FILL: Record<Exclude<RemainingByggStatus, "ok">, string> = {
  avsluttet: "FFFFC7CE",
  "ikke-matchet-i-nxt": "FFBDD7EE",
  "forklart-omsetningsleie": "FFFFEB9C",
  "forklart-kontraktsendring": "FFFFEB9C",
  "forklart-engangsgebyr": "FFFFEB9C",
  "forklart-nxt-feilkoding": "FFFFEB9C",
  "intern-mustad": "FFD9D9D9",
  "forklart-parkering-onepark": "FFC6E0B4",
};

const HEADERS = ["Leietaker", "Bygg", "Status", "Full årsverdi 2026", "Allerede fakturert (NXT)", "Gjenstår", "Forklaring"];

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
}

export async function GET() {
  try {
    const snapshot = await getRemainingTenantsSnapshot();
    const today = localDateString();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "mitt-dashboard";
    workbook.created = new Date(today);

    const sheet = workbook.addWorksheet("Leieforhold til gjennomgang");
    sheet.addRow(HEADERS);
    styleHeaderRow(sheet.getRow(1));
    sheet.columns = [{ width: 30 }, { width: 26 }, { width: 20 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 70 }];

    if (snapshot) {
      const reviewStatuses: RemainingByggStatus[] = [
        "ikke-matchet-i-nxt",
        "forklart-omsetningsleie",
        "forklart-kontraktsendring",
        "avsluttet",
        "intern-mustad",
      ];
      const rows = snapshot.tenants
        .flatMap((t) =>
          t.byggGrupper
            .filter((b) => reviewStatuses.includes(b.status))
            .map((b) => ({
              leietaker: t.navn,
              bygg: b.bygg,
              status: b.status,
              fullArsverdi: b.fullArsverdi2026DelA + b.fullArsverdi2026DelB,
              alleredeFakturert: b.alleredeFakturertDelA + b.alleredeFakturertDelB,
              gjenstar: b.gjenstarTotal,
              forklaring: b.forklaring ?? "",
            })),
        )
        .sort((a, b) => b.fullArsverdi - a.fullArsverdi);

      for (const r of rows) {
        const row = sheet.addRow([r.leietaker, r.bygg, STATUS_LABEL[r.status], r.fullArsverdi, r.alleredeFakturert, r.gjenstar, r.forklaring]);
        if (r.status !== "ok") {
          row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[r.status] } };
        }
        for (const c of [4, 5, 6]) row.getCell(c).numFmt = "#,##0";
        row.getCell(7).alignment = { wrapText: true };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Inntektsprognose_leieforhold_til_gjennomgang_${today}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
