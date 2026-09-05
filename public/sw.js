// Bumpet fra v2 → v3 fordi navigasjons-strategien er endret: den gamle
// cachen kan inneholde et innloggingssvar lagret av forrige versjon, som vi
// nå bevisst aldri vil servere. activate-handleren under sletter alle
// cacher som ikke matcher CACHE_NAME, så bumpen tømmer den gamle.
const CACHE_NAME = "mitt-dashboard-v3";
const APP_SHELL = ["/", "/manifest.webmanifest"];

// Hvor lenge en oppstart maks skal vente på nettverket før vi viser cachen.
// 2 sekunder: lavt nok til at det ikke oppleves som "blank skjerm", høyt nok
// til at et normalt svar rekker fram først (og dermed alltid er ferskt).
const NAV_TIMEOUT_MS = 2000;

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

  // Sidenavigasjon (HTML/RSC): nettverk først, MEN med tidsavbrudd.
  //
  // Innloggingsstatus (PIN-cookie) kan ha endret seg akkurat nå — cache først
  // ville av og til vist en gammel mellomlagret side (f.eks. innloggings-
  // skjermen) på nytt rett etter en vellykket PIN-innlogging, som så ut som
  // at innloggingen ikke tok. Derfor foretrekkes nettverket fortsatt.
  //
  // Uten tidsavbrudd betydde det derimot at HVER oppstart ventet på et fullt
  // nettverkssvar før noe som helst ble tegnet — på dårlig mobildekning ga
  // det flere sekunder blank skjerm fra hjem-skjermen, selv med en brukbar
  // kopi i cachen. Nå vinner cachen hvis nettverket bruker mer enn
  // NAV_TIMEOUT_MS, og nettverkssvaret oppdaterer cachen når det lander.
  //
  // Innloggings-fellen er lukket separat: vi cacher ALDRI et svar som er
  // (eller ble omdirigert til) /login, så et stale cache-treff kan ikke være
  // innloggingsskjermen.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cachePromise = caches.match(request);

        const networkPromise = fetch(request)
          .then((res) => {
            if (!isLoginResponse(res)) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return res;
          })
          .catch(() => null);

        const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), NAV_TIMEOUT_MS));
        const winner = await Promise.race([networkPromise, timeout]);

        if (winner && winner !== "timeout") return winner;

        // Nettverket var tregt eller feilet — vis cachen hvis vi har en.
        const cached = await cachePromise;
        if (cached) return cached;

        // Ingen cache: da må vi vente på nettverket likevel.
        const late = await networkPromise;
        if (late) return late;
        return Response.error();
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
