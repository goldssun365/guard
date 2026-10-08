/* 경비초소 기록 — 서비스 워커 (오프라인 실행용)
 * 화면(index.html): 인터넷이 되면 항상 최신 버전을 받아오고, 안 되면 저장해 둔 화면을 띄움
 * 아이콘·설정 파일·엑셀 엔진·글꼴: 저장해 둔 것을 바로 사용하고 뒤에서 갱신
 */
const CACHE = "guard-v12.0";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
const EXTERNAL = ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of SHELL) { try { await cache.add(new Request(url, { cache: "reload" })); } catch (e) {} }
    for (const url of EXTERNAL) { try { await cache.add(new Request(url, { mode: "no-cors" })); } catch (e) {} }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("guard-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await Promise.race([fetch(req, { cache: "no-store" }), timeout(4000)]);
        if (fresh && fresh.ok) { cache.put("./index.html", fresh.clone()); return fresh; }
        throw new Error("bad response");
      } catch (e) {
        return (await cache.match("./index.html")) || (await cache.match("./")) ||
          new Response("<h2 style='font-family:sans-serif;padding:24px'>인터넷 연결 후 한 번 열어주세요.</h2>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const allowedExternal = /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname);
  if (!sameOrigin && !allowedExternal) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: sameOrigin });
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response("", { status: 504 });
  })());
});
