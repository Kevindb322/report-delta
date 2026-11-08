'use strict';
/* TESTE – Custos de viagem (fora do Relatório Deltafrigo).
   Depois de aprovado, entra no app como uma aba nova e as páginas vão no fim do PDF do relatório.
   - Serviço no Brasil: cada gasto tem um valor em R$; total em R$.
   - Serviço no exterior: moeda local (a da nota) e moeda utilizada (a cobrada), cada gasto com os dois valores,
     total nas duas moedas. Não converte por câmbio: cada banco tem seu spread, então o valor utilizado é digitado.
   - Foto da nota: o OCR (Tesseract, roda no aparelho) tenta achar o TOTAL e põe no campo da moeda local (ou R$).
     O campo fica laranja ("lido da nota") e pode ser corrigido.
   - PDF: tabela com todos os gastos (os sem nota aparecem só aqui) + folhas com as notas, por data, sem assinaturas.
   Dados: IndexedDB 'custosTeste' (nome próprio para não misturar com os apps). */

const $ = id => document.getElementById(id);
const MOEDAS = {
  CLP: { nome: 'Peso chileno', dec: 0 },
  USD: { nome: 'Dólar americano', dec: 2 },
  EUR: { nome: 'Euro', dec: 2 },
  BRL: { nome: 'Real brasileiro', dec: 2 }
};
const MOEDA_SIMB = { CLP: '$', USD: 'US$', EUR: '€', BRL: 'R$' };
const pad2 = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const isoTxt = iso => iso ? iso.split('-').reverse().join('/') : '';
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ------------------------------------------------------------ números e moedas */
function fmtNum(v, cur) {
  const dec = MOEDAS[cur] ? MOEDAS[cur].dec : 2;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMoney(v, cur) {           // 360.452 CLP · 325,76 EUR · R$ 1.234,56
  if (v === null || v === undefined || isNaN(v)) return '';
  return cur === 'BRL' ? 'R$ ' + fmtNum(v, cur) : fmtNum(v, cur) + ' ' + cur;
}
// entende 360.452 · 360,452 (CLP) · 325,76 · 325.76 · 1.234,56 · 1,234.56 · 12 345,60
function parseValor(str) {
  let s = String(str || '').replace(/[oO](?=\d)|(?<=\d)[oO]/g, '0').replace(/\s(?=\d{3}\b)/g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(',');
  if (lastDot >= 0 && lastCom >= 0) {
    const dec = lastDot > lastCom ? '.' : ',', th = dec === '.' ? ',' : '.';
    s = s.split(th).join('').replace(dec, '.');
  } else if (lastDot >= 0 || lastCom >= 0) {
    const sep = lastDot >= 0 ? '.' : ',', parts = s.split(sep), last = parts[parts.length - 1];
    s = (parts.length > 2 || last.length === 3) ? parts.join('') : parts.slice(0, -1).join('') + '.' + last;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------ dados */
let doc = { cliente: '', numero: '', exterior: null, moedaLocal: 'CLP', moedaUsada: 'EUR', colunas: 3, itens: [] };
const DBN = 'custosTeste';
function idb() { return new Promise((ok, err) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); }); }
async function dbGet() { const db = await idb(); return new Promise(ok => { const r = db.transaction('kv').objectStore('kv').get('doc'); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); }); }
async function dbPut() { const db = await idb(); return new Promise(ok => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(doc, 'doc'); t.oncomplete = ok; t.onerror = () => { toast('Não foi possível guardar no aparelho.', 'warn'); ok(); }; }); }
let saveT; function save() { clearTimeout(saveT); saveT = setTimeout(dbPut, 300); }
const curLocal = () => doc.exterior ? doc.moedaLocal : 'BRL';

/* ------------------------------------------------------------ util de tela */
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'value') e.value = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
let toastT; function toast(m, cls, ms) { const t = $('toast'); t.textContent = m; t.className = 'show ' + (cls || ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = '', ms || 3500); }
function openSheet(kids) { const s = $('sheet'); s.innerHTML = ''; s.append(...kids.filter(Boolean)); s.hidden = false; $('scrim').hidden = false; }
function hideSheet() { $('sheet').hidden = true; $('scrim').hidden = true; }
$('scrim').addEventListener('click', hideSheet);

/* ------------------------------------------------------------ tela */
function renderTop() {
  $('cliente').value = doc.cliente; $('numero').value = doc.numero;
  for (const b of $('segExt').children) b.classList.toggle('on', doc.exterior === (b.dataset.v === '1'));
  $('moedas').hidden = !doc.exterior;
  for (const [segId, key] of [['segLocal', 'moedaLocal'], ['segUsada', 'moedaUsada']]) {
    const seg = $(segId); seg.innerHTML = '';
    for (const c of Object.keys(MOEDAS)) seg.append(el('button', { type: 'button', class: doc[key] === c ? 'on' : '', onclick: () => setMoeda(key, c) },
      c, el('small', null, MOEDA_SIMB[c] + ' ' + MOEDAS[c].nome.split(' ')[0])));
  }
  $('hintMoeda').textContent = doc.exterior === null ? 'Escolha primeiro: a lista de gastos aparece depois.'
    : doc.exterior ? (doc.moedaLocal === doc.moedaUsada ? 'Moeda local e utilizada iguais: só um valor por gasto.' : 'Cada gasto terá o valor em ' + doc.moedaLocal + ' (da nota) e em ' + doc.moedaUsada + ' (o que foi cobrado).')
    : 'Cada gasto terá só o valor em R$. No fim sai o total em reais.';
  $('gastosSec').hidden = doc.exterior === null; $('actions').hidden = doc.exterior === null;
}
function setMoeda(key, c) { doc[key] = c; save(); renderTop(); renderGastos(); }
$('segExt').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; doc.exterior = b.dataset.v === '1'; save(); renderTop(); renderGastos(); });
$('cliente').addEventListener('input', e => { doc.cliente = e.target.value; save(); });
$('numero').addEventListener('input', e => { doc.numero = e.target.value; save(); });

const dupla = () => doc.exterior && doc.moedaLocal !== doc.moedaUsada;
function moneyInput(it, key, cur) {
  const isAuto = key === 'vLocal' ? it.auto : it.autoUsado;
  const i = el('input', { class: 'money' + (isAuto ? ' auto' : ''), inputmode: 'decimal', autocomplete: 'off', placeholder: 'digite',
    value: it[key] === null || it[key] === undefined ? '' : fmtNum(it[key], cur) });
  i.addEventListener('input', () => { it[key] = parseValor(i.value); if (key === 'vLocal' && it.ocr === 'fail') { it.ocr = null; const ch = i.closest('.gasto').querySelector('.chip.fail'); if (ch) ch.remove(); } if (key === 'vUsado' && it.autoUsado) { it.autoUsado = false; i.classList.remove('auto'); } if (key === 'vLocal' && it.auto) { it.auto = false; i.classList.remove('auto'); const ch = i.closest('.gasto').querySelector('.chip.ok'); if (ch) ch.remove(); } save(); renderTotais(); });
  i.addEventListener('blur', () => { i.value = it[key] === null ? '' : fmtNum(it[key], cur); });
  return i;
}
function renderGastos() {
  const box = $('gastos'); box.innerHTML = '';
  const its = [...doc.itens].sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.criado - b.criado);
  $('cntGastos').textContent = its.length ? its.length + (its.length === 1 ? ' gasto' : ' gastos') + ' · ' + its.filter(i => i.img).length + ' com nota' : '';
  for (const it of its) {
    const cl = curLocal();
    const vals = dupla()
      ? el('div', { class: 'vals' }, el('label', { class: 'f' }, el('span', null, 'Moeda local (' + doc.moedaLocal + ')'), moneyInput(it, 'vLocal', doc.moedaLocal)),
          el('label', { class: 'f' }, el('span', null, 'Moeda utilizada (' + doc.moedaUsada + ')'), moneyInput(it, 'vUsado', doc.moedaUsada)))
      : el('div', { class: 'vals one' }, el('label', { class: 'f' }, el('span', null, 'Valor (' + (cl === 'BRL' ? 'R$' : cl) + ')'), moneyInput(it, 'vLocal', cl)));
    const desc = el('input', { value: it.desc, placeholder: 'Ex.: Mercado, combustível, hotel…', autocomplete: 'off' });
    desc.addEventListener('input', () => { it.desc = desc.value; save(); });
    const data = el('input', { type: 'date', value: it.data });
    data.addEventListener('change', () => { it.data = data.value; save(); renderGastos(); });
    const chip = it.ocr === 'busy' ? el('span', { class: 'chip busy' }, el('span', { class: 'spin' }), 'Lendo o valor da nota…')
      : it.ocr === 'ok' && (it.auto || it.autoUsado) ? el('span', { class: 'chip ok' }, '⚠ ' + (it.auto && it.autoUsado && dupla() ? 'Valores lidos' : 'Valor lido') + ' da imagem: confira')
      : it.ocr === 'fail' ? el('span', { class: 'chip fail' }, 'Não consegui ler o total: digite o valor') : null;
    const body = el('div', null,
      el('div', { class: 'top' }, el('label', { class: 'f', style: 'max-width:170px' }, el('span', null, 'Data'), data),
        el('button', { type: 'button', class: 'del', title: 'Excluir', onclick: () => delGasto(it) }, '🗑')),
      el('label', { class: 'f' }, el('span', null, 'Descrição'), desc), vals, chip,
      !it.img && el('div', { class: 'addnotas' }, el('span', null, 'Anexar a nota:'),
        el('button', { type: 'button', class: 'addnota', onclick: () => pickFoto(it, true) }, '📷 câmera'),
        el('button', { type: 'button', class: 'addnota', onclick: () => pickFoto(it, false) }, '🖼️ galeria')));
    if (it.img) {
      const th = el('div', { class: 'thumb', style: 'background-image:url(' + it.img + ')', onclick: e => { if (!e.target.closest('.tools')) verNota(it); } },
        el('div', { class: 'tools' }, el('button', { type: 'button', onclick: () => girar(it) }, '⟳'), el('button', { type: 'button', onclick: () => tirarNota(it) }, '✕')));
      box.append(el('div', { class: 'gasto' }, th, body));
    } else box.append(el('div', { class: 'gasto semnota' }, body));
  }
  renderTotais();
}
function totais() {
  const t = { local: 0, usado: 0, faltaUsado: 0, faltaLocal: 0 };
  for (const it of doc.itens) {
    if (it.vLocal === null || it.vLocal === undefined) t.faltaLocal++; else t.local += it.vLocal;
    if (dupla()) { if (it.vUsado === null || it.vUsado === undefined) t.faltaUsado++; else t.usado += it.vUsado; }
  }
  if (!dupla()) t.usado = t.local;
  return t;
}
function renderTotais() {
  const b = $('totais'), t = totais(), n = doc.itens.length; b.innerHTML = '';
  if (!n) { b.append(el('p', { class: 'hint', style: 'margin:0' }, 'Nenhum gasto ainda. Fotografe uma nota ou adicione um gasto sem nota.')); return; }
  const rows = [];
  if (dupla()) {
    rows.push(el('tr', null, el('td', null, 'Total na moeda local'), el('td', null, fmtMoney(t.local, doc.moedaLocal))));
    rows.push(el('tr', { class: 'grand' }, el('td', null, 'Total gasto na viagem'), el('td', null, fmtMoney(t.usado, doc.moedaUsada))));
  } else rows.push(el('tr', { class: 'grand' }, el('td', null, doc.exterior ? 'Total gasto na viagem' : 'Total em reais'), el('td', null, fmtMoney(t.local, curLocal()))));
  b.append(el('h3', null, 'Totais'), el('table', null, rows));
  const falta = [t.faltaLocal && t.faltaLocal + ' sem valor' + (dupla() ? ' na moeda local' : ''), t.faltaUsado && t.faltaUsado + ' sem valor na moeda utilizada'].filter(Boolean);
  if (falta.length) b.append(el('div', { class: 'warnbox' }, 'Atenção: ' + falta.join(' e ') + '. Esses gastos não entram no total.'));
}

/* ------------------------------------------------------------ gastos */
function novoGasto() { return { id: newId(), criado: Date.now(), data: todayISO(), desc: '', vLocal: null, vUsado: null, img: null, imgW: 0, imgH: 0, ocr: null, auto: false, autoUsado: false }; }
$('bManual').addEventListener('click', () => { const it = novoGasto(); doc.itens.push(it); save(); renderGastos(); toast('Gasto adicionado. Preencha a descrição e o valor.'); });
let fotoAlvo = null;
// câmera: input com capture (abre direto a câmera traseira); galeria: input sem capture
function pickFoto(it, cam) { fotoAlvo = it || null; $(cam ? 'fCam' : 'fFoto').click(); }
$('bCam').addEventListener('click', () => pickFoto(null, true));
$('bFoto').addEventListener('click', () => pickFoto(null, false));
for (const id of ['fFoto', 'fCam']) $(id).addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let it = fotoAlvo; fotoAlvo = null;
  try {
    const im = await loadImage(f);
    if (!it) { it = novoGasto(); doc.itens.push(it); }
    const c = toCanvas(im, 2000); it.img = c.toDataURL('image/jpeg', 0.82); it.imgW = c.width; it.imgH = c.height;
    it.ocr = 'busy'; save(); renderGastos();
    lerNota(it);
  } catch (err) { console.error(err); toast('Não foi possível abrir a imagem: ' + err.message, 'warn', 6000); }
});
function loadImage(f) { return new Promise((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => err(new Error('formato não suportado')); im.src = URL.createObjectURL(f); }); }
function toCanvas(im, max, rot) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height, k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k), c = document.createElement('canvas'), r = rot || 0;
  c.width = r % 180 ? h : w; c.height = r % 180 ? w : h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate(r * Math.PI / 180); g.drawImage(im, -w / 2, -h / 2, w, h);
  return c;
}
async function girar(it) {
  const im = await loadImage(await (await fetch(it.img)).blob()); const c = toCanvas(im, 2000, 90);
  it.img = c.toDataURL('image/jpeg', 0.82); it.imgW = c.width; it.imgH = c.height; save(); renderGastos();
  if (it.vLocal === null) { it.ocr = 'busy'; renderGastos(); lerNota(it); }
}
function tirarNota(it) { if (!confirmar('Tirar a nota deste gasto? O gasto continua, sem a imagem.')) return; it.img = null; it.ocr = null; it.auto = false; it.autoUsado = false; save(); renderGastos(); }
function delGasto(it) { if (!confirmar('Excluir este gasto' + (it.desc ? ' (' + it.desc + ')' : '') + '?')) return; doc.itens = doc.itens.filter(x => x !== it); save(); renderGastos(); }
function confirmar(m) { return window.confirm(m); }
function verNota(it) {
  openSheet([el('h2', null, it.desc || 'Nota'), el('p', null, isoTxt(it.data) + (it.vLocal !== null ? ' · ' + fmtMoney(it.vLocal, curLocal()) : '')),
    el('img', { class: 'full', src: it.img }), el('button', { type: 'button', class: 'opt', onclick: hideSheet }, 'Fechar')]);
}

/* ------------------------------------------------------------ OCR (Tesseract no aparelho) */
let workerP = null;
function getWorker() {
  if (!workerP) {
    const base = new URL('ocr/', location.href).href;
    workerP = Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true, cacheMethod: 'write' })
      .catch(e => { workerP = null; throw e; });
  }
  return workerP;
}
const ocrFila = []; let ocrRodando = false;
function lerNota(it) { ocrFila.push(it); if (!ocrRodando) rodaFila(); }
async function rodaFila() {
  ocrRodando = true;
  while (ocrFila.length) {
    const it = ocrFila.shift();
    try {
      const w = await getWorker();
      const im = await loadImage(await (await fetch(it.img)).blob());
      const c = prepOcr(im);
      const { data } = await w.recognize(c);
      const r = acharTotal(data.text), m = acharMoedas(data.text), cl = curLocal();
      console.log('OCR', data.text, r, m);
      it.ocrTexto = data.text;
      // valor da moeda local: linha do TOTAL; senão, valor com a moeda escrita (ex.: print do app do banco)
      // (se o TOTAL está escrito em outra moeda, ex.: "Gesamt EUR" com moeda local CLP, não vai para a moeda local)
      const totalOutra = r.valor !== null && m[cl] === undefined && Object.entries(m).some(([k, v]) => k !== cl && v === r.valor);
      const vl = r.valor !== null && !totalOutra ? r.valor : m[cl] !== undefined ? m[cl] : null;
      if (vl !== null && (it.vLocal === null || it.auto)) { it.vLocal = vl; it.auto = true; }
      // print do banco com as duas moedas: completa também a moeda utilizada
      if (dupla() && m[doc.moedaUsada] !== undefined && (it.vUsado === null || it.autoUsado)) { it.vUsado = m[doc.moedaUsada]; it.autoUsado = true; }
      it.ocr = it.auto || it.autoUsado ? 'ok' : 'fail';
      const dt = acharData(data.text); if (dt && it.data === todayISO()) it.data = dt;
      if (!it.desc && r.loja) it.desc = r.loja;
    } catch (e) { console.error(e); it.ocr = 'fail'; toast('Leitura automática indisponível: ' + (e.message || e), 'warn', 6000); }
    save(); if (doc.itens.includes(it)) renderGastos();
  }
  ocrRodando = false;
}
// cinza + contraste; imagem pequena (print de tela) é ampliada; fundo escuro (app do banco em modo escuro) é invertido
function prepOcr(im) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height, up = Math.min(3, Math.max(1, 1600 / Math.max(w0, h0)));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * up); c.height = Math.round(h0 * up);
  if (Math.max(c.width, c.height) > 2400) { const k = 2400 / Math.max(c.width, c.height); c.width = Math.round(c.width * k); c.height = Math.round(c.height * k); }
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data; let soma = 0;
  for (let i = 0; i < p.length; i += 4) { const y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = y; soma += y; }
  const escuro = soma / (p.length / 4) < 110;
  for (let i = 0; i < p.length; i += 4) { let y = escuro ? 255 - p[i] : p[i]; y = Math.max(0, Math.min(255, (y - 128) * 1.35 + 140)); p[i] = p[i + 1] = p[i + 2] = y; }
  g.putImageData(d, 0, 0); return c;
}
// valores com moeda escrita junto: "360.452 CLP", "325,76 EUR", "€ 12,50", "US$ 40", "R$ 89,90"
// valores com a moeda escrita colada no número: "360.452 CLP", "325,76 EUR", "€ 12,50", "US$ 40", "R$ 89,90"
// (a moeda solta na linha não vale: o OCR às vezes lê a logo da Shell como "€")
const NUMX = String.raw`\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MOEDA_TOK = [['CLP', String.raw`CLP|CH\$`], ['USD', String.raw`USD|U\$S|US\s?\$`], ['EUR', String.raw`EUR|€`], ['BRL', String.raw`BRL|R\s?\$`]];
function acharMoedas(texto) {
  const out = {};
  for (const l of texto.split('\n')) for (const [cur, tok] of MOEDA_TOK) {
    const rx = new RegExp('(?:(?:' + tok + String.raw`)\s*[:=]?\s*(` + NUMX + ')|(' + NUMX + String.raw`)\s*(?:` + tok + '))', 'gi');
    let m; while ((m = rx.exec(l))) { const v = parseValor(m[1] || m[2]); if (v !== null && v > 0) out[cur] = Math.max(out[cur] || 0, v); }
  }
  return out;
}
// marcas conhecidas: o nome impresso na nota (a logo em si, como desenho, o leitor não reconhece)
const MARCAS = [
  ['Shell', /\bshell\b|\benex\b/i], ['Copec', /\bcopec\b/i], ['Aramco', /\baramco\b/i], ['Petrobras', /petrobras/i], ['Esso', /\besso\b/i],
  ['Texaco', /texaco/i], ['Ipiranga', /ipiranga/i], ['Posto BR / Vibra', /\bvibra\b/i], ['YPF', /\bypf\b/i], ['Axion', /\baxion\b/i],
  ['Terpel', /terpel/i], ['Repsol', /repsol/i], ['Galp', /\bgalp\b/i],
  ['Jumbo', /\bjumbo\b/i], ['Líder', /\bl[ií]der\b|walmart/i], ['Unimarc', /unimarc/i], ['Santa Isabel', /santa\s*isabel/i], ['Tottus', /tottus/i],
  ['Acuenta', /acuenta/i], ['Carrefour', /carrefour/i], ['Pão de Açúcar', /p[aã]o\s*de\s*a[cç][uú]car/i], ['Assaí', /\bassa[ií]\b/i],
  ['Atacadão', /atacad[aã]o/i], ['Makro', /\bmakro\b/i], ['Lidl', /\blidl\b/i], ['Aldi', /\baldi\b/i], ['REWE', /\brewe\b/i], ['Edeka', /\bedeka\b/i],
  ['Cruz Verde', /cruz\s*verde/i], ['Salcobrand', /salcobrand/i], ['Farmacias Ahumada', /ahumada/i], ['Drogasil', /drogasil/i], ['Droga Raia', /droga\s*raia/i],
  ["McDonald's", /mc\s?donald/i], ['Burger King', /burger\s*king/i], ['Subway', /\bsubway\b/i], ['Starbucks', /starbucks/i], ['KFC', /\bkfc\b/i],
  ['Juan Valdez', /juan\s*valdez/i], ['Dunkin', /dunkin/i], ["Domino's", /domino'?s/i],
  ['Uber', /\buber\b/i], ['Cabify', /cabify/i], ['DiDi', /\bdidi\b/i], ['LATAM', /\blatam\b/i], ['Sky Airline', /sky\s*airline/i], ['JetSMART', /jet\s*smart/i],
  ['Gol', /\bgol\s*linhas/i], ['Azul', /azul\s*linhas/i], ['Hertz', /\bhertz\b/i], ['Avis', /\bavis\b/i], ['Localiza', /localiza/i], ['Movida', /\bmovida\b/i],
  ['Europcar', /europcar/i], ['Budget', /\bbudget\b/i], ['Turbus', /tur\s*bus/i], ['Pullman', /pullman/i], ['Sem Parar', /sem\s*parar/i], ['ConectCar', /conectcar/i],
  ['Costanera Norte', /costanera\s*norte/i], ['Vespucio', /vespucio/i], ['Autopista', /autopista/i],
  ['Ibis', /\bibis\b/i], ['Holiday Inn', /holiday\s*inn/i], ['Hilton', /hilton/i], ['Marriott', /marriott/i], ['Novotel', /novotel/i], ['Mercure', /mercure/i],
  ['Airbnb', /airbnb/i], ['Booking', /booking\.com/i],
  ['Sodimac', /sodimac|homecenter/i], ['Easy', /\beasy\b/i], ['Falabella', /falabella/i], ['Ripley', /ripley/i], ['Leroy Merlin', /leroy\s*merlin/i], ['Construmart', /construmart/i]
];
// linhas que não são o nome da loja: maquininha/adquirente, bandeira do cartão, tipo de documento
const NAO_LOJA = /\b(getnet|transbank|redcompra|redelcom|cielo|rede|stone|pagseguro|sumup|mercado\s*pago|visa|master\s*card|mastercard|maestro|amex|compra|afecta|v[aá]lido|boleta|factura|copia|comprobante|voucher|cliente|comercio|tarjeta|cart[aã]o|d[eé]bito|cr[eé]dito|rut|cnpj|cpf|nif|fecha|data|datum|date|ticket|cupom|cupon|nota\s*fiscal|recibo|receipt)\b/i;
const RX_NUM = /\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
function numerosDaLinha(l) { return (l.replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0').match(RX_NUM) || []).map(parseValor).filter(v => v !== null && v > 0); }
// procura a linha do TOTAL (várias línguas); ignora subtotal, IVA, troco, gorjeta…
function acharTotal(texto) {
  const lines = texto.split('\n').map(s => s.trim()).filter(Boolean), cand = [];
  const KEY = /(total|totale|gesamt|summe|monto|importe|a\s*pagar|valor\s*pago|valor\s*a\s*pagar|amount\s*due|grand)/i;
  const NOT = /(sub\s*-?\s*total|neto|iva|imp(uesto)?|tax|vat|mwst|propina|tip|troco|vuelto|cambio|change|descuento|desconto|items?|art[ií]culos|qtd|cant)/i;
  lines.forEach((l, i) => {
    if (!KEY.test(l) || NOT.test(l)) return;
    let nums = numerosDaLinha(l.replace(/.*?(total|totale|gesamt|summe|monto|importe|pagar|pago|due|grand)/i, ''));
    if (!nums.length && lines[i + 1]) nums = numerosDaLinha(lines[i + 1]);
    if (nums.length) cand.push({ v: nums[nums.length - 1], forte: /(a\s*pagar|grand|total\s*(a\s*pagar|general|eur|usd|clp|r\$)|valor\s*total|monto\s*total)/i.test(l) });
  });
  // nome da loja: primeira linha com palavra de 3+ letras, sem valores, moedas, datas, RUT/CNPJ etc.
  // nome da loja: marca conhecida (pelo nome impresso); senão, primeira linha com palavra, sem valores, moedas, datas,
  // maquininha (GETNET, Transbank…), bandeira do cartão ou tipo de documento
  const marca = MARCAS.find(([, rx]) => rx.test(texto));
  const loja = marca ? marca[0] : (lines.find(l => /[a-zA-ZÀ-ú]{3,}/.test(l) && !/\d{3,}|\d[.,]\d|\b(CLP|EUR|USD|BRL)\b|R\$|US\$|€/i.test(l) && !NAO_LOJA.test(l)) || '')
    .replace(/[^\wÀ-ú .&'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!cand.length) return { valor: null, loja };
  const fortes = cand.filter(c => c.forte), pool = fortes.length ? fortes : cand;
  return { valor: Math.max(...pool.map(c => c.v)), loja };
}
function acharData(texto) {
  const m = texto.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/); if (!m) return null;
  let [, d, mo, y] = m.map(Number); if (y < 100) y += 2000;
  if (mo > 12 || d > 31 || mo < 1 || d < 1 || y < 2015 || y > 2100) return null;
  const iso = y + '-' + pad2(mo) + '-' + pad2(d); return iso > todayISO() ? null : iso;
}

/* ------------------------------------------------------------ PDF */
const PW = 595.276, PH = 841.89, ML = 37.5, MR = PW - 37.5, CW = MR - ML;
let LOGO = null;
async function buildPdf() {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  if (!LOGO) LOGO = new Uint8Array(await (await fetch('../logo.png')).arrayBuffer());
  const logo = await pdf.embedPng(LOGO);
  const hex = h => { const n = parseInt(h.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
  const BLUE = hex('#1c2a8a'), LBL = hex('#2b3a9c'), GRAY = hex('#555555'), HEAD = hex('#e8ecf7'), LINE = hex('#000000');
  const clean = s => { let o = ''; for (const ch of String(s ?? '')) { try { F.encodeText(ch); o += ch; } catch (e) { o += '?'; } } return o; };
  const tw = (s, sz, f) => (f || F).widthOfTextAtSize(s, sz);
  const wrap = (s, sz, w, f) => { s = clean(s); const out = []; let line = ''; for (const word of s.split(/\s+/)) { const t = line ? line + ' ' + word : word; if (tw(t, sz, f) <= w || !line) line = t; else { out.push(line); line = word; } } out.push(line); return out; };
  let pg, y;
  const T = (s, x, yy, sz, o = {}) => { s = clean(s); const f = o.b ? FB : F, w = tw(s, sz, f); pg.drawText(s, { x: o.a === 'r' ? x - w : o.a === 'c' ? x - w / 2 : x, y: PH - yy, size: sz, font: f, color: o.c || LINE }); };
  const R = (x, yy, w, h, o = {}) => pg.drawRectangle({ x, y: PH - yy - h, width: w, height: h, borderWidth: o.noStroke ? 0 : (o.lw || 0.6), borderColor: o.noStroke ? undefined : LINE, color: o.fill });
  const its = [...doc.itens].sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.criado - b.criado);
  const comNota = its.filter(i => i.img); comNota.forEach((it, k) => { it._anexo = k + 1; });
  const datas = its.map(i => i.data).filter(Boolean).sort();
  const periodo = datas.length ? isoTxt(datas[0]) + (datas.length > 1 && datas[0] !== datas[datas.length - 1] ? ' a ' + isoTxt(datas[datas.length - 1]) : '') : '';
  function header(titulo, compacto) {
    pg = pdf.addPage([PW, PH]);
    const lh = compacto ? 26 : 34, lw = lh * 2400 / 355;
    pg.drawImage(logo, { x: ML, y: PH - 30 - lh, width: lw, height: lh });
    T(titulo, MR, 48, compacto ? 13 : 15, { b: 1, a: 'r', c: BLUE });
    const info = [doc.cliente && 'Cliente: ' + doc.cliente, doc.numero && 'Relatório nº ' + doc.numero, periodo && 'Período: ' + periodo].filter(Boolean).join('   ·   ');
    pg.drawLine({ start: { x: ML, y: PH - 72 }, end: { x: MR, y: PH - 72 }, thickness: 1.2, color: BLUE });
    if (info) T(info, ML, 84, 8.5, { c: GRAY });
    y = info ? 92 : 80;
  }
  header('CUSTOS DE VIAGEM');
  if (doc.exterior) T('Serviço no exterior   ·   Moeda local: ' + doc.moedaLocal + ' (' + MOEDAS[doc.moedaLocal].nome + ')' + (dupla() ? '   ·   Moeda utilizada: ' + doc.moedaUsada + ' (' + MOEDAS[doc.moedaUsada].nome + ')' : ''), ML, y + 4, 8.5, { c: GRAY });
  else T('Serviço no Brasil   ·   Valores em reais (R$)', ML, y + 4, 8.5, { c: GRAY });
  y += 16;

  // tabela
  const two = dupla(), FS = 8.5, padX = 4;
  const cols = two ? [{ t: 'Data', w: 52 }, { t: 'Descrição', w: 0 }, { t: 'Nota', w: 46 }, { t: 'Moeda local (' + doc.moedaLocal + ')', w: 100, r: 1 }, { t: 'Moeda utilizada (' + doc.moedaUsada + ')', w: 108, r: 1 }]
    : [{ t: 'Data', w: 52 }, { t: 'Descrição', w: 0 }, { t: 'Nota', w: 46 }, { t: 'Valor (' + (curLocal() === 'BRL' ? 'R$' : curLocal()) + ')', w: 110, r: 1 }];
  cols[1].w = CW - cols.reduce((s, c) => s + c.w, 0);
  const xs = []; cols.reduce((x, c) => { xs.push(x); return x + c.w; }, ML);
  function tHead(cont) {
    if (cont) { T('Gastos (continuação)', ML, y + 8, 10, { b: 1, c: LBL }); y += 14; }
    if (two) {      // linha "Valor" em cima das duas colunas de valor, como no modelo
      const xv = xs[3], wv = cols[3].w + cols[4].w;
      R(xs[0], y, xv - ML, 14, { fill: HEAD }); R(xv, y, wv, 14, { fill: HEAD }); T('Valor', xv + wv / 2, y + 10, FS, { b: 1, a: 'c' }); y += 14;
    }
    cols.forEach((c, i) => { R(xs[i], y, c.w, 16, { fill: HEAD }); T(c.t, c.r ? xs[i] + c.w - padX : xs[i] + padX, y + 11, FS, { b: 1, a: c.r ? 'r' : 'l' }); });
    y += 16;
  }
  if (!its.length) { T('Nenhum gasto lançado.', ML, y + 10, 9, { c: GRAY }); y += 20; }
  else {
    T('Gastos', ML, y + 8, 10, { b: 1, c: LBL }); y += 14; tHead(false);
    for (const it of its) {
      const lines = wrap(it.desc || '-', FS, cols[1].w - 2 * padX), h = Math.max(15, lines.length * 10.5 + 5);
      if (y + h > PH - 60) { header('CUSTOS DE VIAGEM', true); tHead(true); }
      const cells = [isoTxt(it.data), null, it._anexo ? 'Anexo ' + it._anexo : '-', fmtMoney(it.vLocal, curLocal()) || '-'];
      if (two) cells.push(fmtMoney(it.vUsado, doc.moedaUsada) || '-');
      cols.forEach((c, i) => {
        R(xs[i], y, c.w, h);
        if (i === 1) lines.forEach((l, k) => T(l, xs[i] + padX, y + 11 + k * 10.5, FS));
        else T(cells[i], c.r ? xs[i] + c.w - padX : i === 2 || i === 0 ? xs[i] + c.w / 2 : xs[i] + padX, y + 11, FS, { a: c.r ? 'r' : 'c', c: i === 2 && !it._anexo ? GRAY : LINE });
      });
      y += h;
    }
    // total
    const t = totais(); if (y + 40 > PH - 60) { header('CUSTOS DE VIAGEM', true); }
    const xT = xs[3];
    R(ML, y, xT - ML, 18, { fill: HEAD }); T(doc.exterior ? 'Total gasto na viagem' : 'Total em reais', xT - padX, y + 12.5, 9.5, { b: 1, a: 'r' });
    R(xs[3], y, cols[3].w, 18, { fill: HEAD }); T(fmtMoney(t.local, curLocal()), xs[3] + cols[3].w - padX, y + 12.5, 9.5, { b: 1, a: 'r' });
    if (two) { R(xs[4], y, cols[4].w, 18, { fill: HEAD }); T(fmtMoney(t.usado, doc.moedaUsada), xs[4] + cols[4].w - padX, y + 12.5, 9.5, { b: 1, a: 'r' }); }
    y += 26;
    const notas = [];
    if (comNota.length) notas.push(comNota.length === its.length ? 'As notas de todos os gastos estão nas folhas seguintes (Anexos).' : 'Gastos com "Anexo n" têm a nota digitalizada nas folhas seguintes; os marcados com "-" não têm nota.');
    if (t.faltaLocal || t.faltaUsado) notas.push('Gastos sem valor não entram no total.');
    notas.forEach(n => { T(n, ML, y, 7.5, { c: GRAY }); y += 10; });
  }

  // folhas das notas: por data, sem assinaturas, montadas sozinhas em 3 colunas (todas as notas com a largura de 1 coluna,
  // assim todos os cupons ficam na mesma escala; o papel térmico tem sempre ~8 cm).
  // Enche coluna por coluna, de cima para baixo, como jornal: empilha na coluna atual enquanto ela não passar
  // (com uma folga) da coluna mais alta; senão passa para a próxima coluna, e depois da 3ª volta para a 1ª.
  // Se nenhuma coluna aceitar, vai na mais baixa. Não cabe mais na folha: folha nova.
  if (comNota.length) {
    const gap = 10, HH = 36, bottom = PH - 30, NC = 3, colW = (CW - (NC - 1) * gap) / NC, FOLGA = 1.15;
    let top = 0, col = 0, colY = [];
    const novaFolha = () => { header('CUSTOS DE VIAGEM – NOTAS', true); top = y + 2; col = 0; colY = Array(NC).fill(top); };
    const medida = it => { const maxImgH = bottom - top - HH - 4; let iw = colW, ih = colW * it.imgH / it.imgW; if (ih > maxImgH) { ih = maxImgH; iw = ih * it.imgW / it.imgH; } return { iw, ih, h: HH + ih + 2 }; };
    novaFolha();
    for (const it of comNota) {
      const m = medida(it);
      const escolhe = () => {
        const ref = Math.max(...colY) - top;
        for (let k = 0; k < NC; k++) {
          const c = (col + k) % NC, alt = colY[c] - top;
          if (colY[c] + m.h <= bottom && (alt === 0 || alt + m.h <= ref * FOLGA)) return c;
        }
        let c = -1; for (let k = 0; k < NC; k++) if (colY[k] + m.h <= bottom && (c < 0 || colY[k] < colY[c])) c = k;
        return c;
      };
      let c = escolhe();
      if (c < 0) { novaFolha(); c = 0; }
      col = c;
      const { iw, ih, h } = m, x = ML + col * (colW + gap), yy = colY[col];
      colY[col] = yy + h + gap;
      const val = [fmtMoney(it.vLocal, curLocal()), two && it.vUsado !== null ? fmtMoney(it.vUsado, doc.moedaUsada) : ''].filter(Boolean).join(' / ');
      R(x, yy, colW, HH - 2, { fill: HEAD });
      T('Anexo ' + it._anexo + '  ·  ' + isoTxt(it.data), x + 4, yy + 10, 7.5, { b: 1 });
      if (val) { const sz = Math.max(5.5, Math.min(7.5, 7.5 * (colW - 8) / tw(clean(val), 7.5, FB))); T(val, x + 4, yy + 20, sz, { b: 1 }); }
      T(wrap(it.desc || '-', 7, colW - 8)[0], x + 4, yy + 30, 7, { c: GRAY });
      const img = await pdf.embedJpg(Uint8Array.from(atob(it.img.split(',')[1]), ch => ch.charCodeAt(0)));
      const ix = x + (colW - iw) / 2, iy = yy + HH;
      pg.drawImage(img, { x: ix, y: PH - iy - ih, width: iw, height: ih });
      R(ix, iy, iw, ih, { lw: 0.4 });
    }
  }
  const n = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => { pg = p; T('Página ' + (i + 1) + '/' + n, MR, PH - 16, 7.5, { a: 'r', c: GRAY }); });
  pdf.setTitle(nomeArquivo()); pdf.setAuthor('Deltafrigo Ltda.'); pdf.setProducer('Teste Custos de viagem');
  return await pdf.save();
}
const nomeArquivo = () => ['Custos de viagem', doc.cliente.trim(), doc.numero.trim()].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, '-');
async function gerar() {
  if (!doc.itens.length) { toast('Adicione pelo menos um gasto.', 'warn'); return null; }
  toast('Gerando o PDF…', '', 2000);
  try { return new File([await buildPdf()], nomeArquivo() + '.pdf', { type: 'application/pdf' }); }
  catch (e) { console.error(e); toast('Erro ao gerar o PDF: ' + e.message, 'warn', 6000); return null; }
}
$('bVer').addEventListener('click', async () => {
  const w = window.open('', '_blank'); const f = await gerar(); if (!f) { if (w) w.close(); return; }
  const url = URL.createObjectURL(f); if (w) w.location = url; else location.href = url;
});
$('bPdf').addEventListener('click', async () => {
  const f = await gerar(); if (!f) return;
  openSheet([el('h2', null, 'PDF pronto'), el('p', null, '"' + f.name + '"'),
    navigator.canShare && navigator.canShare({ files: [f] }) && el('button', { type: 'button', class: 'opt main', onclick: async () => { try { await navigator.share({ files: [f], title: f.name }); hideSheet(); } catch (e) { if (e.name !== 'AbortError') toast('Não foi possível enviar: ' + e.message, 'warn'); } } }, 'Enviar', el('small', null, 'WhatsApp, Telegram, e-mail…')),
    el('button', { type: 'button', class: 'opt', onclick: () => { const a = el('a', { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); setTimeout(() => a.remove(), 3000); hideSheet(); toast('"' + f.name + '" foi para Downloads.'); } }, 'Baixar', el('small', null, 'Salva na pasta Downloads')),
    el('button', { type: 'button', class: 'opt', onclick: hideSheet }, 'Fechar')]);
});
$('bLimpar').addEventListener('click', () => { if (!confirmar('Apagar todos os gastos e notas deste teste?')) return; doc = { cliente: '', numero: '', exterior: null, moedaLocal: 'CLP', moedaUsada: 'EUR', colunas: 3, itens: [] }; save(); renderTop(); renderGastos(); });

/* ------------------------------------------------------------ início */
(async () => {
  try { const d = await dbGet(); if (d) doc = Object.assign(doc, d); } catch (e) {}
  doc.itens.forEach(it => { if (it.ocr === 'busy') { it.ocr = null; } });
  renderTop(); renderGastos();
})();
