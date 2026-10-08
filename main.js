import { removeBackground } from '@imgly/background-removal';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), file = $('file'), erro = $('erro'), tela = $('tela');
const FONTES = [['Anton', 400], ['League Spartan', 900], ['Bebas Neue', 400], ['Archivo Black', 400], ['Bangers', 400], ['Luckiest Guy', 400],
  ['Montserrat', 900], ['Oswald', 700], ['Passion One', 900], ['Permanent Marker', 400], ['Poppins', 800], ['Russo One', 400]];
const fnt = (f, tam) => `${f[1]} ${tam}px "${f[0]}", Impact, sans-serif`;

let nome = 'imagem', fundo = '', tipoFundo = 'cor', imgFundo = null;
let base = null, edit = null, origCv = null, caixa = null;       // recorte da IA, recorte editável, original, área do sujeito
let acoes = [], tracado = null, ultimo = null, quadro = 0;
let interativo = false, arrasto = null, transf = null;
let ferramenta = '', espiando = false, T = { sx: 0, sy: 0, k: 1, dx: 0, dy: 0, w: 0, h: 0 };
let up = null, exportando = false;                                  // upscaling e modo de exportação
let camadas = [], sel = 's', uid = 0, avisoT = 0;                // pilha de camadas: de baixo para cima

const novoCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
const porId = (id) => camadas.find((l) => l.id === id);
const T0 = () => ({ x: 0.5, y: 0.5, sx: 1, sy: 1, r: 0, fx: false }); // transformação livre: posição, escala, rotação, espelho
const pintaRange = (r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
const pintarRanges = () => document.querySelectorAll('input[type=range]').forEach(pintaRange);
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
  base = edit = origCv = caixa = null; acoes = [];
  camadas = [{ id: 's', tipo: 'sujeito', vis: true, t: T0() }]; sel = 's'; escolher('');
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
    b: false, i: false, u: false, s: false, caps: false, al: 'c', ls: 0, lh: 1.08, op: 100, nat: null, t: { ...T0(), y: 0.82 }, ...dados };
}
function listar() {
  const ul = $('lista'); ul.replaceChildren();
  [...camadas].reverse().forEach((l) => {
    const li = mk('li', 'item'); li.setAttribute('aria-current', l.id === sel);
    const olho = mk('button', 'olho', l.vis ? '👁' : '◌'); olho.setAttribute('aria-pressed', l.vis); olho.setAttribute('aria-label', 'Mostrar ou ocultar camada');
    olho.onclick = () => { l.vis = !l.vis; listar(); desenhar(); };
    const rotulo = l.tipo === 'sujeito' ? 'Sujeito (recorte)' : l.tipo === 'imagem' ? 'Imagem  ' + l.nome : 'T  ' + (l.txt.split('\n')[0].trim() || 'Texto vazio');
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
function syncT(l) { // espelha a transformação nos controles
  const t = l.t, m = (Math.abs(t.sx) + Math.abs(t.sy)) / 2;
  $('esc').value = Math.min(400, Math.max(5, Math.round(m * 100)));
  $('rot').value = Math.round((t.r * 180) / Math.PI); $('espelhar').setAttribute('aria-pressed', !!t.fx); pintarRanges();
}
function props() {
  requestAnimationFrame(pintarRanges);
  const l = porId(sel), t = l?.tipo === 'texto', i = camadas.indexOf(l), livre = l && l.tipo !== 'sujeito';
  $('p-transf').classList.toggle('hidden', !l);
  $('p-sujeito').classList.toggle('hidden', l?.tipo !== 'sujeito'); $('p-texto').classList.toggle('hidden', !t);
  $('barraTexto').classList.toggle('hidden', !t);
  $('subir').disabled = !l || i >= camadas.length - 1; $('descer').disabled = !l || i <= 0;
  $('dup').disabled = $('del').disabled = !livre;
  if (l) syncT(l);
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
  const o = porId(sel); if (!o || o.tipo === 'sujeito') return;
  const l = { ...o, id: o.tipo[0] + ++uid, nat: null, t: { ...o.t, x: o.t.x + 0.03, y: o.t.y + 0.03 } };
  camadas.splice(camadas.indexOf(o) + 1, 0, l); selecionar(l.id);
};
$('del').onclick = () => { const l = porId(sel); if (!l || l.tipo === 'sujeito') return; camadas = camadas.filter((c) => c !== l); selecionar('s'); };
$('addImg').onclick = () => $('fimgL').click();
$('fimgL').onchange = async () => { // nova imagem como camada livre
  const f = $('fimgL').files[0]; $('fimgL').value = ''; if (!f) return;
  const l = { id: 'i' + ++uid, tipo: 'imagem', vis: true, bmp: await createImageBitmap(f), nome: f.name.replace(/\.[^.]+$/, ''), t: T0() };
  camadas.push(l); aba('camadas'); selecionar(l.id);
};
// controles de transformação (valem para sujeito, texto e imagens)
$('esc').addEventListener('input', () => {
  const l = porId(sel); if (!l) return;
  const m = (Math.abs(l.t.sx) + Math.abs(l.t.sy)) / 2 || 1, f = $('esc').value / 100 / m; l.t.sx *= f; l.t.sy *= f; desenhar();
});
$('rot').addEventListener('input', () => { const l = porId(sel); if (l) { l.t.r = ($('rot').value * Math.PI) / 180; desenhar(); } });
$('espelhar').onclick = () => { const l = porId(sel); if (l) { l.t.fx = !l.t.fx; syncT(l); desenhar(); } };
$('reset').onclick = () => { const l = porId(sel); if (l) { l.t = { ...T0(), y: l.tipo === 'texto' ? 0.82 : 0.5 }; syncT(l); desenhar(); } };
document.querySelectorAll('[data-pos]').forEach((b) => (b.onclick = () => { const l = porId(sel); if (l) { l.t.x = 0.5 + parseFloat(b.dataset.pos); desenhar(); } }));
document.addEventListener('keydown', (e) => { // atalhos: setas movem, Delete exclui, Ctrl+D duplica
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || ferramenta) return;
  const l = porId(sel); if (!l) return;
  const p = e.shiftKey ? 0.02 : 0.004, d = { ArrowLeft: [-p, 0], ArrowRight: [p, 0], ArrowUp: [0, -p], ArrowDown: [0, p] }[e.key];
  if (d) { e.preventDefault(); l.t.x += d[0]; l.t.y += d[1]; desenhar(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && l.tipo !== 'sujeito') $('del').click();
  else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && l.tipo !== 'sujeito') { e.preventDefault(); $('dup').click(); }
});
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
document.querySelectorAll('[data-al]').forEach((b) => (b.onclick = () => { // alinhar a camada na imagem
  const l = porId(sel), g = l && geo(l); if (!g) return;
  const W = tela.width, H = tela.height, c = Math.abs(Math.cos(g.r)), n = Math.abs(Math.sin(g.r));
  const ex = (g.w * c + g.h * n) / 2 / W, ey = (g.w * n + g.h * c) / 2 / H, m = 0.03, a = b.dataset.al;
  if (a === 'esq') l.t.x = ex + m; if (a === 'cen') l.t.x = 0.5; if (a === 'dir') l.t.x = 1 - ex - m;
  if (a === 'topo') l.t.y = ey + m; if (a === 'meio') l.t.y = 0.5; if (a === 'base') l.t.y = 1 - ey - m;
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
pintarRanges(); document.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => pintaRange(r)));

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

function ponto(e) { // posição do ponteiro -> coordenadas da foto original (desfaz mover, girar, escalar e espelhar)
  const r = tela.getBoundingClientRect(), esc = tela.width / r.width;
  const dx = (e.clientX - r.left) * esc - T.cx, dy = (e.clientY - r.top) * esc - T.cy, c = Math.cos(-T.r), n = Math.sin(-T.r);
  let lx = (dx * c - dy * n) / T.tsx; const ly = (dx * n + dy * c) / T.tsy;
  if (T.fx) lx = -lx;
  return [T.sx0 + (lx + T.w / 2) / T.k, T.sy0 + (ly + T.h / 2) / T.k, ((parseFloat($('pincel').value) / 2) * esc) / (T.k * ((T.tsx + T.tsy) / 2))];
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

// ---------- interação no palco: selecionar, mover e transformar ----------
const frac = (e) => { const r = tela.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
const xy = (e) => { const r = tela.getBoundingClientRect(); return [((e.clientX - r.left) * tela.width) / r.width, ((e.clientY - r.top) * tela.height) / r.height]; };

function geo(l) { // tamanho e posição da camada (com transformação), em pixels da prévia
  const W = tela.width, H = tela.height, t = l.t; let w, h;
  if (l.tipo === 'texto') { if (!l.nat) return null; w = l.nat.w; h = l.nat.h; }
  else if (l.tipo === 'imagem') { const k = (H * 0.5) / l.bmp.height; w = l.bmp.width * k; h = l.bmp.height * k; }
  else { if (!edit) return null; ({ w, h } = layoutSujeito(W, H)); }
  return { cx: t.x * W, cy: t.y * H, w: w * Math.abs(t.sx), h: h * Math.abs(t.sy), r: t.r, w0: w, h0: h };
}
function dentroDe(l, px, py) {
  const g = geo(l); if (!g) return false;
  const dx = px - g.cx, dy = py - g.cy, c = Math.cos(-g.r), n = Math.sin(-g.r);
  return Math.abs(dx * c - dy * n) <= g.w / 2 && Math.abs(dx * n + dy * c) <= g.h / 2;
}

tela.addEventListener('pointerdown', (e) => {
  if (!edit) return;
  tela.setPointerCapture(e.pointerId); interativo = true;
  if (ferramenta) { tracado = { pts: [] }; ultimo = null; marcar(e); return; }
  const [fx, fy] = frac(e), [px, py] = xy(e), atual = porId(sel);
  let alvo = atual && atual.vis && dentroDe(atual, px, py) ? atual : null; // mantém a camada já selecionada
  for (let i = camadas.length - 1; i >= 0 && !alvo; i--) if (camadas[i].vis && dentroDe(camadas[i], px, py)) alvo = camadas[i];
  interativo = !!alvo;
  if (!alvo) { sel = ''; listar(); props(); desenhar(); return; } // toque no vazio: desmarca
  if (alvo.id !== sel) { sel = alvo.id; listar(); props(); aba('camadas'); }
  arrasto = { l: alvo, fx, fy, a: alvo.t.x, b: alvo.t.y };
});
tela.addEventListener('pointermove', (e) => {
  if (ferramenta) {
    const a = $('anel'), s = $('stage').getBoundingClientRect();
    a.style.display = 'block'; a.style.width = a.style.height = $('pincel').value + 'px';
    a.style.left = e.clientX - s.left + 'px'; a.style.top = e.clientY - s.top + 'px';
  }
  if (tracado) marcar(e);
  if (arrasto) {
    const [fx, fy] = frac(e), a = arrasto;
    a.l.t.x = a.a + fx - a.fx; a.l.t.y = a.b + fy - a.fy; agendar();
  }
});
tela.addEventListener('pointerleave', () => ($('anel').style.display = 'none'));
const fim = () => {
  if (tracado) { if (tracado.pts.length) acoes.push(tracado); tracado = null; habilitar(true); }
  arrasto = null;
  if (interativo) { interativo = false; desenhar(); }
};
tela.addEventListener('pointerup', fim); tela.addEventListener('pointercancel', fim);

// alças da transformação livre: cantos e laterais escalam, a bolinha de cima gira
$('selecao').addEventListener('pointerdown', (e) => {
  const h = e.target.dataset?.h, l = porId(sel), g = l && geo(l);
  if (!h || !g) return;
  e.preventDefault(); e.stopPropagation();
  transf = { h, l, t0: { ...l.t }, g, p0: xy(e) };
  const mover = (ev) => aplicarTransf(ev);
  const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); transf = null; desenhar(); };
  window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar);
});
function aplicarTransf(e) {
  const { h, l, t0, g, p0 } = transf, t = l.t, [px, py] = xy(e), dx = px - g.cx, dy = py - g.cy;
  if (h === 'rot') {
    let a = Math.atan2(dy, dx) + Math.PI / 2; const passo = Math.PI / 12, n = Math.round(a / passo) * passo;
    if (Math.abs(a - n) < 0.05) a = n; // ímã a cada 15°
    t.r = ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  } else if (h.length === 2) { // canto: escala proporcional
    const f = Math.max(0.02, Math.hypot(dx, dy) / (Math.hypot(p0[0] - g.cx, p0[1] - g.cy) || 1));
    t.sx = t0.sx * f; t.sy = t0.sy * f;
  } else { // lateral: estica só um eixo
    const c = Math.cos(-g.r), n = Math.sin(-g.r), lx = dx * c - dy * n, ly = dx * n + dy * c;
    if (h === 'e' || h === 'w') t.sx = Math.max(0.02, Math.abs(lx) / (g.w0 / 2));
    else t.sy = Math.max(0.02, Math.abs(ly) / (g.h0 / 2));
  }
  syncT(l); agendar();
}
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
  const [W, H] = (exportando ? $('res').value : '1280x720').split('x').map(Number);
  dim(tela, W, H);
  const ctx = tela.getContext('2d'), u = W / 1280;
  const filtro = `brightness(${$('br').value}%) contrast(${$('ct').value}%) saturate(${$('sa').value}%)`;
  $('stage').classList.toggle('checker', tipoFundo === 'cor' && !fundo);
  ctx.clearRect(0, 0, W, H);
  pintarFundo(ctx, W, H, u, filtro);
  for (const l of camadas) {
    if (!l.vis) continue;
    if (l.tipo === 'sujeito') { if (edit) sujeito(ctx, W, H, u, filtro, l); } else if (l.tipo === 'imagem') imagem(ctx, W, H, l); else texto(ctx, W, H, u, l);
  }
  $('mini').getContext('2d').drawImage(tela, 0, 0, 336, 189);
  destacar();
}

function destacar() { // moldura com alças da camada selecionada (não entra na imagem exportada)
  const el = $('selecao'), l = porId(sel), g = l && l.vis && !ferramenta && !exportando ? geo(l) : null;
  if (!g) { el.style.display = 'none'; return; }
  const W = tela.width, H = tela.height;
  Object.assign(el.style, { display: 'block', left: ((g.cx - g.w / 2) / W) * 100 + '%', top: ((g.cy - g.h / 2) / H) * 100 + '%',
    width: (g.w / W) * 100 + '%', height: (g.h / H) * 100 + '%', transform: `rotate(${g.r}rad)` });
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

function layoutSujeito(W, H) { // tamanho natural do recorte no quadro (a transformação livre vem por cima)
  const trim = $('trim').checked, cover = $('ajuste').value === 'cover';
  const s = trim && caixa ? caixa : { x: 0, y: 0, w: edit.width, h: edit.height };
  const m = !cover && trim ? 0.06 : 0;
  const k = cover ? Math.max(W / s.w, H / s.h) : Math.min((W * (1 - 2 * m)) / s.w, (H * (1 - 2 * m)) / s.h);
  return { s, k, w: s.w * k, h: s.h * k };
}

function imagem(ctx, W, H, l) {
  const t = l.t, k = (H * 0.5) / l.bmp.height, w = l.bmp.width * k, h = l.bmp.height * k;
  ctx.save(); ctx.translate(t.x * W, t.y * H); ctx.rotate(t.r); ctx.scale(t.fx ? -t.sx : t.sx, t.sy);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(l.bmp, -w / 2, -h / 2, w, h); ctx.restore();
}

function sujeito(ctx, W, H, u, filtro, l) {
  const { s, k, w, h } = layoutSujeito(W, H), t = l.t;
  T = { sx0: s.x, sy0: s.y, k, w, h, cx: t.x * W, cy: t.y * H, tsx: t.sx, tsy: t.sy, r: t.r, fx: t.fx };
  const L = dim(CA, W, H), c = L.getContext('2d'), fonte = espiando ? origCv : edit;
  const fs = up ? [up.cv, 0, 0, up.cv.width, up.cv.height] : [fonte, s.x, s.y, s.w, s.h]; // recorte ampliado, se houver
  c.clearRect(0, 0, W, H); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.save(); c.translate(T.cx, T.cy); c.rotate(t.r); c.scale(t.fx ? -t.sx : t.sx, t.sy);
  c.drawImage(...fs, -w / 2, -h / 2, w, h); c.restore();

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
  l.nat = null;
  const linhas = (l.caps ? l.txt.toUpperCase() : l.txt).split('\n').filter((s) => s.trim());
  if (!linhas.length) return;
  const e = H / 720, tam = l.tam * e, lh = tam * l.lh, f = FONTES[l.fonte], t = l.t;
  ctx.save();
  ctx.globalAlpha = l.op / 100;
  ctx.font = `${l.i ? 'italic ' : ''}${l.b ? Math.max(700, f[1]) : f[1]} ${tam}px "${f[0]}", Impact, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${l.ls * e}px`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const larg = linhas.map((s) => ctx.measureText(s).width), maior = Math.max(...larg);
  l.nat = { w: maior, h: lh * linhas.length };
  ctx.translate(t.x * W, t.y * H); ctx.rotate(t.r); ctx.scale(t.fx ? -t.sx : t.sx, t.sy); // transformação livre
  const x0 = -maior / 2, y0 = -l.nat.h / 2 + lh / 2;
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
}

// ---------- controles do sujeito, fundo e cor ----------
['cw', 'cb', 'bl', 'cc', 'cs', 'g1', 'g2', 'br', 'ct', 'sa', 'res', 'ajuste'].forEach((id) => $(id).addEventListener('input', desenhar));
$('trim').addEventListener('input', () => { if (edit) caixa = achar(edit); desenhar(); });
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

// ---------- upscaling (Lanczos-3 em Web Worker) ----------
const WORKER = `(${function () {
  self.onmessage = (e) => {
    const { d, w, h, W, H } = e.data, px = new Uint8ClampedArray(d);
    const lz = (x) => { x = Math.abs(x); if (x < 1e-6) return 1; if (x >= 3) return 0; const p = Math.PI * x; return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p); };
    const taps = (n, N) => { // 6 pesos por pixel de saída
      const idx = new Int32Array(N * 6), wt = new Float32Array(N * 6), sc = n / N;
      for (let o = 0; o < N; o++) {
        const c = (o + 0.5) * sc - 0.5, f = Math.floor(c) - 2; let sum = 0;
        for (let t = 0; t < 6; t++) { const v = lz(f + t - c); wt[o * 6 + t] = v; sum += v; idx[o * 6 + t] = Math.min(n - 1, Math.max(0, f + t)); }
        for (let t = 0; t < 6; t++) wt[o * 6 + t] /= sum;
      }
      return [idx, wt];
    };
    const [ix, wx] = taps(w, W), [iy, wy] = taps(h, H);
    const src = new Float32Array(w * h * 4); // alfa pré-multiplicado, para não manchar as bordas
    for (let i = 0; i < w * h; i++) { const a = px[i * 4 + 3] / 255; src[i * 4] = px[i * 4] * a; src[i * 4 + 1] = px[i * 4 + 1] * a; src[i * 4 + 2] = px[i * 4 + 2] * a; src[i * 4 + 3] = px[i * 4 + 3]; }
    const tmp = new Float32Array(W * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let t = 0; t < 6; t++) { const j = (y * w + ix[x * 6 + t]) * 4, k = wx[x * 6 + t]; r += src[j] * k; g += src[j + 1] * k; b += src[j + 2] * k; a += src[j + 3] * k; }
      const o = (y * W + x) * 4; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
    }
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let t = 0; t < 6; t++) { const j = (iy[y * 6 + t] * W + x) * 4, k = wy[y * 6 + t]; r += tmp[j] * k; g += tmp[j + 1] * k; b += tmp[j + 2] * k; a += tmp[j + 3] * k; }
      a = Math.min(255, Math.max(0, a)); const m = a > 0 ? 255 / a : 0, o = (y * W + x) * 4;
      out[o] = r * m; out[o + 1] = g * m; out[o + 2] = b * m; out[o + 3] = a;
    }
    self.postMessage(out.buffer, [out.buffer]);
  };
}})()`;

function ampliar(cv, S) {
  const w = cv.width, h = cv.height, W = Math.round(w * S), H = Math.round(h * S);
  const img = cv.getContext('2d').getImageData(0, 0, w, h);
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })), wk = new Worker(url);
    const fim = () => { wk.terminate(); URL.revokeObjectURL(url); };
    wk.onmessage = (e) => { fim(); const o = novoCanvas(W, H); o.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(e.data), W, H), 0, 0); ok(o); };
    wk.onerror = (e) => { fim(); falha(e); };
    wk.postMessage({ d: img.data.buffer, w, h, W, H }, [img.data.buffer]);
  });
}

const pausa = () => new Promise((r) => setTimeout(r, 40));
const limitePx = () => (matchMedia('(pointer:coarse)').matches ? 16.7e6 : 40e6); // celulares têm menos memória
function cabe(W, H) { // o navegador consegue criar um canvas deste tamanho?
  try { const c = novoCanvas(W, H), x = c.getContext('2d'); x.fillStyle = '#f00'; x.fillRect(W - 1, H - 1, 1, 1); return x.getImageData(W - 1, H - 1, 1, 1).data[0] === 255; }
  catch { return false; }
}
async function prepararUp(W, H, f) {
  const L0 = layoutSujeito(W, H), s = L0.s, sub = porId('s').t, k = L0.k * Math.max(Math.abs(sub.sx), Math.abs(sub.sy));
  const S = Math.min(f === 0 ? Infinity : f, Math.max(1, k), Math.sqrt(limitePx() / (s.w * s.h))); // nunca além do necessário
  if (S < 1.05) { aviso(k <= 1.05 ? 'A foto já tem resolução suficiente para esse tamanho: upscaling dispensado.' : 'Sem memória para ampliar a foto neste aparelho.'); return null; }
  status(`Ampliando ${S.toFixed(1).replace('.', ',')}× — pode levar alguns segundos…`); await pausa();
  const c = novoCanvas(s.w, s.h); c.getContext('2d').drawImage(edit, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
  return { cv: await ampliar(c, S), S };
}

// ---------- exportar ----------
$('baixar').onclick = async () => {
  espiando = false;
  const [W, H] = $('res').value.split('x').map(Number), jpg = $('fmt').value === 'jpg', max = 2 * 1024 * 1024;
  if (W * H > 16.7e6 && !cabe(W, H)) { aviso('Este aparelho não consegue gerar imagens tão grandes. Escolha uma resolução menor (4K costuma funcionar).'); return; }
  habilitar(false); status('Gerando a imagem…'); await pausa();
  let blob, q = 0.95, fator = null;
  try {
    const f = +$('up').value;
    if (edit && f !== 1) up = await prepararUp(W, H, f);
    fator = up?.S; exportando = true; desenhar();
    let alvo = tela;
    if (jpg) { // JPG não tem transparência: assenta sobre branco
      alvo = novoCanvas(W, H);
      const c = alvo.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(tela, 0, 0);
    }
    const gerar = (qq) => new Promise((r) => alvo.toBlob(r, jpg ? 'image/jpeg' : 'image/png', qq));
    blob = await gerar(q);
    if (jpg && $('lim').checked) while (blob.size > max && q > 0.4) { q -= 0.05; blob = await gerar(q); }
  } catch (e) { console.error(e); aviso('Não foi possível gerar esta resolução. Tente uma menor.'); }
  finally { up = null; exportando = false; habilitar(true); status(''); desenhar(); }
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}-thumbnail-${W}x${H}.${jpg ? 'jpg' : 'png'}`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  const mb = (blob.size / 1048576).toFixed(2).replace('.', ',');
  aviso((blob.size > max
    ? `Arquivo com ${mb} MB: passa do limite de 2 MB do YouTube. Use 1280×720 em JPG com “Limitar a 2 MB”.`
    : `Arquivo salvo: ${mb} MB${jpg ? ` (qualidade ${Math.round(q * 100)}%)` : ''}.`) + (fator ? ` Upscaling ${fator.toFixed(1).replace('.', ',')}× aplicado.` : ''));
};
