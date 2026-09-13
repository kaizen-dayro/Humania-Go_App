// Calculadora de Presupuesto (KAI-29) — amortización de crédito bancario
// (Capa B). Ver spec.md 19.5 (corrección de tolerancia de punto
// flotante) y 19.19.4 (vista de rentabilidad vs. vista de caja).

export interface CuotaMes {
  mes: number
  cuota: number
  interes: number
  abonoCapital: number
  saldo: number
}

export interface Amortizacion {
  cuotaMensual: number
  cronograma: CuotaMes[]
  interesTotalMeses: number
  /** Primer mes con saldo prácticamente en cero (tolerancia — spec.md 19.5, nunca igualdad exacta). */
  mesPagoCompleto: number
}

const TOLERANCIA_SALDO_CERO = 1 // peso — spec.md 19.5

/**
 * Sistema francés (cuota fija), tasa efectiva anual convertida a mensual
 * equivalente. Verificado con aritmética exacta en spec.md 19.19.2 para
 * el escenario de referencia (principal 27.329.323, TEA 26,8%, 72 meses).
 */
export function amortizarCredito(principal: number, tasaEfectivaAnual: number, plazoMeses: number): Amortizacion {
  const tasaMensual = Math.pow(1 + tasaEfectivaAnual, 1 / 12) - 1
  const cuotaMensual =
    tasaMensual === 0 ? principal / plazoMeses : (principal * tasaMensual) / (1 - Math.pow(1 + tasaMensual, -plazoMeses))

  let saldo = principal
  let interesTotalMeses = 0
  let mesPagoCompleto = plazoMeses
  const cronograma: CuotaMes[] = []

  for (let mes = 1; mes <= plazoMeses; mes++) {
    const interes = saldo * tasaMensual
    let abonoCapital = cuotaMensual - interes
    if (abonoCapital > saldo) abonoCapital = saldo
    saldo -= abonoCapital
    if (Math.abs(saldo) < TOLERANCIA_SALDO_CERO) saldo = 0
    interesTotalMeses += interes
    cronograma.push({ mes, cuota: interes + abonoCapital, interes, abonoCapital, saldo })
    if (saldo === 0 && mesPagoCompleto === plazoMeses) mesPagoCompleto = mes
  }

  return { cuotaMensual, cronograma, interesTotalMeses, mesPagoCompleto }
}

export interface CuotaConAbono {
  mes: number
  saldoInicial: number
  interes: number
  capitalOrdinario: number
  abonoExtra: number
  capitalTotal: number
  pagoTotal: number
  saldoFinal: number
}

export interface AmortizacionConAbono {
  cuotaMensualOriginal: number
  cronograma: CuotaConAbono[]
  /** Meses reales que tardó en pagarse (con abono) — plan.md Sección 11.2, "Meses reales" del Excel. */
  mesesReales: number
  mesesAhorrados: number
  interesTotalConAbono: number
  /** cuotaMensualOriginal × plazoMeses − principal (mismo criterio que F221 del Excel de referencia). */
  interesTotalSinAbono: number
  ahorroIntereses: number
  totalAbonosExtra: number
  totalPagado: number
}

/**
 * Amortización con abono extraordinario a capital, reducción de plazo,
 * cuota fija (D15 CERRADA, spec.md Sección 11/21). Replica la mecánica
 * auditada de `Documentos/CAL/Amortizacion_Abono.xlsx` (filas 141-224,
 * plan.md Sección 11.1): el abono es un % de la cuota mensual ORIGINAL
 * (nunca recalculada), 100% a capital, desde `mesInicioAbono` — nunca
 * deja el saldo negativo (se limita al saldo restante después del
 * capital ordinario de esa cuota).
 */
export function amortizarCreditoConAbono(
  principal: number,
  tasaEfectivaAnual: number,
  plazoMeses: number,
  porcentajeAbono: number,
  mesInicioAbono: number,
): AmortizacionConAbono {
  const tasaMensual = Math.pow(1 + tasaEfectivaAnual, 1 / 12) - 1
  const cuotaMensualOriginal =
    tasaMensual === 0 ? principal / plazoMeses : (principal * tasaMensual) / (1 - Math.pow(1 + tasaMensual, -plazoMeses))

  let saldo = principal
  const cronograma: CuotaConAbono[] = []

  for (let mes = 1; mes <= plazoMeses && saldo > TOLERANCIA_SALDO_CERO; mes++) {
    const saldoInicial = saldo
    const interes = saldoInicial * tasaMensual
    const capitalOrdinario = Math.max(0, Math.min(cuotaMensualOriginal - interes, saldoInicial))
    const restanteTrasOrdinario = saldoInicial - capitalOrdinario
    const abonoExtra = mes >= mesInicioAbono ? Math.min(porcentajeAbono * cuotaMensualOriginal, restanteTrasOrdinario) : 0
    const capitalTotal = capitalOrdinario + abonoExtra
    const pagoTotal = interes + capitalTotal
    saldo = saldoInicial - capitalTotal
    if (Math.abs(saldo) < TOLERANCIA_SALDO_CERO) saldo = 0

    cronograma.push({ mes, saldoInicial, interes, capitalOrdinario, abonoExtra, capitalTotal, pagoTotal, saldoFinal: saldo })
  }

  const mesesReales = cronograma.length
  const interesTotalConAbono = cronograma.reduce((acc, c) => acc + c.interes, 0)
  const interesTotalSinAbono = cuotaMensualOriginal * plazoMeses - principal
  const totalAbonosExtra = cronograma.reduce((acc, c) => acc + c.abonoExtra, 0)

  return {
    cuotaMensualOriginal,
    cronograma,
    mesesReales,
    mesesAhorrados: plazoMeses - mesesReales,
    interesTotalConAbono,
    interesTotalSinAbono,
    ahorroIntereses: interesTotalSinAbono - interesTotalConAbono,
    totalAbonosExtra,
    totalPagado: interesTotalConAbono + principal,
  }
}

/** Interés acumulado (vista rentabilidad) hasta el mes dado, sobre el cronograma CON abono — mismo criterio de FLOOR que `interesAcumuladoAlMes`. */
export function interesAcumuladoConAbonoAlMes(amortizacion: AmortizacionConAbono, mesExacto: number): number {
  return acumuladoAlMes(amortizacion.cronograma.map((c) => c.interes), mesExacto)
}

/** Desembolso real acumulado (vista de caja: interés + capital + abono) hasta el mes dado, sobre el cronograma CON abono. */
export function pagoTotalAcumuladoConAbono(amortizacion: AmortizacionConAbono, mesExacto: number): number {
  return acumuladoAlMes(amortizacion.cronograma.map((c) => c.pagoTotal), mesExacto)
}

/**
 * Financiación del seguro externo (D1, spec.md 19.13.1/19.14.2): el
 * costo financiero total confirmado ($2.500.000) y el cronograma exacto
 * de la financiación no están documentados — se distribuye de forma
 * lineal simple sobre el plazo dado. Esto es un SUPUESTO explícito (no
 * un dato bancario confirmado), señalado también en spec.md 19.19.4 —
 * nunca presentar como si fuera un cronograma real de amortización.
 */
export function estimarCostoSeguroLineal(principal: number, costoFinancieroTotal: number, plazoMeses: number) {
  const costoFinancieroMensual = costoFinancieroTotal / plazoMeses
  const cuotaMensual = (principal + costoFinancieroTotal) / plazoMeses
  return { costoFinancieroMensual, cuotaMensual }
}

/**
 * Interés acumulado (vista rentabilidad) hasta el mes dado — solo meses
 * CALENDARIO completos (FLOOR, nunca prorrateo fraccionario), mismo
 * criterio que la simulación semana a semana de spec.md 19.19.2 (un mes
 * calendario solo se considera "transcurrido" cuando se completa).
 */
export function interesAcumuladoAlMes(amortizacion: Amortizacion, mesExacto: number): number {
  return acumuladoAlMes(amortizacion.cronograma.map((c) => c.interes), mesExacto)
}

/** Cuota total acumulada (vista de caja, capital+interés) hasta el mes dado — mismo criterio de FLOOR. */
export function cuotaAcumuladaAlMes(amortizacion: Amortizacion, mesExacto: number): number {
  return acumuladoAlMes(amortizacion.cronograma.map((c) => c.cuota), mesExacto)
}

function acumuladoAlMes(valoresPorMes: number[], mesExacto: number): number {
  const mesesCompletos = Math.min(Math.floor(mesExacto), valoresPorMes.length)
  let acumulado = 0
  for (let i = 0; i < mesesCompletos; i++) acumulado += valoresPorMes[i]
  return acumulado
}
