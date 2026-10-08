import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// controle deslizante com rótulo e valor
export function Rng({ label, v, min, max, step = 1, on, fmt }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-xs tabular-nums">{fmt ? fmt(v) : v}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[v]} onValueChange={([x]) => on(x)} aria-label={label} />
    </div>
  )
}

// seletor de cor em formato de botão
export function Cor({ v, on, label }) {
  return (
    <label title={label} className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background hover:bg-accent">
      <span className="h-5 w-5 rounded-full border border-foreground/40" style={{ background: v }} />
      <input type="color" aria-label={label} value={v} onChange={(e) => on(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </label>
  )
}

// botão que abre um painel flutuante com mais opções
export function Pop({ label, children, className = 'w-72' }) {
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="outline" size="sm">{label}</Button></PopoverTrigger>
      <PopoverContent align="start" className={`${className} grid gap-4`}>{children}</PopoverContent>
    </Popover>
  )
}

// campo numérico com − e +
export function Stepper({ v, on, min = 10, max = 600, step = 5 }) {
  const c = (x) => Math.min(max, Math.max(min, x))
  return (
    <div className="inline-flex h-9 items-center rounded-md border border-input bg-background">
      <Button variant="ghost" size="icon" className="h-9 w-8 rounded-r-none" aria-label="Diminuir tamanho" onClick={() => on(c(Math.round(v) - step))}><Minus /></Button>
      <input
        type="number" inputMode="numeric" aria-label="Tamanho da fonte" value={Math.round(v)}
        onChange={(e) => { const n = +e.target.value; if (n > 0) on(Math.min(max, n)) }}
        onBlur={() => on(c(v))}
        className="h-9 w-14 bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield]"
      />
      <Button variant="ghost" size="icon" className="h-9 w-8 rounded-l-none" aria-label="Aumentar tamanho" onClick={() => on(c(Math.round(v) + step))}><Plus /></Button>
    </div>
  )
}

export const Titulo = ({ children }) => <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
export const Linha = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3"><Label className="text-sm font-normal">{label}</Label>{children}</div>
)
