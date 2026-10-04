// KAI-121 — Plazo del contrato (SDD `plazo-contrato-deposito`, spec.md R1-R5).
//
// Módulo puro: sin Supabase, sin Next.js, sin red. Solo calcula lo que la
// ficha muestra en el bloque "Plazo del contrato" a partir de los registros
// vigentes. La autoridad de las reglas que deben cumplirse siempre (límite de
// aplazatorias) es PostgreSQL (migración 00081); esto es solo lectura.

export type TipoPagoSemanal = 'NORMAL' | 'APLAZATORIA' | 'NO_PAGO'

export interface PagoParaPlazo {
  numero_semana: number
  tipo_pago: TipoPagoSemanal
}

export interface EntradaPlazo {
  /** Semanas ordinarias pactadas (D1). `null` = aún no definidas. */
  semanasPactadas: number | null
  /** `asset_assignment_history.fecha_asignacion` (TIMESTAMPTZ en ISO). */
  fechaAsignacion: string
  pagos: PagoParaPlazo[]
}

export interface ResultadoPlazo {
  aplazatorias: number
  sinPago: number
  ordinariasPagadas: number
  /** R3: pactadas + aplazatorias + sin pago. `null` sin semanas pactadas. */
  plazoAjustado: number | null
  /** R4: máx(0, pactadas − ordinarias). `null` sin semanas pactadas. */
  restantes: number | null
  /** R5: fecha de entrega (Bogotá) + plazoAjustado × 7 días, `YYYY-MM-DD`. */
  fechaEstimadaFin: string | null
}

/** Fecha calendario de Bogotá (`YYYY-MM-DD`) de un instante ISO. */
export function fechaBogota(iso: string): string | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const parte = (t: string) => partes.find(p => p.type === t)?.value ?? ''
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

/** Suma días a una fecha `YYYY-MM-DD` sin pasar por zonas horarias. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000)
  return t.toISOString().slice(0, 10)
}

export function calcularPlazo({ semanasPactadas, fechaAsignacion, pagos }: EntradaPlazo): ResultadoPlazo {
  const aplazatorias = pagos.filter(p => p.tipo_pago === 'APLAZATORIA').length
  const sinPago = pagos.filter(p => p.tipo_pago === 'NO_PAGO').length
  const ordinariasPagadas = pagos.filter(p => p.tipo_pago === 'NORMAL').length

  const pactadasValidas = semanasPactadas !== null && Number.isInteger(semanasPactadas) && semanasPactadas >= 1
  if (!pactadasValidas) {
    return { aplazatorias, sinPago, ordinariasPagadas, plazoAjustado: null, restantes: null, fechaEstimadaFin: null }
  }

  const plazoAjustado = semanasPactadas + aplazatorias + sinPago
  const restantes = Math.max(0, semanasPactadas - ordinariasPagadas)
  const inicio = fechaBogota(fechaAsignacion)
  const fechaEstimadaFin = inicio ? sumarDias(inicio, plazoAjustado * 7) : null

  return { aplazatorias, sinPago, ordinariasPagadas, plazoAjustado, restantes, fechaEstimadaFin }
}
