// Calculadora de Presupuesto (KAI-29) — Política financiera D8 (spec.md 39.1, 39.8.2 y 39.9).
//
// Dominio puro. La política NO es un parámetro del motor: no forma parte de
// `ParametrosPresupuesto`, así que `calcularMetricas` no puede leerla por construcción
// (AC-49). Se guarda congelada dentro del JSONB `parametros` de cada presupuesto, bajo
// la clave `politicaFinanciera` (esquemaSnapshot.ts la reconoce como clave adicional).
//
// Unidades: el ROI es una fracción (0,30 = 30%) y el payback se mide en SEMANAS; la
// equivalencia en meses es solo presentación.

/** Clave del snapshot guardado donde vive la política congelada. */
export const CLAVE_POLITICA_FINANCIERA = 'politicaFinanciera'

export interface PoliticaFinanciera {
  version: 'POLITICA_FINANCIERA_V1'
  /** Cortes del ROI sobre inversión total: [inicio de BAJO, inicio de BUENO (= ROI mínimo), inicio de EXCELENTE]. */
  roiCortes: [number, number, number]
  /** Cortes del payback contractual en semanas: [fin de RIESGO BAJO, fin de RIESGO MEDIO, fin de RIESGO ELEVADO (= payback máximo)]. */
  paybackCortesSemanas: [number, number, number]
}

/** Política aprobada por Humania Go el 2026-09-25 (spec.md 39.1). Valor por defecto de toda simulación nueva (DEC-3). */
export const POLITICA_FINANCIERA_V1: PoliticaFinanciera = {
  version: 'POLITICA_FINANCIERA_V1',
  roiCortes: [0.2, 0.3, 0.6],
  paybackCortesSemanas: [52, 78, 104],
}

export type ClasificacionRoi = 'MUY_BAJO' | 'BAJO' | 'BUENO' | 'EXCELENTE'
export type ClasificacionPayback = 'RIESGO_BAJO' | 'RIESGO_MEDIO' | 'RIESGO_ELEVADO' | 'RIESGO_ALTO'
export type Veredicto = 'CUMPLE' | 'CUMPLE_CON_OBSERVACIONES' | 'NO_CUMPLE'

export type Incumplimiento =
  | { tipo: 'ROI_BAJO_MINIMO'; roi: number; roiMinimo: number }
  | { tipo: 'PAYBACK_SOBRE_MAXIMO'; semana: number; paybackMaximo: number }
  | { tipo: 'PAYBACK_NO_ALCANZADO' }

export type Observacion = { tipo: 'PAYBACK_RIESGO_ELEVADO'; semana: number }

export interface EvaluacionPolitica {
  veredicto: Veredicto
  roi: number
  payback: number | null
  clasificacionRoi: ClasificacionRoi
  clasificacionPayback: ClasificacionPayback
  cumpleRoi: boolean
  cumplePayback: boolean
  roiMinimo: number
  paybackMaximo: number
  /** Una entrada por cada condición incumplida (vacío salvo en NO_CUMPLE). */
  incumplimientos: Incumplimiento[]
  /** Solo en CUMPLE_CON_OBSERVACIONES. */
  observaciones: Observacion[]
}

export function roiMinimo(politica: PoliticaFinanciera): number {
  return politica.roiCortes[1]
}

export function paybackMaximo(politica: PoliticaFinanciera): number {
  return politica.paybackCortesSemanas[2]
}

export function clasificarRoi(roi: number, politica: PoliticaFinanciera): ClasificacionRoi {
  const [c1, c2, c3] = politica.roiCortes
  if (roi < c1) return 'MUY_BAJO'
  if (roi < c2) return 'BAJO'
  if (roi < c3) return 'BUENO'
  return 'EXCELENTE'
}

/** Payback no alcanzado dentro del contrato (null) = RIESGO ALTO (DEC-8). */
export function clasificarPayback(semana: number | null, politica: PoliticaFinanciera): ClasificacionPayback {
  if (semana === null) return 'RIESGO_ALTO'
  const [c1, c2, c3] = politica.paybackCortesSemanas
  if (semana <= c1) return 'RIESGO_BAJO'
  if (semana <= c2) return 'RIESGO_MEDIO'
  if (semana <= c3) return 'RIESGO_ELEVADO'
  return 'RIESGO_ALTO'
}

/**
 * Evalúa la política D8 (DEC-1 = Opción A). La firma recibe SOLO las dos métricas de la
 * política: el ROI sobre recursos propios no puede participar (AC-47). Las comparaciones
 * usan el valor real, nunca el porcentaje redondeado de pantalla.
 */
export function evaluarPolitica(
  metricas: { roiSobreInversionTotal: number; paybackFlujoContractualCompleto: number | null },
  politica: PoliticaFinanciera,
): EvaluacionPolitica {
  const roi = metricas.roiSobreInversionTotal
  const payback = metricas.paybackFlujoContractualCompleto
  const minimo = roiMinimo(politica)
  const maximo = paybackMaximo(politica)
  const clasificacionRoi = clasificarRoi(roi, politica)
  const clasificacionPayback = clasificarPayback(payback, politica)
  const cumpleRoi = roi >= minimo
  const cumplePayback = payback !== null && payback <= maximo

  const incumplimientos: Incumplimiento[] = []
  if (!cumpleRoi) incumplimientos.push({ tipo: 'ROI_BAJO_MINIMO', roi, roiMinimo: minimo })
  if (payback === null) incumplimientos.push({ tipo: 'PAYBACK_NO_ALCANZADO' })
  else if (!cumplePayback) incumplimientos.push({ tipo: 'PAYBACK_SOBRE_MAXIMO', semana: payback, paybackMaximo: maximo })

  // Con el ROI mínimo definido como inicio de BUENO, un ROI que cumple nunca está en la banda
  // BAJO: la única zona de observación posible es el payback en RIESGO ELEVADO (spec.md 39.9).
  const observaciones: Observacion[] =
    incumplimientos.length === 0 && clasificacionPayback === 'RIESGO_ELEVADO' && payback !== null
      ? [{ tipo: 'PAYBACK_RIESGO_ELEVADO', semana: payback }]
      : []

  const veredicto: Veredicto = incumplimientos.length > 0 ? 'NO_CUMPLE' : observaciones.length > 0 ? 'CUMPLE_CON_OBSERVACIONES' : 'CUMPLE'
  return {
    veredicto,
    roi,
    payback,
    clasificacionRoi,
    clasificacionPayback,
    cumpleRoi,
    cumplePayback,
    roiMinimo: minimo,
    paybackMaximo: maximo,
    incumplimientos,
    observaciones,
  }
}

function esTernaNumerica(valor: unknown): valor is [number, number, number] {
  return Array.isArray(valor) && valor.length === 3 && valor.every((v) => typeof v === 'number' && Number.isFinite(v))
}

/** Errores de una política (vacío = válida). Nunca lanza, acepta cualquier entrada. */
export function validarPolitica(politica: unknown): string[] {
  if (typeof politica !== 'object' || politica === null || Array.isArray(politica)) return ['La política financiera no tiene una estructura válida.']
  const p = politica as Record<string, unknown>
  const errores: string[] = []
  if (p.version !== 'POLITICA_FINANCIERA_V1') errores.push(`Versión de política financiera no reconocida (recibido: ${String(p.version)}).`)
  if (!esTernaNumerica(p.roiCortes)) {
    errores.push('Los cortes del ROI deben ser tres números.')
  } else {
    const [c1, c2, c3] = p.roiCortes
    if (!(c1 >= 0 && c1 < c2 && c2 < c3)) errores.push('Los cortes del ROI deben cumplir 0 ≤ inicio de BAJO < ROI mínimo < inicio de EXCELENTE.')
  }
  if (!esTernaNumerica(p.paybackCortesSemanas)) {
    errores.push('Los cortes del payback deben ser tres números de semanas.')
  } else {
    const [c1, c2, c3] = p.paybackCortesSemanas
    if (![c1, c2, c3].every(Number.isInteger)) errores.push('Los cortes del payback deben ser semanas enteras.')
    if (!(c1 > 0 && c1 < c2 && c2 < c3)) errores.push('Los cortes del payback deben cumplir 0 < fin de RIESGO BAJO < fin de RIESGO MEDIO < payback máximo.')
  }
  return errores
}

export type LecturaPoliticaGuardada =
  /** Presupuesto guardado antes de D8: no tiene política y NUNCA se evalúa con la vigente (spec.md 39.1.3 / 39.9). */
  | { estado: 'AUSENTE' }
  | { estado: 'VALIDA'; politica: PoliticaFinanciera }
  | { estado: 'INVALIDA'; errores: string[] }

/** Lee la política congelada de un snapshot `parametros` crudo. Copia en profundidad; nunca completa valores. */
export function leerPoliticaGuardada(parametrosBrutos: unknown): LecturaPoliticaGuardada {
  if (typeof parametrosBrutos !== 'object' || parametrosBrutos === null || !(CLAVE_POLITICA_FINANCIERA in parametrosBrutos)) {
    return { estado: 'AUSENTE' }
  }
  const bruto = (parametrosBrutos as Record<string, unknown>)[CLAVE_POLITICA_FINANCIERA]
  const errores = validarPolitica(bruto)
  if (errores.length > 0) return { estado: 'INVALIDA', errores }
  const p = bruto as PoliticaFinanciera
  return {
    estado: 'VALIDA',
    politica: { version: p.version, roiCortes: [...p.roiCortes], paybackCortesSemanas: [...p.paybackCortesSemanas] },
  }
}
