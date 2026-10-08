import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const ALCAS = {
  nw: ['0%', '0%', 'nwse-resize'], n: ['50%', '0%', 'ns-resize'], ne: ['100%', '0%', 'nesw-resize'], e: ['100%', '50%', 'ew-resize'],
  se: ['100%', '100%', 'nwse-resize'], s: ['50%', '100%', 'ns-resize'], sw: ['0%', '100%', 'nesw-resize'], w: ['0%', '50%', 'ew-resize'],
}
const alca = 'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 touch-none border-2 border-foreground bg-background before:absolute before:-inset-3 before:content-[""]'

export function Stage({ eng }) {
  const ref = useRef(null)
  useEffect(() => { eng.attach(ref.current) }, [eng])
  const d = eng.doc, sel = eng.selRect(), transparente = d.fundo.tipo === 'cor' && !d.fundo.cor
  return (
    <div className="relative aspect-video w-full select-none">
      <div className={cn('absolute inset-0 rounded-lg border', transparente && 'checker')}>
        <canvas
          ref={ref} aria-label="Prévia da thumbnail em 16:9"
          className={cn('h-full w-full touch-none rounded-lg', d.tool ? 'cursor-crosshair' : 'cursor-default')}
          onPointerDown={(e) => eng.down(e)} onPointerMove={(e) => eng.move(e)}
          onPointerUp={() => eng.up_()} onPointerCancel={() => eng.up_()} onPointerLeave={() => eng.fora()}
        />
      </div>
      {d.guia && <div className="pointer-events-none absolute bottom-[2.5%] right-[1.2%] h-[8%] w-[13%] border-2 border-dashed border-foreground bg-foreground/10" />}
      {sel && (
        <div
          className="pointer-events-none absolute border border-foreground"
          style={{ left: sel.left + '%', top: sel.top + '%', width: sel.width + '%', height: sel.height + '%', transform: `rotate(${sel.r}rad)`, boxShadow: '0 0 0 1px hsl(var(--background))' }}
        >
          <span className="absolute -top-7 left-1/2 h-7 border-l border-foreground" />
          {Object.entries(ALCAS).map(([h, [x, y, cursor]]) => (
            <i key={h} onPointerDown={(e) => eng.alca(h, e)} className={cn(alca, 'h-3 w-3 rounded-[3px]')} style={{ left: x, top: y, cursor }} />
          ))}
          <i onPointerDown={(e) => eng.alca('rot', e)} className={cn(alca, 'h-4 w-4 cursor-grab rounded-full')} style={{ left: '50%', top: '-28px' }} />
        </div>
      )}
      {d.tool && eng.anel && (
        <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: eng.anel.x, top: eng.anel.y, width: d.pincel, height: d.pincel, boxShadow: '0 0 0 1px #000' }} />
      )}
      {eng.busy && <div className="absolute inset-0 grid place-items-center rounded-lg bg-background/85 p-4 text-center text-sm font-medium">{eng.busy}</div>}
    </div>
  )
}
