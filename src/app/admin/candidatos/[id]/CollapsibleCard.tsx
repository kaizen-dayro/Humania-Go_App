'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function CollapsibleCard({
  title,
  defaultOpen = false,
  headerExtra,
  accent = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  headerExtra?: ReactNode
  /** Resalta la tarjeta con borde y franja azul institucional (secciones que requieren acción del equipo). */
  accent?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`bg-white p-8 mt-6 rounded-lg shadow-sm relative overflow-hidden ${accent ? 'border border-humania-blue' : 'border border-neutral-200'}`}>
      {accent && <div className="absolute top-0 left-0 w-1 h-full bg-humania-blue"></div>}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 border-b border-neutral-100 pb-3 text-left"
      >
        <span className="text-sm font-bold text-humania-gray/50 tracking-widest">{title}</span>
        <span className="flex items-center gap-3 shrink-0">
          {headerExtra}
          <ChevronDown className={`w-4 h-4 text-humania-gray/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <div className="pt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
