// KAI-135 — Fecha de pago y de abono: un día, no un instante.
//
// `pagos_semanales.fecha_pago` y `abonos_extraordinarios.fecha_abono` son
// TIMESTAMPTZ y la sesión de PostgreSQL corre en UTC. Un `YYYY-MM-DD` sin
// hora se guardaba como medianoche UTC, que en Bogotá (UTC-5, sin horario de
// verano) es el día anterior a las 19:00. Se guarda el mediodía de Bogotá
// (17:00 UTC): el mismo día en cualquier zona horaria.

import { fechaBogota } from './plazo'

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` → `YYYY-MM-DDT12:00:00-05:00`. Cualquier otro valor se devuelve igual. */
export function fechaPagoABogota(fecha: string): string
export function fechaPagoABogota(fecha: string | null): string | null
export function fechaPagoABogota(fecha: string | null): string | null {
  if (fecha === null) return null
  return SOLO_FECHA.test(fecha) ? `${fecha}T12:00:00-05:00` : fecha
}

/** Día `DD-MM-YYYY` en Bogotá de un instante guardado, o `null` si no hay fecha válida. */
export function formatearDiaBogota(fecha: string | null | undefined): string | null {
  if (!fecha) return null
  const dia = fechaBogota(fecha)
  if (!dia) return null
  const [anio, mes, d] = dia.split('-')
  return `${d}-${mes}-${anio}`
}
