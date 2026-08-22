'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { bulkChangeCandidateState } from '../actions'

// Misma matriz de transiciones que protege bulk_change_candidate_status en PostgreSQL
// (la base de datos es la autoridad final; esto solo evita mostrar opciones invalidas).
const TRANSICIONES_VALIDAS: Record<string, string[]> = {
  REVISION_PRELIMINAR: ['ENTREVISTA', 'DESISTE', 'DESCARTADO'],
  ENTREVISTA: ['SELECCIONADO', 'BACKUP', 'DESISTE', 'DESCARTADO'],
  BACKUP: ['ENTREVISTA', 'DESISTE', 'DESCARTADO'],
  DESISTE: ['REVISION_PRELIMINAR'],
  SELECCIONADO: [],
  DESCARTADO: [],
}

const ESTADO_LABELS: Record<string, string> = {
  REVISION_PRELIMINAR: 'En revisión',
  ENTREVISTA: 'Entrevista',
  BACKUP: 'Backup',
  DESISTE: 'Desiste',
  SELECCIONADO: 'Seleccionado',
  DESCARTADO: 'Descartado',
}

export function BulkStatusModal({
  selectedCandidatos,
  onSuccess
}: {
  selectedCandidatos: { id: string; estado: string }[],
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [newState, setNewState] = useState('')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedIds = selectedCandidatos.map(c => c.id)
  const estadosUnicos = [...new Set(selectedCandidatos.map(c => c.estado))]
  const estadoComun = estadosUnicos.length === 1 ? estadosUnicos[0] : null
  const opcionesDisponibles = estadoComun ? (TRANSICIONES_VALIDAS[estadoComun] || []) : []

  const handleSave = async () => {
    if (!newState) {
      setError('Selecciona el nuevo estado.')
      return
    }
    if (!motivo.trim()) {
      setError('El motivo es obligatorio.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await bulkChangeCandidateState(selectedIds, newState, motivo)
      if (!res.success) {
        setError(res.error || 'Ocurrió un error al cambiar los estados.')
      } else {
        setOpen(false)
        setNewState('')
        setMotivo('')
        onSuccess()
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} disabled={selectedIds.length === 0} className="bg-neutral-800 hover:bg-neutral-700 ml-2">
        Cambiar Estado ({selectedIds.length})
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambio Masivo de Estado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <p className="text-sm text-neutral-500">Se aplicará el cambio a {selectedIds.length} candidato(s) seleccionado(s).</p>

          {!estadoComun ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              Los candidatos seleccionados tienen estados distintos ({estadosUnicos.map(e => ESTADO_LABELS[e] || e).join(', ')}). Selecciona únicamente candidatos que compartan el mismo estado actual para cambiarles el estado en lote.
            </p>
          ) : opcionesDisponibles.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              Los candidatos en estado &quot;{ESTADO_LABELS[estadoComun] || estadoComun}&quot; no pueden cambiar de estado mediante esta función.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nuevo Estado</label>
                <Select value={newState} onValueChange={(v) => setNewState(v || '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {opcionesDisponibles.map(s => (
                      <SelectItem key={s} value={s}>{ESTADO_LABELS[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo (Obligatorio)</label>
                <Textarea
                  placeholder="Ej. Cumple con perfil inicial, Se rechaza por antecedentes..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <Button onClick={handleSave} disabled={loading} className="w-full bg-humania-blue hover:bg-humania-blue/90">
                {loading ? 'Guardando...' : 'Aplicar Cambio'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
