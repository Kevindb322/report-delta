'use strict';
/* Rapport Deltafrigo — app único para PC e celular (PWA).
   O PDF é montado do zero (sem modelo fixo): as tabelas crescem conforme as linhas preenchidas e
   as páginas são criadas sozinhas. O JSON do rapport vai embutido no PDF (chave RapportDeltafrigoData),
   então dá para reabrir e editar qualquer PDF gerado aqui, no PC ou no celular. */

const APP_VERSION = '1.0.0';
const PW = 595.276, PH = 841.89;
const DATA_KEY = 'RapportDeltafrigoData';
const LOGO_RATIO = 2400 / 355;
const $ = id => document.getElementById(id);
let FONTS = null;                   // fontes Helvetica do pdf-lib, só para medir larguras
let LOGO = null;                    // bytes do logo.png

/* ------------------------------------------------------------------ util */
const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>', plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="M18 6L6 18M6 6l12 12"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check: '<path d="M20 6L9 17l-5-5"/>', pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5z"/>',
  plane: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l4-4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.2a5.5 5.5 0 0 1 6 5.8"/>',
  note: '<path d="M4 6h16M4 12h16M4 18h10"/>', box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  down: '<path d="M6 9l6 6 6-6"/>', alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>', later: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  up: '<path d="M18 15l-6-6-6 6"/>'
};
function icon(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'value') e.value = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const pad2 = n => String(n).padStart(2, '0');
function pref(k, v) {
  try { if (v === undefined) return localStorage.getItem('dl_' + k); localStorage.setItem('dl_' + k, v); } catch (e) { return null; }
}
let toastT;
function toast(msg, cls, ms) {
  const t = $('toast'); t.textContent = msg; t.className = 'show ' + (cls || '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = cls || ''; }, ms || 3800);
}
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

/* ------------------------------------------------------------------ datas e horas */
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function isoToTxt(iso, full) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + (full ? y : y.slice(2)); }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseT(v, clock) {         // minutos | null (vazio) | NaN (inválido)
  v = String(v || '').trim().toLowerCase(); if (!v) return null;
  let r, h, m;
  if ((r = v.match(/^(\d{1,3})\s*[:h.,]\s*(\d{1,2})?$/))) { h = +r[1]; m = r[2] ? +r[2] : 0; }
  else if ((r = v.match(/^(\d{1,2})$/))) { h = +r[1]; m = 0; }
  else if ((r = v.match(/^(\d{1,2})(\d{2})$/))) { h = +r[1]; m = +r[2]; }
  else return NaN;
  if (m > 59 || (clock && h > 23)) return NaN;
  return h * 60 + m;
}
const hmStr = min => pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
const num = x => (x === null || Number.isNaN(x)) ? null : x;
const dec2 = x => x.toFixed(2).replace('.', ',');
const parseNum = v => { const s = String(v || '').trim().replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return s && !isNaN(n) && /^-?[\d.]+$/.test(s) ? n : null; };

/* ------------------------------------------------------------------ modelo de dados
   doc = { _programa, _versao, head{cliente,end1,end2,end3,data,obra,tecResp,numero,sistema},
           equipe[nomes], tempos[{data,tecs[],ida,ini,fim,volta,km}], relatorio[linhas],
           material[{qtd,desc,cod,preco}], sig{tecnico,cliente}, fileName } */
function blankDoc() {
  return {
    _programa: 'Rapport Deltafrigo', _versao: 1,
    head: { cliente: '', end1: '', end2: '', end3: '', data: todayISO(), obra: '', tecResp: pref('tecResp') || '',
            numero: todayISO().split('-').reverse().join(''), sistema: '' },
    equipe: [], tempos: [], relatorio: [], material: [], sig: { tecnico: null, cliente: null }, fileName: ''
  };
}
function normDoc(j) {                // aceita JSON de outra versão / incompleto
  const d = blankDoc();
  Object.assign(d.head, j.head || {});
  d.equipe = Array.isArray(j.equipe) ? j.equipe.map(String) : [];
  d.tempos = (j.tempos || []).map(r => ({ data: r.data || '', tecs: Array.isArray(r.tecs) ? r.tecs.map(String) : [], ida: r.ida || '', ini: r.ini || '', fim: r.fim || '', volta: r.volta || '', km: r.km || '' }));
  d.relatorio = (j.relatorio || []).map(String);
  d.material = (j.material || []).map(m => ({ qtd: m.qtd || '', desc: m.desc || '', cod: m.cod || '', preco: m.preco || '' }));
  d.sig = { tecnico: (j.sig || {}).tecnico || null, cliente: (j.sig || {}).cliente || null };
  d.fileName = j.fileName || '';
  return d;
}
const emptyMat = m => !['qty', 'qtd', 'desc', 'cod', 'preco'].some(k => String(m[k] || '').trim());
function trimEnd(a, isEmpty) { let n = a.length; while (n > 0 && isEmpty(a[n - 1])) n--; return a.slice(0, n); }

// total da linha = (fim − início, passando da meia-noite se preciso) + viagem de ida + viagem de volta
function rowCalc(r) {
  const S = num(parseT(r.ini, true)), E = num(parseT(r.fim, true)), OB = num(parseT(r.ida)), RT = num(parseT(r.volta));
  let work = null; if (S !== null && E !== null) { work = E - S; if (work < 0) work += 1440; }
  const travel = (OB || 0) + (RT || 0);
  return { work, S, travel, total: (work !== null || travel) ? (work || 0) + travel : null };
}
// Horas trabalhadas totais: no mesmo dia, horários sobrepostos contam uma vez só; viagens entram inteiras.
// Por técnico: soma o total de cada linha em que ele está marcado; 8 h = 1 diária.
function calcAll(tempos) {
  const rows = tempos.map(rowCalc), days = new Map(), perTec = new Map(); let grand = 0, any = false, km = 0, anyKm = false;
  rows.forEach((c, i) => {
    const r = tempos[i];
    const k = parseNum(r.km); if (c.total !== null && k !== null) { km += k; anyKm = true; }
    if (c.total === null) return;
    any = true; grand += c.travel;
    if (c.work !== null) {
      const key = r.data || ('#' + i);
      if (!days.has(key)) days.set(key, { data: r.data, iv: [] });
      days.get(key).iv.push([c.S, c.S + c.work]);
    }
    for (const n of r.tecs) perTec.set(n, (perTec.get(n) || 0) + c.total);
  });
  const overlaps = [];
  for (const d of days.values()) {
    d.iv.sort((a, b) => a[0] - b[0]);
    let raw = 0, uni = 0, cs = null, ce = null;
    for (const [a, b] of d.iv) { raw += b - a; if (cs === null || a > ce) { if (cs !== null) uni += ce - cs; cs = a; ce = b; } else ce = Math.max(ce, b); }
    if (cs !== null) uni += ce - cs;
    grand += uni;
    if (raw > uni) overlaps.push({ min: raw - uni, data: d.data });
  }
  return { rows, grand, any, overlaps, perTec, km, anyKm };
}
// lista dos técnicos com horas, na ordem da equipe (quem não está mais na equipe vai no fim)
function tecSummary(d, calc) {
  calc = calc || calcAll(d.tempos);
  const names = [...d.equipe, ...[...calc.perTec.keys()].filter(n => !d.equipe.includes(n))];
  return names.filter(n => calc.perTec.get(n)).map(n => ({ nome: n, min: calc.perTec.get(n), diarias: calc.perTec.get(n) / 480 }));
}
function autoName(d) { return ['Rapport', d.head.cliente.trim(), d.head.numero.trim()].filter(Boolean).join(' '); }
function fileNameOf(d) { return ((d.fileName || '').trim() || autoName(d)).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Rapport'; }

/* ------------------------------------------------------------------ montagem das páginas
   layoutDoc() gera uma lista de páginas, cada uma com operações simples (texto, retângulo, linha, imagem)
   em pontos, com origem no canto de cima à esquerda. O PDF e a visualização usam a mesma lista,
   então a tela mostra exatamente o que sai no PDF. */
const BLUE = '#1c2a8a', INK = '#000000', LBL = '#2b3a9c';
const ML = 37.5, MR = PW - 37.5, CW = MR - ML, BOTTOM = PH - 34;
const FS = 8.5;                      // tamanho do texto nas tabelas
function fnt(f) { return FONTS[f || 'R']; }
function tw(s, size, f) { return fnt(f).widthOfTextAtSize(s, size); }
function clean(s) { let o = ''; for (const ch of String(s ?? '')) { try { FONTS.R.encodeText(ch); o += ch; } catch (e) { o += ch === '\t' ? ' ' : '?'; } } return o; }
function wrap(s, size, maxW, f) {
  s = clean(s); if (!s.trim()) return [''];
  const out = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const test = line + word;
      if (tw(test, size, f) <= maxW || !line.trim()) {
        if (tw(test, size, f) <= maxW) { line = test; continue; }
        // palavra maior que a largura: quebra no meio
        let chunk = line; for (const ch of word) { if (tw(chunk + ch, size, f) > maxW && chunk) { out.push(chunk); chunk = ''; } chunk += ch; } line = chunk; continue;
      }
      out.push(line.replace(/\s+$/, '')); line = word.replace(/^\s+/, '');
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out;
}
function fitSize(s, size, maxW, f, min) { while (size > (min || 5) && tw(s, size, f) > maxW) size -= 0.25; return size; }

function layoutDoc(d, imgs) {
  const pages = []; let ops, y;
  const calc = calcAll(d.tempos);
  const T = (x, yy, s, size, o = {}) => ops.push({ k: 't', x, y: yy, s: clean(s), size, f: o.f || 'R', c: o.c || INK, a: o.a || 'l', u: o.u });
  const R = (x, yy, w, h, o = {}) => ops.push({ k: 'r', x, y: yy, w, h, lw: o.lw ?? 0.6, stroke: o.stroke ?? INK, fill: o.fill || null });
  const L = (x1, y1, x2, y2, o = {}) => ops.push({ k: 'l', x1, y1, x2, y2, lw: o.lw ?? 0.6, c: o.c || INK });
  const box = (x, yy, w, h, s, o = {}) => {               // campo com borda e texto ajustado
    R(x, yy, w, h); if (!String(s || '').trim()) return;
    const txt = clean(s), size = fitSize(txt, o.size || 9, w - 4, o.f, 5);
    T(o.a === 'c' ? x + w / 2 : o.a === 'r' ? x + w - 2.5 : x + 2.5, yy + h / 2 + size * 0.36, txt, size, { f: o.f, a: o.a });
  };
  const label = (x, yy, s, o = {}) => T(x, yy, s, o.size || 8.5, { f: 'I', c: LBL, a: o.a });

  // ---- cabeçalho
  const logoTop = (w) => { ops.push({ k: 'img', src: 'logo', x: MR - w, y: 22, w, h: w / LOGO_RATIO }); };
  function fullHeader() {
    const lw = 232; logoTop(lw);
    const title = 'RELATÓRIO DE INSTALAÇÃO OU REPAROS';
    T(ML, 54, title, fitSize(title, 14.5, MR - lw - 14 - ML, 'BI', 9), { f: 'BI', c: BLUE });
    const h = d.head, rh = 15.5, y0 = 70, gap = 1.6;
    label(ML, y0 + 11, 'Cliente:'); box(ML + 46, y0, 196, rh, h.cliente);
    box(ML, y0 + (rh + gap), 242, rh, h.end1); box(ML, y0 + 2 * (rh + gap), 242, rh, h.end2); box(ML, y0 + 3 * (rh + gap), 242, rh, h.end3);
    const xl = 300, xb = 405, bw = MR - xb;
    [['Data:', isoToTxt(h.data, true)], ['Nº da obra:', h.obra], ['Técnico responsável:', h.tecResp], ['Nº do relatório:', h.numero]].forEach(([lb, v], i) => {
      label(xl, y0 + i * (rh + gap) + 11, lb); box(xb, y0 + i * (rh + gap), bw, rh, v);
    });
    const y1 = y0 + 4 * (rh + gap) + 6;
    label(ML, y1 + 11, 'Sistema / equipamento:'); box(ML + 96, y1, xb - 52 - (ML + 96), rh, h.sistema);
    label(xb - 6, y1 + 11, 'Página:', { a: 'r' }); ops.push({ k: 'pg', x: xb, y: y1, w: 50, h: rh });
    return y1 + rh + 14;
  }
  function smallHeader() {
    const lw = 170; logoTop(lw);
    T(ML, 40, 'RELATÓRIO DE INSTALAÇÃO OU REPAROS', 11.5, { f: 'BI', c: BLUE });
    const parts = [['Cliente: ', d.head.cliente], ['Nº do relatório: ', d.head.numero]].filter(p => String(p[1] || '').trim());
    let x = ML;
    for (const [a, b] of parts) {
      label(x, 58, a); x += tw(a, 8.5, 'I');
      let s = clean(b).trim(); const max = MR - 100 - x - (parts.length > 1 && a === 'Cliente: ' ? 130 : 0);
      if (tw(s, 8.5) > max) { while (s.length > 1 && tw(s + '…', 8.5) > max) s = s.slice(0, -1); s = s.trim() + '…'; }
      T(x, 58, s, 8.5); x += tw(s, 8.5) + 14;
    }
    label(MR - 70, 58, 'Página:'); ops.push({ k: 'pgt', x: MR - 38, y: 58 });
    L(ML, 64, MR, 64, { lw: 0.8, c: BLUE });
    return 76;
  }
  function newPage() { ops = []; pages.push(ops); y = pages.length === 1 ? fullHeader() : smallHeader(); }
  const room = h => y + h <= BOTTOM;
  newPage();

  function heading(s, extra) {
    if (!room(20 + (extra || 0))) newPage();
    T(ML, y + 13, s, 13, { f: 'BI', c: BLUE, u: true }); y += 20;
  }
  // tabela genérica: cols [{w, h:'título', a:'l|c|r'}], linhas = arrays de texto
  function table(title, cols, rows, opts = {}) {
    const free = CW - cols.reduce((s, c) => s + (c.w || 0), 0), flex = cols.filter(c => !c.w).length;
    cols.forEach(c => { if (!c.w) c.w = free / flex; });
    const gap = opts.gap ?? 1.6;
    const headH = cols.some(c => c.h.includes('\n')) ? 20 : 12;
    const drawHead = () => {
      let x = ML;
      for (const c of cols) {
        const ls = c.h.split('\n'), base = y + headH - 3 - (ls.length - 1) * 8;
        ls.forEach((l, i) => T(x + c.w / 2, base + i * 8, l, 7.2, { c: LBL, a: 'c' }));
        x += c.w + gap;
      }
      y += headH + 1;
    };
    const measure = cells => {
      const lines = cells.map((s, i) => cols[i].wrap ? wrap(s, FS, cols[i].w - 5) : [clean(s)]);
      return { lines, h: Math.max(13.5, Math.max(...lines.map(l => l.length)) * (FS + 1.6) + 4.5) };
    };
    const first = rows.length ? measure(rows[0]).h : 0;
    heading(title, headH + 1 + first + (opts.after || 0));
    drawHead();
    rows.forEach((cells, ri) => {
      const m = measure(cells);
      const tail = ri === rows.length - 1 ? (opts.after || 0) : 0;
      if (!room(m.h + gap + tail)) { newPage(); heading(title + ' (continuação)', headH + 1 + m.h); drawHead(); }
      let x = ML;
      cells.forEach((s, i) => {
        const c = cols[i]; R(x, y, c.w, m.h, { fill: c.fill || null });
        const ls = m.lines[i];
        ls.forEach((l, li) => {
          if (!l) return;
          const size = c.wrap ? FS : fitSize(l, FS, c.w - 4, 'R', 5);
          const lh = FS + 1.6, top = y + (m.h - ls.length * lh) / 2;
          T(c.a === 'c' ? x + c.w / 2 : c.a === 'r' ? x + c.w - 2.5 : x + 2.5, top + li * lh + lh / 2 + FS * 0.36, l, size, { a: c.a });
        });
        x += c.w + gap;
      });
      y += m.h + gap;
    });
    return cols;
  }

  // ---- Tempos (só as linhas com horas)
  const tRows = [], tIdx = [];
  d.tempos.forEach((r, i) => { if (calc.rows[i].total !== null) { tRows.push(r); tIdx.push(i); } });
  if (tRows.length) {
    const cols = [{ w: 44, h: 'Data', a: 'c' }, { h: 'Técnicos', wrap: true }, { w: 44, h: 'Viagem\nida (h)', a: 'c' }, { w: 40, h: 'Início\ntrabalho', a: 'c' },
      { w: 40, h: 'Fim\ntrabalho', a: 'c' }, { w: 44, h: 'Viagem\nvolta (h)', a: 'c' }, { w: 46, h: 'Total\nhoras', a: 'c' }, { w: 46, h: 'Km ida\ne volta', a: 'c' }];
    const fmt = (v, clock) => { const m = parseT(v, clock); return m === null || Number.isNaN(m) ? String(v || '') : hmStr(m); };
    table('Tempos', cols, tRows.map((r, k) => [isoToTxt(r.data, false), r.tecs.join(', '), fmt(r.ida), fmt(r.ini, true), fmt(r.fim, true), fmt(r.volta),
      hmStr(calc.rows[tIdx[k]].total), r.km || '']), { after: 20 });
    // linha "Horas trabalhadas totais"
    const xTot = ML + cols.slice(0, 6).reduce((s, c) => s + c.w + 1.6, 0);
    T(ML, y + 11, 'Horas trabalhadas totais', 8.5, { f: 'I', c: LBL, u: true });
    box(xTot, y + 1, cols[6].w, 15, hmStr(calc.grand), { a: 'c', f: 'B' });
    if (calc.anyKm) box(xTot + cols[6].w + 1.6, y + 1, cols[7].w, 15, String(Math.round(calc.km * 100) / 100).replace('.', ','), { a: 'c' });
    y += 26;
  }

  // ---- Relatório (cada linha do texto vira uma linha da tabela; linhas longas quebram)
  const rep = trimEnd(d.relatorio, l => !String(l).trim());
  if (rep.length) { table('Relatório', [{ h: '', wrap: true }], rep.map(l => [l]), { gap: 0 }); y += 10; }

  // ---- Material
  const mat = trimEnd(d.material, emptyMat).filter(m => !emptyMat(m));
  if (mat.length) {
    table('Material', [{ w: 38, h: 'Qtd', a: 'c' }, { h: 'Descrição', wrap: true }, { w: 80, h: 'Código', a: 'c' }, { w: 62, h: 'Preço', a: 'r' }],
      mat.map(m => [m.qtd, m.desc, m.cod, m.preco]));
    y += 10;
  }

  // ---- Técnicos: horas e diárias (duas tabelas lado a lado)
  const sum = tecSummary(d, calc);
  if (sum.length) {
    const half = Math.ceil(sum.length / 2), left = sum.slice(0, half), right = sum.slice(half);
    const tw2 = (CW - 14) / 2, cw = [tw2 - 136, 66, 70], rh = 14;
    const head = () => {
      [0, tw2 + 14].forEach((ox, k) => {
        if (k === 1 && !right.length) return;
        let x = ML + ox;
        ['Nome', 'Horas totais', 'Total de diárias'].forEach((h, i) => { T(x + cw[i] / 2, y + 9, h, 7.2, { c: LBL, a: 'c' }); x += cw[i] + 1.6; });
      });
      y += 13;
    };
    heading('Técnicos — horas e diárias', 13 + rh + 2);
    head();
    for (let i = 0; i < half; i++) {
      if (!room(rh + 1.6)) { newPage(); heading('Técnicos — horas e diárias (continuação)', 13 + rh); head(); }
      [[left[i], 0], [right[i], tw2 + 14]].forEach(([p, ox]) => {
        if (!p) return;
        let x = ML + ox;
        [[p.nome, 'l'], [dec2(p.min / 60), 'c'], [dec2(p.diarias), 'c']].forEach(([s, a], j) => { box(x, y, cw[j], rh, s, { a, size: FS, f: j === 2 ? 'B' : 'R' }); x += cw[j] + 1.6; });
      });
      y += rh + 1.6;
    }
    T(ML, y + 9, 'Horas em decimal (ex.: 7,50 = 7 h 30 min). 1 diária = 8 horas (trabalho + viagens).', 7, { f: 'I', c: '#555555' });
    y += 20;
  }

  // ---- Assinaturas (sempre juntas na mesma página)
  const sigH = 58;
  if (!room(sigH + 26)) newPage();
  const sw = (CW - 30) / 2;
  [['cliente', ML, 'Assinatura do cliente'], ['tecnico', ML + sw + 30, 'Assinatura do técnico']].forEach(([k, x, lb]) => {
    const im = imgs && imgs[k];
    if (im) {
      const sc = Math.min((sw - 8) / im.w, (sigH - 6) / im.h), w = im.w * sc, h = im.h * sc;
      ops.push({ k: 'img', src: k, x: x + (sw - w) / 2, y: y + sigH - 2 - h, w, h });
    }
    L(x, y + sigH, x + sw, y + sigH, { lw: 0.8 });
    T(x + sw / 2, y + sigH + 11, lb, 8.5, { f: 'I', c: LBL, a: 'c' });
  });
  if (d.head.tecResp && d.head.tecResp.trim()) T(ML + sw + 30 + sw / 2, y + sigH + 21, d.head.tecResp.trim(), 7.5, { a: 'c', c: '#333333' });

  // números de página
  const n = pages.length;
  pages.forEach((p, i) => p.forEach(o => {
    if (o.k === 'pg') { o.k = 'box'; o.s = (i + 1) + '/' + n; }
    if (o.k === 'pgt') { o.k = 't'; o.s = (i + 1) + '/' + n; o.size = 8.5; o.f = 'R'; o.c = INK; o.a = 'l'; }
  }));
  pages.forEach(p => { for (let i = 0; i < p.length; i++) if (p[i].k === 'box') { const b = p[i]; p.splice(i, 1, { k: 'r', x: b.x, y: b.y, w: b.w, h: b.h, lw: 0.6, stroke: INK }, { k: 't', x: b.x + b.w / 2, y: b.y + b.h / 2 + 3.2, s: b.s, size: 9, f: 'R', c: INK, a: 'c' }); } });
  return pages;
}

/* ------------------------------------------------------------------ imagens (assinaturas e logo) */
function dataUrlBytes(u) { const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
async function imgSize(src) { const im = new Image(); im.src = src; try { await im.decode(); } catch (e) {} return { w: im.naturalWidth || 1, h: im.naturalHeight || 1 }; }
async function sigImgs(d) {
  const o = {};
  for (const k of ['cliente', 'tecnico']) if (d.sig[k]) o[k] = Object.assign({ src: d.sig[k] }, await imgSize(d.sig[k]));
  return o;
}

/* ------------------------------------------------------------------ PDF */
const hex = c => { const n = parseInt(c.slice(1), 16); return PDFLib.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
async function buildPdf(d) {
  const { PDFDocument, StandardFonts, PDFName, PDFHexString } = PDFLib;
  const imgs = await sigImgs(d), pages = layoutDoc(d, imgs);
  const out = await PDFDocument.create();
  const F = { R: await out.embedFont(StandardFonts.Helvetica), B: await out.embedFont(StandardFonts.HelveticaBold),
              I: await out.embedFont(StandardFonts.HelveticaOblique), BI: await out.embedFont(StandardFonts.HelveticaBoldOblique) };
  const E = { logo: await out.embedPng(LOGO) };
  for (const k of Object.keys(imgs)) E[k] = await out.embedPng(dataUrlBytes(imgs[k].src));
  for (const ops of pages) {
    const pg = out.addPage([PW, PH]);
    for (const o of ops) {
      if (o.k === 't') {
        const w = F[o.f].widthOfTextAtSize(o.s, o.size), x = o.a === 'c' ? o.x - w / 2 : o.a === 'r' ? o.x - w : o.x;
        pg.drawText(o.s, { x, y: PH - o.y, size: o.size, font: F[o.f], color: hex(o.c) });
        if (o.u) pg.drawLine({ start: { x, y: PH - o.y - 1.6 }, end: { x: x + w, y: PH - o.y - 1.6 }, thickness: Math.max(0.5, o.size / 16), color: hex(o.c) });
      } else if (o.k === 'r') {
        pg.drawRectangle({ x: o.x, y: PH - o.y - o.h, width: o.w, height: o.h, borderWidth: o.stroke ? o.lw : 0, borderColor: o.stroke ? hex(o.stroke) : undefined, color: o.fill ? hex(o.fill) : undefined });
      } else if (o.k === 'l') {
        pg.drawLine({ start: { x: o.x1, y: PH - o.y1 }, end: { x: o.x2, y: PH - o.y2 }, thickness: o.lw, color: hex(o.c) });
      } else if (o.k === 'img') {
        pg.drawImage(E[o.src], { x: o.x, y: PH - o.y - o.h, width: o.w, height: o.h });
      }
    }
  }
  out.setTitle(fileNameOf(d)); out.setAuthor('Deltafrigo Ltda.'); out.setProducer('Rapport Deltafrigo ' + APP_VERSION); out.setLanguage('pt-BR');
  const data = Object.assign({}, d, { _programa: 'Rapport Deltafrigo', _versao: 1, _app: APP_VERSION });
  out.getInfoDict().set(PDFName.of(DATA_KEY), PDFHexString.fromText(JSON.stringify(data)));
  return { bytes: await out.save(), pages: pages.length };
}
async function readFileData(file) {
  if (/\.json$/i.test(file.name) || file.type === 'application/json') return { data: JSON.parse(await file.text()), pdf: null };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  const v = pdf.getInfoDict().lookup(PDFLib.PDFName.of(DATA_KEY));
  if (!v) throw new Error('este PDF não foi feito pelo Rapport Deltafrigo');
  return { data: JSON.parse(v.decodeText()), pdf: new Blob([bytes], { type: 'application/pdf' }) };
}

/* ------------------------------------------------------------------ visualização (SVG com as mesmas operações) */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function pageSvg(ops, imgs) {
  const fam = 'Helvetica, Arial, sans-serif';
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PW + ' ' + PH + '" class="pg">';
  for (const o of ops) {
    if (o.k === 't') {
      const anchor = o.a === 'c' ? 'middle' : o.a === 'r' ? 'end' : 'start';
      s += '<text x="' + o.x + '" y="' + o.y + '" font-family="' + fam + '" font-size="' + o.size + '"' + (o.f.includes('B') ? ' font-weight="bold"' : '') +
        (o.f.includes('I') ? ' font-style="italic"' : '') + ' fill="' + o.c + '" text-anchor="' + anchor + '"' + (o.u ? ' text-decoration="underline"' : '') + ' xml:space="preserve">' + esc(o.s) + '</text>';
    } else if (o.k === 'r') s += '<rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" fill="' + (o.fill || 'none') + '" stroke="' + (o.stroke || 'none') + '" stroke-width="' + o.lw + '"/>';
    else if (o.k === 'l') s += '<line x1="' + o.x1 + '" y1="' + o.y1 + '" x2="' + o.x2 + '" y2="' + o.y2 + '" stroke="' + o.c + '" stroke-width="' + o.lw + '"/>';
    else if (o.k === 'img') s += '<image href="' + (o.src === 'logo' ? 'logo.png' : imgs[o.src].src) + '" x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" preserveAspectRatio="none"/>';
  }
  return s + '</svg>';
}

/* ------------------------------------------------------------------ banco local (IndexedDB) */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('rapportDeltafrigo', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('rapports', { keyPath: 'id' }); r.result.createObjectStore('kv'); };
      r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tr = db.transaction(store, mode), st = tr.objectStore(store); const out = fn(st);
      tr.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined); tr.onerror = () => rej(tr.error);
    });
  },
  all() { return this.tx('rapports', 'readonly', st => st.getAll()); },
  put(rec) { return this.tx('rapports', 'readwrite', st => st.put(rec)); },
  del(id) { return this.tx('rapports', 'readwrite', st => st.delete(id)); },
  kget(k) { return this.tx('kv', 'readonly', st => st.get(k)); },
  kset(k, v) { return this.tx('kv', 'readwrite', st => st.put(v, k)); }
};
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ------------------------------------------------------------------ navegação (botão voltar do Android) */
const stack = ['home'];
let screen = 'home';
function showScreen(name) {
  for (const s of ['home', 'editor', 'preview']) $(s).hidden = s !== name;
  screen = name; window.scrollTo(0, 0);
}
function push(name) { stack.push(name); history.pushState({ idx: stack.length - 1 }, ''); }
function replaceTop(name) { stack[stack.length - 1] = name; }
function back() { history.back(); }
window.addEventListener('popstate', e => {
  const target = e.state && typeof e.state.idx === 'number' ? e.state.idx : 0;
  while (stack.length - 1 > target) undo(stack.pop());
});
function undo(what) {
  if (what === 'sheet') hideSheet();
  else if (what === 'pad') hidePad();
  else if (what === 'preview') showScreen('editor');
  else if (what === 'editor') { flushSave(); cur = null; renderHome(); showScreen('home'); }
}
function applyStatic() {
  for (const e of document.querySelectorAll('[data-icon]')) if (!e.firstElementChild) e.insertAdjacentHTML('afterbegin', icon(e.dataset.icon));
  for (const e of document.querySelectorAll('[data-icon-before]')) if (!e.querySelector('svg')) e.insertAdjacentHTML('afterbegin', icon(e.dataset.iconBefore));
  $('verInfo').textContent = 'Versão ' + APP_VERSION + (IS_PC ? ' · rapports guardados neste computador' : ' · os dados ficam neste celular');
  if (installEvt) { $('bInstall').hidden = false; $('bInstall').innerHTML = icon('phone') + 'Instalar como app'; }
}

/* ------------------------------------------------------------------ início */
const IS_PC = 'showDirectoryPicker' in window && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
async function renderHome() {
  let recs = [];
  try { recs = await DB.all(); } catch (e) { toast('Não foi possível ler os rapports guardados.', 'warn'); }
  recs.sort((a, b) => b.updated - a.updated);
  const list = $('list'); list.innerHTML = '';
  $('emptyList').hidden = recs.length > 0;
  const pend = recs.filter(r => r.status === 'saved').length;
  $('pendingBanner').hidden = !pend;
  $('pendingBanner').innerHTML = icon('send') + '<span>' + (pend === 1 ? '1 rapport salvo e não enviado' : pend + ' rapports salvos e não enviados') + '</span>';
  $('home').querySelector('.appbar small').textContent = recs.length ? plural(recs.length, 'rapport', 'rapports') : 'Relatórios de instalação ou reparos';
  for (const r of recs) {
    const d = r.doc, c = calcAll(d.tempos);
    const sub = [isoToTxt(d.head.data, true), d.head.numero && ('Nº ' + d.head.numero), c.any && (hmStr(c.grand) + ' h'), d.equipe.length && plural(d.equipe.length, 'técnico', 'técnicos')].filter(Boolean).join(' · ');
    const badge = r.status === 'sent' ? el('span', { class: 'badge sent' }, 'Enviado ' + fmtStamp(r.sentAt) + (r.sentVia ? ' · ' + VIA[r.sentVia] : ''))
      : r.status === 'saved' ? el('span', { class: 'badge saved' }, 'Salvo · não enviado') : el('span', { class: 'badge draft' }, 'Rascunho');
    const item = el('div', { class: 'item', role: 'button', tabindex: 0, onclick: () => itemMenu(r) },
      el('div', { class: 'ico', html: icon('file') }),
      el('div', { class: 'txt' }, el('b', null, d.head.cliente.trim() || '(sem cliente)'), el('small', null, sub), badge));
    if (r.status === 'saved') item.append(el('button', { class: 'send', html: icon('send') + '<span>Enviar</span>',
      onclick: e => { e.stopPropagation(); askSend(r, true); } }));
    list.append(item);
  }
  renderFolderInfo();
}
const VIA = { wa: 'WhatsApp', tg: 'Telegram', em: 'e-mail', other: 'outro app', manual: 'à mão' };
function fmtStamp(ms) {
  if (!ms) return ''; const d = new Date(ms);
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function itemMenu(r) {
  openSheet([
    el('h2', null, r.doc.head.cliente.trim() || '(sem cliente)'),
    el('p', null, fileNameOf(r.doc) + '.pdf'),
    el('div', { class: 'opts' },
      opt('main', 'edit', 'Abrir e editar', null, () => { hideSheet(); replaceTop('editor'); openEditor(r); }),
      r.pdf && r.status !== 'draft' && opt('', 'send', 'Enviar', r.status === 'sent' ? 'Já foi enviado; dá para enviar de novo' : null, () => askSend(r, true)),
      (!r.pdf || r.status === 'draft') && opt('', 'save', 'Salvar PDF e enviar', null, () => { hideSheet(); replaceTop('editor'); openEditor(r); saveFlow(); }),
      r.pdf && opt('', 'save', IS_PC ? 'Salvar o PDF de novo' : 'Baixar o PDF de novo', null, async () => { const x = await saveToDevice(r, true); if (x.ok) { back(); toast(savedMsg(x, fileNameOf(r.doc) + '.pdf')); } }),
      opt('', 'copy', 'Duplicar', 'Copia cliente, equipe e dados; limpa assinaturas', () => duplicate(r)),
      opt('danger', 'trash', 'Excluir', null, () => confirmDelete(r))),
    el('button', { class: 'cancel', onclick: back }, 'Cancelar')
  ]);
}
function opt(cls, ic, title, sub, fn) {
  return el('button', { class: 'opt ' + cls, onclick: fn }, el('span', { class: 'oi', html: icon(ic) }),
    el('span', { class: 'ot' }, title, sub && el('small', null, sub)));
}
async function duplicate(r) {
  const d = normDoc(JSON.parse(JSON.stringify(r.doc)));
  d.sig = { tecnico: null, cliente: null }; d.fileName = ''; d.head.data = todayISO(); d.head.numero = todayISO().split('-').reverse().join('');
  const rec = { id: newId(), created: Date.now(), updated: Date.now(), status: 'draft', doc: d, pdf: null };
  await DB.put(rec); hideSheet(); replaceTop('editor'); openEditor(rec); toast('Rapport duplicado.');
}
function confirmDelete(r) {
  openSheet([el('h2', null, 'Excluir este rapport?'), el('p', null, '"' + (r.doc.head.cliente.trim() || '(sem cliente)') + '" sai da lista. PDFs já salvos ou enviados não são apagados.'),
    el('div', { class: 'opts' },
      opt('danger', 'trash', 'Excluir', null, async () => { await DB.del(r.id); back(); renderHome(); toast('Rapport excluído.'); }),
      opt('', 'back', 'Cancelar', null, back))]);
}

/* ------------------------------------------------------------------ editor */
let cur = null, tab = 'dados', saveT = null;
const TABS = ['dados', 'equipe', 'horas', 'relatorio', 'material', 'assinar'];
async function newReport() {
  const d = blankDoc();
  try { d.equipe = JSON.parse(pref('ultimaEquipe') || '[]'); } catch (e) {}
  const rec = { id: newId(), created: Date.now(), updated: Date.now(), status: 'draft', doc: d, pdf: null };
  await DB.put(rec); push('editor'); tab = 'dados'; openEditor(rec);
}
function openEditor(rec) { cur = rec; cur.doc = normDoc(cur.doc); renderEditor(); showScreen('editor'); showTab(tab); }
function touch() {
  if (!cur) return;
  cur.updated = Date.now(); if (cur.status !== 'draft') cur.status = 'draft';
  clearTimeout(saveT); saveT = setTimeout(flushSave, 500);
  updateBadges();
}
function flushSave() { clearTimeout(saveT); saveT = null; if (cur) DB.put(cur).catch(() => toast('Não foi possível guardar no aparelho.', 'warn')); }
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

function showTab(name) {
  tab = name;
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === name);
  for (const s of TABS) $('tab-' + s).hidden = s !== name;
  const b = $('tabs').querySelector('[data-tab="' + name + '"]'); if (b) b.scrollIntoView({ inline: 'center', block: 'nearest' });
  if (name === 'horas') renderHoras();          // a equipe pode ter mudado
  if (name === 'relatorio') for (const ta of $('tab-relatorio').querySelectorAll('textarea')) if (ta.fit) ta.fit();
  window.scrollTo(0, 0);
}
function renderEditor() {
  if (!cur) return;
  renderDados(); renderEquipe(); renderHoras(); renderRelatorio(); renderMaterial(); renderAssinar(); updateBadges();
}
function updateBadges() {
  if (!cur) return;
  const d = cur.doc, c = calcAll(d.tempos);
  $('edTitle').textContent = d.head.cliente.trim() || 'Novo rapport';
  $('edSub').textContent = (c.any ? hmStr(c.grand) + ' h · ' : '') + (cur.status === 'draft' ? 'salvo automaticamente' : cur.status === 'sent' ? 'enviado' : 'salvo · não enviado');
  $('cntEquipe').textContent = d.equipe.length || '';
  $('cntHoras').textContent = c.rows.filter(r => r.total !== null).length || '';
  $('cntRelatorio').textContent = d.relatorio.filter(l => String(l).trim()).length || '';
  $('cntMaterial').textContent = d.material.filter(m => !emptyMat(m)).length || '';
  const ns = (d.sig.tecnico ? 1 : 0) + (d.sig.cliente ? 1 : 0);
  $('cntAssinar').textContent = ns ? ns + '/2' : '';
}
// campo de texto ligado a obj[key]
function inp(label, obj, key, opts = {}) {
  const i = el('input', { type: opts.type || 'text', value: obj[key] || '', inputmode: opts.inputmode, placeholder: opts.ph,
    autocomplete: 'off', autocapitalize: opts.cap || 'sentences', enterkeyhint: 'next', list: opts.list });
  i.addEventListener('input', () => { obj[key] = i.value; i.classList.remove('bad'); touch(); if (opts.oninput) opts.oninput(i); });
  if (opts.hm) {                                    // horas: 0740 -> 07:40 ao sair do campo
    i.addEventListener('blur', () => {
      const m = parseT(i.value, opts.hm === 'clock');
      if (m === null) { if (i.value) { i.value = ''; obj[key] = ''; touch(); } return; }
      if (Number.isNaN(m)) { i.classList.add('bad'); toast('Hora inválida: ' + i.value, 'warn'); return; }
      const v = hmStr(m); if (v !== i.value) { i.value = v; obj[key] = v; touch(); if (opts.oninput) opts.oninput(i); }
    });
  }
  return el('label', { class: 'f' }, el('span', null, label), i);
}
function card(ic, title, ...kids) { return el('div', { class: 'card' }, el('h3', { html: icon(ic) + '<span>' + title + '</span>' }), ...kids); }

// ---- Dados
function knownNames() { try { return JSON.parse(pref('nomes') || '[]'); } catch (e) { return []; } }
function rememberNames(names) { const l = [...new Set([...names.map(s => s.trim()).filter(Boolean), ...knownNames()])].slice(0, 60); pref('nomes', JSON.stringify(l)); }
function dlNames() {
  const dl = document.getElementById('dlNomes') || document.body.appendChild(el('datalist', { id: 'dlNomes' }));
  dl.innerHTML = ''; for (const n of knownNames()) dl.append(el('option', { value: n }));
  return 'dlNomes';
}
function renderDados() {
  const d = cur.doc, h = d.head, box = $('tab-dados'); box.innerHTML = '';
  const date = el('input', { type: 'date', value: h.data || '' });
  date.addEventListener('change', () => { h.data = date.value; touch(); });
  box.append(
    card('user', 'Cliente', inp('Cliente', h, 'cliente', { oninput: updateBadges }), inp('Endereço / linha 2', h, 'end1'), inp('Linha 3', h, 'end2'), inp('Linha 4', h, 'end3')),
    card('note', 'Obra', el('div', { class: 'row2' }, el('label', { class: 'f' }, el('span', null, 'Data'), date), inp('Nº do relatório', h, 'numero', { inputmode: 'numeric' })),
      inp('Nº da obra', h, 'obra'), inp('Técnico responsável', h, 'tecResp', { list: dlNames(), cap: 'words', oninput: i => pref('tecResp', i.value.trim()) }),
      inp('Sistema / equipamento', h, 'sistema')),
    card('file', 'Nome do arquivo', inp('Nome do PDF', d, 'fileName', { ph: autoName(d) }), el('p', { class: 'help' }, 'Em branco, usa "Rapport Cliente Nº".'))
  );
}

// ---- Equipe
function renderEquipe() {
  const d = cur.doc, box = $('tab-equipe'); box.innerHTML = '';
  const field = el('input', { type: 'text', placeholder: 'Nome do técnico', autocapitalize: 'words', autocomplete: 'off', list: dlNames(), enterkeyhint: 'done' });
  const add = () => {
    const names = field.value.split(/[,;\n]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
    let n = 0; for (const nm of names) if (!d.equipe.some(x => x.toLowerCase() === nm.toLowerCase())) { d.equipe.push(nm); n++; }
    if (!names.length) return;
    rememberNames(names); pref('ultimaEquipe', JSON.stringify(d.equipe));
    field.value = ''; touch(); renderEquipe(); $('tab-equipe').querySelector('input').focus();
    if (!n) toast('Esse nome já está na equipe.');
  };
  field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const chips = el('div', { class: 'chips' }, d.equipe.map((nm, i) => el('span', { class: 'chip' }, nm,
    el('button', { type: 'button', 'aria-label': 'Remover ' + nm, html: icon('close'), onclick: () => removeTec(i) }))));
  const sugs = knownNames().filter(n => !d.equipe.some(x => x.toLowerCase() === n.toLowerCase())).slice(0, 16);
  box.append(
    el('div', { class: 'info' }, 'Coloque aqui todos os técnicos da obra. Na aba Horas, cada dia tem a lista para marcar quem estava presente.'),
    card('users', 'Equipe da obra' + (d.equipe.length ? ' · ' + plural(d.equipe.length, 'técnico', 'técnicos') : ''),
      el('div', { class: 'addrow' }, field, el('button', { type: 'button', class: 'primary small', onclick: add, html: icon('plus') + '<span>Adicionar</span>' })),
      d.equipe.length ? chips : el('p', { class: 'help' }, 'Nenhum técnico ainda. Dá para colar vários separados por vírgula.'),
      sugs.length ? el('div', null, el('p', { class: 'help' }, 'Já usados antes (toque para adicionar):'),
        el('div', { class: 'chips sug' }, sugs.map(n => el('button', { type: 'button', class: 'chip', onclick: () => { field.value = n; add(); } }, '+ ' + n)))) : null),
    tecSummaryCard() || '');
}
function removeTec(i) {
  const d = cur.doc, nm = d.equipe[i], used = d.tempos.filter(r => r.tecs.includes(nm)).length;
  const go = () => { d.equipe.splice(i, 1); d.tempos.forEach(r => { r.tecs = r.tecs.filter(x => x !== nm); }); pref('ultimaEquipe', JSON.stringify(d.equipe)); touch(); renderEquipe(); renderHoras(); };
  if (!used) { go(); return; }
  openSheet([el('h2', null, 'Remover ' + nm + '?'), el('p', null, nm + ' está marcado em ' + plural(used, 'dia', 'dias') + '. As horas dele saem da tabela de técnicos.'),
    el('div', { class: 'opts' }, opt('danger', 'trash', 'Remover', null, () => { back(); go(); }), opt('', 'back', 'Cancelar', null, back))]);
}
function tecSummaryCard() {
  const d = cur.doc, c = calcAll(d.tempos), s = tecSummary(d, c);
  if (!s.length) return null;
  const tb = el('table', { class: 'sum' }, el('thead', null, el('tr', null, el('th', null, 'Nome'), el('th', null, 'Horas totais'), el('th', null, 'Diárias'))),
    el('tbody', null, s.map(p => el('tr', null, el('td', null, p.nome), el('td', null, dec2(p.min / 60)), el('td', null, el('b', null, dec2(p.diarias)))))));
  return card('clock', 'Horas e diárias por técnico', tb, el('p', { class: 'help' }, 'Horas em decimal (7,50 = 7 h 30 min). 1 diária = 8 horas, contando trabalho + viagens. Sai no fim do PDF.'));
}

// ---- Horas
function renderHoras() {
  const d = cur.doc, box = $('tab-horas'); box.innerHTML = '';
  const grand = el('div', { class: 'grand' }), list = el('div'), totals = [];
  const summary = el('div');
  const refresh = () => {
    const c = calcAll(d.tempos);
    c.rows.forEach((r, i) => {
      const te = totals[i]; if (!te) return;
      te.innerHTML = '<span>Total da linha</span><span>' + (r.total !== null ? hmStr(r.total) : '—') + '</span>';
      te.classList.toggle('manual', r.total === null);
    });
    grand.innerHTML = '<small>Horas trabalhadas totais</small><div class="big">' + (c.any ? hmStr(c.grand) : '—') + '</div>' +
      (c.overlaps.length ? '<div class="ovl">Descontado por sobreposição no mesmo dia: ' + c.overlaps.map(o => hmStr(o.min) + ' em ' + (o.data ? isoToTxt(o.data, false) : '?')).join(', ') + ' (só aparece aqui, não no PDF)</div>'
        : '<small>Soma das linhas. No mesmo dia, horários que se sobrepõem contam uma vez.</small>');
    summary.innerHTML = ''; const sc = tecSummaryCard(); if (sc) summary.append(sc);
    updateBadges();
  };
  d.tempos.forEach((r, i) => {
    const date = el('input', { type: 'date', value: r.data || '' });
    const dl = el('span', { class: 'dl' }, r.data ? isoToTxt(r.data, false) : '');
    date.addEventListener('change', () => { r.data = date.value; dl.textContent = date.value ? isoToTxt(date.value, false) : ''; touch(); refresh(); });
    const time = (lbl, key) => {
      const ti = el('input', { type: 'time', value: r[key] || '', step: 60 });
      ti.addEventListener('input', () => { r[key] = ti.value; touch(); refresh(); });
      return el('label', { class: 'f' }, el('span', null, lbl), ti);
    };
    const te = el('div', { class: 'total' }); totals[i] = te;
    const tecBtn = el('button', { type: 'button', class: 'tecbtn' + (r.tecs.length ? '' : ' empty') },
      el('span', { class: 'lbl' }, 'Técnicos presentes'),
      el('span', { class: 'names' }, r.tecs.length ? r.tecs.join(', ') : (d.equipe.length ? 'Toque para marcar' : 'Cadastre a equipe primeiro')), el('span', { html: icon('down') }));
    tecBtn.addEventListener('click', () => pickTecs(r, () => { touch(); renderHoras(); }));
    const head = el('h3', null, el('span', null, 'Dia ' + (i + 1)), dl, el('span', { class: 'grow' }),
      el('button', { class: 'del', type: 'button', html: icon('trash'), 'aria-label': 'Excluir', onclick: () => { d.tempos.splice(i, 1); touch(); renderHoras(); toast('Linha excluída.'); } }));
    list.append(el('div', { class: 'card' }, head,
      el('label', { class: 'f' }, el('span', null, 'Data'), date), tecBtn,
      el('div', { class: 'row2' }, inp('Viagem ida (h)', r, 'ida', { inputmode: 'numeric', ph: '00:00', hm: 'dur', oninput: refresh }),
        inp('Viagem volta (h)', r, 'volta', { inputmode: 'numeric', ph: '00:00', hm: 'dur', oninput: refresh })),
      el('div', { class: 'row2' }, time('Início do trabalho', 'ini'), time('Fim do trabalho', 'fim')),
      inp('Km ida e volta', r, 'km', { inputmode: 'decimal' }),
      te));
  });
  const add = el('button', { class: 'add', type: 'button', html: icon('plus') + '<span>Adicionar dia</span>' });
  add.addEventListener('click', () => {
    const last = d.tempos[d.tempos.length - 1];
    d.tempos.push({ data: last && last.data ? addDays(last.data, 1) : (d.head.data || todayISO()), tecs: last ? last.tecs.slice() : d.equipe.slice(),
      ida: '', ini: last ? last.ini : '', fim: last ? last.fim : '', volta: '', km: '' });
    touch(); renderHoras();
    const cards = $('tab-horas').querySelectorAll('.card'); const c = cards[d.tempos.length - 1]; if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  box.append(...[grand, d.tempos.length ? null : el('div', { class: 'info' }, 'Um cartão por dia. "Adicionar dia" já avança a data e copia os técnicos e o horário do dia anterior. Só as linhas com horas saem no PDF.'),
    !d.equipe.length ? el('div', { class: 'warnbox' }, 'A equipe está vazia. Cadastre os técnicos na aba Equipe para poder marcar quem estava em cada dia.') : null,
    list, add, summary].filter(Boolean));
  refresh();
}
function pickTecs(r, done) {
  const d = cur.doc, sel = new Set(r.tecs);
  const all = [...d.equipe, ...r.tecs.filter(n => !d.equipe.includes(n))];
  const boxes = all.map(n => {
    const cb = el('input', { type: 'checkbox' }); cb.checked = sel.has(n);
    cb.addEventListener('change', () => { cb.checked ? sel.add(n) : sel.delete(n); });
    return el('label', { class: 'check' }, cb, el('span', null, n));
  });
  const setAll = v => { boxes.forEach(b => { const cb = b.querySelector('input'); cb.checked = v; }); all.forEach(n => v ? sel.add(n) : sel.delete(n)); };
  openSheet([el('h2', null, 'Quem estava presente' + (r.data ? ' em ' + isoToTxt(r.data, false) : '') + '?'),
    all.length ? el('div', { class: 'checks' }, boxes) : el('p', null, 'A equipe está vazia. Cadastre os técnicos na aba Equipe.'),
    all.length ? el('div', { class: 'siglinks' }, el('button', { type: 'button', onclick: () => setAll(true) }, 'Marcar todos'), el('button', { type: 'button', onclick: () => setAll(false) }, 'Desmarcar todos')) : null,
    el('div', { class: 'opts' }, opt('main', 'check', 'Confirmar', null, () => { r.tecs = all.filter(n => sel.has(n)); back(); done(); }),
      !all.length && opt('', 'users', 'Ir para a Equipe', null, () => { back(); showTab('equipe'); }))]);
}

// ---- Relatório
function renderRelatorio() {
  const d = cur.doc, box = $('tab-relatorio'); box.innerHTML = '';
  const list = el('div', { class: 'lines' });
  const row = (i) => {
    const ta = el('textarea', { rows: 1, placeholder: 'Linha ' + (i + 1), autocapitalize: 'sentences', spellcheck: 'true' }); ta.value = d.relatorio[i] || '';
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', () => {
      if (ta.value.includes('\n')) {            // colar várias linhas: vira várias linhas do relatório
        const parts = ta.value.split('\n'); d.relatorio.splice(i, 1, ...parts); touch(); renderRelatorio(); return;
      }
      d.relatorio[i] = ta.value; touch(); fit();
    });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); d.relatorio.splice(i + 1, 0, ''); touch(); renderRelatorio(); const t2 = $('tab-relatorio').querySelectorAll('textarea')[i + 1]; if (t2) t2.focus(); } });
    ta.fit = fit; setTimeout(fit, 0);
    return el('div', { class: 'line' }, el('span', { class: 'n' }, i + 1), ta,
      el('button', { type: 'button', class: 'mini', 'aria-label': 'Subir', html: icon('up'), disabled: i === 0, onclick: () => { [d.relatorio[i - 1], d.relatorio[i]] = [d.relatorio[i], d.relatorio[i - 1]]; touch(); renderRelatorio(); } }),
      el('button', { type: 'button', class: 'mini del', 'aria-label': 'Excluir linha', html: icon('trash'), onclick: () => { d.relatorio.splice(i, 1); touch(); renderRelatorio(); } }));
  };
  d.relatorio.forEach((_, i) => list.append(row(i)));
  const add = el('button', { class: 'add', type: 'button', html: icon('plus') + '<span>Adicionar linha</span>', onclick: () => {
    d.relatorio.push(''); touch(); renderRelatorio(); const all = $('tab-relatorio').querySelectorAll('textarea'); all[all.length - 1].focus(); } });
  box.append(el('div', { class: 'info' }, 'Cada linha vira uma linha da tabela "Relatório" no PDF. Linhas longas quebram sozinhas. Enter cria a próxima linha; colar um texto com várias linhas também funciona.'),
    card('note', 'Relatório', d.relatorio.length ? list : el('p', { class: 'help' }, 'Nenhuma linha ainda.')), add);
}

// ---- Material
function renderMaterial() {
  const d = cur.doc, box = $('tab-material'); box.innerHTML = '';
  d.material.forEach((m, i) => {
    box.append(el('div', { class: 'card' },
      el('h3', null, el('span', null, 'Item ' + (i + 1)), el('span', { class: 'grow' }),
        el('button', { class: 'del', type: 'button', html: icon('trash'), 'aria-label': 'Excluir', onclick: () => { d.material.splice(i, 1); touch(); renderMaterial(); toast('Item excluído.'); } })),
      inp('Descrição', m, 'desc'),
      el('div', { class: 'row3' }, inp('Qtd', m, 'qtd', { inputmode: 'decimal' }), inp('Código', m, 'cod'), inp('Preço', m, 'preco', { inputmode: 'decimal' }))));
  });
  const add = el('button', { class: 'add', type: 'button', html: icon('plus') + '<span>Adicionar item</span>' });
  add.addEventListener('click', () => {
    d.material.push({ qtd: '', desc: '', cod: '', preco: '' }); touch(); renderMaterial();
    const cards = box.querySelectorAll('.card'); const c = cards[cards.length - 1];
    if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.querySelector('input').focus(); }
  });
  if (!d.material.length) box.append(el('div', { class: 'info' }, 'Lista de materiais usados. Só os itens preenchidos saem no PDF; sem itens, a tabela não aparece.'));
  box.append(add);
}

// ---- Assinaturas
function renderAssinar() {
  const d = cur.doc, box = $('tab-assinar'); box.innerHTML = '';
  const tile = kind => {
    const img = d.sig[kind];
    return el('button', { class: 'sigtile' + (img ? ' done' : ''), type: 'button', onclick: () => openPad(kind) },
      el('span', { class: 'lbl', html: icon(img ? 'check' : 'pen') + '<span>' + (kind === 'tecnico' ? 'Assinatura do técnico' : 'Assinatura do cliente') + '</span>' }),
      img ? el('img', { src: img, alt: '' }) : el('span', { class: 'ph' }, 'Toque para assinar'));
  };
  const saved = pref('sig');
  box.append(el('div', { class: 'info' }, 'Toque num quadro para assinar com o dedo. Dica: vire o celular de lado para ter mais espaço.'), tile('cliente'),
    d.sig.cliente ? el('div', { class: 'siglinks' }, el('button', { type: 'button', onclick: () => { d.sig.cliente = null; touch(); renderAssinar(); } }, 'Remover assinatura')) : null,
    tile('tecnico'),
    el('div', { class: 'siglinks' },
      saved && el('button', { type: 'button', onclick: () => { d.sig.tecnico = saved; touch(); renderAssinar(); toast('Assinatura colocada.'); } }, 'Usar minha assinatura salva'),
      el('button', { type: 'button', onclick: () => $('fSig').click() }, saved ? 'Trocar imagem salva' : 'Escolher imagem da assinatura'),
      d.sig.tecnico && el('button', { type: 'button', onclick: () => { d.sig.tecnico = null; touch(); renderAssinar(); } }, 'Remover assinatura')));
}
$('fSig').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const url = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
  const im = new Image(); im.src = url; await im.decode().catch(() => {});
  const c = document.createElement('canvas'); const sc = Math.min(1, 900 / im.naturalWidth);
  c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const png = c.toDataURL('image/png'); pref('sig', png);
  if (cur) { cur.doc.sig.tecnico = png; touch(); renderAssinar(); }
  toast('Imagem guardada neste aparelho e colocada no rapport.');
});

/* ------------------------------------------------------------------ quadro de assinatura */
let padRatio = 2.6, padKind = null, strokes = [], curStroke = null;
const cv = $('padCanvas'), ctx = cv.getContext('2d');
function openPad(kind) {
  padKind = kind; strokes = []; curStroke = null;
  $('padTitle').textContent = kind === 'tecnico' ? 'Assinatura do técnico' : 'Assinatura do cliente';
  $('pad').hidden = false; push('pad'); sizePad();
}
function hidePad() { $('pad').hidden = true; padKind = null; }
function sizePad() {
  if ($('pad').hidden) return;
  const area = cv.parentElement.getBoundingClientRect();
  if (!strokes.length) padRatio = area.width > area.height ? 2.8 : 1.9;
  let w = area.width - 20, h = w / padRatio;
  if (h > area.height - 20) { h = area.height - 20; w = h * padRatio; }
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const line = document.querySelector('.padLine'), hint = document.querySelector('.padHint');
  const ox = (area.width - w) / 2, oy = (area.height - h) / 2;
  Object.assign(line.style, { left: ox + w * 0.06 + 'px', width: w * 0.88 + 'px', top: oy + h * 0.74 + 'px' });
  Object.assign(hint.style, { left: ox + w * 0.06 + 'px', top: oy + h * 0.74 - 26 + 'px' });
  hint.hidden = strokes.length > 0;
  redraw();
}
function redraw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#13308f'; ctx.fillStyle = '#13308f';
  for (const s of strokes) drawStroke(s, 0);
}
function drawStroke(s, from) {
  const W = cv.width, H = cv.height, k = W / 1000;
  for (let i = Math.max(1, from); i < s.length; i++) {
    const a = s[i - 1], b = s[i]; ctx.lineWidth = Math.max(1.2, (s.pen ? 1.4 + b[2] * 4 : 3) * k * 1.6);
    ctx.beginPath(); ctx.moveTo(a[0] * W, a[1] * H); ctx.lineTo(b[0] * W, b[1] * H); ctx.stroke();
  }
  if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0][0] * W, s[0][1] * H, 2.2 * k * 1.6, 0, Math.PI * 2); ctx.fill(); }
}
function ptOf(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.pressure || 0.5]; }
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  curStroke = [ptOf(e)]; curStroke.pen = e.pointerType === 'pen'; strokes.push(curStroke);
  document.querySelector('.padHint').hidden = true; drawStroke(curStroke, 0);
});
cv.addEventListener('pointermove', e => {
  if (!curStroke) return; e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; const from = curStroke.length;
  for (const ev of evs) curStroke.push(ptOf(ev));
  drawStroke(curStroke, from);
});
['pointerup', 'pointercancel'].forEach(tp => cv.addEventListener(tp, () => { curStroke = null; }));
window.addEventListener('resize', () => setTimeout(sizePad, 120));
$('padClear').addEventListener('click', () => { strokes = []; redraw(); document.querySelector('.padHint').hidden = false; });
$('padClose').addEventListener('click', back);
$('padOk').addEventListener('click', () => {
  if (!strokes.length) { toast('Assine antes de confirmar.', 'warn'); return; }
  const W = cv.width, H = cv.height, data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { toast('Assine antes de confirmar.', 'warn'); return; }
  const m = 6; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const kind = padKind; cur.doc.sig[kind] = out.toDataURL('image/png');
  touch(); back(); renderAssinar(); toast(kind === 'tecnico' ? 'Assinatura do técnico colocada.' : 'Assinatura do cliente colocada.');
});

/* ------------------------------------------------------------------ visualizar */
async function renderPreview() {
  const d = cur.doc, imgs = await sigImgs(d), pages = layoutDoc(d, imgs), box = $('prevPages'); box.innerHTML = '';
  $('prevSub').textContent = fileNameOf(d) + '.pdf · ' + plural(pages.length, 'página', 'páginas');
  pages.forEach((ops, p) => box.append(el('p', { class: 'plabel' }, 'Página ' + (p + 1) + ' de ' + pages.length), el('div', { class: 'ppage', html: pageSvg(ops, imgs) })));
}

/* ------------------------------------------------------------------ salvar e enviar */
let busy = false;
async function saveFlow() {
  if (!cur || busy) return;
  if (!cur.doc.head.cliente.trim()) {
    openSheet([el('h2', null, 'Falta o cliente'), el('p', null, 'O nome do cliente aparece no PDF e no nome do arquivo.'),
      el('div', { class: 'opts' },
        opt('main', 'edit', 'Preencher o cliente', null, () => { history.go(screen === 'preview' ? -2 : -1); setTimeout(() => { showTab('dados'); const i = $('tab-dados').querySelector('input'); if (i) i.focus(); }, 350); }),
        opt('', 'save', 'Salvar assim mesmo', null, doSave))]);
    return;
  }
  doSave();
}
async function doSave() {
  if (busy) return; busy = true;
  const d = cur.doc;
  try {
    let dir = null;
    if (IS_PC) { dir = await getDir(true); if (!dir) { busy = false; return; } }   // pede a pasta antes de gerar (precisa do clique)
    toast('Gerando o PDF…', '', 1500);
    const { bytes } = await buildPdf(d);
    cur.pdf = new Blob([bytes], { type: 'application/pdf' }); cur.status = 'saved'; cur.savedAt = Date.now(); cur.updated = Date.now();
    await DB.put(cur); rememberNames([d.head.tecResp, ...d.equipe]); updateBadges();
    const r = await saveToDevice(cur, false, dir);
    $('toast').className = '';
    if (r.ok === 'ask') return;               // perguntou se substitui; continua de lá
    askSend(cur, false, r);
  } catch (e) { console.error(e); toast('Erro ao gerar o PDF: ' + e.message, 'warn', 6000); }
  finally { busy = false; }
}
function savedMsg(r, name) { return r.where === 'downloads' ? '"' + name + '" foi para a pasta Downloads.' : 'Salvo em ' + r.where + '.'; }
// PC: grava na pasta escolhida (lembrada); celular: Downloads (ou o seletor de arquivo do navegador)
async function getDir(ask) {
  let h = null; try { h = await DB.kget('dir'); } catch (e) {}
  if (h) {
    let p = await h.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (p === 'granted') return h;
  }
  if (!ask) return null;
  try { h = await window.showDirectoryPicker({ id: 'rapportsDeltafrigo', mode: 'readwrite' }); }
  catch (e) { if (e.name !== 'AbortError') toast('Não foi possível abrir a pasta: ' + e.message, 'warn'); return null; }
  await DB.kset('dir', h); renderFolderInfo(); return h;
}
async function renderFolderInfo() {
  const b = $('folderInfo'); if (!b) return; b.hidden = !IS_PC; if (!IS_PC) return;
  let h = null; try { h = await DB.kget('dir'); } catch (e) {}
  b.innerHTML = ''; b.append(el('span', { html: icon('folder') }), el('span', null, h ? 'PDFs salvos na pasta "' + h.name + '"' : 'Ao salvar o primeiro PDF, escolha a pasta (ex.: Rapports Deltafrigo)'),
    el('button', { type: 'button', onclick: async () => { try { const n = await window.showDirectoryPicker({ id: 'rapportsDeltafrigo', mode: 'readwrite' }); await DB.kset('dir', n); renderFolderInfo(); toast('Pasta trocada para "' + n.name + '".'); } catch (e) {} } }, h ? 'Trocar' : 'Escolher'));
}
async function saveToDevice(rec, again, dir) {
  const name = fileNameOf(rec.doc) + '.pdf', file = new File([rec.pdf], name, { type: 'application/pdf' });
  if (IS_PC) {
    dir = dir || await getDir(true); if (!dir) return { ok: false };
    let exists = false; try { await dir.getFileHandle(name); exists = true; } catch (e) {}
    const write = async () => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(file); await w.close(); return { ok: true, where: dir.name + '\\' + name }; };
    if (exists && !again) {
      openSheet([el('h2', null, 'Substituir o PDF?'), el('p', null, '"' + name + '" já existe na pasta "' + dir.name + '".'),
        el('div', { class: 'opts' },
          opt('main', 'save', 'Substituir', null, async () => { const r = await write(); askSend(rec, false, r); }),
          opt('', 'edit', 'Mudar o nome do arquivo', 'Aba Dados → Nome do PDF', () => { history.go(screen === 'preview' ? -2 : -1); setTimeout(() => showTab('dados'), 350); }))]);
      return { ok: 'ask' };
    }
    return await write();
  }
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
      const w = await h.createWritable(); await w.write(file); await w.close();
      return { ok: true, where: h.name };
    } catch (e) { if (e.name === 'AbortError') return { ok: false }; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  return { ok: true, where: 'downloads' };
}
function askSend(rec, direct, saved) {
  const name = fileNameOf(rec.doc) + '.pdf';
  const ways = [el('h2', null, 'Enviar por'), el('p', null, '"' + name + '" vai como anexo.'),
    el('div', { class: 'opts' },
      opt('wa', 'chat', 'WhatsApp', null, () => share(rec, 'wa')),
      opt('tg', 'plane', 'Telegram', null, () => share(rec, 'tg')),
      opt('em', 'mail', 'E-mail', null, () => share(rec, 'em')),
      opt('', 'share', 'Outro app (Drive, Outlook…)', null, () => share(rec, 'other'))),
    el('button', { class: 'cancel', onclick: () => later(rec) }, 'Mais tarde')];
  if (direct) { openSheet(ways); return; }
  const where = !saved ? '' : saved.ok ? savedMsg(saved, name) : 'O PDF ficou guardado só no app.';
  openSheet([el('h2', { html: icon('check') + ' PDF pronto' }), el('p', null, where),
    el('div', { class: 'opts' },
      opt('main', 'send', 'Enviar agora', 'WhatsApp, Telegram ou e-mail, com o PDF anexado', () => openSheet(ways)),
      opt('', 'later', 'Mais tarde', 'Fica na lista como "não enviado"', () => later(rec)))]);
}
function goHome() { const n = stack.length - 1; if (n > 0) history.go(-n); }
function later(rec) { goHome(); toast('Ok. O rapport fica na lista para enviar depois.'); }
// plain = true: manda só o arquivo, sem título/texto (alguns navegadores recusam arquivo + texto)
async function share(rec, via, plain) {
  const file = new File([rec.pdf], fileNameOf(rec.doc) + '.pdf', { type: 'application/pdf' });
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { shareFail(rec, via, null, true); return; }
  if (via !== 'other') toast('Escolha ' + VIA[via] + ' na lista que abrir.', '', 2500);
  const h = rec.doc.head;
  const data = plain ? { files: [file] }
    : { files: [file], title: fileNameOf(rec.doc), text: 'Rapport Deltafrigo – ' + [h.cliente.trim(), isoToTxt(h.data, true), h.numero && 'Nº ' + h.numero].filter(Boolean).join(' – ') };
  try { await navigator.share(data); }
  catch (e) { if (e.name === 'AbortError') return; console.warn('share', e); shareFail(rec, via, e, plain); return; }
  markSent(rec, via);
}
async function markSent(rec, via) {
  rec.status = 'sent'; rec.sentAt = Date.now(); rec.sentVia = via; await DB.put(rec);
  if (cur && cur.id === rec.id) { cur.status = 'sent'; updateBadges(); }
  goHome(); setTimeout(renderHome, 250);
  toast('Rapport enviado.');
}
function shareFail(rec, via, e, final) {
  $('toast').className = '';
  const samsung = /SamsungBrowser/i.test(navigator.userAgent);
  openSheet([el('h2', { html: icon('alert') + ' Não foi possível enviar' }),
    el('p', null, e ? 'O navegador recusou: ' + (e.message || e.name) : 'Este navegador não envia anexos. Use o Chrome (Android, PC) ou o Safari (iPhone).'),
    samsung ? el('div', { class: 'warnbox' }, 'O Samsung Internet costuma bloquear o envio de anexos. Abra o app no Chrome.') : null,
    el('p', null, 'O PDF "' + fileNameOf(rec.doc) + '.pdf" já está salvo. Dá para anexar à mão no WhatsApp, Telegram ou e-mail.'),
    el('div', { class: 'opts' },
      final ? null : opt('main', 'send', 'Tentar de novo (só o PDF)', 'Manda só o arquivo, sem o texto da mensagem', () => share(rec, via, true)),
      opt('', 'check', 'Já enviei à mão', 'Marca o rapport como enviado', () => markSent(rec, 'manual')),
      opt('', 'later', 'Mais tarde', 'Fica na lista como "não enviado"', () => later(rec)))]);
}

/* ------------------------------------------------------------------ folha de opções */
function openSheet(children) {
  const s = $('sheet'), wasOpen = !s.hidden;
  s.innerHTML = ''; s.append(el('div', { class: 'grab' }), ...children.filter(Boolean));
  s.hidden = false; $('scrim').hidden = false; document.body.classList.add('sheetOpen');
  if (!wasOpen) push('sheet');
}
function hideSheet() { $('sheet').hidden = true; $('scrim').hidden = true; document.body.classList.remove('sheetOpen'); }
$('scrim').addEventListener('click', back);

/* ------------------------------------------------------------------ abrir PDF/JSON */
async function importFile(f) {
  try {
    const { data, pdf } = await readFileData(f);
    if (!data || !data.head) throw new Error('o arquivo não tem dados de rapport');
    const rec = { id: newId(), created: Date.now(), updated: Date.now(), status: pdf ? 'saved' : 'draft', doc: normDoc(data), pdf };
    await DB.put(rec); push('editor'); tab = 'dados'; openEditor(rec); toast('"' + f.name + '" aberto.');
  } catch (err) { console.error(err); toast('Não foi possível abrir "' + f.name + '": ' + err.message, 'warn', 6000); }
}
$('bImport').addEventListener('click', () => $('fImport').click());
$('fImport').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
document.addEventListener('dragover', e => { if (screen === 'home') e.preventDefault(); });
document.addEventListener('drop', e => { if (screen !== 'home') return; e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) importFile(f); });

/* ------------------------------------------------------------------ botões fixos */
$('bNew').addEventListener('click', newReport);
$('bBack').addEventListener('click', back);
$('bBackPrev').addEventListener('click', back);
$('bPrevEdit').addEventListener('click', back);
$('bPreview').addEventListener('click', () => { flushSave(); push('preview'); showScreen('preview'); renderPreview(); });
$('bSave').addEventListener('click', saveFlow);
$('bPrevSave').addEventListener('click', saveFlow);
for (const b of $('tabs').querySelectorAll('button')) b.addEventListener('click', () => showTab(b.dataset.tab));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && cur) { e.preventDefault(); saveFlow(); } });

/* ------------------------------------------------------------------ instalar / atualizar */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; applyStatic(); });
$('bInstall').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('bInstall').hidden = true; });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  const askUpdate = (reg, w) => {
    if (!navigator.serviceWorker.controller || !$('sheet').hidden) return;
    openSheet([el('h2', null, 'Versão nova disponível'), el('p', null, 'Atualizar agora? Os rapports guardados continuam.'),
      el('div', { class: 'opts' }, opt('main', 'check', 'Atualizar', null, () => { (reg.waiting || w).postMessage('skip'); }), opt('', 'later', 'Mais tarde', null, back))]);
  };
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting) askUpdate(reg, reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed') askUpdate(reg, nw); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (reg.waiting) askUpdate(reg, reg.waiting); else reg.update().catch(() => {}); });
  }).catch(() => {});
}

/* ------------------------------------------------------------------ início do app */
(async () => {
  history.replaceState({ idx: 0 }, '');
  applyStatic();
  const doc = await PDFLib.PDFDocument.create(), S = PDFLib.StandardFonts;
  FONTS = { R: await doc.embedFont(S.Helvetica), B: await doc.embedFont(S.HelveticaBold), I: await doc.embedFont(S.HelveticaOblique), BI: await doc.embedFont(S.HelveticaBoldOblique) };
  LOGO = new Uint8Array(await (await fetch('logo.png')).arrayBuffer());
  await renderHome();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
