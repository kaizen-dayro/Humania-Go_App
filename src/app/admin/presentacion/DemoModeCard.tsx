'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle } from 'lucide-react'
import { LETTERS_WITH_PUNCTUATION, capitalizarPalabras } from '@/lib/validation'
import { setPresentacionDemoSegundos } from '../actions'

/**
 * Modo demo temporal (Fase 16b): administrado 100% desde la base de
 * datos, sin variable de entorno de Vercel (el plan gratuito del usuario
 * no permite agregar más). Solo SUPER_ADMIN puede prenderlo/apagarlo --
 * a propósito no es un parámetro de la URL, para que un candidato real no
 * pueda descubrirlo ni compartirlo.
 */
export function DemoModeCard({ demoSegundosActual }: { demoSegundosActual: number | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [segundos, setSegundos] = useState(demoSegundosActual ? String(demoSegundosActual) : '11')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const activo = demoSegundosActual !== null

  function handleMotivoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
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

  async function handleConfirm(apagar: boolean) {
    const trimmed = motivo.trim()
    if (trimmed.length < 10) { setError('El motivo debe tener al menos 10 caracteres.'); return }

    let valor: number | null = null
    if (!apagar) {
      const n = parseInt(segundos, 10)
      if (isNaN(n) || n <= 0 || n > 300) { setError('Debe ser un número entre 1 y 300 segundos.'); return }
      valor = n
    }

    setLoading(true)
    setError('')
    const res = await setPresentacionDemoSegundos(valor, trimmed)
    setLoading(false)

    if (!res.success) { setError(res.error || 'No se pudo actualizar el modo demo.'); return }

    setOpen(false)
    setMotivo('')
    router.refresh()
  }

  return (
    <>
      <div className="flex items-start gap-3 p-4 border border-amber-200 bg-amber-50 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-amber-900">Modo demo temporal</p>
          <p className="text-xs text-amber-800/80 mt-1">
            {activo
              ? `Activo: la presentación se marca como vista tras ${demoSegundosActual} segundos, en vez de esperar el video completo. Úsalo solo para pruebas internas — apágalo antes de que candidatos reales usen el sitio.`
              : 'Apagado. Actívalo solo para mostrar el flujo completo sin esperar el video real (mientras Humania Go todavía no lo tiene cargado).'}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
            {activo ? 'Apagar / cambiar' : 'Activar modo demo'}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modo demo temporal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Segundos para marcar como vista</Label>
              <Input type="number" min={1} max={300} value={segundos} onChange={(e) => setSegundos(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo (obligatorio)</label>
              <Textarea
                value={motivo}
                onChange={handleMotivoChange}
                placeholder="Motivo del cambio... (mínimo 10 caracteres)"
                maxLength={111}
                rows={3}
                autoFocus
              />
              <p className="text-xs text-neutral-400 text-right">{motivo.length}/111</p>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={() => handleConfirm(false)} disabled={loading} className="flex-1 bg-humania-blue hover:bg-humania-blue/90">
                {loading ? 'Guardando...' : 'Activar con este valor'}
              </Button>
              {activo && (
                <Button onClick={() => handleConfirm(true)} disabled={loading} variant="outline" className="flex-1">
                  Apagar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
