// Refino do recorte, inspirado no que o withoutBG descreve em seu pipeline:
//  1) alfa contínuo (matting), não máscara binária: o miolo do sujeito deve ser 100% opaco e só a borda é macia;
//  2) trimap: miolo certo / fundo certo / faixa incerta, e só a faixa incerta guarda transparência;
//  3) refino na resolução da foto, guiado pela própria imagem, para a borda seguir os contornos reais.
// Aqui isso vira: filtro guiado (borda) + trimap por distância (miolo sólido, fundo limpo) + descarte de ilhas fracas.
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const sstep = (lo, hi, v) => { const t = clamp01((v - lo) / (hi - lo)); return t * t * (3 - 2 * t) }

export function alfaDe(img) {
  const n = img.width * img.height, a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = img.data[i * 4 + 3] / 255
  return a
}
export function lumDe(img) {
  const n = img.width * img.height, l = new Float32Array(n), d = img.data
  for (let i = 0; i < n; i++) l[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255
  return l
}

function box(src, w, h, r) { // média numa janela (2r+1)², borda replicada, custo O(N)
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0
    for (let k = -r; k <= r; k++) s += src[row + Math.min(w - 1, Math.max(0, k))]
    for (let x = 0; x < w; x++) { tmp[row + x] = s / n; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)] }
  }
  for (let x = 0; x < w; x++) {
    let s = 0
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
    for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x] }
  }
  return out
}

function guiado(I, p, w, h, r, eps) { // filtro guiado (He et al.): a borda do alfa passa a seguir as bordas da foto
  const N = w * h, Ip = new Float32Array(N), II = new Float32Array(N)
  for (let i = 0; i < N; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i] }
  const mI = box(I, w, h, r), mp = box(p, w, h, r), mIp = box(Ip, w, h, r), mII = box(II, w, h, r)
  const a = new Float32Array(N), b = new Float32Array(N)
  for (let i = 0; i < N; i++) { a[i] = (mIp[i] - mI[i] * mp[i]) / (mII[i] - mI[i] * mI[i] + eps); b[i] = mp[i] - a[i] * mI[i] }
  const ma = box(a, w, h, r), mb = box(b, w, h, r), out = new Float32Array(N)
  for (let i = 0; i < N; i++) out[i] = ma[i] * I[i] + mb[i]
  return out
}

function dist(mask, w, h) { // distância (px) até o pixel marcado mais próximo
  const d = new Float32Array(w * h), D = 1.4142
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 1e9
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i]
    if (x > 0) v = Math.min(v, d[i - 1] + 1)
    if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + D); if (x < w - 1) v = Math.min(v, d[i - w + 1] + D) }
    d[i] = v
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i]
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1)
    if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + D); if (x > 0) v = Math.min(v, d[i + w - 1] + D) }
    d[i] = v
  }
  return d
}
const dilatar = (m, w, h, r) => { const d = dist(m, w, h), o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = d[i] <= r ? 1 : 0; return o }
const erodir = (m, w, h, r) => { const inv = new Uint8Array(w * h); for (let i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1; const d = dist(inv, w, h), o = new Uint8Array(w * h); for (let i = 0; i < o.length; i++) o[i] = d[i] > r ? 1 : 0; return o }
const fechar = (m, w, h, r) => erodir(dilatar(m, w, h, r), w, h, r) // fecha buracos pequenos

function filtrarIlhas(m, a0, w, h) { // descarta manchas soltas fracas e minúsculas; mantém partes grandes ou bem detectadas
  const n = w * h, lab = new Int32Array(n), pilha = new Int32Array(n), area = [0], pico = [0]
  for (let s = 0; s < n; s++) {
    if (!m[s] || lab[s]) continue
    const id = area.length; let sp = 0, a = 0, pk = 0
    pilha[sp++] = s; lab[s] = id
    while (sp) {
      const p = pilha[--sp], x = p % w; a++; if (a0[p] > pk) pk = a0[p]
      if (x > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = id; pilha[sp++] = p - 1 }
      if (x < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = id; pilha[sp++] = p + 1 }
      if (p >= w && m[p - w] && !lab[p - w]) { lab[p - w] = id; pilha[sp++] = p - w }
      if (p < n - w && m[p + w] && !lab[p + w]) { lab[p + w] = id; pilha[sp++] = p + w }
    }
    area.push(a); pico.push(pk)
  }
  let maior = 0; for (const a of area) if (a > maior) maior = a
  const o = new Uint8Array(n)
  for (let i = 0; i < n; i++) { const l = lab[i]; if (l && (area[l] >= maior * 0.02 || pico[l] >= 0.45)) o[i] = 1 }
  return o
}

// ref = { w, h, a0 (alfa bruto da IA), lum (luminância da foto) }; p = { sens, borda, transp }
export function alfaRefinado(ref, p, cache = {}) {
  const { w, h, a0, lum } = ref, n = w * h, R = Math.max(w, h), thr = p.sens / 100
  const r = Math.max(1, Math.round((R * p.borda) / 1000))
  if (!cache.cacheAg || cache.cacheAg.r !== r) { // o filtro guiado só muda com "precisão da borda"
    const g = guiado(lum, a0, w, h, r, 1e-3); for (let i = 0; i < n; i++) g[i] = clamp01(g[i])
    cache.cacheAg = { r, g }
  }
  const ag = cache.cacheAg.g
  if (p.transp) return ag // preservar transparência: só alinha a borda, sem solidificar nada
  const fraco = new Uint8Array(n)
  for (let i = 0; i < n; i++) fraco[i] = a0[i] > thr ? 1 : 0
  const C = fechar(filtrarIlhas(fraco, a0, w, h), w, h, Math.max(2, Math.round(R * 0.01)))
  const miolo = erodir(C, w, h, Math.max(1, Math.round(R * 0.004))), perto = dilatar(C, w, h, Math.max(2, Math.round(R * 0.006)))
  const lo = thr * 0.35, hi = 0.8, piso = thr * 0.4, out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = !perto[i] ? 0 : miolo[i] && a0[i] > piso ? 1 : sstep(lo, hi, ag[i])
  return out
}
