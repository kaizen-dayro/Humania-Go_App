// KAI-29 — Lectura, desde el servidor, de la financiación vigente del seguro
// (tabla `financiaciones_seguro`, migración 00076) para `seguro.cotizacion`
// (spec.md 31). Solo lectura: no escribe nada.
//
// Es integración de DATOS. Lo leído es informativo y no participa en ROI,
// payback, caja, resultado neto ni ningún otro indicador.
//
// La RLS de la tabla solo deja leer a un SUPER_ADMIN activo: quien llama ya
// verificó ese rol (page.tsx y actions.ts); aun así, con cualquier otro rol la
// consulta devuelve 0 filas. Un error de lectura NO se oculta detrás de un
// texto genérico: se devuelve el mensaje real.

import type { createClient } from '@/utils/supabase/server'
import {
  COLUMNAS_FINANCIACION_COTIZACION,
  resolverLecturaCotizacion,
  type FinanciacionSeguroFila,
  type LecturaCotizacion,
} from '@/lib/domain/seguros/adaptador'

type ClienteSupabase = Awaited<ReturnType<typeof createClient>>

export async function leerCotizacionSeguroVigente(supabase: ClienteSupabase): Promise<LecturaCotizacion> {
  // `limit(2)` basta: con más de una activa no se elige ninguna (resolverLecturaCotizacion).
  const { data, error } = await supabase
    .from('financiaciones_seguro')
    .select(COLUMNAS_FINANCIACION_COTIZACION)
    .eq('estado', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(2)

  if (error) {
    console.error('Error leyendo la financiación vigente del seguro:', error)
    return { estado: 'ERROR', financiacionId: null, cotizacion: null, mensaje: error.message }
  }
  return resolverLecturaCotizacion((data ?? []) as unknown as FinanciacionSeguroFila[])
}
