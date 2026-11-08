'use strict';
/* Relatório Deltafrigo — aba "Custos de viagem" (testada à parte em teste-custos/ até a v0.7).
   doc.custos = { exterior: null|true|false, moedaLocal, moedaUsada, itens: [{ id, criado, data, desc, vLocal, vUsado,
                  img (dataURL jpeg), imgW, imgH, imgObj (nº do objeto da imagem no PDF), auto, autoUsado }] }
   - Serviço no Brasil: cada gasto só em R$; total em reais.
   - Exterior: moeda local (a da nota) e moeda utilizada (a cobrada); os dois valores por gasto; total nas duas.
     Sem conversão por câmbio (cada banco tem seu spread): a moeda utilizada é digitada (ou lida de um print do banco).
   - Foto da nota: OCR no aparelho (Tesseract, pasta ocr/). Procura o TOTAL, valores com moeda escrita junto,
     data e marca impressa. O valor lido fica laranja ("confira") e pode ser corrigido.
   - No PDF: tabela de custos e as notas em 3 colunas, depois das assinaturas (montagem em layoutDoc, app.js).
   - No JSON embutido no PDF as imagens não vão em texto: vai o número do objeto da imagem no PDF (imgObj),
     e ao reabrir o PDF a imagem é lida de lá (readFileData). Assim o arquivo não dobra de tamanho.
   Usa do app.js: el, icon, card, toast, touch, cur, openSheet, back, opt, todayISO, isoToTxt, newId, pad2. */

const MOEDAS = { CLP: { nome: 'Peso chileno', dec: 0, simb: '$' }, USD: { nome: 'Dólar americano', dec: 2, simb: 'US$' },
  EUR: { nome: 'Euro', dec: 2, simb: '€' }, BRL: { nome: 'Real brasileiro', dec: 2, simb: 'R$' } };

/* ------------------------------------------------------------ dados */
function blankCustos() { return { exterior: null, moedaLocal: 'CLP', moedaUsada: 'EUR', itens: [] }; }
function normCustos(c) {
  const o = blankCustos(); if (!c || typeof c !== 'object') return o;
  o.exterior = c.exterior === true ? true : c.exterior === false ? false : null;
  if (MOEDAS[c.moedaLocal]) o.moedaLocal = c.moedaLocal; if (MOEDAS[c.moedaUsada]) o.moedaUsada = c.moedaUsada;
  const num = v => (typeof v === 'number' && !isNaN(v)) ? v : null;
  o.itens = (Array.isArray(c.itens) ? c.itens : []).map(it => ({ id: it.id || newId(), criado: +it.criado || Date.now(), data: it.data || '', desc: String(it.desc || ''),
    vLocal: num(it.vLocal), vUsado: num(it.vUsado), img: it.img || null, imgW: +it.imgW || 0, imgH: +it.imgH || 0, imgObj: +it.imgObj || 0,
    auto: !!it.auto, autoUsado: !!it.autoUsado, ocr: it.ocr === 'busy' ? null : (it.ocr || null) }));
  return o;
}
const cstLocal = c => c.exterior ? c.moedaLocal : 'BRL';
const cstDupla = c => !!c.exterior && c.moedaLocal !== c.moedaUsada;
const cstItens = c => [...c.itens].sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.criado - b.criado);
function cstTotais(c) {
  const t = { local: 0, usado: 0, faltaLocal: 0, faltaUsado: 0 };
  for (const it of c.itens) {
    if (it.vLocal === null) t.faltaLocal++; else t.local += it.vLocal;
    if (cstDupla(c)) { if (it.vUsado === null) t.faltaUsado++; else t.usado += it.vUsado; }
  }
  t.local = Math.round(t.local * 100) / 100; t.usado = cstDupla(c) ? Math.round(t.usado * 100) / 100 : t.local;
  return t;
}

/* ------------------------------------------------------------ números */
function fmtNum(v, cur) { const dec = MOEDAS[cur] ? MOEDAS[cur].dec : 2; return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtMoney(v, cur) { if (v === null || v === undefined || isNaN(v)) return ''; return cur === 'BRL' ? 'R$ ' + fmtNum(v, cur) : fmtNum(v, cur) + ' ' + cur; }
// entende 360.452 · 325,76 · 325.76 · 1.234,56 · 1,234.56 · 12 345,60
function parseValor(str) {
  let s = String(str || '').replace(/[oO](?=\d)|(?<=\d)[oO]/g, '0').replace(/\s(?=\d{3}\b)/g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(',');
  if (lastDot >= 0 && lastCom >= 0) { const dec = lastDot > lastCom ? '.' : ',', th = dec === '.' ? ',' : '.'; s = s.split(th).join('').replace(dec, '.'); }
  else if (lastDot >= 0 || lastCom >= 0) {
    const sep = lastDot >= 0 ? '.' : ',', parts = s.split(sep), last = parts[parts.length - 1];
    s = (parts.length > 2 || last.length === 3) ? parts.join('') : parts.slice(0, -1).join('') + '.' + last;
  }
  const n = parseFloat(s); return isNaN(n) ? null : Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------ aba Custos */
function renderCustos() {
  const d = cur.doc, c = d.custos, box = $('tab-custos'); box.innerHTML = '';
  const seg = (opts, val, onpick, cls) => el('div', { class: 'cst-seg' + (cls ? ' ' + cls : '') }, opts.map(([v, lbl, sub]) =>
    el('button', { type: 'button', class: val === v ? 'on' : '', onclick: () => onpick(v) }, lbl, sub && el('small', null, sub))));
  const moedaOpts = Object.keys(MOEDAS).map(k => [k, k, MOEDAS[k].simb + ' ' + MOEDAS[k].nome.split(' ')[0]]);
  const hint = c.exterior === null ? 'Escolha primeiro: os gastos aparecem depois.'
    : c.exterior ? (c.moedaLocal === c.moedaUsada ? 'Moeda local e utilizada iguais: um valor por gasto.' : 'Cada gasto terá o valor em ' + c.moedaLocal + ' (da nota) e em ' + c.moedaUsada + ' (o que foi cobrado).')
    : 'Cada gasto terá só o valor em R$. No fim sai o total em reais.';
  box.append(card('plane', 'O serviço foi realizado no exterior?',
    seg([[false, 'Não, no Brasil'], [true, 'Sim, no exterior']], c.exterior, v => { c.exterior = v; touch(); renderCustos(); }),
    c.exterior ? el('div', null,
      el('div', { class: 'cst-lbl' }, 'Moeda local ', el('small', null, '(a moeda da nota)')),
      seg(moedaOpts, c.moedaLocal, v => { c.moedaLocal = v; touch(); renderCustos(); }, 'cur'),
      el('div', { class: 'cst-lbl' }, 'Moeda utilizada ', el('small', null, '(a moeda cobrada no cartão ou paga)')),
      seg(moedaOpts, c.moedaUsada, v => { c.moedaUsada = v; touch(); renderCustos(); }, 'cur')) : null,
    el('p', { class: 'help', style: 'margin:10px 0 0' }, hint)));
  if (c.exterior === null) { if (!c.itens.length) box.append(el('div', { class: 'info' }, 'Gastos da viagem (mercado, combustível, pedágio, hotel…), com ou sem a nota fotografada. Saem no fim do PDF, depois das assinaturas, com as notas em folhas próprias. Sem gastos, essa parte não aparece.')); return; }

  const its = cstItens(c);
  for (const it of its) box.append(cstGastoCard(c, it));
  box.append(el('div', { class: 'cst-add' },
    el('button', { type: 'button', class: 'main', onclick: () => cstPick(null, true) }, el('span', { class: 'ic' }, '📷'), el('span', null, 'Fotografar nota', el('small', null, 'abre a câmera'))),
    el('button', { type: 'button', onclick: () => cstPick(null, false) }, el('span', { class: 'ic' }, '🖼️'), el('span', null, 'Nota da galeria', el('small', null, 'foto, print ou imagem salva'))),
    el('button', { type: 'button', onclick: () => { c.itens.push(cstNovo()); touch(); renderCustos(); toast('Gasto adicionado. Preencha a descrição e o valor.'); } },
      el('span', { class: 'ic' }, '✎'), el('span', null, 'Adicionar sem nota', el('small', null, 'só descrição e valor')))));
  box.append(el('div', { class: 'card cst-tot', id: 'cstTot' }));
  cstRenderTot();
}
function cstNovo() { return { id: newId(), criado: Date.now(), data: todayISO(), desc: '', vLocal: null, vUsado: null, img: null, imgW: 0, imgH: 0, imgObj: 0, auto: false, autoUsado: false, ocr: null }; }
function cstMoney(c, it, key, cur) {
  const isAuto = key === 'vLocal' ? it.auto : it.autoUsado;
  const i = el('input', { class: 'money' + (isAuto ? ' auto' : ''), inputmode: 'decimal', autocomplete: 'off', placeholder: 'digite', value: it[key] === null ? '' : fmtNum(it[key], cur) });
  i.addEventListener('input', () => {
    it[key] = parseValor(i.value);
    if (key === 'vLocal') { if (it.ocr === 'fail') it.ocr = null; if (it.auto) it.auto = false; } else if (it.autoUsado) it.autoUsado = false;
    i.classList.remove('auto'); const g = i.closest('.cst-gasto'), ch = g && g.querySelector('.cst-chip'); if (ch && !it.auto && !it.autoUsado) ch.remove();
    touch(); cstRenderTot();
  });
  i.addEventListener('blur', () => { i.value = it[key] === null ? '' : fmtNum(it[key], cur); });
  return i;
}
function cstGastoCard(c, it) {
  const cl = cstLocal(c);
  const vals = cstDupla(c)
    ? el('div', { class: 'row2 cst-vals' }, el('label', { class: 'f' }, el('span', null, 'Moeda local (' + c.moedaLocal + ')'), cstMoney(c, it, 'vLocal', c.moedaLocal)),
        el('label', { class: 'f' }, el('span', null, 'Moeda utilizada (' + c.moedaUsada + ')'), cstMoney(c, it, 'vUsado', c.moedaUsada)))
    : el('label', { class: 'f' }, el('span', null, 'Valor (' + (cl === 'BRL' ? 'R$' : cl) + ')'), cstMoney(c, it, 'vLocal', cl));
  const desc = el('input', { value: it.desc, placeholder: 'Ex.: Mercado, combustível, hotel…', autocomplete: 'off' });
  desc.addEventListener('input', () => { it.desc = desc.value; touch(); });
  const data = el('input', { type: 'date', value: it.data });
  data.addEventListener('change', () => { it.data = data.value; touch(); renderCustos(); });
  const chip = it.ocr === 'busy' ? el('span', { class: 'cst-chip busy' }, el('span', { class: 'spin' }), 'Lendo a nota…')
    : it.ocr === 'ok' && (it.auto || it.autoUsado) ? el('span', { class: 'cst-chip ok' }, '⚠ ' + (it.auto && it.autoUsado && cstDupla(c) ? 'Valores lidos' : 'Valor lido') + ' da imagem: confira')
    : it.ocr === 'fail' ? el('span', { class: 'cst-chip fail' }, 'Não consegui ler o total: digite o valor') : null;
  const body = el('div', { class: 'cst-body' },
    el('div', { class: 'cst-top' }, el('label', { class: 'f' }, el('span', null, 'Data'), data),
      el('button', { type: 'button', class: 'del', html: icon('trash'), 'aria-label': 'Excluir', onclick: () => cstDel(c, it) })),
    el('label', { class: 'f' }, el('span', null, 'Descrição'), desc), vals, chip,
    !it.img && el('div', { class: 'cst-anexar' }, el('span', null, 'Anexar a nota:'),
      el('button', { type: 'button', onclick: () => cstPick(it, true) }, '📷 câmera'), el('button', { type: 'button', onclick: () => cstPick(it, false) }, '🖼️ galeria')));
  if (!it.img) return el('div', { class: 'card cst-gasto' }, body);
  const th = el('div', { class: 'cst-thumb', style: 'background-image:url(' + it.img + ')', onclick: e => { if (!e.target.closest('.tools')) cstVer(c, it); } },
    el('div', { class: 'tools' }, el('button', { type: 'button', onclick: () => cstGirar(it) }, '⟳'), el('button', { type: 'button', onclick: () => cstTirar(it) }, '✕')));
  return el('div', { class: 'card cst-gasto com' }, th, body);
}
function cstRenderTot() {
  const b = $('cstTot'); if (!b || !cur) return; const c = cur.doc.custos, t = cstTotais(c); b.innerHTML = '';
  if (!c.itens.length) { b.append(el('p', { class: 'help', style: 'margin:0' }, 'Nenhum gasto ainda. Fotografe uma nota ou adicione um gasto sem nota.')); updateBadges(); return; }
  const rows = cstDupla(c)
    ? [['Total na moeda local', fmtMoney(t.local, c.moedaLocal), ''], ['Total gasto na viagem', fmtMoney(t.usado, c.moedaUsada), 'g']]
    : [[c.exterior ? 'Total gasto na viagem' : 'Total em reais', fmtMoney(t.local, cstLocal(c)), 'g']];
  b.append(el('h3', { html: icon('box') + '<span>Totais</span>' }), el('table', null, rows.map(([a, v, g]) => el('tr', { class: g }, el('td', null, a), el('td', null, v)))));
  const falta = [t.faltaLocal && t.faltaLocal + ' sem valor' + (cstDupla(c) ? ' na moeda local' : ''), t.faltaUsado && t.faltaUsado + ' sem valor na moeda utilizada'].filter(Boolean);
  if (falta.length) b.append(el('div', { class: 'warnbox' }, 'Atenção: ' + falta.join(' e ') + '. Esses gastos não entram no total.'));
  updateBadges();
}
function cstDel(c, it) {
  openSheet([el('h2', null, 'Excluir este gasto?'), el('p', null, (it.desc || 'Gasto sem descrição') + (it.vLocal !== null ? ' · ' + fmtMoney(it.vLocal, cstLocal(c)) : '')),
    el('div', { class: 'opts' }, opt('danger', 'trash', 'Excluir', null, () => { c.itens = c.itens.filter(x => x !== it); touch(); back(); renderCustos(); toast('Gasto excluído.'); }),
      opt('', 'back', 'Cancelar', null, back))]);
}
function cstTirar(it) {
  openSheet([el('h2', null, 'Tirar a nota deste gasto?'), el('p', null, 'O gasto continua, sem a imagem.'),
    el('div', { class: 'opts' }, opt('danger', 'trash', 'Tirar a nota', null, () => { it.img = null; it.imgObj = 0; it.ocr = null; it.auto = false; it.autoUsado = false; touch(); back(); renderCustos(); }),
      opt('', 'back', 'Cancelar', null, back))]);
}
function cstVer(c, it) {
  openSheet([el('h2', null, it.desc || 'Nota'), el('p', null, isoToTxt(it.data, true) + (it.vLocal !== null ? ' · ' + fmtMoney(it.vLocal, cstLocal(c)) : '')),
    el('img', { src: it.img, style: 'width:100%;border-radius:10px;display:block;margin-bottom:10px' }), el('button', { class: 'cancel', onclick: back }, 'Fechar')]);
}

/* ------------------------------------------------------------ imagens */
let cstAlvo = null;
function cstPick(it, cam) { cstAlvo = it || null; $(cam ? 'fCam' : 'fNota').click(); }
async function cstArquivo(f) {
  const c = cur && cur.doc.custos; if (!c) return;
  let it = cstAlvo; cstAlvo = null;
  try {
    const im = await cstLoad(f);
    if (!it) { it = cstNovo(); c.itens.push(it); }
    const cv = cstCanvas(im, 2000); it.img = cv.toDataURL('image/jpeg', 0.82); it.imgW = cv.width; it.imgH = cv.height; it.imgObj = 0;
    it.ocr = 'busy'; touch(); renderCustos();
    cstLer(it);
  } catch (e) { console.error(e); toast('Não foi possível abrir a imagem: ' + e.message, 'warn', 6000); }
}
function cstLoad(src) { return new Promise((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => err(new Error('formato não suportado')); im.src = typeof src === 'string' ? src : URL.createObjectURL(src); }); }
function cstCanvas(im, max, rot) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height, k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k), cv = document.createElement('canvas'), r = rot || 0;
  cv.width = r % 180 ? h : w; cv.height = r % 180 ? w : h;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.translate(cv.width / 2, cv.height / 2); g.rotate(r * Math.PI / 180); g.drawImage(im, -w / 2, -h / 2, w, h);
  return cv;
}
async function cstGirar(it) {
  const cv = cstCanvas(await cstLoad(it.img), 2000, 90);
  it.img = cv.toDataURL('image/jpeg', 0.82); it.imgW = cv.width; it.imgH = cv.height; it.imgObj = 0; touch();
  if (it.vLocal === null && it.vUsado === null) { it.ocr = 'busy'; cstLer(it); }
  renderCustos();
}

/* ------------------------------------------------------------ OCR (Tesseract no aparelho) */
let cstWorkerP = null;
function cstWorker() {
  if (!cstWorkerP) {
    if (typeof Tesseract === 'undefined') return Promise.reject(new Error('leitor não carregado'));
    const base = new URL('ocr/', location.href).href;
    cstWorkerP = Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true, cacheMethod: 'write' })
      .catch(e => { cstWorkerP = null; throw e; });
  }
  return cstWorkerP;
}
const cstFila = []; let cstRodando = false;
function cstLer(it) { cstFila.push(it); if (!cstRodando) cstRodaFila(); }
async function cstRodaFila() {
  cstRodando = true;
  while (cstFila.length) {
    const it = cstFila.shift(), rec = cur;
    try {
      const w = await cstWorker();
      const { data } = await w.recognize(cstPrep(await cstLoad(it.img)));
      cstAplica(rec ? rec.doc.custos : null, it, data.text);
    } catch (e) { console.error(e); it.ocr = 'fail'; toast('Leitura automática indisponível: ' + (e.message || e), 'warn', 6000); }
    if (rec) { DB.put(rec).catch(() => {}); if (cur === rec && tab === 'custos') renderCustos(); }
  }
  cstRodando = false;
}
function cstAplica(c, it, texto) {
  c = c || { exterior: false, moedaLocal: 'BRL', moedaUsada: 'BRL' };
  const r = cstTotal(texto), m = cstMoedas(texto), cl = cstLocal(c);
  // valor da moeda local: linha do TOTAL; senão, valor com a moeda escrita (ex.: print do app do banco).
  // Se o TOTAL está escrito em outra moeda (ex.: "Gesamt EUR" com moeda local CLP), não vai para a moeda local.
  const totalOutra = r.valor !== null && m[cl] === undefined && Object.entries(m).some(([k, v]) => k !== cl && v === r.valor);
  const vl = r.valor !== null && !totalOutra ? r.valor : m[cl] !== undefined ? m[cl] : null;
  if (vl !== null && (it.vLocal === null || it.auto)) { it.vLocal = vl; it.auto = true; }
  if (cstDupla(c) && m[c.moedaUsada] !== undefined && (it.vUsado === null || it.autoUsado)) { it.vUsado = m[c.moedaUsada]; it.autoUsado = true; }
  it.ocr = it.auto || it.autoUsado ? 'ok' : 'fail';
  const dt = cstData(texto); if (dt && it.data === todayISO()) it.data = dt;
  if (!it.desc && r.loja) it.desc = r.loja;
}
// cinza + contraste; imagem pequena (print) é ampliada; fundo escuro (app do banco em modo escuro) é invertido
function cstPrep(im) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height, up = Math.min(3, Math.max(1, 1600 / Math.max(w0, h0)));
  const cv = document.createElement('canvas'); cv.width = Math.round(w0 * up); cv.height = Math.round(h0 * up);
  if (Math.max(cv.width, cv.height) > 2400) { const k = 2400 / Math.max(cv.width, cv.height); cv.width = Math.round(cv.width * k); cv.height = Math.round(cv.height * k); }
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, cv.width, cv.height);
  const d = g.getImageData(0, 0, cv.width, cv.height), p = d.data; let soma = 0;
  for (let i = 0; i < p.length; i += 4) { const y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = y; soma += y; }
  const escuro = soma / (p.length / 4) < 110;
  for (let i = 0; i < p.length; i += 4) { let y = escuro ? 255 - p[i] : p[i]; y = Math.max(0, Math.min(255, (y - 128) * 1.35 + 140)); p[i] = p[i + 1] = p[i + 2] = y; }
  g.putImageData(d, 0, 0); return cv;
}
const CST_NUM = /\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
const cstNums = l => (l.replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0').match(CST_NUM) || []).map(parseValor).filter(v => v !== null && v > 0);
// valores com a moeda colada no número ("360.452 CLP", "€ 12,50", "R$ 89,90"); a moeda solta não vale
// (o OCR às vezes lê a logo da Shell como "€")
const CST_NUMX = String.raw`\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const CST_TOK = [['CLP', String.raw`CLP|CH\$`], ['USD', String.raw`USD|U\$S|US\s?\$`], ['EUR', String.raw`EUR|€`], ['BRL', String.raw`BRL|R\s?\$`]];
function cstMoedas(texto) {
  const out = {};
  for (const l of texto.split('\n')) for (const [cur, tok] of CST_TOK) {
    const rx = new RegExp('(?:(?:' + tok + String.raw`)\s*[:=]?\s*(` + CST_NUMX + ')|(' + CST_NUMX + String.raw`)\s*(?:` + tok + '))', 'gi');
    let m; while ((m = rx.exec(l))) { const v = parseValor(m[1] || m[2]); if (v !== null && v > 0) out[cur] = Math.max(out[cur] || 0, v); }
  }
  return out;
}
// marcas conhecidas: pelo nome impresso na nota (a logo como desenho o leitor não reconhece)
const CST_MARCAS = [
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
// linhas que não são o nome da loja: maquininha, bandeira do cartão, tipo de documento
const CST_NAO_LOJA = /\b(getnet|transbank|redcompra|redelcom|cielo|rede|stone|pagseguro|sumup|mercado\s*pago|visa|master\s*card|mastercard|maestro|amex|compra|afecta|v[aá]lido|boleta|factura|copia|comprobante|voucher|cliente|comercio|tarjeta|cart[aã]o|d[eé]bito|cr[eé]dito|rut|cnpj|cpf|nif|fecha|data|datum|date|ticket|cupom|cupon|nota\s*fiscal|recibo|receipt)\b/i;
// procura a linha do TOTAL (várias línguas); ignora subtotal, IVA, troco, gorjeta…
function cstTotal(texto) {
  const lines = texto.split('\n').map(s => s.trim()).filter(Boolean), cand = [];
  const KEY = /(total|totale|gesamt|summe|monto|importe|a\s*pagar|valor\s*pago|valor\s*a\s*pagar|amount\s*due|grand)/i;
  const NOT = /(sub\s*-?\s*total|neto|iva|imp(uesto)?|tax|vat|mwst|propina|tip|troco|vuelto|cambio|change|descuento|desconto|items?|art[ií]culos|qtd|cant)/i;
  lines.forEach((l, i) => {
    if (!KEY.test(l) || NOT.test(l)) return;
    let nums = cstNums(l.replace(/.*?(total|totale|gesamt|summe|monto|importe|pagar|pago|due|grand)/i, ''));
    if (!nums.length && lines[i + 1]) nums = cstNums(lines[i + 1]);
    if (nums.length) cand.push({ v: nums[nums.length - 1], forte: /(a\s*pagar|grand|total\s*(a\s*pagar|general|eur|usd|clp|r\$)|valor\s*total|monto\s*total)/i.test(l) });
  });
  const marca = CST_MARCAS.find(([, rx]) => rx.test(texto));
  const loja = marca ? marca[0] : (lines.find(l => /[a-zA-ZÀ-ú]{3,}/.test(l) && !/\d{3,}|\d[.,]\d|\b(CLP|EUR|USD|BRL)\b|R\$|US\$|€/i.test(l) && !CST_NAO_LOJA.test(l)) || '')
    .replace(/[^\wÀ-ú .&'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!cand.length) return { valor: null, loja };
  const fortes = cand.filter(x => x.forte), pool = fortes.length ? fortes : cand;
  return { valor: Math.max(...pool.map(x => x.v)), loja };
}
function cstData(texto) {
  const m = texto.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/); if (!m) return null;
  let [, d, mo, y] = m.map(Number); if (y < 100) y += 2000;
  if (mo > 12 || d > 31 || mo < 1 || d < 1 || y < 2015 || y > 2100) return null;
  const iso = y + '-' + pad2(mo) + '-' + pad2(d); return iso > todayISO() ? null : iso;
}
