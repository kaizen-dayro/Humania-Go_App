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
                <TableCell colSpan={7} className="text-center h-32 text-neutral-500">
                  No se encontraron registros que coincidan con los filtros aplicados.
                </TableCell>
              </TableRow>
            )}

            {historial.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-neutral-500">
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
