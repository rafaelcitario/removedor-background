import { removeBackground } from '@imgly/background-removal';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), file = $('file'), erro = $('erro'), tela = $('tela');
let nome = 'imagem', fundo = '';
let base = null, edit = null, origCv = null, caixa = null; // recorte da IA, recorte editável, original, área do sujeito
let acoes = [], tracado = null, ultimo = null, quadro = 0;
let ferramenta = '', espiando = false, T = { sx: 0, sy: 0, k: 1, dx: 0, dy: 0 };

// ---------- entrada ----------
drop.onclick = () => file.click();
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
file.onchange = () => file.files[0] && usar(file.files[0]);
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
  base = edit = origCv = caixa = null; acoes = []; escolher('');
  habilitar(false); $('painel').classList.remove('hidden'); desenhar(); status('Preparando…');

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
    refazer();
    caixa = achar(edit);
    habilitar(true); status(''); desenhar();
  } catch (e) {
    console.error(e);
    erro.textContent = 'Não foi possível remover o fundo desta imagem. Tente outra imagem ou recarregue a página.';
    status('');
  }
}

function novoCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

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
  const out = x.createImageData(w, h); let achou = 0; const marcadas = new Set();
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
  achou = marcadas.size;
  if (!achou) { $('dica').textContent = 'Nenhuma mancha solta encontrada.'; return; }
  const m = novoCanvas(w, h); m.getContext('2d').putImageData(out, 0, 0);
  acoes.push({ m });
  refazer(); desenhar(); habilitar(true);
  $('dica').textContent = `${achou} mancha(s) solta(s) removida(s). Se algo importante sumiu, use “Desfazer”.`;
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
  if (sai && edit) { caixa = achar(edit); desenhar(); } // ao concluir o retoque, reenquadra no sujeito
}));
$('desfazer').onclick = () => { acoes.pop(); refazer(); desenhar(); habilitar(true); };
const ver = (v) => () => { espiando = v; desenhar(); };
$('espiar').addEventListener('pointerdown', ver(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => $('espiar').addEventListener(t, ver(false)));

function ponto(e) {
  const r = tela.getBoundingClientRect(), esc = tela.width / r.width;
  const cx = (e.clientX - r.left) * esc, cy = (e.clientY - r.top) * esc;
  return [T.sx + (cx - T.dx) / T.k, T.sy + (cy - T.dy) / T.k, (parseFloat($('pincel').value) / 2) * esc / T.k];
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
  ultimo = [x, y];
  if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenhar(); });
}
tela.addEventListener('pointerdown', (e) => {
  if (!ferramenta || !edit) return;
  tela.setPointerCapture(e.pointerId); tracado = { pts: [] }; ultimo = null; marcar(e);
});
tela.addEventListener('pointermove', (e) => {
  if (ferramenta) { // anel do pincel
    const r = tela.getBoundingClientRect(), a = $('anel'), s = $('stage').getBoundingClientRect();
    a.style.display = 'block'; a.style.width = a.style.height = $('pincel').value + 'px';
    a.style.left = e.clientX - s.left + 'px'; a.style.top = e.clientY - s.top + 'px';
  }
  if (tracado) marcar(e);
});
tela.addEventListener('pointerleave', () => ($('anel').style.display = 'none'));
const fim = () => { if (tracado) { if (tracado.pts.length) acoes.push(tracado); tracado = null; habilitar(true); } };
tela.addEventListener('pointerup', fim); tela.addEventListener('pointercancel', fim);

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
function desenhar() {
  const [W, H] = $('res').value.split('x').map(Number);
  if (tela.width !== W || tela.height !== H) { tela.width = W; tela.height = H; }
  const ctx = tela.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (fundo) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H); }
  if (!edit) return;

  const fonte = espiando ? origCv : edit;
  const trim = $('trim').checked;
  const s = trim && caixa ? caixa : { x: 0, y: 0, w: edit.width, h: edit.height };
  const cover = $('ajuste').value === 'cover';
  const m = !cover && trim ? 0.06 : 0;
  const k = cover ? Math.max(W / s.w, H / s.h) : Math.min((W * (1 - 2 * m)) / s.w, (H * (1 - 2 * m)) / s.h);
  const w = s.w * k, h = s.h * k;
  T = { sx: s.x, sy: s.y, k, dx: (W - w) / 2, dy: (H - h) / 2 };
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, s.x, s.y, s.w, s.h, T.dx, T.dy, w, h);
}

const reenquadrar = () => { if (edit) caixa = achar(edit); desenhar(); };
$('res').addEventListener('change', desenhar);
$('ajuste').addEventListener('change', desenhar);
$('trim').addEventListener('change', reenquadrar);

function setFundo(v, botao) {
  fundo = v;
  document.querySelectorAll('.sw').forEach((b) => b.setAttribute('aria-pressed', b === botao));
  $('stage').classList.toggle('checker', !v);
  desenhar();
}
document.querySelectorAll('.sw').forEach((b) => (b.onclick = () => setFundo(b.dataset.bg, b)));
$('cor').oninput = (e) => setFundo(e.target.value, null);

$('baixar').onclick = () => {
  espiando = false; desenhar();
  tela.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${nome}-sem-fundo-16x9-${tela.width}x${tela.height}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }, 'image/png');
};
