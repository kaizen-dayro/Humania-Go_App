// Calculadora de Presupuesto (KAI-42) — alertas de la operación y mensaje del crédito.
//
// Función pura de PRESENTACIÓN: decide qué alertas mostrar a partir del resultado del motor y arma sus
// textos aprobados. No calcula indicadores nuevos ni cambia ninguno (opción A aprobada el 2026-09-27).
// Cada alerta aparece solo si su condición se cumple con los números de la simulación:
//   A. El crédito no queda pagado dentro del contrato (regla contractual confirmada por Humania Go).
//   B. La caja de la operación cierra negativa (solo Crédito: el texto habla del pago al banco).
//   C. La operación cierra con pérdida (resultado neto negativo).
// Y un mensaje positivo cuando el crédito queda pagado al menos un mes antes de terminar el contrato.
//
// Se retiraron las tres alertas anteriores de paybacks (ingreso operativo solo, vista de rentabilidad y
// vista de caja): comparaban solo el ingreso operativo contra una inversión que incluye el vehículo, que en
// el modelo se paga con el componente de adquisición, así que se cumplían casi siempre (81, 109 y 113 de
// 113 simulaciones medidas) y repetían la tabla de paybacks.

import type { ResultadoAbonoContrato } from './abonoMinimo'
import type { ResultadoMetricas } from './metricas'
import { flujoOperativoHumaniaSemanal, type ParametrosPresupuesto } from './parametros'
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
 * Pago mensual al banco mientras el abono está activo: la cuota original más el abono (% de esa cuota).
 * Sin crédito devuelve null.
 */
export function pagoMensualAlBanco(p: ParametrosPresupuesto, r: ResultadoMetricas): number | null {
  if (!r.amortizacionNormal) return null
  const abono = r.amortizacionConAbono ? p.porcentajeAbonoCapital : 0
  return r.amortizacionNormal.cuotaMensual * (1 + abono)
}

/** Ingreso operativo mensual de Humania (sin el componente de adquisición del conductor). */
export function ingresoOperativoMensual(p: ParametrosPresupuesto): number {
  return (flujoOperativoHumaniaSemanal(p) * p.semanasPorAno) / p.mesesPorAno
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

  // B. Caja negativa al cierre del contrato (solo Crédito: el texto se refiere al pago al banco).
  if (esCredito && r.flujoDeCajaNeto < 0) {
    let texto = T.cajaNegativa(f.moneda(r.flujoDeCajaNeto))
    const pago = pagoMensualAlBanco(p, r)
    const ingreso = ingresoOperativoMensual(p)
    if (pago !== null && pago > ingreso) texto += ` ${T.pagoMayorQueIngreso(f.moneda(pago), f.moneda(ingreso))}`
    alertas.push(texto)
  }

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
