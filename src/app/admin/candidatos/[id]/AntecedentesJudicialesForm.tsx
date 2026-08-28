'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { saveAntecedentesJudiciales } from '@/app/admin/actions'

type EstadoAptitud = '' | 'APTO' | 'NO_APTO'

function AptoNoApto({ id, label, value, onChange }: { id: string, label: string, value: EstadoAptitud, onChange: (v: EstadoAptitud) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-humania-gray font-medium">{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as EstadoAptitud)}
        className="flex h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
      >
        <option value="">Sin verificar</option>
        <option value="APTO">Apto</option>
        <option value="NO_APTO">No Apto</option>
      </select>
    </div>
  )
}

/**
 * Verificación manual de antecedentes (Fase 19, 2026-08-25; relabel y
 * dropdown Apto/No Apto en KAI-21, 2026-08-28), solo visible para
 * candidatos en REVISION_PRELIMINAR. Tres preguntas independientes --
 * Policía (antes "Judiciales" en la interfaz -- el nombre de columna
 * antecedentes_judiciales_estado no cambió) / Procuraduría / Contraloría
 * --, cada una Apto/No Apto (antes Cumple/No Cumple, también en la base
 * de datos -- ver migración 00053). De apoyo a la decisión humana, no
 * dispara descarte automático por sí sola.
 */
export function AntecedentesJudicialesForm({
  candidatoId,
  initial,
}: {
  candidatoId: string
  initial: { judiciales: string | null, procuraduria: string | null, contraloria: string | null }
}) {
  const [judiciales, setJudiciales] = useState<EstadoAptitud>((initial.judiciales as EstadoAptitud) || '')
  const [procuraduria, setProcuraduria] = useState<EstadoAptitud>((initial.procuraduria as EstadoAptitud) || '')
  const [contraloria, setContraloria] = useState<EstadoAptitud>((initial.contraloria as EstadoAptitud) || '')
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
          <AptoNoApto id="policia" label="Policía" value={judiciales} onChange={setJudiciales} />
          <AptoNoApto id="procuraduria" label="Procuraduría" value={procuraduria} onChange={setProcuraduria} />
          <AptoNoApto id="contraloria" label="Contraloría" value={contraloria} onChange={setContraloria} />
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
