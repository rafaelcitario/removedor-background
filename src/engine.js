import { removeBackground } from '@imgly/background-removal'

export const FONTES = [['Anton', 400], ['League Spartan', 900], ['Bebas Neue', 400], ['Archivo Black', 400], ['Bangers', 400], ['Luckiest Guy', 400],
  ['Montserrat', 900], ['Oswald', 700], ['Passion One', 900], ['Permanent Marker', 400], ['Poppins', 800], ['Russo One', 400]]
export const RESOLUCOES = [['1280x720', '1280×720 · YouTube'], ['1920x1080', '1920×1080 · 1080p'], ['2560x1440', '2560×1440 · 1440p'],
  ['3840x2160', '3840×2160 · 4K'], ['5120x2880', '5120×2880 · 5K'], ['7680x4320', '7680×4320 · 8K']]

const PW = 1280, PH = 720 // a prévia é sempre 1280×720; a resolução final só é gerada ao exportar
export const T0 = () => ({ x: 0.5, y: 0.5, sx: 1, sy: 1, r: 0, fx: false }) // transformação livre
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const dim = (c, W, H) => { if (c.width !== W || c.height !== H) { c.width = W; c.height = H } return c }
const pausa = () => new Promise((r) => setTimeout(r, 40))
const limitePx = () => (matchMedia('(pointer:coarse)').matches ? 16.7e6 : 40e6)
export const nomeCamada = (l) => (l.tipo === 'sujeito' ? 'Sujeito (recorte)' : l.tipo === 'imagem' ? l.nome : l.txt.split('\n')[0].trim() || 'Texto vazio')

function cabe(W, H) { // o navegador consegue criar um canvas deste tamanho?
  try { const c = cv(W, H), x = c.getContext('2d'); x.fillStyle = '#f00'; x.fillRect(W - 1, H - 1, 1, 1); return x.getImageData(W - 1, H - 1, 1, 1).data[0] === 255 }
  catch { return false }
}

function achar(src) { // área com pixels visíveis
  const k = Math.min(1, 512 / Math.max(src.width, src.height))
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k))
  const c = cv(w, h), x = c.getContext('2d')
  x.drawImage(src, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    if (d[(y * w + i) * 4 + 3] > 16) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) return { x: 0, y: 0, w: src.width, h: src.height }
  const m = Math.ceil(1 / k) + 2
  const sx = Math.max(0, Math.floor(x0 / k) - m), sy = Math.max(0, Math.floor(y0 / k) - m)
  return { x: sx, y: sy, w: Math.min(src.width, Math.ceil((x1 + 1) / k) + m) - sx, h: Math.min(src.height, Math.ceil((y1 + 1) / k) + m) - sy }
}

// ---------- upscaling Lanczos-3 em Web Worker ----------
const WORKER = `(${function () {
  self.onmessage = (e) => {
    const { d, w, h, W, H } = e.data, px = new Uint8ClampedArray(d)
    const lz = (x) => { x = Math.abs(x); if (x < 1e-6) return 1; if (x >= 3) return 0; const p = Math.PI * x; return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p) }
    const taps = (n, N) => {
      const idx = new Int32Array(N * 6), wt = new Float32Array(N * 6), sc = n / N
      for (let o = 0; o < N; o++) {
        const c = (o + 0.5) * sc - 0.5, f = Math.floor(c) - 2; let sum = 0
        for (let t = 0; t < 6; t++) { const v = lz(f + t - c); wt[o * 6 + t] = v; sum += v; idx[o * 6 + t] = Math.min(n - 1, Math.max(0, f + t)) }
        for (let t = 0; t < 6; t++) wt[o * 6 + t] /= sum
      }
      return [idx, wt]
    }
    const [ix, wx] = taps(w, W), [iy, wy] = taps(h, H)
    const src = new Float32Array(w * h * 4)
    for (let i = 0; i < w * h; i++) { const a = px[i * 4 + 3] / 255; src[i * 4] = px[i * 4] * a; src[i * 4 + 1] = px[i * 4 + 1] * a; src[i * 4 + 2] = px[i * 4 + 2] * a; src[i * 4 + 3] = px[i * 4 + 3] }
    const tmp = new Float32Array(W * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let t = 0; t < 6; t++) { const j = (y * w + ix[x * 6 + t]) * 4, k = wx[x * 6 + t]; r += src[j] * k; g += src[j + 1] * k; b += src[j + 2] * k; a += src[j + 3] * k }
      const o = (y * W + x) * 4; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a
    }
    const out = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let t = 0; t < 6; t++) { const j = (iy[y * 6 + t] * W + x) * 4, k = wy[y * 6 + t]; r += tmp[j] * k; g += tmp[j + 1] * k; b += tmp[j + 2] * k; a += tmp[j + 3] * k }
      a = Math.min(255, Math.max(0, a)); const m = a > 0 ? 255 / a : 0, o = (y * W + x) * 4
      out[o] = r * m; out[o + 1] = g * m; out[o + 2] = b * m; out[o + 3] = a
    }
    self.postMessage(out.buffer, [out.buffer])
  }
}})()`

function ampliar(c, S) {
  const w = c.width, h = c.height, W = Math.round(w * S), H = Math.round(h * S)
  const img = c.getContext('2d').getImageData(0, 0, w, h)
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })), wk = new Worker(url)
    const fim = () => { wk.terminate(); URL.revokeObjectURL(url) }
    wk.onmessage = (e) => { fim(); const o = cv(W, H); o.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(e.data), W, H), 0, 0); ok(o) }
    wk.onerror = (e) => { fim(); falha(e) }
    wk.postMessage({ d: img.data.buffer, w, h, W, H }, [img.data.buffer])
  })
}

const novoDoc = () => ({
  layers: [], sel: '', aba: 'camadas', tool: '', pincel: 30, espiando: false, guia: false,
  fundo: { tipo: 'cor', cor: '', g1: '#111111', g2: '#8a8a8a', img: null, blur: 22 },
  sujeito: { trim: true, ajuste: 'contain', cw: 10, cb: 0, cc: '#ffffff', cs: true },
  cor: { br: 100, ct: 100, sa: 100 },
  exp: { res: '1280x720', fmt: 'jpg', lim: true, up: '0' },
})

export class Engine {
  constructor() {
    this.doc = novoDoc(); this.subs = new Set(); this.q = 0; this.uid = 0
    this.tela = null; this.mini = null; this.busy = ''; this.erro = ''; this.nome = 'imagem'; this.temImagem = false; this.onAviso = () => {}
    this.base = this.edit = this.origCv = this.caixa = null; this.acoes = []
    this.T = null; this.up = null; this.exportando = false; this.tracado = null; this.ultimo = null; this.arrasto = null; this.anel = null
    this.CA = cv(1, 1); this.CB = cv(1, 1); this.tmp = cv(1, 1)
  }
  subscribe(f) { this.subs.add(f); return () => this.subs.delete(f) }
  emit() { this.subs.forEach((f) => f()); if (!this.q) this.q = requestAnimationFrame(() => { this.q = 0; this.desenhar() }) }
  mut(fn) { fn(this.doc); this.emit() }
  attach(tela) { this.tela = tela; Promise.all(FONTES.map((f) => document.fonts.load(`${f[1]} 32px "${f[0]}"`))).then(() => this.emit()); this.emit() }

  // ---------- carregar foto ----------
  async carregar(f) {
    const d = this.doc
    this.erro = ''; this.nome = f.name.replace(/\.[^.]+$/, '') || 'imagem'
    this.base = this.edit = this.origCv = this.caixa = null; this.acoes = []
    d.layers = [{ id: 's', tipo: 'sujeito', vis: true, t: T0() }]; d.sel = 's'; d.tool = ''; d.aba = 'camadas'
    this.temImagem = true; this.busy = 'Preparando…'; this.emit()
    // qualidade máxima: modelo isnet (fp32), PNG sem perdas, imagem no tamanho original
    const cfg = {
      model: 'isnet', output: { format: 'image/png', quality: 1 },
      progress: (key, a, t) => { const pct = t ? Math.round((a / t) * 100) : 0; this.busy = String(key).startsWith('fetch') ? `Baixando o modelo (só na primeira vez): ${pct}%` : 'Removendo o fundo…'; this.emit() },
    }
    try {
      let blob
      try { blob = await removeBackground(f, navigator.gpu ? { ...cfg, device: 'gpu' } : cfg) }
      catch (e) { if (!navigator.gpu) throw e; blob = await removeBackground(f, cfg) }
      this.base = await createImageBitmap(blob)
      const orig = await createImageBitmap(f)
      this.origCv = cv(this.base.width, this.base.height); this.origCv.getContext('2d').drawImage(orig, 0, 0, this.base.width, this.base.height)
      this.edit = cv(this.base.width, this.base.height)
      this.refazer(); this.caixa = achar(this.edit)
    } catch (e) {
      console.error(e); this.erro = 'Não foi possível remover o fundo desta imagem. Tente outra imagem ou recarregue a página.'; this.temImagem = false
    }
    this.busy = ''; this.emit()
  }

  // ---------- camadas ----------
  get L() { return this.porId(this.doc.sel) }
  porId(id) { return this.doc.layers.find((l) => l.id === id) }
  setLayer(id, p) { Object.assign(this.porId(id), p); this.emit() }
  selecionar(id) { this.doc.sel = id; this.emit() }
  setAba(a) { if (a !== 'retoque' && this.doc.tool) this.setTool(''); this.doc.aba = a; this.emit() }
  addTexto() {
    const l = { id: 't' + ++this.uid, tipo: 'texto', vis: true, txt: 'SEU TÍTULO', fonte: 0, tam: 115, cor: '#ffffff', borda: '#000000', bw: 16, bb: 0, sh: true,
      b: false, i: false, u: false, s: false, caps: false, al: 'c', ls: 0, lh: 1.08, op: 100, nat: null, t: { ...T0(), y: 0.82 } }
    this.doc.layers.push(l); this.doc.sel = l.id; this.doc.aba = 'camadas'; this.emit()
  }
  async addImagem(f) {
    const l = { id: 'i' + ++this.uid, tipo: 'imagem', vis: true, bmp: await createImageBitmap(f), nome: f.name.replace(/\.[^.]+$/, ''), t: T0() }
    this.doc.layers.push(l); this.doc.sel = l.id; this.doc.aba = 'camadas'; this.emit()
  }
  ordenar(dd) {
    const ls = this.doc.layers, i = ls.indexOf(this.L), j = i + dd
    if (i < 0 || j < 0 || j >= ls.length) return
    ;[ls[i], ls[j]] = [ls[j], ls[i]]; this.emit()
  }
  posRel(frente) { // coloca a camada logo atrás ou logo à frente do sujeito
    const l = this.L; if (!l || l.tipo === 'sujeito') return
    const rest = this.doc.layers.filter((c) => c !== l), k = rest.findIndex((c) => c.tipo === 'sujeito')
    rest.splice(frente ? k + 1 : k, 0, l); this.doc.layers = rest; this.emit()
  }
  duplicar() {
    const o = this.L; if (!o || o.tipo === 'sujeito') return
    const l = { ...o, id: o.tipo[0] + ++this.uid, nat: null, t: { ...o.t, x: o.t.x + 0.03, y: o.t.y + 0.03 } }
    this.doc.layers.splice(this.doc.layers.indexOf(o) + 1, 0, l); this.doc.sel = l.id; this.emit()
  }
  excluir() { const l = this.L; if (!l || l.tipo === 'sujeito') return; this.doc.layers = this.doc.layers.filter((c) => c !== l); this.doc.sel = 's'; this.emit() }
  espelhar() { const l = this.L; if (l) { l.t.fx = !l.t.fx; this.emit() } }
  redefinir() { const l = this.L; if (l) { l.t = { ...T0(), y: l.tipo === 'texto' ? 0.82 : 0.5 }; this.emit() } }
  mover(x) { const l = this.L; if (l) { l.t.x = x; this.emit() } }
  escala(pct) { const l = this.L; if (!l) return; const m = (Math.abs(l.t.sx) + Math.abs(l.t.sy)) / 2 || 1, f = pct / 100 / m; l.t.sx *= f; l.t.sy *= f; this.emit() }
  rotacao(deg) { const l = this.L; if (l) { l.t.r = (deg * Math.PI) / 180; this.emit() } }
  alinhar(a) {
    const l = this.L, g = l && this.geo(l); if (!g) return
    const c = Math.abs(Math.cos(g.r)), n = Math.abs(Math.sin(g.r)), m = 0.03
    const ex = (g.w * c + g.h * n) / 2 / PW, ey = (g.w * n + g.h * c) / 2 / PH
    if (a === 'esq') l.t.x = ex + m; if (a === 'cen') l.t.x = 0.5; if (a === 'dir') l.t.x = 1 - ex - m
    if (a === 'topo') l.t.y = ey + m; if (a === 'meio') l.t.y = 0.5; if (a === 'base') l.t.y = 1 - ey - m
    this.emit()
  }
  setFundo(tipo) { const f = this.doc.fundo; f.tipo = tipo; if (tipo === 'desfocado') f.blur = 22; if (tipo === 'imagem') f.blur = 0; this.emit() }
  setSujeito(p) { Object.assign(this.doc.sujeito, p); if ('trim' in p && this.edit) this.caixa = achar(this.edit); this.emit() }

  // ---------- geometria e seleção ----------
  layoutSujeito(W, H) {
    const { trim, ajuste } = this.doc.sujeito, e = this.edit
    const s = trim && this.caixa ? this.caixa : { x: 0, y: 0, w: e.width, h: e.height }
    const m = ajuste !== 'cover' && trim ? 0.06 : 0
    const k = ajuste === 'cover' ? Math.max(W / s.w, H / s.h) : Math.min((W * (1 - 2 * m)) / s.w, (H * (1 - 2 * m)) / s.h)
    return { s, k, w: s.w * k, h: s.h * k }
  }
  geo(l, W = PW, H = PH) {
    const t = l.t; let w, h
    if (l.tipo === 'texto') { if (!l.nat) return null; w = l.nat.w; h = l.nat.h }
    else if (l.tipo === 'imagem') { const k = (H * 0.5) / l.bmp.height; w = l.bmp.width * k; h = l.bmp.height * k }
    else { if (!this.edit) return null; ({ w, h } = this.layoutSujeito(W, H)) }
    return { cx: t.x * W, cy: t.y * H, w: w * Math.abs(t.sx), h: h * Math.abs(t.sy), r: t.r, w0: w, h0: h }
  }
  selRect() { // moldura da camada selecionada, em porcentagem do quadro
    const l = this.L, g = l && l.vis && !this.doc.tool ? this.geo(l) : null
    if (!g) return null
    return { left: ((g.cx - g.w / 2) / PW) * 100, top: ((g.cy - g.h / 2) / PH) * 100, width: (g.w / PW) * 100, height: (g.h / PH) * 100, r: g.r }
  }
  dentroDe(l, px, py) {
    const g = this.geo(l); if (!g) return false
    const dx = px - g.cx, dy = py - g.cy, c = Math.cos(-g.r), n = Math.sin(-g.r)
    return Math.abs(dx * c - dy * n) <= g.w / 2 && Math.abs(dx * n + dy * c) <= g.h / 2
  }
  xy(e) { const r = this.tela.getBoundingClientRect(); return [((e.clientX - r.left) * PW) / r.width, ((e.clientY - r.top) * PH) / r.height] }
  frac(e) { const r = this.tela.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] }

  // ---------- ponteiro: selecionar, mover, pintar ----------
  down(e) {
    if (!this.edit) return
    const d = this.doc
    e.currentTarget.setPointerCapture(e.pointerId)
    if (d.tool) { this.tracado = { pts: [] }; this.ultimo = null; this.marcar(e); return }
    const [fx, fy] = this.frac(e), [px, py] = this.xy(e), atual = this.L
    let alvo = atual && atual.vis && this.dentroDe(atual, px, py) ? atual : null // mantém a camada já selecionada
    for (let i = d.layers.length - 1; i >= 0 && !alvo; i--) if (d.layers[i].vis && this.dentroDe(d.layers[i], px, py)) alvo = d.layers[i]
    if (!alvo) { d.sel = ''; this.emit(); return } // toque no vazio: desmarca
    if (alvo.id !== d.sel) { d.sel = alvo.id; d.aba = 'camadas' }
    this.arrasto = { l: alvo, fx, fy, a: alvo.t.x, b: alvo.t.y }; this.emit()
  }
  move(e) {
    const d = this.doc
    if (d.tool) { const r = this.tela.getBoundingClientRect(); this.anel = { x: e.clientX - r.left, y: e.clientY - r.top } }
    if (this.tracado) this.marcar(e)
    if (this.arrasto) { const [fx, fy] = this.frac(e), a = this.arrasto; a.l.t.x = a.a + fx - a.fx; a.l.t.y = a.b + fy - a.fy }
    if (d.tool || this.arrasto) this.emit()
  }
  fora() { if (this.anel) { this.anel = null; this.emit() } }
  up_() {
    if (this.tracado) { if (this.tracado.pts.length) this.acoes.push(this.tracado); this.tracado = null }
    this.arrasto = null; this.emit()
  }
  alca(h, e) { // alças: cantos e laterais escalam, a bolinha de cima gira
    const l = this.L, g = l && this.geo(l); if (!g) return
    e.preventDefault(); e.stopPropagation()
    const t0 = { ...l.t }, p0 = this.xy(e), t = l.t
    const mv = (ev) => {
      const [px, py] = this.xy(ev), dx = px - g.cx, dy = py - g.cy
      if (h === 'rot') {
        let a = Math.atan2(dy, dx) + Math.PI / 2; const passo = Math.PI / 12, n = Math.round(a / passo) * passo
        if (Math.abs(a - n) < 0.05) a = n // ímã a cada 15°
        t.r = ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
      } else if (h.length === 2) { // canto: escala proporcional
        const f = Math.max(0.02, Math.hypot(dx, dy) / (Math.hypot(p0[0] - g.cx, p0[1] - g.cy) || 1)); t.sx = t0.sx * f; t.sy = t0.sy * f
      } else { // lateral: estica só um eixo
        const c = Math.cos(-g.r), n = Math.sin(-g.r), lx = dx * c - dy * n, ly = dx * n + dy * c
        if (h === 'e' || h === 'w') t.sx = Math.max(0.02, Math.abs(lx) / (g.w0 / 2)); else t.sy = Math.max(0.02, Math.abs(ly) / (g.h0 / 2))
      }
      this.emit()
    }
    const fim = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fim) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', fim)
  }

  // ---------- retoque ----------
  setTool(t) { const antes = this.doc.tool; this.doc.tool = t; if (antes && !t && this.edit) this.caixa = achar(this.edit); this.emit() }
  carimbar(x, y, r, restaurar) {
    const d = Math.ceil(r * 2) + 2, o = Math.floor(r) + 1, ex = this.edit.getContext('2d')
    const g = ex.createRadialGradient(0, 0, r * 0.6, 0, 0, r); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)')
    if (restaurar) {
      const tm = this.tmp; if (tm.width !== d) { tm.width = d; tm.height = d }
      const t = tm.getContext('2d')
      t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, d, d); t.drawImage(this.origCv, x - o, y - o, d, d, 0, 0, d, d)
      t.globalCompositeOperation = 'destination-in'; t.save(); t.translate(o, o); t.fillStyle = g; t.fillRect(-o, -o, d, d); t.restore()
      ex.drawImage(tm, x - o, y - o)
    } else { ex.save(); ex.globalCompositeOperation = 'destination-out'; ex.translate(x, y); ex.fillStyle = g; ex.fillRect(-o, -o, d, d); ex.restore() }
  }
  refazer() { // resultado da IA + todas as edições
    const ex = this.edit.getContext('2d'), e = this.edit
    ex.globalCompositeOperation = 'source-over'; ex.clearRect(0, 0, e.width, e.height); ex.drawImage(this.base, 0, 0)
    for (const a of this.acoes) {
      if (a.m) { ex.globalCompositeOperation = 'destination-out'; ex.drawImage(a.m, 0, 0, e.width, e.height); ex.globalCompositeOperation = 'source-over' }
      else a.pts.forEach((p) => this.carimbar(...p))
    }
  }
  desfazer() { this.acoes.pop(); this.refazer(); this.emit() }
  ponto(e) { // ponteiro -> coordenadas da foto (desfaz mover, girar, escalar e espelhar)
    const T = this.T, r = this.tela.getBoundingClientRect(), esc = PW / r.width
    const dx = (e.clientX - r.left) * esc - T.cx, dy = (e.clientY - r.top) * esc - T.cy, c = Math.cos(-T.r), n = Math.sin(-T.r)
    let lx = (dx * c - dy * n) / T.tsx; const ly = (dx * n + dy * c) / T.tsy
    if (T.fx) lx = -lx
    return [T.sx0 + (lx + T.w / 2) / T.k, T.sy0 + (ly + T.h / 2) / T.k, ((this.doc.pincel / 2) * esc) / (T.k * ((T.tsx + T.tsy) / 2))]
  }
  marcar(e) {
    if (!this.T) return
    const [x, y, r] = this.ponto(e), rest = this.doc.tool === 'restaurar'
    const st = (px, py) => { this.carimbar(px, py, r, rest); this.tracado.pts.push([px, py, r, rest]) }
    if (!this.ultimo) st(x, y)
    else {
      const dx = x - this.ultimo[0], dy = y - this.ultimo[1], n = Math.floor(Math.hypot(dx, dy) / Math.max(1, r * 0.25))
      if (!n) return
      for (let i = 1; i <= n; i++) st(this.ultimo[0] + (dx * i) / n, this.ultimo[1] + (dy * i) / n)
    }
    this.ultimo = [x, y]
  }
  limparManchas() { // apaga ilhas pequenas e soltas, mantendo as partes grandes
    const e = this.edit, k = Math.min(1, 512 / Math.max(e.width, e.height))
    const w = Math.max(1, Math.round(e.width * k)), h = Math.max(1, Math.round(e.height * k))
    const c = cv(w, h), x = c.getContext('2d'); x.drawImage(e, 0, 0, w, h)
    const d = x.getImageData(0, 0, w, h).data, lab = new Int32Array(w * h), area = [0], pilha = []
    for (let i = 0; i < w * h; i++) {
      if (lab[i] || d[i * 4 + 3] <= 32) continue
      const n = area.length; let a = 0; lab[i] = n; pilha.push(i)
      while (pilha.length) {
        const p = pilha.pop(); a++
        const px = p % w, py = (p - px) / w
        for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, py > 0 ? p - w : -1, py < h - 1 ? p + w : -1]) {
          if (q >= 0 && !lab[q] && d[q * 4 + 3] > 32) { lab[q] = n; pilha.push(q) }
        }
      }
      area.push(a)
    }
    const limite = Math.max(...area) * 0.02, out = x.createImageData(w, h), marcadas = new Set()
    for (let i = 0; i < w * h; i++) {
      const l = lab[i]; if (!l || area[l] >= limite) continue
      marcadas.add(l)
      const px = i % w, py = (i - px) / w
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy
        if (qx >= 0 && qx < w && qy >= 0 && qy < h) out.data[(qy * w + qx) * 4 + 3] = 255
      }
    }
    if (!marcadas.size) { this.onAviso('Nenhuma mancha solta encontrada.'); return }
    const m = cv(w, h); m.getContext('2d').putImageData(out, 0, 0)
    this.acoes.push({ m }); this.refazer(); this.emit()
    this.onAviso(`${marcadas.size} mancha(s) removida(s). Se algo importante sumiu, use “Desfazer”.`)
  }

  // ---------- composição ----------
  desenhar() {
    const tela = this.tela; if (!tela) return
    const d = this.doc, [W, H] = this.exportando ? d.exp.res.split('x').map(Number) : [PW, PH]
    dim(tela, W, H)
    const ctx = tela.getContext('2d'), u = W / 1280, { br, ct, sa } = d.cor
    const filtro = `brightness(${br}%) contrast(${ct}%) saturate(${sa}%)`
    ctx.clearRect(0, 0, W, H)
    this.pintarFundo(ctx, W, H, u, filtro)
    for (const l of d.layers) {
      if (!l.vis) continue
      if (l.tipo === 'sujeito') { if (this.edit) this.sujeito(ctx, W, H, u, filtro, l) }
      else if (l.tipo === 'imagem') this.imagem(ctx, W, H, l)
      else this.texto(ctx, W, H, u, l)
    }
    if (!this.exportando && this.mini) this.mini.getContext('2d').drawImage(tela, 0, 0, this.mini.width, this.mini.height)
  }
  pintarFundo(ctx, W, H, u, filtro) {
    const f = this.doc.fundo
    if (f.tipo === 'cor') { if (f.cor) { ctx.fillStyle = f.cor; ctx.fillRect(0, 0, W, H) } return }
    if (f.tipo === 'degrade') { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, f.g1); g.addColorStop(1, f.g2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); return }
    const img = f.tipo === 'imagem' ? f.img : this.origCv
    if (!img) return
    const bl = f.blur * u, k = Math.max(W / img.width, H / img.height) * (1 + Math.min(0.25, (bl / u) * 0.005))
    ctx.filter = (bl > 0 ? `blur(${bl}px) ` : '') + filtro
    ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); ctx.filter = 'none'
  }
  sombra(ctx, u) { if (this.doc.sujeito.cs) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 6 * u } }
  sujeito(ctx, W, H, u, filtro, l) {
    const { s, k, w, h } = this.layoutSujeito(W, H), t = l.t, sj = this.doc.sujeito
    this.T = { sx0: s.x, sy0: s.y, k, w, h, cx: t.x * W, cy: t.y * H, tsx: t.sx, tsy: t.sy, r: t.r, fx: t.fx }
    const L = dim(this.CA, W, H), c = L.getContext('2d'), fonte = this.doc.espiando ? this.origCv : this.edit
    const fs = this.up ? [this.up.cv, 0, 0, this.up.cv.width, this.up.cv.height] : [fonte, s.x, s.y, s.w, s.h] // recorte ampliado, se houver
    c.clearRect(0, 0, W, H); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'
    c.save(); c.translate(this.T.cx, this.T.cy); c.rotate(t.r); c.scale(t.fx ? -t.sx : t.sx, t.sy)
    c.drawImage(...fs, -w / 2, -h / 2, w, h); c.restore()
    const r = sj.cw * u
    ctx.save()
    if (r > 0) { // contorno: várias cópias deslocadas em círculo, pintadas de uma cor
      const O = dim(this.CB, W, H), o = O.getContext('2d')
      o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, W, H)
      for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; o.drawImage(L, Math.cos(a) * r, Math.sin(a) * r) }
      o.globalCompositeOperation = 'source-in'; o.fillStyle = sj.cc; o.fillRect(0, 0, W, H)
      const cb = sj.cb * u
      this.sombra(ctx, u); ctx.filter = cb > 0 ? `blur(${cb}px)` : 'none'; ctx.drawImage(O, 0, 0)
      ctx.filter = 'none'; ctx.shadowColor = 'transparent'
    } else this.sombra(ctx, u)
    ctx.filter = filtro; ctx.drawImage(L, 0, 0)
    ctx.restore()
  }
  imagem(ctx, W, H, l) {
    const t = l.t, k = (H * 0.5) / l.bmp.height, w = l.bmp.width * k, h = l.bmp.height * k
    ctx.save(); ctx.translate(t.x * W, t.y * H); ctx.rotate(t.r); ctx.scale(t.fx ? -t.sx : t.sx, t.sy)
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(l.bmp, -w / 2, -h / 2, w, h); ctx.restore()
  }
  texto(ctx, W, H, u, l) {
    l.nat = null
    const linhas = (l.caps ? l.txt.toUpperCase() : l.txt).split('\n').filter((s) => s.trim())
    if (!linhas.length) return
    const e = H / 720, tam = l.tam * e, lh = tam * l.lh, f = FONTES[l.fonte], t = l.t
    ctx.save()
    ctx.globalAlpha = l.op / 100
    ctx.font = `${l.i ? 'italic ' : ''}${l.b ? Math.max(700, f[1]) : f[1]} ${tam}px "${f[0]}", Impact, sans-serif`
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${l.ls * e}px`
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    const larg = linhas.map((s) => ctx.measureText(s).width), maior = Math.max(...larg)
    l.nat = { w: maior, h: lh * linhas.length }
    ctx.translate(t.x * W, t.y * H); ctx.rotate(t.r); ctx.scale(t.fx ? -t.sx : t.sx, t.sy) // transformação livre
    const x0 = -maior / 2, y0 = -l.nat.h / 2 + lh / 2
    const sombraOn = () => { if (l.sh) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 4 * u } }
    linhas.forEach((s, i) => {
      const x = l.al === 'l' ? x0 : l.al === 'r' ? x0 + maior - larg[i] : x0 + (maior - larg[i]) / 2, y = y0 + i * lh
      if (l.bw > 0) { // contorno do texto, com desfoque opcional
        ctx.lineWidth = (tam * l.bw) / 100; ctx.strokeStyle = l.borda
        ctx.filter = l.bb > 0 ? `blur(${l.bb * u}px)` : 'none'; sombraOn()
        ctx.strokeText(s, x, y); ctx.filter = 'none'; ctx.shadowColor = 'transparent'
      } else sombraOn()
      ctx.fillStyle = l.cor; ctx.fillText(s, x, y); ctx.shadowColor = 'transparent'
      const fio = Math.max(1, tam * 0.06)
      if (l.u) ctx.fillRect(x, y + tam * 0.36, larg[i], fio)
      if (l.s) ctx.fillRect(x, y - fio / 2, larg[i], fio)
    })
    ctx.restore()
  }

  // ---------- exportar ----------
  async prepararUp(W, H, f) {
    const L0 = this.layoutSujeito(W, H), s = L0.s, sub = this.porId('s').t, k = L0.k * Math.max(Math.abs(sub.sx), Math.abs(sub.sy))
    const S = Math.min(f === 0 ? Infinity : f, Math.max(1, k), Math.sqrt(limitePx() / (s.w * s.h))) // nunca além do necessário
    if (S < 1.05) { this.onAviso(k <= 1.05 ? 'A foto já tem resolução suficiente para esse tamanho: upscaling dispensado.' : 'Sem memória para ampliar a foto neste aparelho.'); return null }
    this.busy = `Ampliando ${S.toFixed(1).replace('.', ',')}× — pode levar alguns segundos…`; this.emit(); await pausa()
    const c = cv(s.w, s.h); c.getContext('2d').drawImage(this.edit, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
    return { cv: await ampliar(c, S), S }
  }
  async exportar() {
    const d = this.doc, [W, H] = d.exp.res.split('x').map(Number), jpg = d.exp.fmt === 'jpg', max = 2 * 1024 * 1024
    if (W * H > 16.7e6 && !cabe(W, H)) throw new Error('Este aparelho não consegue gerar imagens tão grandes. Escolha uma resolução menor (4K costuma funcionar).')
    d.espiando = false; this.busy = 'Gerando a imagem…'; this.emit(); await pausa()
    let blob, q = 0.95, fator = null
    try {
      const f = +d.exp.up
      if (this.edit && f !== 1) this.up = await this.prepararUp(W, H, f)
      fator = this.up?.S; this.exportando = true; this.desenhar()
      let alvo = this.tela
      if (jpg) { // JPG não tem transparência: assenta sobre branco
        alvo = cv(W, H); const c = alvo.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(this.tela, 0, 0)
      }
      const gerar = (qq) => new Promise((r) => alvo.toBlob(r, jpg ? 'image/jpeg' : 'image/png', qq))
      blob = await gerar(q)
      if (jpg && d.exp.lim) while (blob.size > max && q > 0.4) { q -= 0.05; blob = await gerar(q) }
    } catch (e) { console.error(e); throw new Error('Não foi possível gerar esta resolução. Tente uma menor.') }
    finally { this.up = null; this.exportando = false; this.busy = ''; this.emit() }
    return { blob, W, H, jpg, q, fator, max }
  }
}

export const eng = new Engine()
