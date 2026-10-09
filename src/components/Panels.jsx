import { useRef } from 'react'
import { Layers, Image as ImageIcon, SlidersHorizontal, Eraser, Eye, EyeOff, Type, ImagePlus, Undo2, Sparkles, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { nomeCamada } from '@/engine'
import { Cor, Linha, Rng, Titulo } from '@/components/atoms'

const ICONE = { sujeito: User, texto: Type, imagem: ImageIcon }

function PCamadas({ eng }) {
  const d = eng.doc, l = eng.L, arq = useRef(null)
  const sj = d.sujeito, m = l ? Math.round(((Math.abs(l.t.sx) + Math.abs(l.t.sy)) / 2) * 100) : 100
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => eng.addTexto()}><Type />Texto</Button>
          <Button size="sm" variant="outline" onClick={() => arq.current.click()}><ImagePlus />Imagem</Button>
          <input ref={arq} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await eng.addImagem(f) }} />
        </div>
        <ul className="grid gap-1.5" aria-label="Camadas, da frente para trás">
          {[...d.layers].reverse().map((c) => {
            const I = ICONE[c.tipo]
            return (
              <li key={c.id} className={cn('flex items-center gap-1 rounded-md border p-1', c.id === d.sel && 'border-foreground bg-accent')}>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={c.vis ? 'Ocultar camada' : 'Mostrar camada'} onClick={() => eng.setLayer(c.id, { vis: !c.vis })}>
                  {c.vis ? <Eye /> : <EyeOff />}
                </Button>
                <button type="button" onClick={() => eng.selecionar(c.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm">
                  <I className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{nomeCamada(c)}</span>
                </button>
              </li>
            )
          })}
          <li className="flex items-center rounded-md border border-dashed p-1">
            <button type="button" onClick={() => eng.setAba('fundo')} className="flex flex-1 items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />Fundo
            </button>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">Arraste na imagem para mover, use as alças para redimensionar e a bolinha de cima para girar. Setas movem, Delete exclui, Ctrl+D duplica.</p>
      </div>

      {l && (
        <>
          <Separator />
          <div className="grid gap-4">
            <Titulo>Transformar</Titulo>
            <Rng label="Escala" v={Math.min(400, Math.max(5, m))} min={5} max={400} on={(v) => eng.escala(v)} fmt={(v) => v + '%'} />
            <Rng label="Rotação" v={Math.round((l.t.r * 180) / Math.PI)} min={-180} max={180} on={(v) => eng.rotacao(v)} fmt={(v) => v + '°'} />
            <div className="grid grid-cols-3 gap-2">
              {[['Esquerda', 0.28], ['Centro', 0.5], ['Direita', 0.72]].map(([t, x]) => (
                <Button key={t} variant="outline" size="sm" onClick={() => eng.mover(x)}>{t}</Button>
              ))}
            </div>
          </div>
        </>
      )}

      {l?.tipo === 'texto' && (
        <>
          <Separator />
          <div className="grid gap-2">
            <Titulo>Conteúdo</Titulo>
            <Textarea rows={3} value={l.txt} placeholder="Digite o título (Enter quebra a linha)" onChange={(e) => eng.setLayer(l.id, { txt: e.target.value })} />
            <p className="text-xs text-muted-foreground">Fonte, tamanho, cor e efeitos estão na barra acima da imagem.</p>
          </div>
        </>
      )}

      {l?.tipo === 'sujeito' && (
        <>
          <Separator />
          <div className="grid gap-4">
            <Titulo>Recorte e contorno</Titulo>
            <Linha label="Centralizar no sujeito"><Switch checked={sj.trim} onCheckedChange={(v) => eng.setSujeito({ trim: v })} aria-label="Centralizar no sujeito" /></Linha>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Enquadramento</Label>
              <Select value={sj.ajuste} onValueChange={(v) => eng.setSujeito({ ajuste: v })}>
                <SelectTrigger aria-label="Enquadramento"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="contain">Mostrar inteiro</SelectItem><SelectItem value="cover">Preencher o quadro</SelectItem></SelectContent>
              </Select>
            </div>
            <Rng label="Contorno" v={sj.cw} min={0} max={40} on={(v) => eng.setSujeito({ cw: v })} />
            <Rng label="Desfoque do contorno" v={sj.cb} min={0} max={40} on={(v) => eng.setSujeito({ cb: v })} />
            <Linha label="Cor do contorno"><Cor v={sj.cc} on={(v) => eng.setSujeito({ cc: v })} label="Cor do contorno" /></Linha>
            <Linha label="Sombra"><Switch checked={sj.cs} onCheckedChange={(v) => eng.setSujeito({ cs: v })} aria-label="Sombra" /></Linha>
          </div>
        </>
      )}
    </div>
  )
}

function PFundo({ eng }) {
  const f = eng.doc.fundo, arq = useRef(null)
  const set = (p) => eng.mut((d) => Object.assign(d.fundo, p))
  const preset = f.cor === '' ? 't' : f.cor === '#ffffff' ? 'b' : f.cor === '#000000' ? 'p' : ''
  return (
    <div className="grid gap-5">
      <ToggleGroup type="single" variant="outline" className="grid grid-cols-4" value={f.tipo} onValueChange={(v) => v && eng.setFundo(v)} aria-label="Tipo de fundo">
        {[['cor', 'Cor'], ['degrade', 'Degradê'], ['imagem', 'Imagem'], ['desfocado', 'Desfoque']].map(([v, t]) => (
          <ToggleGroupItem key={v} value={v} className="px-1 text-xs sm:text-sm">{t}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      {f.tipo === 'cor' && (
        <div className="grid gap-3">
          <ToggleGroup type="single" variant="outline" className="grid grid-cols-3" value={preset} aria-label="Cor de fundo"
            onValueChange={(v) => v && set({ cor: { t: '', b: '#ffffff', p: '#000000' }[v] })}>
            <ToggleGroupItem value="t" className="text-xs sm:text-sm">Transparente</ToggleGroupItem>
            <ToggleGroupItem value="b">Branco</ToggleGroupItem>
            <ToggleGroupItem value="p">Preto</ToggleGroupItem>
          </ToggleGroup>
          <Linha label="Cor personalizada"><Cor v={f.cor || '#808080'} on={(v) => set({ cor: v })} label="Cor personalizada" /></Linha>
        </div>
      )}
      {f.tipo === 'degrade' && (
        <div className="grid gap-3">
          <Linha label="Cor inicial"><Cor v={f.g1} on={(v) => set({ g1: v })} label="Cor inicial" /></Linha>
          <Linha label="Cor final"><Cor v={f.g2} on={(v) => set({ g2: v })} label="Cor final" /></Linha>
        </div>
      )}
      {f.tipo === 'imagem' && (
        <div>
          <Button variant="outline" onClick={() => arq.current.click()}><ImagePlus />{f.img ? 'Trocar imagem' : 'Escolher imagem'}</Button>
          <input ref={arq} type="file" accept="image/*" className="hidden" onChange={async (e) => { const x = e.target.files[0]; e.target.value = ''; if (x) set({ img: await createImageBitmap(x) }) }} />
        </div>
      )}
      {(f.tipo === 'imagem' || f.tipo === 'desfocado') && <Rng label="Desfoque do fundo" v={f.blur} min={0} max={60} on={(v) => set({ blur: v })} />}
    </div>
  )
}

function PAjustes({ eng }) {
  const c = eng.doc.cor, set = (p) => eng.mut((d) => Object.assign(d.cor, p))
  return (
    <div className="grid gap-5">
      <Rng label="Brilho" v={c.br} min={50} max={150} on={(v) => set({ br: v })} fmt={(v) => v + '%'} />
      <Rng label="Contraste" v={c.ct} min={50} max={150} on={(v) => set({ ct: v })} fmt={(v) => v + '%'} />
      <Rng label="Saturação" v={c.sa} min={0} max={180} on={(v) => set({ sa: v })} fmt={(v) => v + '%'} />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => set({ br: 105, ct: 112, sa: 130 })}><Sparkles />Dar mais vida</Button>
        <Button variant="outline" size="sm" onClick={() => set({ br: 100, ct: 100, sa: 100 })}>Redefinir</Button>
      </div>
      <p className="text-xs text-muted-foreground">Os ajustes valem para o sujeito e para o fundo em imagem. Textos e imagens adicionadas não são alterados.</p>
    </div>
  )
}

function PRetoque({ eng }) {
  const d = eng.doc, ok = !!eng.edit, rc = d.recorte, setR = (x) => eng.setRecorte(x), espiar = (v) => eng.mut((x) => { x.espiando = v })
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 rounded-lg border p-3">
        <Titulo>Refino automático do recorte</Titulo>
        <Linha label="Refinar bordas e remover fantasmas"><Switch checked={rc.on} disabled={!ok} onCheckedChange={(v) => setR({ on: v })} aria-label="Refinar recorte" /></Linha>
        {rc.on && (
          <>
            <Rng label="Sensibilidade" v={rc.sens} min={2} max={40} on={(v) => setR({ sens: v })} fmt={(v) => v + '%'} />
            <Rng label="Precisão da borda" v={rc.borda} min={1} max={10} on={(v) => setR({ borda: v })} />
            <Linha label="Preservar transparência"><Switch checked={rc.transp} onCheckedChange={(v) => setR({ transp: v })} aria-label="Preservar transparência" /></Linha>
            <p className="text-xs text-muted-foreground">Partes do sujeito que saíram semitransparentes (fantasmas) viram sólidas. Se ainda sobrar fantasma, aumente a sensibilidade; se estiver incluindo fundo demais, diminua. Use “Preservar transparência” para vidro, véus e fumaça.</p>
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Corrija o recorte: pinte de volta o que foi cortado sem querer ou apague o que sobrou. Depois, clique em “Concluir retoque”.</p>
      <ToggleGroup type="single" variant="outline" className="grid grid-cols-2" value={d.tool} onValueChange={(v) => eng.setTool(v || '')} aria-label="Ferramenta de retoque">
        <ToggleGroupItem value="restaurar" disabled={!ok}>Restaurar</ToggleGroupItem>
        <ToggleGroupItem value="apagar" disabled={!ok}>Apagar</ToggleGroupItem>
      </ToggleGroup>
      <Rng label="Tamanho do pincel" v={d.pincel} min={4} max={120} on={(v) => eng.mut((x) => { x.pincel = v })} fmt={(v) => v + ' px'} />
      <div className="grid gap-2">
        <Button variant="outline" disabled={!ok || !eng.acoes.length} onClick={() => eng.desfazer()}><Undo2 />Desfazer</Button>
        <Button variant="outline" disabled={!ok} onClick={() => eng.limparManchas()}><Eraser />Remover manchas soltas</Button>
        <Button variant="outline" disabled={!ok} onPointerDown={() => espiar(true)} onPointerUp={() => espiar(false)} onPointerLeave={() => espiar(false)} onPointerCancel={() => espiar(false)}>
          <Eye />Segurar para ver o original
        </Button>
      </div>
    </div>
  )
}

export function Panels({ eng }) {
  const aba = [['camadas', 'Camadas', Layers], ['fundo', 'Fundo', ImageIcon], ['ajustes', 'Ajustes', SlidersHorizontal], ['retoque', 'Retoque', Eraser]]
  return (
    <Tabs value={eng.doc.aba} onValueChange={(v) => eng.setAba(v)} className="rounded-lg border bg-card">
      <TabsList className="grid h-auto w-full grid-cols-4 rounded-b-none rounded-t-lg p-1">
        {aba.map(([v, t, I]) => <TabsTrigger key={v} value={v} className="gap-1.5 px-1 py-2 text-xs sm:text-sm"><I className="h-4 w-4" />{t}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="camadas" className="p-4"><PCamadas eng={eng} /></TabsContent>
      <TabsContent value="fundo" className="p-4"><PFundo eng={eng} /></TabsContent>
      <TabsContent value="ajustes" className="p-4"><PAjustes eng={eng} /></TabsContent>
      <TabsContent value="retoque" className="p-4"><PRetoque eng={eng} /></TabsContent>
    </Tabs>
  )
}
