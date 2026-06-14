/* Minimāls service worker — "instalējams" kritērijs (fetch handler) + pamata
   bezsaistes čaula.

   Navigācijas (HTML dokumenti) NETIEK kešoti: tiešsaistē vienmēr atgriež svaigu
   tīkla HTML (ar aktuālajiem chunk hash), bezsaistē atkāpjas uz instalācijas laikā
   pre-kešoto čaulu (konsekvents vecāks momentuzņēmums). Tas novērš "stale shell" /
   chunk-mismatch balto ekrānu — agrāk dokuments tika kešots vienā statiskā kešā un
   pēc deploy varēja atsaukties uz vairs neeksistējošiem chunk hash.

   Pārējie same-origin GET (satura-adresētie Turbopack chunk + ikonas) tiek kešoti
   network-first; tie ir imūni pret novecošanu, jo jaunam buildam ir jauni URL.

   WebSocket / cita-domēna pieprasījumi netiek skarti. `activate` izdzēš VISUS
   iepriekšējo versiju kešus, tāpēc CACHE versija jāpalielina laidienos, kas maina
   kešotos aktīvus (statisks SW nevar pats atvasināt build id). */
const CACHE = "domino-poker-v2.8";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// Novērojamība (m12): kešošanas kļūdas paliek NE-fatālas (SW nedrīkst lauzt lapu),
// bet dev vidē (localhost) tās tiek izvadītas, lai PWA/bezsaistes regresijas
// nepaliktu klusas. Produkcijā (reāls domēns) izvads paliek kluss — bez uzvedības maiņas.
const IS_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
function warnSw(context, error) {
  if (IS_DEV) console.warn(`[sw] ${context}`, error);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((error) => warnSw("precache failed", error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigācijas (HTML dokumenti): network-first BEZ kešošanas — tiešsaistē svaiga
  // čaula ar aktuālajiem chunk hash; bezsaistē pre-kešotā sākumlapa.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // Statiskie aktīvi (satura-adresēti): network-first ar kešošanu; bezsaistē kešs.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch((error) => warnSw("cache put failed", error));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
