// Índice SER (KAI-27) — indicador interno de apoyo a la decisión humana.
// Ver Documentos/SDD/indice-ser-entrevista/spec.md para las reglas de
// negocio completas. Función pura: mismos inputs siempre producen el
// mismo output, sin persistencia ni efectos secundarios (AC-26).
//
// El valor calculado NUNCA se guarda en ninguna columna -- se recalcula
// en cada render a partir de referencia_laboral y candidatos_evaluacion.
// No participa en ningún cambio de estado, selección ni descarte de
// candidatos (AC-21/AC-22).

export const TIPO_VIVIENDA_OPTIONS = ['Propia', 'Familiar', 'En arriendo'] as const
export type TipoVivienda = typeof TIPO_VIVIENDA_OPTIONS[number]

export type DimensionKeySER =
  | 'responsabilidad'
  | 'honestidad'
  | 'autonomia'
  | 'manejoDificultades'
  | 'visitaDomiciliaria'

export interface DimensionSER {
  label: string
  /** Peso de esta dimensión dentro del Índice SER, en puntos porcentuales (suman 100 entre las 5). */
  peso: number
  disponible: boolean
  /** 0-100, precisión completa (sin redondear). null si `disponible` es false. */
  valor: number | null
  /** Texto siempre visible en la interfaz -- de dónde sale este valor (AC-27). */
  fuente: string
}

export interface IndiceSERResult {
  /** true solo si las 5 dimensiones tienen dato disponible. */
  disponible: boolean
  /** 0-100, precisión completa. null si `disponible` es false (Índice SER parcial: se oculta el total). */
  valor: number | null
  dimensiones: Record<DimensionKeySER, DimensionSER>
}

export interface ReferenciaLaboralEvaluacionInput {
  responsabilidad?: number | null
  cumplimiento?: number | null
  honestidad_transparencia?: number | null
  autonomia?: number | null
  manejo_dificultades?: number | null
}

export interface EvaluacionAvanzadaInput {
  visita_domiciliaria_realizada?: boolean | null
  visita_domiciliaria_calificacion?: string | null
}

const FUENTE_RESPONSABILIDAD = 'Referencia Laboral → Responsabilidad + Cumplimiento (promedio)'
const FUENTE_HONESTIDAD = 'Referencia Laboral → Honestidad y transparencia'
const FUENTE_AUTONOMIA = 'Referencia Laboral → Autonomía'
const FUENTE_MANEJO_DIFICULTADES = 'Referencia Laboral → Manejo de dificultades'
const FUENTE_VISITA = 'Información Avanzada → Visita domiciliaria'

const VISITA_DOMICILIARIA_VALORES: Record<string, number> = {
  APTO: 100,
  APTO_CON_RESERVA: 60,
  NO_APTO: 0,
}

/** 1/3 = 33.33%, 2/3 = 66.67%, 3/3 = 100% -- división literal entre 3, no reescalado de rango (ver spec.md Sección 6). */
function normalizar1a3(valor: number): number {
  return (valor / 3) * 100
}

function dimensionSimple(
  label: string,
  peso: number,
  valorCrudo: number | null | undefined,
  fuente: string
): DimensionSER {
  if (valorCrudo === null || valorCrudo === undefined) {
    return { label, peso, disponible: false, valor: null, fuente }
  }
  return { label, peso, disponible: true, valor: normalizar1a3(valorCrudo), fuente }
}

function dimensionResponsabilidad(referenciaLaboral: ReferenciaLaboralEvaluacionInput | null | undefined): DimensionSER {
  const label = 'Responsabilidad y compromisos'
  const peso = 25
  const responsabilidad = referenciaLaboral?.responsabilidad
  const cumplimiento = referenciaLaboral?.cumplimiento
  if (responsabilidad === null || responsabilidad === undefined || cumplimiento === null || cumplimiento === undefined) {
    return { label, peso, disponible: false, valor: null, fuente: FUENTE_RESPONSABILIDAD }
  }
  const promedio = (responsabilidad + cumplimiento) / 2
  return { label, peso, disponible: true, valor: normalizar1a3(promedio), fuente: FUENTE_RESPONSABILIDAD }
}

function dimensionVisitaDomiciliaria(evaluacion: EvaluacionAvanzadaInput | null | undefined): DimensionSER {
  const label = 'Visita domiciliaria'
  const peso = 15
  if (evaluacion?.visita_domiciliaria_realizada !== true || !evaluacion.visita_domiciliaria_calificacion) {
    // No realizada (o no calificada aún) -- NUNCA se interpreta como 0%.
    return { label, peso, disponible: false, valor: null, fuente: FUENTE_VISITA }
  }
  const valor = VISITA_DOMICILIARIA_VALORES[evaluacion.visita_domiciliaria_calificacion]
  if (valor === undefined) {
    return { label, peso, disponible: false, valor: null, fuente: FUENTE_VISITA }
  }
  // NO_APTO = 0 es un resultado real (no ausencia de dato) -- autorizado explícitamente por el spec.
  return { label, peso, disponible: true, valor, fuente: FUENTE_VISITA }
}

export function calcularIndiceSER(
  evaluacion: EvaluacionAvanzadaInput | null | undefined,
  referenciaLaboral: ReferenciaLaboralEvaluacionInput | null | undefined
): IndiceSERResult {
  const dimensiones: Record<DimensionKeySER, DimensionSER> = {
    responsabilidad: dimensionResponsabilidad(referenciaLaboral),
    honestidad: dimensionSimple('Honestidad y transparencia', 25, referenciaLaboral?.honestidad_transparencia, FUENTE_HONESTIDAD),
    autonomia: dimensionSimple('Autonomía y criterio', 20, referenciaLaboral?.autonomia, FUENTE_AUTONOMIA),
    manejoDificultades: dimensionSimple('Manejo de dificultades', 15, referenciaLaboral?.manejo_dificultades, FUENTE_MANEJO_DIFICULTADES),
    visitaDomiciliaria: dimensionVisitaDomiciliaria(evaluacion),
  }

  const todasDisponibles = Object.values(dimensiones).every((d) => d.disponible)

  const valor = todasDisponibles
    ? Object.values(dimensiones).reduce((acc, d) => acc + (d.valor as number) * (d.peso / 100), 0)
    : null

  return { disponible: todasDisponibles, valor, dimensiones }
}
