// Calculadora de Presupuesto (KAI-29) — las 15 salidas mínimas exigidas
// por D13 (spec.md Sección 11/19.18), derivadas EXCLUSIVAMENTE de
// flujoDeCaja.ts/amortizacion.ts (nunca una fórmula paralela). Vista de
// rentabilidad (solo interés) y vista de flujo de caja (cuota completa)
// coexisten siempre por separado — D14, spec.md 19.19.4.

import {
  amortizarCredito,
  amortizarCreditoConAbono,
  cuotaAcumuladaAlMes,
  estimarCostoSeguroLineal,
  interesAcumuladoAlMes,
  interesAcumuladoConAbonoAlMes,
  pagoTotalAcumuladoConAbono,
  type Amortizacion,
  type AmortizacionConAbono,
} from './amortizacion'
import { calcularFlujoDeCaja, type FlujoContractual } from './flujoDeCaja'
import { inversionInicial, margenVentaActivo, recursosPropiosEfectivos, type ParametrosPresupuesto } from './parametros'

export interface CostosRecurrentesConcepto {
  ocurrenciasAdicionales: number
  totalAdicional: number
}

export interface CostosRecurrentes {
  soat: CostosRecurrentesConcepto
  tecnomecanica: CostosRecurrentesConcepto
  impuestos: CostosRecurrentesConcepto
  total: number
}

/** D9 CERRADA: año 1 ya está en inversionInicial — solo se cuentan ocurrencias ADICIONALES (spec.md 19.16.3). */
export function calcularCostosRecurrentes(p: ParametrosPresupuesto, mesEntero: number): CostosRecurrentes {
  const concepto = (monto: number, periodicidad: number): CostosRecurrentesConcepto => {
    const ocurrenciasAdicionales = Math.floor(mesEntero / periodicidad)
    return { ocurrenciasAdicionales, totalAdicional: ocurrenciasAdicionales * monto }
  }
  const soat = concepto(p.soatAnual, p.soatPeriodicidadMeses)
  const tecnomecanica = concepto(p.tecnomecanicaAnual, p.tecnomecanicaPeriodicidadMeses)
  const impuestos = concepto(p.impuestosAnuales, p.impuestosPeriodicidadMeses)
  return { soat, tecnomecanica, impuestos, total: soat.totalAdicional + tecnomecanica.totalAdicional + impuestos.totalAdicional }
}

/**
 * `otrosCostosHumaniaAnuales` (sin decisión D confirmada, valor por
 * defecto 0, plan.md Sección 4): a diferencia de SOAT/Tecno/Impuestos,
 * NO está pre-pagado dentro de `inversionInicial` (ver `parametros.ts`,
 * `inversionInicial` no lo incluye) — por eso su primera ocurrencia SÍ
 * cuenta desde el mes 0, con periodicidad anual (`mesesPorAno`). Se
 * exporta por separado para que se sume de forma idéntica en la serie
 * semanal (payback) y en el snapshot final — nunca solo en uno de los
 * dos (bug corregido en la revisión del motor, 2026-09-01).
 */
export function calcularOtrosCostosHumania(p: ParametrosPresupuesto, mesEntero: number): number {
  if (p.otrosCostosHumaniaAnuales === 0) return 0
  const ocurrencias = Math.floor(mesEntero / p.mesesPorAno) + 1
  return ocurrencias * p.otrosCostosHumaniaAnuales
}

/** Punto de cruce de una serie acumulada contra un umbral — null si no se alcanza dentro de la serie. */
function primeraSemanaQueAlcanza(serie: number[], umbral: number): number | null {
  for (let i = 0; i < serie.length; i++) {
    if (serie[i] >= umbral) return i + 1
  }
  return null
}

export interface ResultadoMetricas {
  // Capas 1-4 (D13 #1-4)
  flujo: FlujoContractual

  // Capa 5-8 (D13 #5-8)
  inversionInicialTotal: number
  recursosPropios: number
  financiacionBancaria: number
  principalFinanciacionSeguro: number

  // Capa 9-10 (D13 #9-10), medidos al final real del contrato
  costosFinancierosRentabilidad: number // solo interés + costo financiero seguro
  costosFinancierosCaja: number // cuota completa crédito + cuota estimada seguro
  costosRecurrentes: CostosRecurrentes

  // Capa 11-12 (D13 #11-12) — real (dentro del contrato) vs. extrapolado (benchmark, D12)
  paybackOperativo: number | null
  paybackOperativoExtrapolado: number | null
  /**
   * D3 refinada (2026-09-01, spec.md Sección 23) — payback usando el
   * flujo contractual COMPLETO (450.000/semana, "el valor real que
   * recibe Humania"), no solo el componente operativo de 240.000. A
   * diferencia de `paybackOperativo`, esta cifra incorpora
   * implícitamente `margenVentaActivo` (valorVentaContractualActivo −
   * precioCompra) sin doble conteo — ver `margenVentaActivo` abajo.
   */
  paybackFlujoContractualCompleto: number | null
  paybackFlujoContractualCompletoExtrapolado: number | null
  paybackFinancieroRentabilidad: number | null
  paybackFinancieroRentabilidadExtrapolado: number | null
  paybackFinancieroCaja: number | null
  paybackFinancieroCajaExtrapolado: number | null

  // Capa 13-14 (D13 #13-14), medidas al final real del contrato (D13, nunca "resultado final del negocio" — spec.md 19.19.3)
  roiSobreInversionTotal: number
  /** null cuando capitalPropioDeclarado = 0 (100% financiado) — nunca Infinity/NaN silencioso. */
  roiSobreRecursosPropios: number | null

  // Capa 15 (D13 #15) — vista de rentabilidad y de caja, nunca mezcladas (D14, spec.md 19.19.4)
  resultadoNeto: number
  flujoDeCajaNeto: number

  /**
   * D3 refinada (2026-09-01, spec.md Sección 23) — dato informativo,
   * NO sumado aparte a `resultadoNeto`/`flujoDeCajaNeto` (ya está
   * implícito en `flujo.flujoContractualTotal` vs. `inversionInicialTotal`
   * — sumarlo también aquí sería doble conteo). Positivo = Humania
   * vende el activo por encima de su costo real; negativo = por debajo.
   */
  margenVentaActivo: number

  /**
   * Amortización completa del crédito bancario, mes a mes (plan.md
   * Sección 11) — null en modalidad RECURSOS_PROPIOS (sin crédito).
   * Siempre la amortización SIN abono, para comparación — nunca se
   * reemplaza por la de con abono, ambas coexisten (D15/D3, "nunca
   * mezclar").
   */
  amortizacionNormal: Amortizacion | null
  /**
   * Amortización con abono extraordinario a capital (D15 CERRADA,
   * spec.md Sección 11/21) — null si modalidad RECURSOS_PROPIOS o
   * `porcentajeAbonoCapital = 0` (sin abono activo). Cuando existe, los
   * paybacks financieros (`paybackFinancieroRentabilidad`/`Caja`) y
   * `costosFinancierosRentabilidad`/`Caja`/`resultadoNeto`/
   * `flujoDeCajaNeto` YA la usan en vez de la amortización normal
   * (pedido explícito de Humania Go, 2026-09-01) — se expone aquí
   * además para la tabla completa mes a mes en la interfaz.
   */
  amortizacionConAbono: AmortizacionConAbono | null
}

export function calcularMetricas(p: ParametrosPresupuesto, semanasAplazatoriasUsadas = 0): ResultadoMetricas {
  const flujo = calcularFlujoDeCaja(p, semanasAplazatoriasUsadas)
  const inversion = inversionInicial(p)
  const semanasPorMes = p.semanasPorAno / p.mesesPorAno
  const esRecursosPropios = p.modalidadAdquisicion === 'RECURSOS_PROPIOS'

  // Modalidad RECURSOS_PROPIOS (pedido explícito de Humania Go,
  // 2026-09-01): sin crédito, sin financiación del seguro, sin
  // intereses ni cuota bancaria — todo pagado de contado (Capa B no
  // aplica en absoluto). `amortizarCredito`/`estimarCostoSeguroLineal`
  // solo se invocan en modalidad CREDITO.
  const amortizacionCredito = esRecursosPropios ? null : amortizarCredito(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesContrato)
  // Abono extraordinario a capital (D15 CERRADA, spec.md Sección 11/21)
  // — solo aplica en modalidad CREDITO con porcentajeAbonoCapital > 0.
  // Cuando existe, SUSTITUYE a `amortizacionCredito` para todos los
  // costos financieros y paybacks (pedido explícito de Humania Go,
  // 2026-09-01: "que al pagar el crédito más rápido, se recalculen los
  // paybacks financieros que ya tenemos") — `amortizacionCredito`
  // (normal) sigue calculándose siempre, para la tabla comparativa.
  const amortizacionConAbono =
    !esRecursosPropios && p.porcentajeAbonoCapital > 0
      ? amortizarCreditoConAbono(p.principalCreditoBancario, p.tasaEfectivaAnualCredito, p.mesesContrato, p.porcentajeAbonoCapital, p.mesInicioAbonoCapital)
      : null
  const { costoFinancieroMensual: seguroCostoMensual, cuotaMensual: seguroCuotaMensual } = esRecursosPropios
    ? { costoFinancieroMensual: 0, cuotaMensual: 0 }
    : estimarCostoSeguroLineal(p.principalFinanciacionSeguro, p.costoFinancieroSeguroEstimado, p.mesesContrato)

  const mesAlFinDelContrato = flujo.duracionContratoSemanas / semanasPorMes

  // Costo del crédito para una vista (rentabilidad/caja) a un mes
  // exacto — usa el cronograma CON abono si está activo, si no el
  // normal. El cronograma con abono se detiene solo cuando el saldo
  // llega a 0 (nunca sigue acumulando costo después de pagado).
  const costoCreditoAlMes = (view: 'rentabilidad' | 'caja', mesExacto: number): number => {
    if (amortizacionConAbono) {
      return view === 'rentabilidad' ? interesAcumuladoConAbonoAlMes(amortizacionConAbono, mesExacto) : pagoTotalAcumuladoConAbono(amortizacionConAbono, mesExacto)
    }
    if (amortizacionCredito) {
      return view === 'rentabilidad' ? interesAcumuladoAlMes(amortizacionCredito, mesExacto) : cuotaAcumuladaAlMes(amortizacionCredito, mesExacto)
    }
    return 0
  }

  const construirSerieCostos = (view: 'rentabilidad' | 'caja'): number[] => {
    const serie: number[] = []
    for (let semana = 1; semana <= flujo.serieIngresoOperativoAcumulado.length; semana++) {
      const mesExacto = semana / semanasPorMes
      const mesEntero = Math.floor(mesExacto)
      const costoCredito = costoCreditoAlMes(view, mesExacto)
      const mesesSeguro = amortizacionCredito ? Math.min(mesEntero, p.mesesContrato) : 0
      const costoSeguro = view === 'rentabilidad' ? seguroCostoMensual * mesesSeguro : seguroCuotaMensual * mesesSeguro
      const recurrentes = calcularCostosRecurrentes(p, mesEntero).total + calcularOtrosCostosHumania(p, mesEntero)
      serie.push(costoCredito + costoSeguro + recurrentes)
    }
    return serie
  }

  const serieCostosRentabilidad = construirSerieCostos('rentabilidad')
  const serieCostosCaja = construirSerieCostos('caja')

  const serieResultadoRealRentabilidad = flujo.serieIngresoOperativoAcumulado.map((v, i) => v - serieCostosRentabilidad[i])
  const serieResultadoExtrapoladoRentabilidad = flujo.serieIngresoOperativoExtrapolada.map((v, i) => v - serieCostosRentabilidad[i])
  const serieResultadoRealCaja = flujo.serieIngresoOperativoAcumulado.map((v, i) => v - serieCostosCaja[i])
  const serieResultadoExtrapoladoCaja = flujo.serieIngresoOperativoExtrapolada.map((v, i) => v - serieCostosCaja[i])

  const paybackOperativo = primeraSemanaQueAlcanza(flujo.serieIngresoOperativoAcumulado, inversion)
  const paybackOperativoExtrapolado = primeraSemanaQueAlcanza(flujo.serieIngresoOperativoExtrapolada, inversion)
  const paybackFlujoContractualCompleto = primeraSemanaQueAlcanza(flujo.serieFlujoContractualAcumulado, inversion)
  const paybackFlujoContractualCompletoExtrapolado = primeraSemanaQueAlcanza(flujo.serieFlujoContractualExtrapolado, inversion)
  const paybackFinancieroRentabilidad = primeraSemanaQueAlcanza(serieResultadoRealRentabilidad, inversion)
  const paybackFinancieroRentabilidadExtrapolado = primeraSemanaQueAlcanza(serieResultadoExtrapoladoRentabilidad, inversion)
  const paybackFinancieroCaja = primeraSemanaQueAlcanza(serieResultadoRealCaja, inversion)
  const paybackFinancieroCajaExtrapolado = primeraSemanaQueAlcanza(serieResultadoExtrapoladoCaja, inversion)

  const mesEnteroAlFinDelContrato = Math.floor(mesAlFinDelContrato)
  const costosRecurrentes = calcularCostosRecurrentes(p, mesEnteroAlFinDelContrato)
  const otrosCostosAlFinDelContrato = calcularOtrosCostosHumania(p, mesEnteroAlFinDelContrato)
  const mesesSeguroAlFinal = amortizacionCredito ? mesEnteroAlFinDelContrato : 0
  const costosFinancierosRentabilidad = costoCreditoAlMes('rentabilidad', mesAlFinDelContrato) + seguroCostoMensual * mesesSeguroAlFinal
  const costosFinancierosCaja = costoCreditoAlMes('caja', mesAlFinDelContrato) + seguroCuotaMensual * mesesSeguroAlFinal

  const resultadoNeto =
    flujo.ingresoOperativoHumania - otrosCostosAlFinDelContrato - costosRecurrentes.total - costosFinancierosRentabilidad
  const flujoDeCajaNeto =
    flujo.ingresoOperativoHumania - otrosCostosAlFinDelContrato - costosRecurrentes.total - costosFinancierosCaja

  const recursosPropios = recursosPropiosEfectivos(p)

  return {
    flujo,
    inversionInicialTotal: inversion,
    recursosPropios,
    // "Financiado" — 0 en RECURSOS_PROPIOS (nada se financia, todo de contado).
    financiacionBancaria: esRecursosPropios ? 0 : p.principalCreditoBancario,
    principalFinanciacionSeguro: esRecursosPropios ? 0 : p.principalFinanciacionSeguro,
    costosFinancierosRentabilidad,
    costosFinancierosCaja,
    costosRecurrentes,
    paybackOperativo,
    paybackOperativoExtrapolado,
    paybackFlujoContractualCompleto,
    paybackFlujoContractualCompletoExtrapolado,
    paybackFinancieroRentabilidad,
    paybackFinancieroRentabilidadExtrapolado,
    paybackFinancieroCaja,
    paybackFinancieroCajaExtrapolado,
    roiSobreInversionTotal: resultadoNeto / inversion,
    roiSobreRecursosPropios: recursosPropios === 0 ? null : resultadoNeto / recursosPropios,
    resultadoNeto,
    flujoDeCajaNeto,
    margenVentaActivo: margenVentaActivo(p),
    amortizacionNormal: amortizacionCredito,
    amortizacionConAbono,
  }
}
