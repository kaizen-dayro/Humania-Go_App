'use client'

import { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from '@/components/ui/button'
import { formatearFechaAdmin } from '@/lib/format'

export interface HistorialRow {
  id: string
  poblacion: 'SILENCIOSA' | 'CANDIDATO_REAL'
  causal: string
  nombres: string | null
  correo_electronico: string | null
  resultado_actual: string
  fecha_descarte: string
  retencion_anonimizado_en: string | null
  causal_detalle: Record<string, unknown> | null
}

/**
 * KAI-36 addendum (2026-09-17): causal_detalle ya se guardaba desde el
 * origen (registrar_descarte_por_edad/_experiencia/_comparendos,
 * submit_application, bulk_change_candidate_status,
 * descartar_candidato_por_comparendos) -- esta funcion solo la traduce a
 * texto humano para la columna "Detalle". Basada en las CLAVES presentes,
 * no en la causal de la fila, porque COMPARENDOS puede tener 2 formas
 * distintas segun si nacio del descarte silencioso (Poblacion A) o del
 * descarte manual de KAI-38 (motivo_original, igual que MANUAL/
 * NO_DETERMINADA). Nunca inventa un campo que no venga en el JSON --
 * si no reconoce ninguna clave conocida, muestra un guion.
 */
function formatearDetalle(detalle: Record<string, unknown> | null): string {
  if (!detalle || Object.keys(detalle).length === 0) return '—'

  if (typeof detalle.edad_declarada === 'number') {
    return `${detalle.edad_declarada} años`
  }
  if (typeof detalle.tiempo_experiencia_declarado === 'string') {
    return detalle.tiempo_experiencia_declarado
  }
  if ('comparendos_declarados' in detalle) {
    const declarados = detalle.comparendos_declarados
    const simit = detalle.simit_number_fines
    return `${declarados} declarado${declarados === 1 ? '' : 's'}${typeof simit === 'number' ? ` · SIMIT: ${simit}` : ''}`
  }
  if (typeof detalle.licencia_declarada_vigente === 'boolean') {
    return detalle.licencia_declarada_vigente ? 'Declarada vigente' : 'Declarada no vigente'
  }
  if (typeof detalle.motivo_original === 'string' && detalle.motivo_original) {
    return detalle.motivo_original
  }
  return '—'
}

const CAUSAL_LABELS: Record<string, string> = {
  EDAD: 'Edad',
  EXPERIENCIA: 'Experiencia',
  COMPARENDOS: 'Comparendos',
  LICENCIA: 'Licencia',
  MANUAL: 'Manual',
  NO_DETERMINADA: 'No determinada',
}

const POBLACION_LABELS: Record<string, string> = {
  SILENCIOSA: 'Descarte Silencioso',
  CANDIDATO_REAL: 'Candidato Real',
}

const RESULTADO_LABELS: Record<string, string> = {
  DESCARTADO: 'Descartado',
  POTENCIALMENTE_ELEGIBLE: 'Potencialmente Elegible',
  REPOSTULADO: 'Repostulado',
  ELEGIBLE_CONFIRMADO: 'Elegible Confirmado',
}

export function DescartadosHistorialTable({ historial }: { historial: HistorialRow[] }) {
  const [causal, setCausal] = useState('')
  const [poblacion, setPoblacion] = useState('')

  const filtrado = useMemo(() => {
    return historial.filter(h => {
      if (causal && h.causal !== causal) return false
      if (poblacion && h.poblacion !== poblacion) return false
      return true
    })
  }, [historial, causal, poblacion])

  const hayFiltrosActivos = !!(causal || poblacion)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={causal}
          onChange={(e) => setCausal(e.target.value)}
          className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="">Causal: Todas</option>
          {Object.entries(CAUSAL_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>

        <select
          value={poblacion}
          onChange={(e) => setPoblacion(e.target.value)}
          className="h-10 rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="">Población: Todas</option>
          {Object.entries(POBLACION_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>

        {hayFiltrosActivos && (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setCausal(''); setPoblacion('') }}>
              Limpiar filtros
            </Button>
            <span className="text-xs text-humania-gray/70">
              {filtrado.length} resultado{filtrado.length === 1 ? '' : 's'} encontrado{filtrado.length === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-x-auto">
        <Table>
          <TableHeader className="bg-neutral-50/50">
            <TableRow>
              <TableHead>Fecha de Descarte</TableHead>
              <TableHead>Población</TableHead>
              <TableHead>Causal</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Estado del Dato</TableHead>
              <TableHead>Resultado Actual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrado.map((h) => {
              const anonimizado = !!h.retencion_anonimizado_en
              return (
                <TableRow key={h.id}>
                  <TableCell className="text-sm text-neutral-600 whitespace-nowrap">
                    {formatearFechaAdmin(h.fecha_descarte)}
                  </TableCell>
                  <TableCell className="text-sm">{POBLACION_LABELS[h.poblacion] ?? h.poblacion}</TableCell>
                  <TableCell className="text-sm">{CAUSAL_LABELS[h.causal] ?? h.causal}</TableCell>
                  <TableCell className="text-sm text-humania-gray max-w-[220px] truncate" title={formatearDetalle(h.causal_detalle)}>
                    {formatearDetalle(h.causal_detalle)}
                  </TableCell>
                  <TableCell className="text-sm">{h.nombres ?? <span className="text-neutral-400 italic">Anonimizado</span>}</TableCell>
                  <TableCell className="text-sm">{h.correo_electronico ?? <span className="text-neutral-400 italic">Anonimizado</span>}</TableCell>
                  <TableCell>
                    {anonimizado
                      ? <Badge variant="outline" className="text-neutral-500">Anonimizado</Badge>
                      : <Badge className="bg-green-500 hover:bg-green-600">Identificable</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{RESULTADO_LABELS[h.resultado_actual] ?? h.resultado_actual}</TableCell>
                </TableRow>
              )
            })}

            {historial.length > 0 && filtrado.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-32 text-neutral-500">
                  No se encontraron registros que coincidan con los filtros aplicados.
                </TableCell>
              </TableRow>
            )}

            {historial.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-32 text-neutral-500">
                  Todavía no hay registros en el histórico de descartados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
