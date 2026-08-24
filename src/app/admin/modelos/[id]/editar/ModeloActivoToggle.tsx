'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { LETTERS_ONLY, capitalizarPalabras } from '@/lib/validation'
import { setModeloActivo } from '../../../actions'

/**
 * Activar/desactivar un modelo (Fase 13, Documento 17 sección 8): separado
 * del resto del formulario de edición a propósito -- el historial solo
 * debe registrar este cambio específico, nunca por modificar nombre/marca/
 * imagen. Confirmación explícita antes de aplicar (modelo, acción,
 * descripción), motivo obligatorio con la misma limpieza en vivo que el
 * resto del sistema.
 */
export function ModeloActivoToggle({
  modeloId,
  modeloNombre,
  activo,
}: {
  modeloId: string
  modeloNombre: string
  activo: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const nuevaAccion = activo ? 'DESACTIVAR' : 'ACTIVAR'

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!LETTERS_ONLY.test(e.target.value)) return
    const input = e.target
    const cursorPos = input.selectionStart
    setDescripcion(capitalizarPalabras(input.value))
    requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setDescripcion('')
      setError('')
    }
  }

  async function handleConfirm() {
    const trimmed = descripcion.trim()
    if (trimmed.length < 10) {
      setError('La descripción debe tener al menos 10 caracteres.')
      return
    }
    setLoading(true)
    setError('')
    const res = await setModeloActivo(modeloId, !activo, trimmed)
    setLoading(false)

    if (!res.success) {
      setError(res.error || 'No se pudo actualizar el estado del modelo.')
      return
    }

    setOpen(false)
    setDescripcion('')
    router.refresh()
  }

  return (
    <>
      <div className="flex items-start space-x-3 p-4 border border-neutral-200 bg-neutral-50 rounded-lg">
        <Checkbox
          checked={activo}
          onCheckedChange={() => setOpen(true)}
          className="mt-1 data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue"
        />
        <div>
          <Label className="font-medium text-humania-blue cursor-pointer" onClick={() => setOpen(true)}>
            Modelo activo
          </Label>
          <p className="text-xs text-humania-gray/70 mt-1">
            Desactivar este modelo no afecta los activos históricos ya relacionados con él. Además, la marca también debe estar activa para que este modelo pueda usarse en un activo nuevo. Cada cambio queda registrado en el historial (fecha, hora, usuario y descripción).
          </p>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{nuevaAccion === 'ACTIVAR' ? 'Activar modelo' : 'Desactivar modelo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-sm space-y-1 bg-neutral-50 border border-neutral-200 rounded-md p-3">
              <p><span className="font-semibold text-humania-blue">Modelo:</span> {modeloNombre}</p>
              <p><span className="font-semibold text-humania-blue">Acción:</span> {nuevaAccion === 'ACTIVAR' ? 'Activar' : 'Desactivar'}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Descripción (obligatoria)</label>
              <Textarea
                value={descripcion}
                onChange={handleChange}
                placeholder="Motivo del cambio... (mínimo 10 caracteres)"
                maxLength={111}
                rows={3}
                autoFocus
              />
              <p className="text-xs text-neutral-400 text-right">{descripcion.length}/111</p>
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
