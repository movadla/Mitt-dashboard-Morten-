// Bumpet fra v2 → v3 fordi navigasjons-strategien er endret: den gamle
// cachen kan inneholde et innloggingssvar lagret av forrige versjon, som vi
// nå bevisst aldri vil servere. activate-handleren under sletter alle
// cacher som ikke matcher CACHE_NAME, så bumpen tømmer den gamle.
// v4: push- og notificationclick-håndterere lagt til (morgenbrief).
// v5 (2026-09-28, Morten: "hvit i 2-3 sekunder når jeg åpner den fra
// hjemskjermen") - navigasjon var nettverk-først MED et 2s-tidsavbrudd før
// cachen ble vist, altså en garantert opptil-2-sekunders hvit skjerm på alt
// annet enn et lynraskt svar. Nå cache-først med bakgrunns-revalidering,
// samme mønster som de statiske filene under - trygt fordi vi (fortsatt)
// ALDRI cacher et innloggingssvar (se isLoginResponse), så et cache-treff
// kan ikke være en foreldet innloggingsskjerm.
const CACHE_NAME = "mitt-dashboard-v5";
const APP_SHELL = ["/", "/manifest.webmanifest"];

// Et svar som ER innloggingssiden, eller ble omdirigert dit av middlewaren.
// Slike skal aldri i cachen — se resonnementet i navigate-grenen under.
function isLoginResponse(res) {
  try {
    return res.redirected || new URL(res.url).pathname.startsWith("/login");
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ─── Morgenbrief (web push) ────────────────────────────────────────────────
// Sendt av /api/cron/morning-brief. Nyttelasten er JSON med title/body/url.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Mitt dashboard";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Fast tag: en ny morgenbrief skal ERSTATTE gårsdagens hvis den fortsatt
      // ligger ulest, ikke stable seg opp til en liste med gamle dager.
      tag: "morgenbrief",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Fokuser et allerede åpent vindu i stedet for å åpne enda et — på iOS
      // ville hvert varseltrykk ellers startet PWA-en på nytt.
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API-ruter: nettverk først (ferske data er poenget), men lagre siste svar
  // slik at vi har noe å vise når du er frakoblet.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Sidenavigasjon (HTML/RSC): cache først, revalider i bakgrunnen (v5,
  // 2026-09-28) - samme mønster som de statiske filene under. Appen skal
  // males INSTANT fra hjem-skjermen, ikke vente på et nettverkssvar i det
  // hele tatt når vi allerede har noe å vise.
  //
  // Trygt fordi vi ALDRI cacher et innloggingssvar (se isLoginResponse under)
  // - et cache-treff kan derfor ikke være en foreldet innloggingsskjerm rett
  // etter en vellykket PIN-innlogging (det var den opprinnelige grunnen til
  // at navigasjon tidligere foretrakk nettverket - se git-historikk for
  // v2→v3). Selve dataene i appen hentes uansett alltid ferskt klientsidig
  // (SWR/useEffect, jf. CLAUDE.md) - en et par minutter gammel HTML-skal
  // endrer ikke hvilke tall som vises.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        const revalidate = fetch(request)
          .then((res) => {
            if (!isLoginResponse(res)) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return res;
          })
          .catch(() => null);

        if (cached) return cached;

        // Ingen cache ennå (aller første besøk) - må vente på nettverket.
        const res = await revalidate;
        return res || Response.error();
      })(),
    );
    return;
  }

  // Statiske filer (JS/CSS/bilder): cache først, hent på nytt i bakgrunnen.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    }),
  );
});
