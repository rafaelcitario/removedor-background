import { useEffect, useReducer, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { eng, RESOLUCOES } from '@/engine'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Stage } from '@/components/Stage'
import { Toolbar } from '@/components/Toolbar'
import { Panels } from '@/components/Panels'

function Entrada({ onFile }) {
  const arq = useRef(null)
  return (
    <div className="mx-auto mt-[8vh] grid max-w-xl gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Thumbnails para YouTube</h1>
      <p className="text-muted-foreground">Remova o fundo, componha com texto e imagens em camadas e exporte em 16:9. Tudo acontece no seu navegador: a foto não é enviada a nenhum servidor.</p>
      <button
        type="button" onClick={() => arq.current.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
        className="grid justify-items-center gap-2 rounded-xl border-2 border-dashed p-10 transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-none"
      >
        <Upload className="h-6 w-6" />
        <strong>Toque aqui, arraste ou cole uma imagem</strong>
        <span className="text-sm text-muted-foreground">JPG, PNG ou WebP</span>
      </button>
      <input ref={arq} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f) }} />
      {eng.erro && <p role="alert" className="rounded-md border border-foreground p-3 text-sm font-medium">{eng.erro}</p>}
      <p className="text-xs text-muted-foreground">Na primeira vez o navegador baixa o modelo de IA (cerca de 170 MB) e o guarda em cache.</p>
    </div>
  )
}

function Exportar({ onBaixar }) {
  const x = eng.doc.exp, set = (p) => eng.mut((d) => Object.assign(d.exp, p))
  return (
    <Popover>
      <PopoverTrigger asChild><Button size="sm" disabled={!eng.edit}><Download />Exportar</Button></PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-4">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Tamanho</Label>
          <Select value={x.res} onValueChange={(v) => set({ res: v })}>
            <SelectTrigger aria-label="Tamanho"><SelectValue /></SelectTrigger>
            <SelectContent>{RESOLUCOES.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Formato</Label>
          <Select value={x.fmt} onValueChange={(v) => set({ fmt: v })}>
            <SelectTrigger aria-label="Formato"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="jpg">JPG</SelectItem><SelectItem value="png">PNG (com transparência)</SelectItem></SelectContent>
          </Select>
        </div>
        {x.fmt === 'jpg' && (
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-normal">Limitar a 2 MB (YouTube)</Label>
            <Switch checked={x.lim} onCheckedChange={(v) => set({ lim: v })} aria-label="Limitar a 2 MB" />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Upscaling da foto</Label>
          <Select value={x.up} onValueChange={(v) => set({ up: v })}>
            <SelectTrigger aria-label="Upscaling"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['0', 'Automático'], ['1', 'Desligado'], ['2', '2×'], ['4', '4×'], ['5', '5×'], ['10', '10×']].map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Amplia o recorte com reamostragem Lanczos, limitado ao que o tamanho exige (até 8K) e à memória do aparelho.</p>
        </div>
        <Button onClick={onBaixar}><Download />Baixar thumbnail</Button>
      </PopoverContent>
    </Popover>
  )
}

export default function App() {
  const [, force] = useReducer((n) => n + 1, 0)
  const [aviso, setAviso] = useState('')
  const timer = useRef(0), novo = useRef(null)

  useEffect(() => {
    eng.onAviso = (t) => { setAviso(t); clearTimeout(timer.current); timer.current = setTimeout(() => setAviso(''), 4500) }
    const off = eng.subscribe(force)
    const colar = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) eng.carregar(f) }
    const teclas = (e) => { // setas movem, Delete exclui, Ctrl+D duplica, Esc desmarca
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || eng.doc.tool) return
      const l = eng.L; if (!l) return
      const p = e.shiftKey ? 0.02 : 0.004, d = { ArrowLeft: [-p, 0], ArrowRight: [p, 0], ArrowUp: [0, -p], ArrowDown: [0, p] }[e.key]
      if (d) { e.preventDefault(); l.t.x += d[0]; l.t.y += d[1]; eng.emit() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && l.tipo !== 'sujeito') eng.excluir()
      else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && l.tipo !== 'sujeito') { e.preventDefault(); eng.duplicar() }
      else if (e.key === 'Escape') eng.selecionar('')
    }
    document.addEventListener('paste', colar); document.addEventListener('keydown', teclas)
    return () => { off(); document.removeEventListener('paste', colar); document.removeEventListener('keydown', teclas) }
  }, [])

  async function baixar() {
    try {
      const r = await eng.exportar()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(r.blob); a.download = `${eng.nome}-thumbnail-${r.W}x${r.H}.${r.jpg ? 'jpg' : 'png'}`
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      const mb = (r.blob.size / 1048576).toFixed(2).replace('.', ',')
      eng.onAviso((r.blob.size > r.max ? `Arquivo com ${mb} MB: passa do limite de 2 MB do YouTube. Use 1280×720 em JPG com “Limitar a 2 MB”.`
        : `Arquivo salvo: ${mb} MB${r.jpg ? ` (qualidade ${Math.round(r.q * 100)}%)` : ''}.`) + (r.fator ? ` Upscaling ${r.fator.toFixed(1).replace('.', ',')}× aplicado.` : ''))
    } catch (e) { eng.onAviso(e.message || 'Não foi possível gerar esta resolução.') }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">TS</span>Thumbnail Studio
        </div>
        {eng.temImagem && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => novo.current.click()}><Upload />Nova imagem</Button>
            <Exportar onBaixar={baixar} />
            <input ref={novo} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) eng.carregar(f) }} />
          </div>
        )}
      </header>

      {!eng.temImagem ? <Entrada onFile={(f) => eng.carregar(f)} /> : (
        <main className="mx-auto grid max-w-[1400px] gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:p-4">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="order-2 lg:order-1"><Toolbar eng={eng} /></div>
            <div className="sticky top-14 z-30 order-1 -mx-3 bg-background px-3 pb-2 pt-1 lg:static lg:order-2 lg:m-0 lg:p-0"><Stage eng={eng} /></div>
            <div className="order-3 flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3">
              <canvas ref={(c) => { eng.mini = c }} width={336} height={189} className="h-[94px] w-[168px] rounded-md border bg-muted" aria-label="Prévia no tamanho de um celular" />
              <div className="grid gap-2 text-sm">
                <span className="text-muted-foreground">Prévia no tamanho de um celular</span>
                <div className="flex items-center gap-2">
                  <Switch checked={eng.doc.guia} onCheckedChange={(v) => eng.mut((d) => { d.guia = v })} aria-label="Mostrar guia do contador" />
                  <Label className="font-normal">Guia do contador de duração</Label>
                </div>
              </div>
            </div>
          </section>
          <aside className="min-w-0"><Panels eng={eng} /></aside>
        </main>
      )}

      {aviso && <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-md bg-foreground px-4 py-2 text-sm text-background shadow-lg">{aviso}</div>}
    </div>
  )
}
