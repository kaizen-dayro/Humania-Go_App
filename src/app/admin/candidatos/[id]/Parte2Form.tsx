'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { marcarAptoEsperandoParte2, desactivarParte2 } from '@/app/admin/actions'
import { formatearFechaAdmin } from '@/lib/format'

const DIAS_REFERENCIA = 11
const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Bloque "Apto, esperando Parte 2" (KAI-9/KAI-15, 2026-08-27; check
 * desactivable/reactivable agregado en KAI-19, 2026-08-28), justo encima
 * de FIADOR SOLIDARIO en /admin/candidatos/[id]. Cuatro estados: sin
 * habilitar (botón para marcar), activo y esperando al candidato
 * (contador informativo de 11 días + "Copiar link" + "Desactivar"),
 * desactivado manualmente (botón "Reactivar" -- genera un link nuevo), y
 * Parte 2 recibida.
 *
 * El contador es puramente informativo -- pasado el día 11 no bloquea
 * nada, solo avisa. Desactivar es reversible (RRHH se equivocó, el
 * candidato ya no está listo, etc.) -- distinto de DESCARTADO, que es
 * permanente y solo lo aplica submit_application_parte2 en PostgreSQL.
 */
export function Parte2Form({
  candidatoId,
  estado,
  parte2Token: parte2TokenInicial,
  parte2HabilitadaEn,
  parte2CompletadaEn,
}: {
  candidatoId: string
  estado: string
  parte2Token: string | null
  parte2HabilitadaEn: string | null
  parte2CompletadaEn: string | null
}) {
  const [parte2Token, setParte2Token] = useState(parte2TokenInicial)
  const [habilitadaEn, setHabilitadaEn] = useState(parte2HabilitadaEn)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  // Inicializador perezoso de useState: el único lugar donde React permite
  // una lectura impura (Date.now()) durante el montaje sin violar la
  // pureza del render -- se ejecuta una sola vez, no en cada render.
  // Suficiente para mostrar el día correcto en cada carga de la página,
  // no hace falta un timer en vivo.
  const [ahora] = useState(() => Date.now())
  const dias = habilitadaEn ? Math.floor((ahora - new Date(habilitadaEn).getTime()) / MS_POR_DIA) + 1 : null

  const handleMarcarApto = async () => {
    setLoading(true)
    setError('')
    const res = await marcarAptoEsperandoParte2(candidatoId)
    setLoading(false)
    if (!res.success) {
      setError(res.error || 'Error interno')
      return
    }
    setParte2Token(res.token)
    setHabilitadaEn(new Date().toISOString())
  }

  const handleCopiarLink = async () => {
    if (!parte2Token) return
    const link = `${window.location.origin}/apply/parte2?candidato_id=${candidatoId}&token=${parte2Token}`
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const handleDesactivar = async () => {
    setLoading(true)
    setError('')
    const res = await desactivarParte2(candidatoId)
    setLoading(false)
    if (!res.success) {
      setError(res.error || 'Error interno')
      return
    }
    setParte2Token(null)
  }

  if (parte2CompletadaEn) {
    return (
      <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
        <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">PARTE 2 (FIADOR Y REFERENCIAS)</h3>
        <p className="text-sm font-medium text-green-700">Recibida el {formatearFechaAdmin(parte2CompletadaEn)}. Los datos aparecen en las secciones de abajo.</p>
      </div>
    )
  }

  if (estado === 'DESCARTADO') {
    return null
  }

  if (!habilitadaEn) {
    return (
      <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
        <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">PARTE 2 (FIADOR Y REFERENCIAS)</h3>
        <p className="text-sm text-humania-gray mb-6">
          Marca este check cuando, después de la entrevista humana, consideres al candidato apto para continuar. Se genera un enlace único que podrás copiar y enviarle cuando confirme que ya tiene su fiador y referencias listos.
        </p>
        <div className="flex items-center gap-4">
          <Button onClick={handleMarcarApto} disabled={loading} size="sm" className="bg-humania-blue hover:bg-humania-blue/90">
            {loading ? 'Guardando...' : 'Apto, esperando Parte 2'}
          </Button>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>
      </div>
    )
  }

  // Desactivado manualmente: se marcó el check alguna vez (habilitadaEn),
  // pero el token actual quedó en NULL -- distinto de "nunca habilitado".
  if (!parte2Token) {
    return (
      <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
        <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">PARTE 2 (FIADOR Y REFERENCIAS)</h3>
        <p className="text-sm font-medium text-amber-700 mb-6">Desactivado manualmente -- el enlace anterior ya no funciona. Puedes reactivarlo cuando quieras; se generará un enlace nuevo.</p>
        <div className="flex items-center gap-4">
          <Button onClick={handleMarcarApto} disabled={loading} size="sm" className="bg-humania-blue hover:bg-humania-blue/90">
            {loading ? 'Guardando...' : 'Reactivar'}
          </Button>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>
      </div>
    )
  }

  const vencido = dias !== null && dias > DIAS_REFERENCIA

  return (
    <div className="bg-white border border-neutral-200 p-8 mb-6 rounded-lg shadow-sm">
      <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">PARTE 2 (FIADOR Y REFERENCIAS)</h3>
      <p className={`text-sm font-medium mb-4 ${vencido ? 'text-amber-700' : 'text-humania-gray'}`}>
        {dias === null ? 'Calculando...' : vencido
          ? `Vencido hace ${dias - DIAS_REFERENCIA} día(s) de referencia (día ${dias} de ${DIAS_REFERENCIA}) -- esto no bloquea nada, es solo un aviso para que decidas si continúa esperando o se descarta.`
          : `Esperando al candidato -- día ${dias} de ${DIAS_REFERENCIA}.`}
      </p>
      <div className="flex items-center gap-4 flex-wrap">
        <Button onClick={handleCopiarLink} size="sm" variant="outline">
          {copiado ? 'Copiado' : 'Copiar link'}
        </Button>
        <Button onClick={handleDesactivar} disabled={loading} size="sm" variant="ghost" className="text-humania-gray hover:text-red-600">
          {loading ? 'Guardando...' : 'Desactivar'}
        </Button>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
      <p className="text-xs text-humania-gray/60 mt-2">Envíaselo por el canal que prefieras cuando el candidato confirme que está listo.</p>
    </div>
  )
}
