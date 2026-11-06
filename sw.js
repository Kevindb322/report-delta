// Service worker: guarda o app no aparelho para funcionar sem internet.
// Ao publicar uma versão nova, mude o número abaixo (e APP_VERSION no app.js).
const CACHE = 'rapport-delta-v1.0.8';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'pdf-lib.min.js', 'manifest.webmanifest', 'logo.png',
  'icons2/dl-192.png', 'icons2/dl-512.png', 'icons2/dl-180.png', 'icons2/dl-maskable-512.png'];
// cache: 'reload' = baixa da internet, sem usar o cache do navegador (senão a versão nova pode guardar arquivos velhos)
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))); });
// os dois apps (Frigotec e Deltafrigo) ficam no mesmo site e dividem o cache: apaga só os caches deste app
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('rapport-delta-v') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
