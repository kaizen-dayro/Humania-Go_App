// Fase 21 (2026-08-26): estado de vencimiento de los documentos de un
// activo (Tecnomecánica, SOAT, Impuestos). Un solo lugar para la lógica
// de "cuántos días faltan y qué tan urgente es" -- la usa tanto la
// alerta sutil en /admin/activos/[id]/editar como la tarjeta del
// Dashboard, y el cron de notificaciones usa el mismo cálculo de días
// restantes (no la misma función exacta, porque el cron necesita el
// número de días, no solo la categoría visual -- pero el criterio es el
// mismo, documentado una sola vez aquí).

export type EstadoVencimiento = 'SIN_REGISTRAR' | 'OK' | 'PROXIMO' | 'URGENTE' | 'VENCIDO'

export type DocumentoActivo = {
  tipo: 'TECNOMECANICA' | 'SOAT' | 'IMPUESTOS'
  label: string
  fecha: string | null
}

/** Días de calendario entre hoy y la fecha (negativo si ya pasó). */
export function diasHastaVencimiento(fecha: string, hoy: Date = new Date()): number {
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const [y, m, d] = fecha.split('-').map(Number)
  const fechaUTC = Date.UTC(y, m - 1, d)
  return Math.round((fechaUTC - hoyUTC) / (1000 * 60 * 60 * 24))
}

/**
 * Categoría visual: OK (>30 días), PROXIMO (16-30 días), URGENTE (1-15
 * días), VENCIDO (hoy o ya pasó), SIN_REGISTRAR (sin fecha guardada).
 * Los cortes de 30/15/0 coinciden a propósito con los tres umbrales de
 * notificación (1 mes / 15 días / el mismo día).
 */
export function evaluarVencimiento(fecha: string | null | undefined, hoy: Date = new Date()): EstadoVencimiento {
  if (!fecha) return 'SIN_REGISTRAR'
  const dias = diasHastaVencimiento(fecha, hoy)
  if (dias <= 0) return 'VENCIDO'
  if (dias <= 15) return 'URGENTE'
  if (dias <= 30) return 'PROXIMO'
  return 'OK'
}

export function construirDocumentos(activo: { vencimiento_tecnomecanica: string | null, vencimiento_soat: string | null, vencimiento_impuestos: string | null }): DocumentoActivo[] {
  return [
    { tipo: 'TECNOMECANICA', label: 'Tecnomecánica', fecha: activo.vencimiento_tecnomecanica },
    { tipo: 'SOAT', label: 'SOAT', fecha: activo.vencimiento_soat },
    { tipo: 'IMPUESTOS', label: 'Impuestos', fecha: activo.vencimiento_impuestos },
  ]
}

/** El peor estado entre los tres documentos de un activo (para ordenar/resumir). */
export function peorEstado(estados: EstadoVencimiento[]): EstadoVencimiento {
  const prioridad: EstadoVencimiento[] = ['VENCIDO', 'URGENTE', 'PROXIMO', 'SIN_REGISTRAR', 'OK']
  for (const nivel of prioridad) {
    if (estados.includes(nivel)) return nivel
  }
  return 'OK'
}
