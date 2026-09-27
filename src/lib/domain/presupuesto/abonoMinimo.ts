// Calculadora de Presupuesto (KAI-29) — D6, abono mínimo requerido para cumplir la política D8
// (spec.md 39.2, 39.8.1 y 39.9; plan.md 19.F.2 y 19.K).
//
// Consulta pura: evalúa `calcularMetricas` con distintos `porcentajeAbonoCapital` (la MISMA
// semántica del campo existente: % de la cuota mensual original, 100% a capital, reducción de
// plazo, desde `mesInicioAbonoCapital`) y nunca modifica los parámetros recibidos.
//
// Validez de la búsqueda binaria (spec.md 39.8.1, demostrado sobre las fórmulas actuales): el ROI
// sobre inversión total es no decreciente en el abono y el payback contractual no depende de él,
// así que "cumple" es un escalón monótono. Si el motor cambia en alguna de las condiciones de
// validez de 39.8.1, las pruebas de `verificacionAbonoMinimo.ts` fallan antes de llegar a CI verde.

import { calcularMetricas, type ResultadoMetricas } from './metricas'
import { PORCENTAJE_ABONO_CAPITAL_MAXIMO, validarParametros, type ParametrosPresupuesto } from './parametros'
import { evaluarPolitica, validarPolitica, type EvaluacionPolitica, type PoliticaFinanciera } from './politicaFinanciera'

/** Resolución de la búsqueda: pasos de 0,1% (1 / 1000 como fracción de la cuota). */
export const PASOS_POR_UNIDAD_ABONO = 1000
/** Último paso de la grilla: 500% = 5000 pasos. */
export const PASO_MAXIMO_ABONO = Math.round(PORCENTAJE_ABONO_CAPITAL_MAXIMO * PASOS_POR_UNIDAD_ABONO)

export interface DetalleAbono {
  /** Fracción de la cuota mensual original (1 = 100%). */
  porcentaje: number
  /** porcentaje × cuota mensual original del crédito, en pesos por mes. */
  montoMensual: number
  mesInicio: number
  roi: number
  payback: number | null
  mesesReales: number
  mesesAhorrados: number
  ahorroIntereses: number
  /** Informativo: D8 no usa la caja (spec.md 39.2.1). */
  flujoDeCajaNeto: number
  evaluacion: EvaluacionPolitica
}

export type ResultadoAbonoMinimo =
  | { estado: 'YA_CUMPLE_SIN_ABONO'; detalle: DetalleAbono }
  | { estado: 'ENCONTRADO'; detalle: DetalleAbono; evaluaciones: number }
  | { estado: 'NO_ALCANZABLE_POR_PAYBACK'; evaluacionSinAbono: EvaluacionPolitica }
  | { estado: 'NO_ALCANZABLE_POR_ROI'; roiConAbonoMaximo: number; roiMinimo: number; porcentajeMaximo: number }
  /** KAI-42: ni con el abono máximo el crédito queda pagado dentro del contrato. */
  | { estado: 'NO_ALCANZABLE_POR_CONTRATO'; porcentajeMaximo: number }
  | { estado: 'NO_APLICA_RECURSOS_PROPIOS' }
  | { estado: 'PARAMETROS_INVALIDOS'; errores: string[] }
  /** Salvaguarda: la verificación final de minimalidad falló (no debería ocurrir, 39.8.1). Nunca se devuelve un abono sin verificar. */
  | { estado: 'ERROR_MONOTONIA'; detalle: string }

/** Parámetros con el abono dado (copia: nunca muta la entrada). */
export function conAbono(p: ParametrosPresupuesto, porcentaje: number): ParametrosPresupuesto {
  return { ...p, porcentajeAbonoCapital: porcentaje }
}

function detalle(p: ParametrosPresupuesto, porcentaje: number, r: ResultadoMetricas, evaluacion: EvaluacionPolitica): DetalleAbono {
  const cuotaMensual = r.amortizacionNormal?.cuotaMensual ?? 0
  const conAbonoActivo = r.amortizacionConAbono
  return {
    porcentaje,
    montoMensual: porcentaje * cuotaMensual,
    mesInicio: p.mesInicioAbonoCapital,
    roi: r.roiSobreInversionTotal,
    payback: r.paybackFlujoContractualCompleto,
    mesesReales: conAbonoActivo ? conAbonoActivo.mesesReales : p.mesesCreditoVehiculo,
    mesesAhorrados: conAbonoActivo ? conAbonoActivo.mesesAhorrados : 0,
    ahorroIntereses: conAbonoActivo ? conAbonoActivo.ahorroIntereses : 0,
    flujoDeCajaNeto: r.flujoDeCajaNeto,
    evaluacion,
  }
}

/**
 * Menor abono de la grilla {0; 0,1%; …; 500%} con el que la operación cumple la política
 * (ROI ≥ mínimo y payback ≤ máximo) y el contrato (crédito pagado antes de terminar el contrato,
 * KAI-42), manteniendo el mes de inicio configurado. Las tres condiciones son escalones monótonos
 * en el abono (más abono nunca baja el ROI, no mueve el payback y nunca alarga el crédito), así que
 * su conjunción también lo es y la búsqueda binaria sigue siendo exacta.
 */
export function calcularAbonoMinimo(p: ParametrosPresupuesto, semanasAplazatoriasUsadas: number, politica: PoliticaFinanciera): ResultadoAbonoMinimo {
  const errores = [...validarParametros(p), ...validarPolitica(politica)]
  if (errores.length > 0) return { estado: 'PARAMETROS_INVALIDOS', errores }
  if (p.modalidadAdquisicion === 'RECURSOS_PROPIOS') return { estado: 'NO_APLICA_RECURSOS_PROPIOS' }

  const cache = new Map<number, { r: ResultadoMetricas; e: EvaluacionPolitica }>()
  const evaluar = (paso: number) => {
    let v = cache.get(paso)
    if (!v) {
      const r = calcularMetricas(conAbono(p, paso / PASOS_POR_UNIDAD_ABONO), semanasAplazatoriasUsadas)
      v = { r, e: evaluarPolitica(r, politica) }
      cache.set(paso, v)
    }
    return v
  }
  const cumple = (paso: number) => {
    const { e } = evaluar(paso)
    return e.cumpleRoi && e.cumplePayback && e.cumpleContrato
  }

  const base = evaluar(0)
  // El abono no mueve el payback contractual (39.8.1): si no cumple sin abono, no cumple con ninguno.
  if (!base.e.cumplePayback) return { estado: 'NO_ALCANZABLE_POR_PAYBACK', evaluacionSinAbono: base.e }
  if (base.e.cumpleRoi && base.e.cumpleContrato) return { estado: 'YA_CUMPLE_SIN_ABONO', detalle: detalle(p, 0, base.r, base.e) }

  const tope = evaluar(PASO_MAXIMO_ABONO)
  if (!tope.e.cumpleContrato) return { estado: 'NO_ALCANZABLE_POR_CONTRATO', porcentajeMaximo: PORCENTAJE_ABONO_CAPITAL_MAXIMO }
  if (!tope.e.cumpleRoi) {
    return { estado: 'NO_ALCANZABLE_POR_ROI', roiConAbonoMaximo: tope.e.roi, roiMinimo: tope.e.roiMinimo, porcentajeMaximo: PORCENTAJE_ABONO_CAPITAL_MAXIMO }
  }

  // Invariante: `bajo` no cumple, `alto` cumple.
  let bajo = 0
  let alto = PASO_MAXIMO_ABONO
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2)
    if (cumple(medio)) alto = medio
    else bajo = medio
  }

  // Verificación final de minimalidad: el encontrado cumple y el paso anterior no.
  if (!cumple(alto) || cumple(alto - 1)) {
    return {
      estado: 'ERROR_MONOTONIA',
      detalle: `La verificación de minimalidad falló en ${alto / 10}% (cumple: ${cumple(alto)}; ${(alto - 1) / 10}% cumple: ${cumple(alto - 1)}).`,
    }
  }
  const encontrado = evaluar(alto)
  return { estado: 'ENCONTRADO', detalle: detalle(p, alto / PASOS_POR_UNIDAD_ABONO, encontrado.r, encontrado.e), evaluaciones: cache.size }
}

/** Referencia exhaustiva (solo para pruebas): recorre toda la grilla de 0,1% y devuelve el primer paso que cumple, o null. */
export function abonoMinimoExhaustivo(p: ParametrosPresupuesto, semanasAplazatoriasUsadas: number, politica: PoliticaFinanciera): number | null {
  for (let paso = 0; paso <= PASO_MAXIMO_ABONO; paso++) {
    const r = calcularMetricas(conAbono(p, paso / PASOS_POR_UNIDAD_ABONO), semanasAplazatoriasUsadas)
    const e = evaluarPolitica(r, politica)
    if (e.cumpleRoi && e.cumplePayback && e.cumpleContrato) return paso
  }
  return null
}

export type ResultadoAbonoContrato =
  | { estado: 'SIN_CREDITO' }
  | { estado: 'CUMPLE_SIN_ABONO' }
  | { estado: 'ENCONTRADO'; porcentaje: number; montoMensual: number; mesInicio: number }
  | { estado: 'NO_ALCANZABLE'; porcentajeMaximo: number; mesInicio: number }

/**
 * KAI-42 — Menor abono de la grilla con el que el crédito queda pagado dentro del contrato, SOLO por la
 * regla contractual (sin la política). Es lo que informa la alerta del contrato. Monótono: más abono
 * nunca alarga el crédito. Nunca modifica los parámetros recibidos.
 */
export function abonoMinimoContrato(p: ParametrosPresupuesto, semanasAplazatoriasUsadas: number): ResultadoAbonoContrato {
  if (p.modalidadAdquisicion !== 'CREDITO') return { estado: 'SIN_CREDITO' }
  const sobrevive = (paso: number) => calcularMetricas(conAbono(p, paso / PASOS_POR_UNIDAD_ABONO), semanasAplazatoriasUsadas).creditoSobreviveAlContrato
  if (!sobrevive(0)) return { estado: 'CUMPLE_SIN_ABONO' }
  if (sobrevive(PASO_MAXIMO_ABONO)) return { estado: 'NO_ALCANZABLE', porcentajeMaximo: PORCENTAJE_ABONO_CAPITAL_MAXIMO, mesInicio: p.mesInicioAbonoCapital }
  let bajo = 0
  let alto = PASO_MAXIMO_ABONO
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2)
    if (sobrevive(medio)) bajo = medio
    else alto = medio
  }
  const porcentaje = alto / PASOS_POR_UNIDAD_ABONO
  const cuotaMensual = calcularMetricas(p, semanasAplazatoriasUsadas).amortizacionNormal?.cuotaMensual ?? 0
  return { estado: 'ENCONTRADO', porcentaje, montoMensual: porcentaje * cuotaMensual, mesInicio: p.mesInicioAbonoCapital }
}
