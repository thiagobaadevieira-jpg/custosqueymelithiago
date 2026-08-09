const CACHE_NAME = 'controle-gastos-v5';

// Extrai os caminhos /assets/*.js|css do HTML e cacheia (nomes têm hash do build)
async function cacheShellAssets(cache, html) {
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(
    [...new Set(assets)].map((url) =>
      cache.match(url).then((hit) => (hit ? null : cache.add(url).catch(() => {})))
    )
  );
}

// ─── Push recebido do servidor (Web Push via Supabase Edge Function) ──────────
self.addEventListener('push', (event) => {
  let data = { title: 'Gastos Queymeli e Thiago', body: 'Você lembrou de anotar os seus gastos hoje?' };
  try {
    if (event.data) data = { ...data, ...JSON.parse(event.data.text()) };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge.svg',
      vibrate: [200, 100, 200],
      tag: 'remind-gastos',
    })
  );
});

// Clique na notificação abre o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});

// ─── Install / Activate / Fetch (cache) ──────────────────────────────────────

self.addEventListener('install', (event) => {
  // Pré-cacheia o app shell COMPLETO (HTML + JS/CSS com hash) para abrir offline.
  // Sem os assets, o HTML cacheado carrega mas a tela fica branca.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const res = await fetch('/');
      if (res && res.status === 200) {
        await cache.put('/', res.clone());
        await cacheShellAssets(cache, await res.text());
      }
    })().catch(() => {}) // rede instável não pode impedir a instalação
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  if (request.mode === 'navigate' || request.url.endsWith('.html')) {
    // Network-first; sucesso atualiza HTML + assets no cache, falha cai no cache
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(async (cache) => {
              await cache.put('/', toCache.clone());
              cacheShellAssets(cache, await toCache.text()).catch(() => {});
            });
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => Response.error());
    })
  );
});
