import { removeBackground } from '@imgly/background-removal';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), file = $('file'), erro = $('erro'), tela = $('tela');
let nome = 'imagem', recorte = null, caixa = null, fundo = '';

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

async function usar(f) {
  erro.textContent = '';
  if (!f.type.startsWith('image/')) { erro.textContent = 'Escolha um arquivo de imagem (JPG, PNG ou WebP).'; return; }
  nome = f.name.replace(/\.[^.]+$/, '') || 'imagem';
  recorte = null; caixa = null; $('baixar').disabled = true;
  $('painel').classList.remove('hidden'); desenhar();
  status('Preparando…');

  // qualidade máxima: modelo isnet (fp32), PNG sem perdas, imagem no tamanho original
  const base = {
    model: 'isnet',
    output: { format: 'image/png', quality: 1 },
    progress: (key, atual, total) => {
      const pct = total ? Math.round((atual / total) * 100) : 0;
      status(String(key).startsWith('fetch')
        ? `Baixando o modelo (só na primeira vez): ${pct}%`
        : 'Removendo o fundo…');
    },
  };
  try {
    let blob;
    try {
      blob = await removeBackground(f, navigator.gpu ? { ...base, device: 'gpu' } : base);
    } catch (e) {
      if (!navigator.gpu) throw e;
      blob = await removeBackground(f, base); // sem WebGPU funcional: usa a CPU
    }
    recorte = await createImageBitmap(blob);
    caixa = achar(recorte);
    $('baixar').disabled = false;
    status('');
    desenhar();
  } catch (e) {
    console.error(e);
    erro.textContent = 'Não foi possível remover o fundo desta imagem. Tente outra imagem ou recarregue a página.';
    status('');
  }
}

function status(t) { $('status').textContent = t; $('status').classList.toggle('hidden', !t); }

// ---------- caixa do sujeito (área com pixels visíveis) ----------
function achar(bmp) {
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
  x.drawImage(bmp, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    if (d[(y * w + i) * 4 + 3] > 16) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { x: 0, y: 0, w: bmp.width, h: bmp.height };
  const m = Math.ceil(1 / k) + 2;
  const sx = Math.max(0, Math.floor(x0 / k) - m), sy = Math.max(0, Math.floor(y0 / k) - m);
  const ex = Math.min(bmp.width, Math.ceil((x1 + 1) / k) + m), ey = Math.min(bmp.height, Math.ceil((y1 + 1) / k) + m);
  return { x: sx, y: sy, w: ex - sx, h: ey - sy };
}

// ---------- composição 16:9 ----------
function desenhar() {
  const [W, H] = $('res').value.split('x').map(Number);
  tela.width = W; tela.height = H;
  const ctx = tela.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (fundo) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H); }
  if (!recorte) return;

  const trim = $('trim').checked;
  const s = trim ? caixa : { x: 0, y: 0, w: recorte.width, h: recorte.height };
  const cover = $('ajuste').value === 'cover';
  const m = !cover && trim ? 0.06 : 0; // respiro ao redor do sujeito
  const aw = W * (1 - 2 * m), ah = H * (1 - 2 * m);
  const k = cover ? Math.max(W / s.w, H / s.h) : Math.min(aw / s.w, ah / s.h);
  const w = s.w * k, h = s.h * k;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(recorte, s.x, s.y, s.w, s.h, (W - w) / 2, (H - h) / 2, w, h);
}

['res', 'ajuste', 'trim'].forEach((id) => $(id).addEventListener('change', desenhar));

function setFundo(v, botao) {
  fundo = v;
  document.querySelectorAll('.sw').forEach((b) => b.setAttribute('aria-pressed', b === botao));
  $('stage').classList.toggle('checker', !v);
  desenhar();
}
document.querySelectorAll('.sw').forEach((b) => (b.onclick = () => setFundo(b.dataset.bg, b)));
$('cor').oninput = (e) => setFundo(e.target.value, null);

$('baixar').onclick = () => {
  tela.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${nome}-sem-fundo-16x9-${tela.width}x${tela.height}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }, 'image/png');
};
