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
 * (ROI ≥ mínimo y payback ≤ máximo), manteniendo el mes de inicio configurado.
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
    return e.cumpleRoi && e.cumplePayback
  }

  const base = evaluar(0)
  // El abono no mueve el payback contractual (39.8.1): si no cumple sin abono, no cumple con ninguno.
  if (!base.e.cumplePayback) return { estado: 'NO_ALCANZABLE_POR_PAYBACK', evaluacionSinAbono: base.e }
  if (base.e.cumpleRoi) return { estado: 'YA_CUMPLE_SIN_ABONO', detalle: detalle(p, 0, base.r, base.e) }

  const tope = evaluar(PASO_MAXIMO_ABONO)
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
    if (e.cumpleRoi && e.cumplePayback) return paso
  }
  return null
}
