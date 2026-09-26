'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { addCandidatoObservacion } from '@/app/admin/actions'
import { DESCRIPTIVE_TEXT } from '@/lib/validation'
import { formatearFechaAdmin } from '@/lib/format'

export type Observacion = {
  id: string
  texto: string
  usuario_email: string
  created_at: string
}

const VISIBLES_POR_DEFECTO = 3

/**
 * "OBSERVACIONES" (2026-09-18, pedido explícito del usuario): campo libre
 * de RRHH para cualquier candidato, con trazabilidad completa pero un
 * diseño deliberadamente sutil -- sin badges de colores ni bordes
 * gruesos (a diferencia de HISTORIAL DE CAMBIOS), solo texto + una línea
 * gris pequeña de fecha/autor debajo. Las últimas 3 se muestran siempre;
 * el resto queda detrás de un enlace de texto discreto para que la
 * sección nunca se sienta ruidosa aunque haya muchas.
 */
export function ObservacionesSection({ candidatoId, observaciones }: { candidatoId: string; observaciones: Observacion[] }) {
  const [lista, setLista] = useState(observaciones)
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verTodas, setVerTodas] = useState(false)

  const visibles = verTodas ? lista : lista.slice(0, VISIBLES_POR_DEFECTO)
  const ocultas = lista.length - visibles.length

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!DESCRIPTIVE_TEXT.test(e.target.value)) return
    setTexto(e.target.value)
  }

  async function handleAgregar() {
    const trimmed = texto.trim()
    if (trimmed.length < 3) {
      setError('Escribe al menos 3 caracteres.')
      return
    }
    setError('')
    setLoading(true)
    const res = await addCandidatoObservacion(candidatoId, trimmed)
    setLoading(false)
    if (!res.success) {
      setError(res.error || 'No se pudo guardar la observación.')
      return
    }
    // Optimista: la fila real (con fecha/autor exactos del servidor)
    // llega en la proxima carga de la pagina -- mientras tanto, mostramos
    // de inmediato lo que se acaba de guardar para que se sienta
    // instantaneo, sin esperar un round-trip extra solo para leer.
    setLista(prev => [{ id: crypto.randomUUID(), texto: trimmed, usuario_email: 'Tú', created_at: new Date().toISOString() }, ...prev])
    setTexto('')
  }

  return (
    <div className="bg-white p-8 mb-6 rounded-lg shadow-sm border border-neutral-200">
      <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">OBSERVACIONES</h3>

      <div className="space-y-2">
        <Textarea
          placeholder="Escribe una observación..."
          value={texto}
          onChange={handleChange}
          maxLength={2000}
          rows={2}
          className="text-sm"
        />
        <div className="flex items-center justify-between">
          {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
          <Button type="button" size="sm" onClick={handleAgregar} disabled={loading || !texto.trim()} className="bg-humania-blue hover:bg-humania-blue/90">
            {loading ? 'Guardando...' : 'Agregar observación'}
          </Button>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-humania-gray/70 mt-6">Sin observaciones registradas.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {visibles.map(o => (
            <div key={o.id} className="text-sm">
              <p className="text-humania-gray whitespace-pre-wrap">{o.texto}</p>
              <p className="text-xs text-humania-gray/50 mt-0.5">
                {formatearFechaAdmin(o.created_at)} · {o.usuario_email}
              </p>
            </div>
          ))}

          {ocultas > 0 && (
            <button
              type="button"
              onClick={() => setVerTodas(true)}
              className="text-xs text-humania-blue hover:underline"
            >
              Ver {ocultas} observación{ocultas === 1 ? '' : 'es'} anterior{ocultas === 1 ? '' : 'es'}
            </button>
          )}
          {verTodas && lista.length > VISIBLES_POR_DEFECTO && (
            <button
              type="button"
              onClick={() => setVerTodas(false)}
              className="text-xs text-humania-blue hover:underline"
            >
              Mostrar menos
            </button>
          )}
        </div>
      )}
    </div>
  )
}
