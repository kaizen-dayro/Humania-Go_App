'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { LETTERS_WITH_PUNCTUATION, capitalizarPalabras } from '@/lib/validation'
import { setCiudadActiva, setMunicipioActivo } from '../actions'

type Ciudad = { id: string; nombre_oficial: string; activo: boolean; orden: number }
type Municipio = { id: string; ciudad_operacion_id: string; nombre_oficial: string; activo: boolean; orden: number }

/**
 * Interruptor activo/inactivo reutilizado tanto para una ciudad como para
 * un municipio -- mismo patrón de confirmación con motivo obligatorio que
 * ModeloActivoToggle.tsx (Fase 13) y SegmentacionToggle (Fase 16).
 */
function ActivarToggle({
  activo,
  onConfirm,
}: {
  activo: boolean
  onConfirm: (nuevoActivo: boolean, motivo: string) => Promise<{ success: boolean; error?: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const nuevaAccion = activo ? 'DESACTIVAR' : 'ACTIVAR'

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!LETTERS_WITH_PUNCTUATION.test(e.target.value)) return
    const input = e.target
    const cursorPos = input.selectionStart
    setMotivo(capitalizarPalabras(input.value))
    requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) { setMotivo(''); setError('') }
  }

  async function handleConfirm() {
    const trimmed = motivo.trim()
    if (trimmed.length < 10) { setError('El motivo debe tener al menos 10 caracteres.'); return }

    setLoading(true)
    setError('')
    const res = await onConfirm(!activo, trimmed)
    setLoading(false)

    if (!res.success) { setError(res.error || 'No se pudo guardar.'); return }

    setOpen(false)
    setMotivo('')
    router.refresh()
  }

  return (
    <>
      <Checkbox
        checked={activo}
        onCheckedChange={() => setOpen(true)}
        className="data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue"
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{nuevaAccion === 'ACTIVAR' ? 'Activar' : 'Desactivar'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo (obligatorio)</label>
              <Textarea
                value={motivo}
                onChange={handleChange}
                placeholder="Motivo del cambio... (mínimo 10 caracteres)"
                maxLength={111}
                rows={3}
                autoFocus
              />
              <p className="text-xs text-neutral-400 text-right">{motivo.length}/111</p>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <Button onClick={handleConfirm} disabled={loading} className="w-full bg-humania-blue hover:bg-humania-blue/90">
              {loading ? 'Guardando...' : `Confirmar ${nuevaAccion === 'ACTIVAR' ? 'activación' : 'desactivación'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CiudadesManager({ ciudades, municipios }: { ciudades: Ciudad[]; municipios: Municipio[] }) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())

  function toggleExpand(ciudadId: string) {
    setExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(ciudadId)) next.delete(ciudadId)
      else next.add(ciudadId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {ciudades.map(ciudad => {
        const municipiosDeCiudad = municipios.filter(m => m.ciudad_operacion_id === ciudad.id)
        const expandida = expandidas.has(ciudad.id)

        return (
          <div key={ciudad.id} className="bg-white border border-neutral-200 rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <ActivarToggle activo={ciudad.activo} onConfirm={(nuevoActivo, motivo) => setCiudadActiva(ciudad.id, nuevoActivo, motivo)} />
                <div>
                  <p className="text-sm font-semibold text-humania-blue">{ciudad.nombre_oficial}</p>
                  <p className="text-xs text-humania-gray/60">{ciudad.activo ? 'Visible en /apply' : 'Oculta en /apply'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleExpand(ciudad.id)}
                className="flex items-center gap-1.5 text-xs font-semibold text-humania-blue/70 hover:text-humania-blue px-2 py-1"
              >
                {municipiosDeCiudad.length} municipios
                <ChevronDown className={`w-4 h-4 transition-transform ${expandida ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {expandida && (
              <div className="border-t border-neutral-100 divide-y divide-neutral-50">
                {municipiosDeCiudad.map(municipio => (
                  <div key={municipio.id} className="flex items-center gap-3 px-4 py-2.5 pl-8">
                    <ActivarToggle activo={municipio.activo} onConfirm={(nuevoActivo, motivo) => setMunicipioActivo(municipio.id, nuevoActivo, motivo)} />
                    <p className="text-sm text-humania-blue">{municipio.nombre_oficial}</p>
                    {!municipio.activo && <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest ml-auto">Inactivo</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
