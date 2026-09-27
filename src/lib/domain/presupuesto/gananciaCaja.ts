// Calculadora de Presupuesto (KAI-43) — Ganancia de caja del contrato (spec.md 43).
//
// Lo que le queda a Humania al terminar el contrato: todo lo que paga el conductor, menos lo pagado por el
// crédito (capital completo e intereses hasta el fin del contrato), los gastos (SOAT, tecnomecánica e
// impuestos del año 1 y sus renovaciones), el seguro, otros costos y los recursos propios que Humania puso
// al comprar el activo. Función pura de PRESENTACIÓN: no cambia ningún cálculo del motor; arma el desglose
// con los mismos datos y funciones que ya usa la calculadora.
//
// El capital del crédito va COMPLETO porque, por contrato, el crédito debe quedar pagado antes de terminar
// (spec.md 42.2): si el plan no lo cumple, el saldo pendiente al fin del contrato se informa aparte. Los
// intereses se cuentan hasta el fin del contrato (con el saldo pagado ahí, no hay intereses posteriores).
//
// Identidad de control (se verifica en `verificacionGananciaCaja.ts`):
//   ganancia = resultado neto + componente de adquisición del conductor − inversión inicial.

import { interesAcumuladoAlMes, interesAcumuladoConAbonoAlMes } from './amortizacion'
import { calcularOtrosCostosHumania, type ResultadoMetricas } from './metricas'
import { capitalSeguroEnInversion, type ParametrosPresupuesto } from './parametros'

export interface GananciaCaja {
  /** Todo lo que paga el conductor en el contrato (flujo contractual bruto). */
  flujoConductor: number
  creditoCapital: number
  /** Intereses del crédito hasta el fin del contrato (con el abono, si está activo). */
  creditoIntereses: number
  /** SOAT, tecnomecánica e impuestos: año 1 + renovaciones dentro del contrato. */
  gastosVehiculo: number
  /** Seguro: lo que entra a la inversión + su costo dentro del contrato (financiación y renovaciones). */
  seguro: number
  /** Otros costos de Humania dentro del contrato (0 por defecto). */
  otrosCostos: number
  /** Recursos propios que Humania puso al comprar el activo (el resto de la inversión inicial). */
  recursosPropios: number
  ganancia: number
  /** Mes (entero) en que termina el contrato. */
  mesesContrato: number
  /** Ganancia ÷ meses del contrato. */
  gananciaPorMes: number
  /** Resultado neto − ganancia = inversión inicial − componente de adquisición. */
  diferenciaConResultadoNeto: number
  /** Saldo de capital del crédito al terminar el contrato (0 si queda pagado dentro del contrato). */
  saldoCreditoPendiente: number
}

export function calcularGananciaCaja(p: ParametrosPresupuesto, r: ResultadoMetricas): GananciaCaja {
  const semanasPorMes = p.semanasPorAno / p.mesesPorAno
  const mesExacto = r.flujo.duracionContratoSemanas / semanasPorMes
  const mesesContrato = Math.floor(mesExacto)
  const esCredito = p.modalidadAdquisicion === 'CREDITO'

  const creditoCapital = esCredito ? r.financiacionBancaria : 0
  // Mismas funciones y mismo mes que usa el motor para los costos financieros al fin del contrato.
  const creditoIntereses = r.amortizacionConAbono
    ? interesAcumuladoConAbonoAlMes(r.amortizacionConAbono, mesExacto)
    : r.amortizacionNormal
      ? interesAcumuladoAlMes(r.amortizacionNormal, mesExacto)
      : 0

  const gastosAnio1 = p.soatAnual + p.tecnomecanicaAnual + p.impuestosAnuales
  const rec = r.costosRecurrentes
  const gastosVehiculo = gastosAnio1 + rec.soat.totalAdicional + rec.tecnomecanica.totalAdicional + rec.impuestos.totalAdicional

  // Seguro = lo que entra a la inversión + su costo financiero dentro del contrato (la parte de
  // `costosFinancierosRentabilidad` que no es interés del crédito) + sus renovaciones (solo seguro digitado).
  const seguroInversion = capitalSeguroEnInversion(p)
  const seguro = seguroInversion + (r.costosFinancierosRentabilidad - creditoIntereses) + (rec.seguro?.totalAdicional ?? 0)

  const otrosCostos = calcularOtrosCostosHumania(p, mesesContrato)
  // Crédito: capital propio declarado. Recursos propios: precio + traspaso + otros costos iniciales.
  const recursosPropios = r.inversionInicialTotal - creditoCapital - seguroInversion - gastosAnio1

  const flujoConductor = r.flujo.flujoContractualTotal
  const ganancia = flujoConductor - creditoCapital - creditoIntereses - gastosVehiculo - seguro - otrosCostos - recursosPropios

  const saldoCreditoPendiente = !esCredito || !r.creditoSobreviveAlContrato
    ? 0
    : r.amortizacionConAbono
      ? (r.amortizacionConAbono.cronograma[mesesContrato - 1]?.saldoFinal ?? 0)
      : (r.amortizacionNormal?.cronograma[mesesContrato - 1]?.saldo ?? 0)

  return {
    flujoConductor,
    creditoCapital,
    creditoIntereses,
    gastosVehiculo,
    seguro,
    otrosCostos,
    recursosPropios,
    ganancia,
    mesesContrato,
    gananciaPorMes: mesesContrato > 0 ? ganancia / mesesContrato : 0,
    diferenciaConResultadoNeto: r.resultadoNeto - ganancia,
    saldoCreditoPendiente,
  }
}

export type ParteDeCada100 = 'banco' | 'gastos' | 'seguro' | 'recursosPropios' | 'ganancia'

/**
 * "De cada $100 que paga el conductor": reparte 100 entre banco (capital + intereses), SOAT y otros (gastos +
 * otros costos), seguro, recursos propios y ganancia, en enteros que suman exactamente 100 (método del mayor
 * resto). null si hay pérdida o si el conductor no paga nada (no hay reparto que mostrar).
 */
export function deCada100(g: GananciaCaja): Record<ParteDeCada100, number> | null {
  if (g.ganancia < 0 || g.flujoConductor <= 0) return null
  const partes: [ParteDeCada100, number][] = [
    ['banco', g.creditoCapital + g.creditoIntereses],
    ['gastos', g.gastosVehiculo + g.otrosCostos],
    ['seguro', g.seguro],
    ['recursosPropios', g.recursosPropios],
    ['ganancia', g.ganancia],
  ]
  const exactos = partes.map(([k, v]) => [k, (100 * Math.max(0, v)) / g.flujoConductor] as const)
  const enteros = exactos.map(([k, v]) => [k, Math.floor(v)] as [ParteDeCada100, number])
  let faltan = 100 - enteros.reduce((s, [, v]) => s + v, 0)
  const porResto = exactos.map(([k, v], i) => ({ i, k, resto: v - Math.floor(v) })).sort((a, b) => b.resto - a.resto || a.i - b.i)
  for (const { i } of porResto) {
    if (faltan <= 0) break
    enteros[i][1] += 1
    faltan -= 1
  }
  return Object.fromEntries(enteros) as Record<ParteDeCada100, number>
}
