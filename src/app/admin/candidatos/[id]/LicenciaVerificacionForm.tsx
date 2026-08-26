'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { saveLicenciaVerificacion } from '@/app/admin/actions'

type Estado = '' | 'SI' | 'NO'

function toEstado(v: boolean | null | undefined): Estado {
  return v === true ? 'SI' : v === false ? 'NO' : ''
}

/**
 * Verificación manual de la licencia de conducción (Fase 19, 2026-08-25),
 * solo visible para candidatos en REVISION_PRELIMINAR. Distinta de
 * `licencia_declarada_vigente` (lo que el candidato dijo en /apply) --
 * esta es la confirmación real del equipo de RRHH. No dispara ningún
 * descarte automático por sí sola: es de apoyo a una decisión humana.
 */
export function LicenciaVerificacionForm({ candidatoId, initial }: { candidatoId: string, initial: boolean | null }) {
  const [estado, setEstado] = useState<Estado>(toEstado(initial))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const res = await saveLicenciaVerificacion(candidatoId, estado === 'SI' ? true : estado === 'NO' ? false : null)
    setLoading(false)
    setMessage(res.error ? `Error: ${res.error}` : 'Guardado.')
  }

  return (
    <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
      <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">VERIFICACIÓN MANUAL DE LICENCIA</h3>
      <p className="text-sm text-humania-gray mb-6">
        Confirma si la licencia de conducción del candidato está realmente vigente. Este filtro es de vital importancia y puede ser causal de descarte manual.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">¿La licencia está vigente?</Label>
          <RadioGroup value={estado} onValueChange={(v) => setEstado(v as Estado)} className="flex gap-4">
            <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
              <RadioGroupItem value="SI" id="licencia-si" className="text-humania-blue w-5 h-5" />
              <Label htmlFor="licencia-si" className="font-medium cursor-pointer">Sí</Label>
            </div>
            <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
              <RadioGroupItem value="NO" id="licencia-no" className="text-humania-blue w-5 h-5" />
              <Label htmlFor="licencia-no" className="font-medium cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        </div>
        <div className="flex items-center gap-4 pt-2">
          <Button type="submit" disabled={loading || !estado} size="sm" className="bg-humania-blue hover:bg-humania-blue/90">
            {loading ? 'Guardando...' : 'Guardar verificación'}
          </Button>
          {message && <p className="text-sm font-medium text-humania-gray">{message}</p>}
        </div>
      </form>
    </div>
  )
}
