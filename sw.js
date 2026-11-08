// Service worker: guarda o app no aparelho para funcionar sem internet.
// Ao publicar uma versão nova, mude o número abaixo (e APP_VERSION no app.js).
const CACHE = 'rapport-delta-v1.2.0';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'xlsx.js', 'custos.js', 'ocr/tesseract.min.js', 'pdf-lib.min.js', 'manifest.webmanifest', 'logo.png',
  'icons2/dl-192.png', 'icons2/dl-512.png', 'icons2/dl-180.png', 'icons2/dl-maskable-512.png'];
// cache: 'reload' = baixa da internet, sem usar o cache do navegador (senão a versão nova pode guardar arquivos velhos)
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))); });
// os dois apps (Frigotec e Deltafrigo) ficam no mesmo site e dividem o cache: apaga só os caches deste app
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('rapport-delta-v') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// leitor de notas (pasta ocr/, ~11 MB): não baixa na instalação; guarda no aparelho na 1ª vez que for usado
const OCR_CACHE = 'rapport-delta-ocr-1';
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (/\/ocr\/[^/]+$/.test(new URL(e.request.url).pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(OCR_CACHE).then(c => c.put(e.request, cp)); } return res; })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
