'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { LETTERS_WITH_PUNCTUATION, capitalizarPalabras } from '@/lib/validation'
import { setPresentacionSegmentacionActiva } from '../actions'
import { VideoPerfilCard } from './VideoPerfilCard'
import { DemoModeCard } from './DemoModeCard'

type VersionRow = React.ComponentProps<typeof VideoPerfilCard>['historial'][number]

/**
 * Interruptor maestro de segmentación por perfil publicitario (Fase 16).
 * Apagado (por defecto): un solo video, el "GENERAL", para todo el
 * mundo -- simple, igual que hoy. Encendido: además de GENERAL, aparecen
 * los dos perfiles segmentables (Conductor / Independiente), cada uno
 * administrado por separado. Mismo patrón de confirmación con motivo
 * obligatorio que ModeloActivoToggle.tsx (Fase 13).
 */
function SegmentacionToggle({ segmentacionActiva }: { segmentacionActiva: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const nuevaAccion = segmentacionActiva ? 'DESACTIVAR' : 'ACTIVAR'

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
    const res = await setPresentacionSegmentacionActiva(!segmentacionActiva, trimmed)
    setLoading(false)

    if (!res.success) { setError(res.error || 'No se pudo actualizar la configuración.'); return }

    setOpen(false)
    setMotivo('')
    router.refresh()
  }

  return (
    <>
      <div className="flex items-start space-x-3 p-4 border border-neutral-200 bg-neutral-50 rounded-lg">
        <Checkbox
          checked={segmentacionActiva}
          onCheckedChange={() => setOpen(true)}
          className="mt-1 data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue"
        />
        <div>
          <Label className="font-medium text-humania-blue cursor-pointer" onClick={() => setOpen(true)}>
            Segmentar el video por perfil publicitario
          </Label>
          <p className="text-xs text-humania-gray/70 mt-1">
            Apagado: todos los candidatos ven el mismo video (General). Encendido: quien llegue desde un enlace de campaña con <code>?perfil=conductor</code> o <code>?perfil=independiente</code> ve el video de ese perfil; el resto sigue viendo el video General.
          </p>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{nuevaAccion === 'ACTIVAR' ? 'Activar segmentación por perfil' : 'Desactivar segmentación por perfil'}</DialogTitle>
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

export function PresentacionConfigPanel({ segmentacionActiva, demoSegundos, historial }: { segmentacionActiva: boolean; demoSegundos: number | null; historial: VersionRow[] }) {
  return (
    <div className="space-y-8">
      <DemoModeCard demoSegundosActual={demoSegundos} />

      <SegmentacionToggle segmentacionActiva={segmentacionActiva} />

      <VideoPerfilCard
        perfil="GENERAL"
        titulo={segmentacionActiva ? 'Video General' : 'Video (único, para todos)'}
        descripcion={segmentacionActiva ? 'Lo ve cualquiera que no traiga un perfil de campaña reconocido (tráfico directo, orgánico, o un enlace sin ?perfil=).' : 'Lo ve todo el mundo mientras la segmentación esté apagada.'}
        historial={historial}
      />

      {segmentacionActiva && (
        <>
          <VideoPerfilCard
            perfil="CONDUCTOR"
            titulo="Video — Perfil Conductor"
            descripcion="Lo ve quien llegue desde un anuncio con ?perfil=conductor."
            historial={historial}
          />
          <VideoPerfilCard
            perfil="INDEPENDIENTE"
            titulo="Video — Perfil Independiente"
            descripcion="Lo ve quien llegue desde un anuncio con ?perfil=independiente."
            historial={historial}
          />
        </>
      )}
    </div>
  )
}
