import { removeBackground } from '@imgly/background-removal';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), file = $('file'), erro = $('erro'), tela = $('tela');
const FONTES = [['Anton', 400], ['League Spartan', 900], ['Bebas Neue', 400], ['Archivo Black', 400], ['Bangers', 400], ['Luckiest Guy', 400],
  ['Montserrat', 900], ['Oswald', 700], ['Passion One', 900], ['Permanent Marker', 400], ['Poppins', 800], ['Russo One', 400]];
const fnt = (f, tam) => `${f[1]} ${tam}px "${f[0]}", Impact, sans-serif`;

let nome = 'imagem', fundo = '', tipoFundo = 'cor', imgFundo = null;
let base = null, edit = null, origCv = null, caixa = null;       // recorte da IA, recorte editável, original, área do sujeito
let acoes = [], tracado = null, ultimo = null, quadro = 0;
let offX = 0, offY = 0, espelhado = false, interativo = false, arrasto = null;
let ferramenta = '', espiando = false, T = { sx: 0, sy: 0, k: 1, dx: 0, dy: 0, w: 0, h: 0 };
let camadas = [], sel = 's', uid = 0, avisoT = 0;                // pilha de camadas: de baixo para cima

const novoCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
const porId = (id) => camadas.find((l) => l.id === id);
function aviso(t) { const a = $('aviso'); a.textContent = t; a.classList.remove('hidden'); clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.add('hidden'), 4500); }

// ---------- entrada ----------
drop.onclick = () => file.click();
$('novo').onclick = () => file.click();
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
file.onchange = () => { if (file.files[0]) usar(file.files[0]); file.value = ''; };
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && usar(e.dataTransfer.files[0]));
document.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (f) usar(f);
});

function habilitar(on) {
  document.querySelectorAll('.tool,#manchas,#espiar,#baixar').forEach((b) => (b.disabled = !on));
  $('desfazer').disabled = !on || !acoes.length;
}
function status(t) { $('status').textContent = t; $('status').classList.toggle('hidden', !t); }

async function usar(f) {
  erro.textContent = '';
  if (!f.type.startsWith('image/')) { erro.textContent = 'Escolha um arquivo de imagem (JPG, PNG ou WebP).'; return; }
  nome = f.name.replace(/\.[^.]+$/, '') || 'imagem';
  base = edit = origCv = caixa = null; acoes = []; offX = offY = 0; espelhado = false; $('espelhar').setAttribute('aria-pressed', 'false');
  camadas = [{ id: 's', tipo: 'sujeito', vis: true }]; sel = 's'; escolher('');
  $('entrada').classList.add('hidden'); $('app').classList.remove('hidden'); $('novo').classList.remove('hidden');
  habilitar(false); aba('camadas'); listar(); props(); desenhar(); status('Preparando…');

  // qualidade máxima: modelo isnet (fp32), PNG sem perdas, imagem no tamanho original
  const cfg = {
    model: 'isnet',
    output: { format: 'image/png', quality: 1 },
    progress: (key, atual, total) => {
      const pct = total ? Math.round((atual / total) * 100) : 0;
      status(String(key).startsWith('fetch') ? `Baixando o modelo (só na primeira vez): ${pct}%` : 'Removendo o fundo…');
    },
  };
  try {
    let blob;
    try { blob = await removeBackground(f, navigator.gpu ? { ...cfg, device: 'gpu' } : cfg); }
    catch (e) { if (!navigator.gpu) throw e; blob = await removeBackground(f, cfg); }
    base = await createImageBitmap(blob);
    const orig = await createImageBitmap(f);
    origCv = novoCanvas(base.width, base.height);
    origCv.getContext('2d').drawImage(orig, 0, 0, base.width, base.height);
    edit = novoCanvas(base.width, base.height);
    refazer(); caixa = achar(edit);
    habilitar(true); status(''); desenhar();
  } catch (e) {
    console.error(e);
    erro.textContent = 'Não foi possível remover o fundo desta imagem. Tente outra imagem ou recarregue a página.';
    status('');
  }
}

// ---------- camadas ----------
function addTexto(dados = {}) {
  return { id: 't' + ++uid, tipo: 'texto', vis: true, txt: 'SEU TÍTULO', fonte: 0, tam: 115, cor: '#ffe600', borda: '#000000', bw: 16, bb: 0, sh: true,
    b: false, i: false, u: false, s: false, caps: false, al: 'c', ls: 0, lh: 1.08, op: 100, x: 0.5, y: 0.82, box: null, ...dados };
}
function listar() {
  const ul = $('lista'); ul.replaceChildren();
  [...camadas].reverse().forEach((l) => {
    const li = mk('li', 'item'); li.setAttribute('aria-current', l.id === sel);
    const olho = mk('button', 'olho', l.vis ? '👁' : '◌'); olho.setAttribute('aria-pressed', l.vis); olho.setAttribute('aria-label', 'Mostrar ou ocultar camada');
    olho.onclick = () => { l.vis = !l.vis; listar(); desenhar(); };
    const rotulo = l.tipo === 'sujeito' ? 'Sujeito (recorte)' : 'T  ' + (l.txt.split('\n')[0].trim() || 'Texto vazio');
    const nomeBtn = mk('button', 'nome', rotulo);
    nomeBtn.onclick = () => selecionar(l.id);
    li.append(olho, nomeBtn); ul.append(li);
  });
  const fx = mk('li', 'item fixo'); const b = mk('button', 'nome', 'Fundo'); b.onclick = () => aba('fundo'); fx.append(b); ul.append(fx);
}
function selecionar(id) { sel = id; listar(); props(); desenhar(); }
const TOG = { bB: 'b', bI: 'i', bU: 'u', bS: 's', bCaps: 'caps' };
const ALIN = {
  l: '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 7h8M2 11h10"/></svg>',
  c: '<svg viewBox="0 0 16 16"><path d="M2 3h12M4 7h8M3 11h10"/></svg>',
  r: '<svg viewBox="0 0 16 16"><path d="M2 3h12M6 7h8M4 11h10"/></svg>',
};
function props() {
  const l = porId(sel), t = l?.tipo === 'texto', i = camadas.indexOf(l);
  $('p-sujeito').classList.toggle('hidden', t); $('p-texto').classList.toggle('hidden', !t);
  $('barraTexto').classList.toggle('hidden', !t);
  $('subir').disabled = !l || i >= camadas.length - 1; $('descer').disabled = !l || i <= 0;
  $('dup').disabled = $('del').disabled = !t;
  if (!t) { fechar(); return; }
  Object.entries({ txt: l.txt, tam: Math.round(l.tam), tc: l.cor, tb: l.borda, bw: l.bw, bb: l.bb, ls: l.ls, lh: l.lh, op: l.op }).forEach(([k, v]) => ($(k).value = v));
  $('ts').checked = l.sh; $('barraCor').style.background = l.cor;
  const f = FONTES[l.fonte], bf = $('bFonte');
  bf.textContent = f[0]; bf.style.fontFamily = `"${f[0]}"`;
  Object.entries(TOG).forEach(([id, k]) => $(id).setAttribute('aria-pressed', !!l[k]));
  $('bAlin').innerHTML = ALIN[l.al];
  document.querySelectorAll('.chip').forEach((c, n) => c.setAttribute('aria-pressed', n === l.fonte));
  const k = camadas.findIndex((c) => c.tipo === 'sujeito');
  $('pAtras').setAttribute('aria-pressed', i < k); $('pFrente').setAttribute('aria-pressed', i > k);
}
function ordenar(d) {
  const i = camadas.indexOf(porId(sel)), j = i + d;
  if (j < 0 || j >= camadas.length) return;
  [camadas[i], camadas[j]] = [camadas[j], camadas[i]]; listar(); props(); desenhar();
}
function posRel(frente) { // coloca o texto logo atrás ou logo à frente do sujeito
  const l = porId(sel); if (l?.tipo !== 'texto') return;
  camadas = camadas.filter((c) => c !== l);
  const k = camadas.findIndex((c) => c.tipo === 'sujeito');
  camadas.splice(frente ? k + 1 : k, 0, l); listar(); props(); desenhar();
}
$('addTxt').onclick = () => { const l = addTexto(); camadas.push(l); sel = l.id; aba('camadas'); listar(); props(); desenhar(); $('txt').focus(); };
$('subir').onclick = () => ordenar(1);
$('descer').onclick = () => ordenar(-1);
$('dup').onclick = () => {
  const o = porId(sel); if (o?.tipo !== 'texto') return;
  const l = addTexto({ ...o, box: null, x: o.x + 0.03, y: o.y + 0.03 });
  camadas.splice(camadas.indexOf(o) + 1, 0, l); selecionar(l.id);
};
$('del').onclick = () => { const l = porId(sel); if (l?.tipo !== 'texto') return; camadas = camadas.filter((c) => c !== l); selecionar('s'); };
$('pAtras').onclick = () => posRel(false);
$('pFrente').onclick = () => posRel(true);
// ---------- barra de formatação do texto ----------
const txtAtual = () => { const l = porId(sel); return l?.tipo === 'texto' ? l : null; };
function aplicarTexto() {
  const l = txtAtual(); if (!l) return;
  Object.assign(l, { txt: $('txt').value, tam: Math.min(600, Math.max(10, +$('tam').value || l.tam)), cor: $('tc').value, borda: $('tb').value,
    bw: +$('bw').value, bb: +$('bb').value, sh: $('ts').checked, ls: +$('ls').value, lh: +$('lh').value, op: +$('op').value });
  $('barraCor').style.background = l.cor; listar(); desenhar();
}
['txt', 'tam', 'tc', 'tb', 'bw', 'bb', 'ts', 'ls', 'lh', 'op'].forEach((id) => $(id).addEventListener('input', aplicarTexto));
[['tMenos', -5], ['tMais', 5]].forEach(([id, d]) => ($(id).onclick = () => {
  const l = txtAtual(); if (!l) return;
  l.tam = Math.min(600, Math.max(10, Math.round(l.tam) + d)); $('tam').value = l.tam; desenhar();
}));
Object.entries(TOG).forEach(([id, k]) => ($(id).onclick = () => { const l = txtAtual(); if (l) { l[k] = !l[k]; props(); desenhar(); } }));
$('bAlin').onclick = () => { const l = txtAtual(); if (l) { l.al = { l: 'c', c: 'r', r: 'l' }[l.al]; props(); desenhar(); } };
function fechar() { $('pop').classList.add('hidden'); document.querySelectorAll('[data-abre]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
function abrir(n) {
  const p = $('pop'), igual = !p.classList.contains('hidden') && p.dataset.aberto === n;
  fechar(); if (igual) return;
  document.querySelectorAll('[data-pop]').forEach((e) => e.classList.toggle('hidden', e.dataset.pop !== n));
  p.dataset.aberto = n; p.classList.remove('hidden');
  document.querySelectorAll('[data-abre]').forEach((b) => b.setAttribute('aria-expanded', b.dataset.abre === n));
}
document.querySelectorAll('[data-abre]').forEach((b) => (b.onclick = () => abrir(b.dataset.abre)));
$('fechaPop').onclick = fechar;
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#barraWrap')) fechar(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
$('oFrente').onclick = () => ordenar(1);
$('oTras').onclick = () => ordenar(-1);
document.querySelectorAll('[data-al]').forEach((b) => (b.onclick = () => { // alinhar o texto na imagem
  const l = txtAtual(); if (!l?.box) return;
  const bw = l.box.w / tela.width / 2, bh = l.box.h / tela.height / 2, m = 0.03, a = b.dataset.al;
  if (a === 'esq') l.x = bw + m; if (a === 'cen') l.x = 0.5; if (a === 'dir') l.x = 1 - bw - m;
  if (a === 'topo') l.y = bh + m; if (a === 'meio') l.y = 0.5; if (a === 'base') l.y = 1 - bh - m;
  desenhar();
}));
FONTES.forEach((f, i) => {
  const b = mk('button', 'chip', f[0]); b.style.fontFamily = `"${f[0]}"`; b.style.fontWeight = f[1]; b.setAttribute('aria-pressed', 'false');
  b.onclick = () => { const l = porId(sel); if (l?.tipo === 'texto') { l.fonte = i; props(); desenhar(); fechar(); } };
  $('fontes').append(b);
});
Promise.all(FONTES.map((f) => document.fonts.load(fnt(f, 32)))).then(desenhar);

// ---------- abas ----------
function aba(n) {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === n));
  document.querySelectorAll('[data-p]').forEach((p) => p.classList.toggle('hidden', p.dataset.p !== n));
  if (n !== 'retoque' && ferramenta) { escolher(''); if (edit) caixa = achar(edit); }
  desenhar();
}
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => aba(t.dataset.tab)));

// ---------- retoque ----------
const tmp = novoCanvas(1, 1);

function carimbar(x, y, r, restaurar) {
  const d = Math.ceil(r * 2) + 2, o = Math.floor(r) + 1;
  const ex = edit.getContext('2d');
  const g = ex.createRadialGradient(0, 0, r * 0.6, 0, 0, r); // borda suave
  g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  if (restaurar) {
    if (tmp.width !== d) { tmp.width = d; tmp.height = d; }
    const t = tmp.getContext('2d');
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, d, d);
    t.drawImage(origCv, x - o, y - o, d, d, 0, 0, d, d);
    t.globalCompositeOperation = 'destination-in';
    t.save(); t.translate(o, o); t.fillStyle = g; t.fillRect(-o, -o, d, d); t.restore();
    ex.drawImage(tmp, x - o, y - o);
  } else {
    ex.save(); ex.globalCompositeOperation = 'destination-out';
    ex.translate(x, y); ex.fillStyle = g; ex.fillRect(-o, -o, d, d); ex.restore();
  }
}

function refazer() { // reconstrói o recorte: resultado da IA + todas as edições
  const ex = edit.getContext('2d');
  ex.globalCompositeOperation = 'source-over';
  ex.clearRect(0, 0, edit.width, edit.height);
  ex.drawImage(base, 0, 0);
  for (const a of acoes) {
    if (a.m) { ex.globalCompositeOperation = 'destination-out'; ex.drawImage(a.m, 0, 0, edit.width, edit.height); ex.globalCompositeOperation = 'source-over'; }
    else a.pts.forEach((p) => carimbar(...p));
  }
}

function manchas() { // apaga ilhas pequenas e soltas, mantendo as partes grandes
  const k = Math.min(1, 512 / Math.max(edit.width, edit.height));
  const w = Math.max(1, Math.round(edit.width * k)), h = Math.max(1, Math.round(edit.height * k));
  const c = novoCanvas(w, h), x = c.getContext('2d');
  x.drawImage(edit, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const lab = new Int32Array(w * h), area = [0], pilha = [];
  for (let i = 0; i < w * h; i++) {
    if (lab[i] || d[i * 4 + 3] <= 32) continue;
    const n = area.length; let a = 0; lab[i] = n; pilha.push(i);
    while (pilha.length) {
      const p = pilha.pop(); a++;
      const px = p % w, py = (p - px) / w;
      for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, py > 0 ? p - w : -1, py < h - 1 ? p + w : -1]) {
        if (q >= 0 && !lab[q] && d[q * 4 + 3] > 32) { lab[q] = n; pilha.push(q); }
      }
    }
    area.push(a);
  }
  const limite = Math.max(...area) * 0.02;
  const out = x.createImageData(w, h), marcadas = new Set();
  for (let i = 0; i < w * h; i++) {
    const l = lab[i];
    if (!l || area[l] >= limite) continue;
    marcadas.add(l);
    const px = i % w, py = (i - px) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const qx = px + dx, qy = py + dy;
      if (qx >= 0 && qx < w && qy >= 0 && qy < h) out.data[(qy * w + qx) * 4 + 3] = 255;
    }
  }
  if (!marcadas.size) { aviso('Nenhuma mancha solta encontrada.'); return; }
  const m = novoCanvas(w, h); m.getContext('2d').putImageData(out, 0, 0);
  acoes.push({ m }); refazer(); desenhar(); habilitar(true);
  aviso(`${marcadas.size} mancha(s) removida(s). Se algo importante sumiu, use “Desfazer”.`);
}
$('manchas').onclick = () => edit && manchas();

function escolher(t) {
  ferramenta = t;
  document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === t));
  tela.classList.toggle('editando', !!t);
  if (!t) $('anel').style.display = 'none';
}
document.querySelectorAll('.tool').forEach((b) => (b.onclick = () => {
  const sai = ferramenta === b.dataset.t;
  escolher(sai ? '' : b.dataset.t);
  if (sai && edit) { caixa = achar(edit); }
  desenhar();
}));
$('desfazer').onclick = () => { acoes.pop(); refazer(); desenhar(); habilitar(true); };
const ver = (v) => () => { espiando = v; desenhar(); };
$('espiar').addEventListener('pointerdown', ver(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => $('espiar').addEventListener(t, ver(false)));

function ponto(e) {
  const r = tela.getBoundingClientRect(), esc = tela.width / r.width;
  const cx = (e.clientX - r.left) * esc, cy = (e.clientY - r.top) * esc, lx = cx - T.dx;
  return [T.sx + (espelhado ? T.w - lx : lx) / T.k, T.sy + (cy - T.dy) / T.k, (parseFloat($('pincel').value) / 2) * esc / T.k];
}
function marcar(e) {
  const [x, y, r] = ponto(e), rest = ferramenta === 'restaurar';
  const st = (px, py) => { carimbar(px, py, r, rest); tracado.pts.push([px, py, r, rest]); };
  if (!ultimo) st(x, y);
  else {
    const dx = x - ultimo[0], dy = y - ultimo[1], n = Math.floor(Math.hypot(dx, dy) / Math.max(1, r * 0.25));
    if (!n) return;
    for (let i = 1; i <= n; i++) st(ultimo[0] + (dx * i) / n, ultimo[1] + (dy * i) / n);
  }
  ultimo = [x, y]; agendar();
}

// ---------- interação no palco: selecionar, arrastar, pintar ----------
const frac = (e) => { const r = tela.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
const caixaDe = (l) => (l.tipo === 'texto' ? l.box : edit ? { x: T.dx, y: T.dy, w: T.w, h: T.h } : null);
const dentro = (b, x, y) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

tela.addEventListener('pointerdown', (e) => {
  if (!edit) return;
  tela.setPointerCapture(e.pointerId); interativo = true;
  if (ferramenta) { tracado = { pts: [] }; ultimo = null; marcar(e); return; }
  const [fx, fy] = frac(e), px = fx * tela.width, py = fy * tela.height;
  const atual = porId(sel);
  let alvo = atual && atual.vis && dentro(caixaDe(atual), px, py) ? atual : null; // mantém a camada já selecionada
  for (let i = camadas.length - 1; i >= 0 && !alvo; i--) if (camadas[i].vis && dentro(caixaDe(camadas[i]), px, py)) alvo = camadas[i];
  if (!alvo) { interativo = false; return; }
  if (alvo.id !== sel) { sel = alvo.id; listar(); props(); aba('camadas'); }
  arrasto = alvo.tipo === 'texto' ? { l: alvo, fx, fy, a: alvo.x, b: alvo.y } : { l: alvo, fx, fy, a: offX, b: offY };
});
tela.addEventListener('pointermove', (e) => {
  if (ferramenta) {
    const a = $('anel'), s = $('stage').getBoundingClientRect();
    a.style.display = 'block'; a.style.width = a.style.height = $('pincel').value + 'px';
    a.style.left = e.clientX - s.left + 'px'; a.style.top = e.clientY - s.top + 'px';
  }
  if (tracado) marcar(e);
  if (arrasto) {
    const [fx, fy] = frac(e), a = arrasto, nx = a.a + fx - a.fx, ny = a.b + fy - a.fy;
    if (a.l.tipo === 'texto') { a.l.x = nx; a.l.y = ny; } else { offX = nx; offY = ny; }
    agendar();
  }
});
tela.addEventListener('pointerleave', () => ($('anel').style.display = 'none'));
const fim = () => {
  if (tracado) { if (tracado.pts.length) acoes.push(tracado); tracado = null; habilitar(true); }
  arrasto = null;
  if (interativo) { interativo = false; desenhar(); }
};
tela.addEventListener('pointerup', fim); tela.addEventListener('pointercancel', fim);
function agendar() { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenhar(); }); }

// ---------- caixa do sujeito ----------
function achar(src) {
  const k = Math.min(1, 512 / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = novoCanvas(w, h), x = c.getContext('2d');
  x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    if (d[(y * w + i) * 4 + 3] > 16) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { x: 0, y: 0, w: src.width, h: src.height };
  const m = Math.ceil(1 / k) + 2;
  const sx = Math.max(0, Math.floor(x0 / k) - m), sy = Math.max(0, Math.floor(y0 / k) - m);
  return { x: sx, y: sy, w: Math.min(src.width, Math.ceil((x1 + 1) / k) + m) - sx, h: Math.min(src.height, Math.ceil((y1 + 1) / k) + m) - sy };
}

// ---------- composição 16:9 ----------
const CA = novoCanvas(1, 1), CB = novoCanvas(1, 1);
const dim = (c, W, H) => { if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } return c; };

function desenhar() {
  const [W, H] = (interativo ? '1280x720' : $('res').value).split('x').map(Number);
  dim(tela, W, H);
  const ctx = tela.getContext('2d'), u = W / 1280;
  const filtro = `brightness(${$('br').value}%) contrast(${$('ct').value}%) saturate(${$('sa').value}%)`;
  $('stage').classList.toggle('checker', tipoFundo === 'cor' && !fundo);
  ctx.clearRect(0, 0, W, H);
  pintarFundo(ctx, W, H, u, filtro);
  for (const l of camadas) {
    if (!l.vis) continue;
    if (l.tipo === 'sujeito') { if (edit) sujeito(ctx, W, H, u, filtro); } else texto(ctx, W, H, u, l);
  }
  $('mini').getContext('2d').drawImage(tela, 0, 0, 336, 189);
  destacar();
}

function destacar() { // moldura da camada selecionada (não entra na imagem exportada)
  const el = $('selecao'), l = porId(sel), b = l && l.vis && !ferramenta ? caixaDe(l) : null;
  if (!b) { el.style.display = 'none'; return; }
  Object.assign(el.style, { display: 'block', left: (b.x / tela.width) * 100 + '%', top: (b.y / tela.height) * 100 + '%',
    width: (b.w / tela.width) * 100 + '%', height: (b.h / tela.height) * 100 + '%' });
}

function pintarFundo(ctx, W, H, u, filtro) {
  if (tipoFundo === 'cor') { if (fundo) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H); } return; }
  if (tipoFundo === 'degrade') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, $('g1').value); g.addColorStop(1, $('g2').value);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); return;
  }
  const img = tipoFundo === 'imagem' ? imgFundo : origCv;
  if (!img) return;
  const bl = parseFloat($('bl').value) * u;
  const k = Math.max(W / img.width, H / img.height) * (1 + Math.min(0.25, bl / u * 0.005));
  ctx.filter = (bl > 0 ? `blur(${bl}px) ` : '') + filtro;
  ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
  ctx.filter = 'none';
}

function sombra(ctx, u) {
  if (!$('cs').checked) return;
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 6 * u;
}

function sujeito(ctx, W, H, u, filtro) {
  const trim = $('trim').checked, cover = $('ajuste').value === 'cover';
  const s = trim && caixa ? caixa : { x: 0, y: 0, w: edit.width, h: edit.height };
  const m = !cover && trim ? 0.06 : 0;
  const k0 = cover ? Math.max(W / s.w, H / s.h) : Math.min((W * (1 - 2 * m)) / s.w, (H * (1 - 2 * m)) / s.h);
  const k = k0 * (parseFloat($('esc').value) / 100), w = s.w * k, h = s.h * k;
  T = { sx: s.x, sy: s.y, k, w, h, dx: (W - w) / 2 + offX * W, dy: (H - h) / 2 + offY * H };

  const L = dim(CA, W, H), c = L.getContext('2d'), fonte = espiando ? origCv : edit;
  c.clearRect(0, 0, W, H); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.save();
  if (espelhado) { c.translate(T.dx + w / 2, 0); c.scale(-1, 1); c.drawImage(fonte, s.x, s.y, s.w, s.h, -w / 2, T.dy, w, h); }
  else c.drawImage(fonte, s.x, s.y, s.w, s.h, T.dx, T.dy, w, h);
  c.restore();

  const r = parseFloat($('cw').value) * u;
  ctx.save();
  if (r > 0) { // contorno: várias cópias deslocadas em círculo, pintadas de uma cor
    const O = dim(CB, W, H), o = O.getContext('2d');
    o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, W, H);
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; o.drawImage(L, Math.cos(a) * r, Math.sin(a) * r); }
    o.globalCompositeOperation = 'source-in'; o.fillStyle = $('cc').value; o.fillRect(0, 0, W, H);
    const cb = parseFloat($('cb').value) * u;
    sombra(ctx, u); ctx.filter = cb > 0 ? `blur(${cb}px)` : 'none'; ctx.drawImage(O, 0, 0);
    ctx.filter = 'none'; ctx.shadowColor = 'transparent';
  } else sombra(ctx, u);
  ctx.filter = filtro; ctx.drawImage(L, 0, 0);
  ctx.restore();
}

function texto(ctx, W, H, u, l) {
  l.box = null;
  const linhas = (l.caps ? l.txt.toUpperCase() : l.txt).split('\n').filter((s) => s.trim());
  if (!linhas.length) return;
  const e = H / 720, tam = l.tam * e, lh = tam * l.lh, f = FONTES[l.fonte];
  ctx.save();
  ctx.globalAlpha = l.op / 100;
  ctx.font = `${l.i ? 'italic ' : ''}${l.b ? Math.max(700, f[1]) : f[1]} ${tam}px "${f[0]}", Impact, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${l.ls * e}px`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const larg = linhas.map((s) => ctx.measureText(s).width), maior = Math.max(...larg);
  const x0 = l.x * W - maior / 2, y0 = l.y * H - ((linhas.length - 1) * lh) / 2;
  const sombraOn = () => { if (l.sh) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 4 * u; } };
  linhas.forEach((s, i) => {
    const x = l.al === 'l' ? x0 : l.al === 'r' ? x0 + maior - larg[i] : x0 + (maior - larg[i]) / 2, y = y0 + i * lh;
    if (l.bw > 0) { // contorno do texto, com desfoque opcional
      ctx.lineWidth = (tam * l.bw) / 100; ctx.strokeStyle = l.borda;
      ctx.filter = l.bb > 0 ? `blur(${l.bb * u}px)` : 'none'; sombraOn();
      ctx.strokeText(s, x, y); ctx.filter = 'none'; ctx.shadowColor = 'transparent';
    } else sombraOn();
    ctx.fillStyle = l.cor; ctx.fillText(s, x, y); ctx.shadowColor = 'transparent';
    const fio = Math.max(1, tam * 0.06);
    if (l.u) ctx.fillRect(x, y + tam * 0.36, larg[i], fio);
    if (l.s) ctx.fillRect(x, y - fio / 2, larg[i], fio);
  });
  ctx.restore();
  l.box = { x: x0, y: y0 - lh / 2, w: maior, h: lh * linhas.length };
}

// ---------- controles do sujeito, fundo e cor ----------
['esc', 'cw', 'cb', 'bl', 'cc', 'cs', 'g1', 'g2', 'br', 'ct', 'sa', 'res', 'ajuste'].forEach((id) => $(id).addEventListener('input', desenhar));
$('trim').addEventListener('input', () => { if (edit) caixa = achar(edit); desenhar(); });
document.querySelectorAll('[data-pos]').forEach((b) => (b.onclick = () => { offX = parseFloat(b.dataset.pos); offY = 0; desenhar(); }));
$('espelhar').onclick = () => { espelhado = !espelhado; $('espelhar').setAttribute('aria-pressed', espelhado); desenhar(); };
$('vida').onclick = () => { $('br').value = 105; $('ct').value = 112; $('sa').value = 130; desenhar(); };
$('gchk').onchange = () => $('guia').classList.toggle('hidden', !$('gchk').checked);
function mostrarFundo() { document.querySelectorAll('[data-f]').forEach((el) => el.classList.toggle('hidden', !el.dataset.f.split(' ').includes(tipoFundo))); }
$('tfundo').addEventListener('input', () => { tipoFundo = $('tfundo').value; $('bl').value = tipoFundo === 'desfocado' ? 22 : 0; mostrarFundo(); desenhar(); });
$('bimg').onclick = () => $('fimg').click();
$('fimg').onchange = async () => { if ($('fimg').files[0]) { imgFundo = await createImageBitmap($('fimg').files[0]); desenhar(); } };
mostrarFundo();

function setFundo(v, botao) {
  fundo = v;
  document.querySelectorAll('.sw').forEach((b) => b.setAttribute('aria-pressed', b === botao));
  desenhar();
}
document.querySelectorAll('.sw').forEach((b) => (b.onclick = () => setFundo(b.dataset.bg, b)));
$('cor').oninput = (e) => setFundo(e.target.value, null);

// ---------- exportar ----------
$('baixar').onclick = async () => {
  espiando = false; interativo = false; desenhar();
  const jpg = $('fmt').value === 'jpg', max = 2 * 1024 * 1024;
  let alvo = tela;
  if (jpg) { // JPG não tem transparência: assenta sobre branco
    alvo = novoCanvas(tela.width, tela.height);
    const c = alvo.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, alvo.width, alvo.height); c.drawImage(tela, 0, 0);
  }
  const gerar = (q) => new Promise((r) => alvo.toBlob(r, jpg ? 'image/jpeg' : 'image/png', q));
  let q = 0.95, blob = await gerar(q);
  if (jpg && $('lim').checked) while (blob.size > max && q > 0.4) { q -= 0.05; blob = await gerar(q); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}-thumbnail-${tela.width}x${tela.height}.${jpg ? 'jpg' : 'png'}`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  const mb = (blob.size / 1048576).toFixed(2).replace('.', ',');
  aviso(blob.size > max
    ? `Arquivo com ${mb} MB: passa do limite de 2 MB do YouTube. Use 1280×720 em JPG com “Limitar a 2 MB”.`
    : `Arquivo salvo: ${mb} MB${jpg ? ` (qualidade ${Math.round(q * 100)}%)` : ''}.`);
};
