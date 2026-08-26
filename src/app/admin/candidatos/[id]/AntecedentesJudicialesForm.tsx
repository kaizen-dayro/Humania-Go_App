'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { saveAntecedentesJudiciales } from '@/app/admin/actions'

type EstadoCumplimiento = '' | 'CUMPLE' | 'NO_CUMPLE'

function CumpleNoCumple({ id, label, value, onChange }: { id: string, label: string, value: EstadoCumplimiento, onChange: (v: EstadoCumplimiento) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-humania-gray font-medium">{label}</Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as EstadoCumplimiento)} className="flex gap-4">
        <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
          <RadioGroupItem value="CUMPLE" id={`${id}-cumple`} className="text-humania-blue w-5 h-5" />
          <Label htmlFor={`${id}-cumple`} className="font-medium cursor-pointer">Cumple</Label>
        </div>
        <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
          <RadioGroupItem value="NO_CUMPLE" id={`${id}-no-cumple`} className="text-humania-blue w-5 h-5" />
          <Label htmlFor={`${id}-no-cumple`} className="font-medium cursor-pointer">No Cumple</Label>
        </div>
      </RadioGroup>
    </div>
  )
}

/**
 * Verificación manual de antecedentes judiciales (Fase 19, 2026-08-25),
 * solo visible para candidatos en REVISION_PRELIMINAR. Tres preguntas
 * independientes -- Judiciales / Procuraduría / Contraloría --, cada una
 * Cumple/No Cumple. De apoyo a la decisión humana, no dispara descarte
 * automático por sí sola.
 */
export function AntecedentesJudicialesForm({
  candidatoId,
  initial,
}: {
  candidatoId: string
  initial: { judiciales: string | null, procuraduria: string | null, contraloria: string | null }
}) {
  const [judiciales, setJudiciales] = useState<EstadoCumplimiento>((initial.judiciales as EstadoCumplimiento) || '')
  const [procuraduria, setProcuraduria] = useState<EstadoCumplimiento>((initial.procuraduria as EstadoCumplimiento) || '')
  const [contraloria, setContraloria] = useState<EstadoCumplimiento>((initial.contraloria as EstadoCumplimiento) || '')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const res = await saveAntecedentesJudiciales(candidatoId, {
      judiciales: judiciales || null,
      procuraduria: procuraduria || null,
      contraloria: contraloria || null,
    })
    setLoading(false)
    setMessage(res.error ? `Error: ${res.error}` : 'Guardado.')
  }

  return (
    <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
      <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">ANTECEDENTES JUDICIALES</h3>
      <p className="text-sm text-humania-gray mb-6">
        Verificación manual del equipo de Gestión Humana. Este filtro es de vital importancia y puede ser causal de descarte manual del candidato en revisión.
      </p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid md:grid-cols-3 gap-6">
          <CumpleNoCumple id="judiciales" label="Judiciales" value={judiciales} onChange={setJudiciales} />
          <CumpleNoCumple id="procuraduria" label="Procuraduría" value={procuraduria} onChange={setProcuraduria} />
          <CumpleNoCumple id="contraloria" label="Contraloría" value={contraloria} onChange={setContraloria} />
        </div>
        <div className="flex items-center gap-4 pt-2 border-t border-neutral-100">
          <Button type="submit" disabled={loading} size="sm" className="bg-humania-blue hover:bg-humania-blue/90 mt-4">
            {loading ? 'Guardando...' : 'Guardar antecedentes'}
          </Button>
          {message && <p className="text-sm font-medium text-humania-gray mt-4">{message}</p>}
        </div>
      </form>
    </div>
  )
}
