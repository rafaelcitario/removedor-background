import { Type, Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, FlipHorizontal, RotateCcw, ArrowUp, ArrowDown, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { FONTES } from '@/engine'
import { Cor, Pop, Rng, Stepper, Titulo, Linha } from '@/components/atoms'

const Barra = ({ children }) => (
  <div role="toolbar" className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">{children}</div>
)
const Divisor = () => <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

function BarraTexto({ eng, l }) {
  const set = (p) => eng.setLayer(l.id, p)
  const estilos = ['b', 'i', 'u', 's', 'caps']
  const f = FONTES[l.fonte]
  return (
    <>
      <Select value={String(l.fonte)} onValueChange={(v) => set({ fonte: +v })}>
        <SelectTrigger className="h-9 w-44" aria-label="Fonte" style={{ fontFamily: `"${f[0]}"`, fontWeight: f[1] }}><SelectValue /></SelectTrigger>
        <SelectContent>
          {FONTES.map((x, i) => (
            <SelectItem key={x[0]} value={String(i)} style={{ fontFamily: `"${x[0]}"`, fontWeight: x[1], fontSize: '1.05rem' }}>{x[0]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Stepper v={l.tam} on={(x) => set({ tam: x })} />
      <Cor v={l.cor} on={(x) => set({ cor: x })} label="Cor do texto" />
      <Divisor />
      <ToggleGroup type="multiple" variant="outline" size="sm" aria-label="Estilo do texto" value={estilos.filter((k) => l[k])}
        onValueChange={(vs) => set(Object.fromEntries(estilos.map((k) => [k, vs.includes(k)])))}>
        <ToggleGroupItem value="b" aria-label="Negrito" title="Negrito"><Bold /></ToggleGroupItem>
        <ToggleGroupItem value="i" aria-label="Itálico" title="Itálico"><Italic /></ToggleGroupItem>
        <ToggleGroupItem value="u" aria-label="Sublinhado" title="Sublinhado"><Underline /></ToggleGroupItem>
        <ToggleGroupItem value="s" aria-label="Tachado" title="Tachado"><Strikethrough /></ToggleGroupItem>
        <ToggleGroupItem value="caps" aria-label="Maiúsculas" title="Maiúsculas">Aa</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" variant="outline" size="sm" aria-label="Alinhamento do texto" value={l.al} onValueChange={(v) => v && set({ al: v })}>
        <ToggleGroupItem value="l" aria-label="Alinhar à esquerda" title="Esquerda"><AlignLeft /></ToggleGroupItem>
        <ToggleGroupItem value="c" aria-label="Centralizar" title="Centro"><AlignCenter /></ToggleGroupItem>
        <ToggleGroupItem value="r" aria-label="Alinhar à direita" title="Direita"><AlignRight /></ToggleGroupItem>
      </ToggleGroup>
      <Divisor />
      <Pop label="Espaçamento">
        <Rng label="Entre letras" v={l.ls} min={-10} max={60} on={(x) => set({ ls: x })} />
        <Rng label="Entre linhas" v={l.lh} min={0.8} max={2} step={0.05} on={(x) => set({ lh: x })} fmt={(x) => x.toFixed(2)} />
      </Pop>
      <Pop label="Opacidade"><Rng label="Opacidade" v={l.op} min={0} max={100} on={(x) => set({ op: x })} fmt={(x) => x + '%'} /></Pop>
      <Pop label="Efeitos">
        <Titulo>Contorno</Titulo>
        <Linha label="Cor do contorno"><Cor v={l.borda} on={(x) => set({ borda: x })} label="Cor do contorno" /></Linha>
        <Rng label="Espessura" v={l.bw} min={0} max={30} on={(x) => set({ bw: x })} />
        <Rng label="Desfoque do contorno" v={l.bb} min={0} max={40} on={(x) => set({ bb: x })} />
        <Linha label="Sombra"><Switch checked={l.sh} onCheckedChange={(v) => set({ sh: v })} aria-label="Sombra" /></Linha>
      </Pop>
      <Pop label="Posição">
        <Titulo>Em relação ao sujeito</Titulo>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => eng.posRel(false)}>Atrás do sujeito</Button>
          <Button variant="outline" size="sm" onClick={() => eng.posRel(true)}>Na frente</Button>
        </div>
        <Titulo>Alinhar na imagem</Titulo>
        <div className="grid grid-cols-3 gap-2">
          {[['esq', 'Esquerda'], ['cen', 'Centro'], ['dir', 'Direita'], ['topo', 'Topo'], ['meio', 'Meio'], ['base', 'Base']].map(([a, t]) => (
            <Button key={a} variant="outline" size="sm" onClick={() => eng.alinhar(a)}>{t}</Button>
          ))}
        </div>
      </Pop>
    </>
  )
}

export function Toolbar({ eng }) {
  const d = eng.doc, l = eng.L
  if (d.tool) return (
    <Barra>
      <p className="px-2 text-sm text-muted-foreground">Modo retoque: pinte sobre o recorte para restaurar ou apagar partes.</p>
      <Button size="sm" onClick={() => eng.setTool('')}>Concluir retoque</Button>
    </Barra>
  )
  if (!l) return (
    <Barra>
      <p className="px-2 text-sm text-muted-foreground">Toque em um elemento da imagem ou da lista de camadas para editá-lo.</p>
      <Button size="sm" variant="outline" onClick={() => eng.addTexto()}><Type />Adicionar texto</Button>
    </Barra>
  )
  const i = d.layers.indexOf(l), livre = l.tipo !== 'sujeito'
  return (
    <Barra>
      <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{l.tipo === 'texto' ? 'Texto' : l.tipo === 'imagem' ? 'Imagem' : 'Sujeito'}</span>
      {l.tipo === 'texto' && <BarraTexto eng={eng} l={l} />}
      {l.tipo === 'texto' && <Divisor />}
      <Button variant="outline" size="sm" onClick={() => eng.espelhar()}><FlipHorizontal />Espelhar</Button>
      <Button variant="outline" size="sm" onClick={() => eng.redefinir()}><RotateCcw />Redefinir</Button>
      <Button variant="outline" size="sm" disabled={i >= d.layers.length - 1} onClick={() => eng.ordenar(1)}><ArrowUp />Frente</Button>
      <Button variant="outline" size="sm" disabled={i <= 0} onClick={() => eng.ordenar(-1)}><ArrowDown />Trás</Button>
      {livre && <Button variant="outline" size="sm" onClick={() => eng.duplicar()}><Copy />Duplicar</Button>}
      {livre && <Button variant="outline" size="sm" onClick={() => eng.excluir()}><Trash2 />Excluir</Button>}
    </Barra>
  )
}
