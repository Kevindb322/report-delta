'use strict';
/* Planilha Excel no modelo da quinzena do Kevin (horas e diárias).
   Colunas: Data | Dia | Horário (Início, Fim, Intervalo, Horas Decimais) | Pessoas (um técnico por coluna).
   Embaixo: "Total de Horas na quinzena" e "Total de Diárias na quinzena" (8 h = 1 diária), com fórmulas.
   Uma aba para cada 15 datas (a mesma contagem do fechamento do app: datas com horas + domingos automáticos).
   O .xlsx é montado aqui mesmo (XML + zip sem compressão), sem biblioteca externa, para funcionar offline.
   Usa funções do app.js: calcAll, workDates, tecSummary, isSunday, isoToTxt, fileNameOf, BLOCO_DATAS. */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// uma linha para cada linha de horas do app (datas repetidas aparecem todas, com a mesma cor do PDF);
// domingo automático (sábado e segunda trabalhados) entra como linha zerada.
// As abas são de 15 datas diferentes (mesma contagem do fechamento), não de 15 linhas.
function quinzenaRows(d) {
  const calc = calcAll(d.tempos), tecs = tecSummary(d, calc).map(t => t.nome);
  const dias = workDates(d, calc).map(dt => {
    const idx = d.tempos.map((r, i) => i).filter(i => d.tempos[i].data === dt && calc.rows[i].total !== null)
      .sort((x, y) => (calc.rows[x].S ?? -1) - (calc.rows[y].S ?? -1) || x - y);
    const lines = idx.map(i => {
      const c = calc.rows[i], per = {};
      for (const n of d.tempos[i].tecs) per[n] = (per[n] || 0) + c.total;
      return { data: dt, domTrab: isSunday(dt), ini: c.work !== null ? c.S : null, fim: c.work !== null ? (c.S + c.work) % 1440 : null, total: c.total, per };
    });
    if (!lines.length) lines.push({ data: dt, domTrab: false, ini: null, fim: null, total: 0, per: {} });
    // sobreposição no mesmo dia (conta uma vez no total de horas, como no PDF)
    const iv = idx.filter(i => calc.rows[i].work !== null).map(i => [calc.rows[i].S, calc.rows[i].S + calc.rows[i].work]).sort((x, y) => x[0] - y[0]);
    let raw = 0, uni = 0, cs = null, ce = null;
    for (const [x, y] of iv) { raw += y - x; if (cs === null || x > ce) { if (cs !== null) uni += ce - cs; cs = x; ce = y; } else ce = Math.max(ce, y); }
    if (cs !== null) uni += ce - cs;
    return { data: dt, lines, ovl: raw - uni };
  });
  let cor = 0;
  for (const dia of dias) if (dia.lines.length > 1) { const f = DUP_COLORS[cor++ % DUP_COLORS.length].slice(1).toUpperCase(); dia.lines.forEach(l => { l.fill = f; }); }
  const blocos = [];
  for (let i = 0; i < dias.length; i += BLOCO_DATAS) {
    const grupo = dias.slice(i, i + BLOCO_DATAS);
    blocos.push({ lines: grupo.flatMap(g => g.lines), ovls: grupo.filter(g => g.ovl > 0).map(g => ({ data: g.data, min: g.ovl })) });
  }
  return { tecs, blocos };
}

/* ---------------- estilos (registro com deduplicação) */
function xStyles() {
  const fonts = ['<font><sz val="10"/><name val="Arial"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
    borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], fmts = [], xfs = [], keys = {};
  const add = (list, xml) => { let i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; };
  const FMT_IDS = { general: 0, '0.00': 2 };
  function style(o) {
    const k = JSON.stringify(o); if (k in keys) return keys[k];
    const f = add(fonts, '<font>' + (o.b ? '<b/>' : '') + '<sz val="' + (o.sz || 10) + '"/>' + (o.color ? '<color rgb="FF' + o.color + '"/>' : '') + '<name val="Arial"/></font>');
    const fi = o.fill ? add(fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + o.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
    const side = (n, w) => w ? '<' + n + ' style="' + w + '"><color rgb="FF000000"/></' + n + '>' : '<' + n + '/>';
    const bd = o.bd ? add(borders, '<border>' + side('left', o.bd[0]) + side('right', o.bd[1]) + side('top', o.bd[2]) + side('bottom', o.bd[3]) + '<diagonal/></border>') : 0;
    let nf = 0;
    if (o.fmt) { if (o.fmt in FMT_IDS) nf = FMT_IDS[o.fmt]; else { let j = fmts.indexOf(o.fmt); if (j < 0) { fmts.push(o.fmt); j = fmts.length - 1; } nf = 164 + j; } }
    const al = '<alignment horizontal="' + (o.h || 'center') + '" vertical="center"' + (o.wrap ? ' wrapText="1"' : '') + '/>';
    xfs.push('<xf numFmtId="' + nf + '" fontId="' + f + '" fillId="' + fi + '" borderId="' + bd + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al + '</xf>');
    return (keys[k] = xfs.length);   // +1: o estilo 0 é o padrão
  }
  function xml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (fmts.length ? '<numFmts count="' + fmts.length + '">' + fmts.map((f, j) => '<numFmt numFmtId="' + (164 + j) + '" formatCode="' + xesc(f) + '"/>').join('') + '</numFmts>' : '') +
      '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
      '<borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + (xfs.length + 1) + '"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }
  return { style, xml };
}
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = c => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
const excelDate = iso => { const [y, m, dd] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(1899, 11, 30)) / 86400000); };

/* ---------------- uma aba (quinzena) */
const XC = { yellow: 'FFF2CC', green: '7CF04C', cyan: '80FFFF', blueGray: 'D6DCE4', pink: 'E6B8B7', nameFill: 'E2EFDA', cellFill: 'C6E0D0', blue: '5B7FD9', red: 'C00000' };
function sheetXml(d, tecs, blk, nBloco, totBlocos, S) {
  const bloco = blk.lines, ovl = blk.ovls.reduce((t, o) => t + o.min, 0);
  const nP = tecs.length, lastCol = 5 + Math.max(nP, 0);   // A..F + técnicos
  const rows = {}, merges = [], heights = {};
  const put = (r, c, cell) => { (rows[r] = rows[r] || [])[c] = cell; };
  // bordas: grossas no contorno, entre Dia|Horário e Horário|Pessoas e embaixo dos títulos
  const vThick = c => c === 0 || c === 2 || c === 6 || c === lastCol + 1;
  const TOP = 3, H2 = TOP + 1, R0 = TOP + 2, RN = R0 + bloco.length - 1;
  const bd = (r, c) => [vThick(c) ? 'medium' : 'thin', vThick(c + 1) ? 'medium' : 'thin', r === TOP ? 'medium' : 'thin', (r === H2 || r === RN) ? 'medium' : 'thin'];

  // cabeçalho do relatório (acima da tabela)
  const h = d.head, per = bloco.length ? isoToTxt(bloco[0].data, true) + ' a ' + isoToTxt(bloco[bloco.length - 1].data, true) : '';
  put(1, 0, { s: [h.cliente.trim() || '(sem cliente)', h.obra.trim() && 'Obra: ' + h.obra.trim(), h.numero.trim() && 'Relatório nº ' + h.numero.trim()].filter(Boolean).join('   ·   '), st: S.style({ b: 1, sz: 12, h: 'left' }) });
  put(2, 0, { s: 'Período: ' + per + (totBlocos > 1 ? '   (quinzena ' + nBloco + ' de ' + totBlocos + ')' : ''), st: S.style({ h: 'left', color: '404040' }) });

  // títulos (2 linhas)
  const hd = (r, c, s, fill, o = {}) => put(r, c, { s, st: S.style(Object.assign({ b: 1, fill, bd: bd(r, c) }, o)) });
  hd(TOP, 0, 'Data', XC.yellow); hd(H2, 0, '', XC.yellow); merges.push('A' + TOP + ':A' + H2);
  hd(TOP, 1, 'Dia', XC.yellow); hd(H2, 1, '', XC.yellow); merges.push('B' + TOP + ':B' + H2);
  for (let c = 2; c <= 5; c++) hd(TOP, c, c === 2 ? 'Horário' : '', XC.green); merges.push('C' + TOP + ':F' + TOP);
  hd(H2, 2, 'Início', XC.blueGray); hd(H2, 3, 'Fim', XC.pink); hd(H2, 4, 'Intervalo', XC.blueGray); hd(H2, 5, 'Horas Decimais', XC.pink);
  if (nP) {
    for (let j = 0; j < nP; j++) { hd(TOP, 6 + j, j === 0 ? 'Pessoas' : '', XC.cyan); hd(H2, 6 + j, tecs[j], XC.nameFill, { b: 0 }); }
    if (nP > 1) merges.push(colName(6) + TOP + ':' + colName(5 + nP) + TOP);
  }
  heights[TOP] = 18; heights[H2] = 18;

  // linhas das datas
  bloco.forEach((q, k) => {
    const r = R0 + k, red = Object.assign(q.domTrab ? { color: XC.red } : {}, q.fill ? { fill: q.fill } : {});
    put(r, 0, { n: excelDate(q.data), st: S.style(Object.assign({ fmt: 'dd/mm', bd: bd(r, 0) }, red)) });
    put(r, 1, { s: DIAS_SEMANA[new Date(q.data + 'T12:00:00').getDay()] + (q.domTrab ? ' (trab.)' : ''), st: S.style(Object.assign({ bd: bd(r, 1) }, red)) });
    put(r, 2, q.ini === null ? { st: S.style(Object.assign({ bd: bd(r, 2) }, red)) } : { n: q.ini / 1440, st: S.style(Object.assign({ fmt: 'h:mm', bd: bd(r, 2) }, red)) });
    put(r, 3, q.fim === null ? { st: S.style(Object.assign({ bd: bd(r, 3) }, red)) } : { n: q.fim / 1440, st: S.style(Object.assign({ fmt: 'h:mm', bd: bd(r, 3) }, red)) });
    put(r, 4, { n: q.total / 1440, st: S.style(Object.assign({ fmt: '[h]:mm', bd: bd(r, 4) }, red)) });
    put(r, 5, { f: 'E' + r + '*24', n: q.total / 60, st: S.style(Object.assign({ fmt: '0.00', bd: bd(r, 5) }, red)) });
    tecs.forEach((n, j) => put(r, 6 + j, { n: (q.per[n] || 0) / 60, st: S.style({ fmt: '0.00', fill: XC.cellFill, bd: bd(r, 6 + j) }) }));
  });

  // totais
  const T1 = RN + 1, T2 = RN + 2, lab = S.style({ color: XC.blue, wrap: 1 }), val = S.style({ color: XC.blue, fmt: '0.00' });
  put(T1, 4, { s: 'Total de Horas\nna quinzena:', st: lab }); put(T2, 4, { s: 'Total de Diárias\nna quinzena:', st: lab });
  heights[T1] = 30; heights[T2] = 30;
  const sumCol = c => { let s = 0; bloco.forEach((q, k) => { const cell = rows[R0 + k][c]; s += cell.n || 0; }); return Math.round(s * 100) / 100; };
  for (let c = 5; c <= lastCol; c++) {
    const L = colName(c), desc = c === 5 && ovl ? Math.round(ovl / 60 * 100) / 100 : 0, tot = Math.round(((bloco.length ? sumCol(c) : 0) - desc) * 100) / 100;
    put(T1, c, { f: bloco.length ? 'SUM(' + L + R0 + ':' + L + RN + ')' + (desc ? '-' + desc : '') : '0', n: tot, st: val });
    put(T2, c, { f: L + T1 + '/8', n: tot / 8, st: val });
  }

  if (ovl) put(T2 + 1, 0, { s: 'Total de Horas: horários sobrepostos no mesmo dia contam uma vez (descontado ' + blk.ovls.map(o => hmStr(o.min) + ' em ' + isoToTxt(o.data, false).slice(0, 5)).join(', ') + ').', st: S.style({ h: 'left', color: '404040', sz: 9 }) });
  // XML
  const cellXml = (r, c, x) => {
    const ref = colName(c) + r, st = x.st ? ' s="' + x.st + '"' : '';
    if (x.f !== undefined) return '<c r="' + ref + '"' + st + '><f>' + xesc(x.f) + '</f><v>' + x.n + '</v></c>';
    if (x.n !== undefined) return '<c r="' + ref + '"' + st + '><v>' + x.n + '</v></c>';
    if (x.s !== undefined && x.s !== '') return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(x.s) + '</t></is></c>';
    return '<c r="' + ref + '"' + st + '/>';
  };
  const widths = [9, 15, 10, 10, 13, 15, ...tecs.map(n => Math.max(12, Math.min(28, n.length * 1.15 + 3)))];
  let sd = '';
  for (const r of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
    sd += '<row r="' + r + '"' + (heights[r] ? ' ht="' + heights[r] + '" customHeight="1"' : '') + '>';
    rows[r].forEach((x, c) => { if (x) sd += cellXml(r, c, x); });
    sd += '</row>';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:' + colName(lastCol) + (RN + 3) + '"/>' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
    '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w.toFixed(1) + '" customWidth="1"/>').join('') + '</cols>' +
    '<sheetData>' + sd + '</sheetData>' +
    (merges.length ? '<mergeCells count="' + merges.length + '">' + merges.map(m => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>' : '') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
}

/* ---------------- zip (sem compressão) */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {          // files: [{name, data: Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF,
    dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + sz;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

/* ---------------- arquivo .xlsx */
function buildXlsx(d) {
  const { tecs, blocos } = quinzenaRows(d), S = xStyles();
  if (!blocos.length) blocos.push({ lines: [], ovls: [] });
  const sheets = blocos.map((b, i) => sheetXml(d, tecs, b, i + 1, blocos.length, S));
  const names = blocos.map((b, i) => blocos.length > 1 ? 'Quinzena ' + (i + 1) : 'Quinzena');
  const enc = new TextEncoder(), X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const files = [
    { name: '[Content_Types].xml', xml: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', xml: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', xml: X + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + xesc(fileNameOf(d)) + '</dc:title><dc:creator>Relatório Deltafrigo ' + xesc(typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') + '</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>' },
    { name: 'xl/workbook.xml', xml: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
      names.map((n, i) => '<sheet name="' + xesc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', xml: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    ...sheets.map((s, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', xml: s })),
    { name: 'xl/styles.xml', xml: S.xml() }      // por último: os estilos só ficam completos depois das abas
  ];
  return zipStore(files.map(f => ({ name: f.name, data: enc.encode(f.xml) })));
}
function xlsxFile(d) { d = normDoc(d); return new File([buildXlsx(d)], fileNameOf(d) + '.xlsx', { type: XLSX_MIME }); }
