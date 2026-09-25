// Calculadora de Presupuesto (KAI-29) — D7, modelos de vista de las visualizaciones (spec.md 39.3 y
// 39.8.3; plan.md 19.F.3). Funciones puras: solo ordenan datos que ya produce el motor (o, en la
// sensibilidad, lo reevalúan cambiando únicamente el abono). No calculan cifras nuevas, no usan
// librerías de gráficos y no modifican ningún parámetro.

import { conAbono } from './abonoMinimo'
import { calcularMetricas, type ResultadoMetricas } from './metricas'
import type { ParametrosPresupuesto } from './parametros'
import { clasificarRoi, evaluarPolitica, type ClasificacionRoi, type PoliticaFinanciera } from './politicaFinanciera'

// ===== D7-1: flujo contractual acumulado, inversión y payback =====

export interface ModeloGraficoFlujo {
  /** Flujo contractual acumulado real, semana 1..duración del contrato (la misma serie con que se calcula el payback). */
  contractualReal: number[]
  /** Continuación hipotética después del contrato (benchmark), semana duración..horizonte. */
  contractualExtrapolado: number[]
  /** Serie secundaria: ingreso operativo acumulado real dentro del contrato. */
  operativoReal: number[]
  inversion: number
  duracionContratoSemanas: number
  /** Semana del payback contractual (= `paybackFlujoContractualCompleto`); null si no se alcanza dentro del contrato. */
  paybackSemana: number | null
  /** Horizonte del eje X en semanas. */
  horizonteSemanas: number
  /** Máximo del eje Y. */
  maximoY: number
}

export function modeloGraficoFlujo(r: ResultadoMetricas): ModeloGraficoFlujo {
  const { serieFlujoContractualAcumulado, serieFlujoContractualExtrapolado, serieIngresoOperativoAcumulado, duracionContratoSemanas } = r.flujo
  const payback = r.paybackFlujoContractualCompleto
  const referencia = payback ?? r.paybackFlujoContractualCompletoExtrapolado ?? duracionContratoSemanas
  const horizonteSemanas = Math.min(Math.round(Math.max(duracionContratoSemanas, referencia, 40) * 1.15), serieFlujoContractualExtrapolado.length)
  const contractualReal = serieFlujoContractualAcumulado.slice(0, Math.min(duracionContratoSemanas, horizonteSemanas))
  const contractualExtrapolado = serieFlujoContractualExtrapolado.slice(Math.max(duracionContratoSemanas - 1, 0), horizonteSemanas)
  const operativoReal = serieIngresoOperativoAcumulado.slice(0, Math.min(duracionContratoSemanas, horizonteSemanas))
  const maximoY = Math.max(r.inversionInicialTotal, ...contractualReal, ...contractualExtrapolado, 1) * 1.08
  return {
    contractualReal,
    contractualExtrapolado,
    operativoReal,
    inversion: r.inversionInicialTotal,
    duracionContratoSemanas,
    paybackSemana: payback,
    horizonteSemanas,
    maximoY,
  }
}

/** Primera semana (1-indexada) en que la serie dibujada alcanza la inversión; null si no la alcanza (AC-50). */
export function semanaDeCruceDibujada(m: ModeloGraficoFlujo): number | null {
  const i = m.contractualReal.findIndex((v) => v >= m.inversion)
  return i === -1 ? null : i + 1
}

// ===== D7-2: evolución del saldo del crédito =====

export interface PuntoSaldo {
  mes: number
  saldo: number
}

export interface ModeloGraficoSaldo {
  normal: PuntoSaldo[]
  /** null sin abono activo. */
  conAbono: PuntoSaldo[] | null
  /** Fin del contrato con el conductor, en meses (puede ser fraccionario). */
  mesFinContrato: number
  /** Mes en que el crédito termina con el cronograma vigente. */
  mesFinCredito: number
  principal: number
}

/** null en Recursos propios (no hay crédito). Cada punto sale tal cual de los cronogramas del motor (AC-51). */
export function modeloGraficoSaldo(r: ResultadoMetricas, p: ParametrosPresupuesto): ModeloGraficoSaldo | null {
  if (!r.amortizacionNormal) return null
  const principal = p.principalCreditoBancario
  const normal: PuntoSaldo[] = [{ mes: 0, saldo: principal }, ...r.amortizacionNormal.cronograma.map((c) => ({ mes: c.mes, saldo: c.saldo }))]
  const conAbonoPuntos = r.amortizacionConAbono
    ? [{ mes: 0, saldo: principal }, ...r.amortizacionConAbono.cronograma.map((c) => ({ mes: c.mes, saldo: c.saldoFinal }))]
    : null
  return {
    normal,
    conAbono: conAbonoPuntos,
    mesFinContrato: r.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno),
    mesFinCredito: r.mesesCreditoReales ?? p.mesesCreditoVehiculo,
    principal,
  }
}

// ===== D7-3: sensibilidad del abono frente a ROI y payback =====

/** Grilla de abonos ya usada en la línea base y en T-31 (fracción de la cuota mensual original). */
export const GRILLA_SENSIBILIDAD_ABONO = [0, 0.5, 1, 2, 3, 5] as const

export interface PuntoSensibilidad {
  porcentaje: number
  roi: number
  clasificacionRoi: ClasificacionRoi
  cumpleRoi: boolean
  payback: number | null
  mesesReales: number
  costosFinancierosRentabilidad: number
  flujoDeCajaNeto: number
  esActual: boolean
  esMinimo: boolean
}

/**
 * Una evaluación de `calcularMetricas` por punto, cambiando SOLO `porcentajeAbonoCapital` (AC-52).
 * Incluye el abono actual y, si existe, el mínimo de D6. null en Recursos propios.
 */
export function sensibilidadAbono(
  p: ParametrosPresupuesto,
  semanasAplazatoriasUsadas: number,
  politica: PoliticaFinanciera,
  abonoMinimo: number | null,
): PuntoSensibilidad[] | null {
  if (p.modalidadAdquisicion === 'RECURSOS_PROPIOS') return null
  const actual = p.porcentajeAbonoCapital
  const porcentajes = [...new Set<number>([...GRILLA_SENSIBILIDAD_ABONO, actual, ...(abonoMinimo === null ? [] : [abonoMinimo])])].sort((a, b) => a - b)
  return porcentajes.map((porcentaje) => {
    const r = calcularMetricas(conAbono(p, porcentaje), semanasAplazatoriasUsadas)
    const e = evaluarPolitica(r, politica)
    return {
      porcentaje,
      roi: r.roiSobreInversionTotal,
      clasificacionRoi: clasificarRoi(r.roiSobreInversionTotal, politica),
      cumpleRoi: e.cumpleRoi,
      payback: r.paybackFlujoContractualCompleto,
      mesesReales: r.mesesCreditoReales ?? p.mesesCreditoVehiculo,
      costosFinancierosRentabilidad: r.costosFinancierosRentabilidad,
      flujoDeCajaNeto: r.flujoDeCajaNeto,
      esActual: porcentaje === actual,
      esMinimo: abonoMinimo !== null && porcentaje === abonoMinimo,
    }
  })
}
