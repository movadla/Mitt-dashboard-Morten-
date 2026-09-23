import { Eye } from "lucide-react";
import { CARD_SHELL } from "../../CardShell";
import IncomeForecastSection from "../../IncomeForecastSection";

// Delt, skrivebeskyttet visning av Inntektsprognosen for økonomisjef/utleiesjef (2026-09-23,
// se middleware.ts). Gjenbruker IncomeForecastSection direkte (samme live Redis-data som
// hoveddashboardet - oppdaterer seg automatisk, ingen egen eksport å vedlikeholde), men
// mutasjons-kall (kommentarer, vurderingsmerker, manuelle linjer osv.) blokkeres i
// middleware.ts - knappene for dette er derfor fortsatt synlige, men lagrer ikke noe herfra.
export default function DeltInntektsprognosePage() {
  return (
    <div className="min-h-screen bg-surface-0 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-2 text-ink-3 text-xs">
          <Eye className="h-4 w-4" />
          <span>Delt, skrivebeskyttet visning — endringer (kommentarer, vurderinger o.l.) lagres ikke herfra</span>
        </div>
        <div className={`${CARD_SHELL} overflow-hidden`}>
          <IncomeForecastSection />
        </div>
      </div>
    </div>
  );
}
