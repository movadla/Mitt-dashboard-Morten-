import { NextResponse } from "next/server";
import { getRyggDailyLogs, getRyggSessionLogs } from "@/lib/ryggLog";

export const dynamic = "force-dynamic";

// Semikolon-separert og komma som desimaltegn — norsk Excel-lokalitet, ikke
// RFC 4180-standarden (komma+punktum), siden dette er ment å åpnes direkte
// i Excel/Numbers på norsk oppsett (jf. DESIGN.md: norsk tall-/valutaformat).
function csvField(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return "";
  const str = typeof value === "number" ? value.toString().replace(".", ",") : typeof value === "boolean" ? (value ? "Ja" : "Nei") : value;
  if (/[;"\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(fields: (string | number | boolean | undefined | null)[]): string {
  return fields.map(csvField).join(";");
}

export async function GET() {
  try {
    const [dailyLogs, sessionLogs] = await Promise.all([getRyggDailyLogs(), getRyggSessionLogs()]);

    const lines: string[] = [];
    lines.push(csvRow(["Dato", "Type", "Smerte (0-10)", "Utstråling", "Gikk 20+ min", "Uke", "Øktnr", "Variant", "Fullført", "RPE (1-10)", "Etterreaksjon", "Notat"]));

    for (const d of dailyLogs) {
      lines.push(csvRow([d.date, "Dagslogg", d.pain, d.radiating, d.walked, "", "", "", "", "", "", d.note]));
    }
    for (const s of sessionLogs) {
      lines.push(csvRow([s.date, "Økt", "", "", "", s.week, s.sessionNo, s.variant, s.completed, s.rpe, s.aggravated, s.note]));
    }

    const csv = "﻿" + lines.join("\r\n"); // BOM slik at Excel tolker UTF-8 (æøå) riktig
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rygg-logg-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
