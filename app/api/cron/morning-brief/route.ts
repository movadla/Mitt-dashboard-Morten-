import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { buildMorningBrief } from "@/lib/morningBrief";
import { getSubscriptions, removeSubscription } from "@/lib/pushSubscriptions";

export const dynamic = "force-dynamic";

// Samme autorisering som app/api/cron/receivables-snapshot/route.ts — Vercel
// legger selv på "Authorization: Bearer <CRON_SECRET>" på cron-kall.
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "VAPID-nøkler mangler i miljøet" }, { status: 500 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:morten.vadla@mustadeiendom.no", publicKey, privateKey);

  const brief = await buildMorningBrief();
  // En daglig push som sier "ingenting i dag" lærer deg på under en uke å
  // ignorere alle varslene fra appen. Da er hele funksjonen verdiløs.
  if (!brief.harInnhold) {
    return NextResponse.json({ ok: true, sendt: 0, grunn: "ingenting å melde" });
  }

  const subscriptions = await getSubscriptions();
  let sendt = 0;
  let fjernet = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title: brief.title, body: brief.body, url: "/" }),
        );
        sendt++;
      } catch (err) {
        // 404/410 fra push-tjenesten betyr at abonnementet er dødt (appen
        // avinstallert, varsler slått av på enheten). Da skal det ryddes bort,
        // ellers vokser lista med endepunkter som aldri kan nås igjen.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(sub.endpoint);
          fjernet++;
        } else {
          console.error("Morgenbrief: push feilet", statusCode, err);
        }
      }
    }),
  );

  return NextResponse.json({ ok: true, sendt, fjernet, total: subscriptions.length });
}
