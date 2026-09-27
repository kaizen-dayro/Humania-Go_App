// Calculadora de Presupuesto (KAI-42) — alertas de la operación y mensaje del crédito.
//
// Función pura de PRESENTACIÓN: decide qué alertas mostrar a partir del resultado del motor y arma sus
// textos aprobados. No calcula indicadores nuevos ni cambia ninguno (opción A aprobada el 2026-09-27).
// Cada alerta aparece solo si su condición se cumple con los números de la simulación:
//   A. El crédito no queda pagado dentro del contrato (regla contractual confirmada por Humania Go).
//   B. Durante algunos meses lo pagado supera lo que paga el conductor (acumulado): hacen falta recursos propios
//      en ese periodo (solo Crédito). Decisión de Dayro (27-09): lo que paga el conductor, incluido el componente
//      de adquisición, se puede usar para pagar el banco.
//   C. La operación cierra con pérdida (resultado neto negativo).
// Y un mensaje positivo cuando el crédito queda pagado al menos un mes antes de terminar el contrato.
//
// Se retiraron las tres alertas anteriores de paybacks (ingreso operativo solo, vista de rentabilidad y
// vista de caja): comparaban solo el ingreso operativo contra una inversión que incluye el vehículo, que en
// el modelo se paga con el componente de adquisición, así que se cumplían casi siempre (81, 109 y 113 de
// 113 simulaciones medidas) y repetían la tabla de paybacks.

import type { ResultadoAbonoContrato } from './abonoMinimo'
import { cuotaAcumuladaAlMes, estimarCostoSeguroLineal, pagoTotalAcumuladoConAbono } from './amortizacion'
import { calcularCostosRecurrentes, calcularOtrosCostosHumania, type ResultadoMetricas } from './metricas'
import { seguroEfectivo, type ParametrosPresupuesto } from './parametros'
import { costoFinancieroSeguroDigitado } from './seguroDigitado'
import { TEXTOS_APROBADOS } from './textosInterfaz'

const T = TEXTOS_APROBADOS.alertasOperacion

export interface FormatosAlertas {
  moneda: (valor: number) => string
  porcentaje: (fraccion: number) => string
}

export interface AlertasOperacion {
  alertas: string[]
  /** Mensaje positivo del crédito pagado antes de terminar el contrato; null si no aplica. */
  creditoPagadoAntes: string | null
}

/** Mes (entero) en que termina el contrato con el conductor: el mismo que usan las alertas y la razón de D8. */
export function mesFinDelContrato(p: ParametrosPresupuesto, r: ResultadoMetricas): number {
  return Math.floor(r.flujo.duracionContratoSemanas / (p.semanasPorAno / p.mesesPorAno))
}

/** Saldo de capital del crédito al terminar el mes `mes`, según el cronograma que usa el cálculo (con abono si está activo). */
export function saldoCreditoAlMes(r: ResultadoMetricas, mes: number): number {
  if (mes <= 0) return r.financiacionBancaria
  if (r.amortizacionConAbono) return r.amortizacionConAbono.cronograma[mes - 1]?.saldoFinal ?? 0
  if (r.amortizacionNormal) return r.amortizacionNormal.cronograma[mes - 1]?.saldo ?? 0
  return 0
}

/**
 * Salidas de caja acumuladas al mes `mes` (sin la inversión inicial, que ya está financiada): pagos al banco
 * (cuota, o cuota + abono), seguro en vista de caja, renovaciones (SOAT, tecnomecánica, impuestos y seguro
 * digitado) y otros costos. Usa las MISMAS funciones del motor (acumulados por mes calendario completo), de
 * modo que al mes del fin del contrato coincide con costos financieros de caja + recurrentes + otros del
 * resultado (lo vigila `verificacionAlertasContrato.ts`).
 */
export function salidasCajaAcumuladas(p: ParametrosPresupuesto, r: ResultadoMetricas, mes: number): number {
  const esCredito = p.modalidadAdquisicion === 'CREDITO'
  const mesFinCredito = esCredito ? r.mesesCreditoReales : null
  const banco = r.amortizacionConAbono
    ? pagoTotalAcumuladoConAbono(r.amortizacionConAbono, mes)
    : r.amortizacionNormal
      ? cuotaAcumuladaAlMes(r.amortizacionNormal, mes)
      : 0
  let seguro = 0
  if (esCredito && p.seguro.modo === 'DIGITADO' && p.seguro.digitado) {
    seguro = costoFinancieroSeguroDigitado(p.seguro.digitado, p.mesesPorAno, mes, mesFinCredito as number, 'caja')
  } else if (esCredito && p.seguro.modo === 'LEGACY_NO_CONFIRMADO') {
    const s = seguroEfectivo(p)
    seguro = estimarCostoSeguroLineal(s.principal, s.costoFinancieroTotal, s.plazoMeses).cuotaMensual * Math.min(mes, s.plazoMeses)
  }
  return banco + seguro + calcularCostosRecurrentes(p, mes, mesFinCredito).total + calcularOtrosCostosHumania(p, mes)
}

/** Lo que el conductor pagó hasta el final del mes `mes` (flujo contractual completo: operativo + adquisición). */
export function entradasConductorAcumuladas(p: ParametrosPresupuesto, r: ResultadoMetricas, mes: number): number {
  const semanas = Math.min(Math.floor((mes * p.semanasPorAno) / p.mesesPorAno), r.flujo.duracionContratoSemanas)
  return semanas <= 0 ? 0 : r.flujo.serieFlujoContractualAcumulado[semanas - 1]
}

export interface NecesidadCajaMensual {
  /** Primer y último mes del contrato en que lo pagado supera lo recibido del conductor (acumulado). */
  desde: number
  hasta: number
  /** Mayor faltante acumulado: los recursos propios que hay que tener disponibles en ese periodo. */
  maximo: number
}

/**
 * KAI-42 (decisión de Dayro, 2026-09-27): Humania puede usar TODO lo que paga el conductor (ingreso operativo +
 * componente de adquisición) para pagar el banco. La necesidad real de caja es, mes a mes dentro del contrato,
 * cuánto supera lo pagado (acumulado) a lo recibido del conductor (acumulado). null si nunca lo supera.
 */
export function necesidadCajaMensual(p: ParametrosPresupuesto, r: ResultadoMetricas): NecesidadCajaMensual | null {
  const mesContrato = mesFinDelContrato(p, r)
  let desde = 0
  let hasta = 0
  let maximo = 0
  for (let mes = 1; mes <= mesContrato; mes++) {
    const faltante = salidasCajaAcumuladas(p, r, mes) - entradasConductorAcumuladas(p, r, mes)
    if (faltante > 0) {
      if (desde === 0) desde = mes
      hasta = mes
      maximo = Math.max(maximo, faltante)
    }
  }
  return desde === 0 ? null : { desde, hasta, maximo }
}

export function construirAlertasOperacion(
  p: ParametrosPresupuesto,
  r: ResultadoMetricas,
  abonoContrato: ResultadoAbonoContrato,
  f: FormatosAlertas,
): AlertasOperacion {
  const esCredito = p.modalidadAdquisicion === 'CREDITO'
  const mesContrato = mesFinDelContrato(p, r)
  const alertas: string[] = []

  // A. Regla contractual: el crédito debe quedar pagado antes de terminar el contrato.
  if (esCredito && r.creditoSobreviveAlContrato && r.mesesCreditoReales !== null) {
    let texto = T.creditoFueraDelContrato(r.mesesCreditoReales, mesContrato, f.moneda(saldoCreditoAlMes(r, mesContrato)))
    if (abonoContrato.estado === 'ENCONTRADO') {
      texto += ` ${T.abonoNecesario(f.porcentaje(abonoContrato.porcentaje), f.moneda(abonoContrato.montoMensual), abonoContrato.mesInicio, mesContrato)}`
    } else if (abonoContrato.estado === 'NO_ALCANZABLE') {
      texto += ` ${T.abonoNoAlcanza(f.porcentaje(abonoContrato.porcentajeMaximo), abonoContrato.mesInicio, mesContrato)}`
    }
    alertas.push(texto)
  }

  // B. Necesidad de caja mes a mes (solo Crédito: el texto se refiere al pago al banco). Reemplaza a la alerta de
  // "caja negativa al cierre", que solo contaba el ingreso operativo y salía en casi todo plan que cumple el contrato.
  const necesidad = esCredito ? necesidadCajaMensual(p, r) : null
  if (necesidad) alertas.push(T.necesidadCajaMensual(necesidad.desde, necesidad.hasta, f.moneda(necesidad.maximo)))

  // C. Pérdida al cierre del contrato.
  if (r.resultadoNeto < 0) alertas.push(T.perdida(f.moneda(r.resultadoNeto)))

  // Mensaje positivo: el crédito queda pagado al menos un mes antes de terminar el contrato.
  let creditoPagadoAntes: string | null = null
  if (esCredito && !r.creditoSobreviveAlContrato && r.mesesCreditoReales !== null) {
    const mesesAntes = mesContrato - r.mesesCreditoReales
    if (mesesAntes >= 1) {
      creditoPagadoAntes = T.creditoPagadoAntes(r.mesesCreditoReales, mesesAntes)
      if (r.amortizacionConAbono) creditoPagadoAntes += ` ${T.ahorroIntereses(f.moneda(r.amortizacionConAbono.ahorroIntereses))}`
    }
  }

  return { alertas, creditoPagadoAntes }
}
