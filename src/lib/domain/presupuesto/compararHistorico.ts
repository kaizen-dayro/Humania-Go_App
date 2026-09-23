// Calculadora de Presupuesto (KAI-29) — Presupuestos guardados: B1, dominio puro
// (spec.md Sección 38.5, "Resultado histórico frente a resultado actual"; plan.md
// Sección 18.4). DISEÑO APROBADO 2026-09-20. Módulo puro, SIN dependencias de Node:
// no importa `lineaBase.ts` (usa `node:crypto`, no corre en el cliente) — por eso
// `TOLERANCIA_COMPARACION` se duplica aquí; `verificacionPresupuestosGuardados.ts`
// (Node) exige que valga lo mismo que `TOLERANCIA_ABSOLUTA`.
//
// `resultados` de una fila guardada NUNCA participa en la reconstrucción
// (`reconocerSnapshot.ts`) — este módulo es la ÚNICA función que lo lee, y solo
// para comparar contra lo que el motor actual recalcula. Nunca escribe, nunca
// decide si un snapshot es válido.

import type { AdquisicionActivo } from './flujoDeCaja'
import type { CostosRecurrentes, ResultadoMetricas } from './metricas'

/** Misma tolerancia que `TOLERANCIA_ABSOLUTA` (lineaBase.ts) — no se amplía. */
export const TOLERANCIA_COMPARACION = 1e-4

/** Subconjunto de `FlujoContractual` que persiste `guardarPresupuesto` (actions.ts). */
export interface FlujoGuardado {
  duracionContratoSemanas: number
  adquisicion: AdquisicionActivo
  flujoContractualTotal: number
  equityAdministradoAcumulado: number
  ingresoOperativoHumania: number
  ingresoAplazatoriasAcumulado: number
}

/**
 * Forma de `resultados` tal como la persiste `guardarPresupuesto` hoy (actions.ts):
 * 22 de las 27 claves de `ResultadoMetricas` (spec.md 38.1) — nunca las series
 * semana a semana ni los cronogramas completos. `datosNoConfirmados` puede estar
 * ausente en filas anteriores al marcado aditivo (spec.md 27.4) — union con
 * `Partial` en vez de opcional para dejar explícito que puede faltar en JSON real,
 * no solo en el tipo.
 */
export type ResultadoGuardado = Omit<
  ResultadoMetricas,
  | 'flujo'
  | 'amortizacionNormal'
  | 'amortizacionConAbono'
  | 'seguroNominal'
  | 'mesesCreditoReales'
  | 'creditoSobreviveAlContrato'
> & {
  costosRecurrentes: CostosRecurrentes
  flujo: FlujoGuardado
  datosNoConfirmados?: ResultadoMetricas['datosNoConfirmados']
}

/** Claves de `ResultadoGuardado` que NUNCA se comparan (informativas, no financieras). */
const CLAVES_EXCLUIDAS = new Set(['datosNoConfirmados'])

export interface DiferenciaComparacion {
  /** Ruta con notación de puntos, ej. "flujo.adquisicion.cuotaFinalAdquisicion". */
  clave: string
  historico: number | boolean | string | null
  actual: number | boolean | string | null
  /** Diferencia absoluta cuando ambos son número; null si no aplica (booleano/string/uno de los dos null). */
  diferencia: number | null
}

export interface ResultadoComparacionHistorico {
  /** NO_COMPARABLE cuando ninguna clave resultó comparable (no es lo mismo que "coincide"). */
  estado: 'COINCIDE' | 'DIFIERE' | 'NO_COMPARABLE'
  diferencias: readonly DiferenciaComparacion[]
  /** Claves que existen en el resultado actual pero no en el histórico (fila anterior a ese campo) — nunca cuentan como diferencia. */
  clavesNoComparables: readonly string[]
  mensaje: string
}

type Hoja = number | boolean | string | null

function esHoja(valor: unknown): valor is Hoja {
  return valor === null || typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'string'
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Recorre un objeto y devuelve sus hojas comparables como pares [ruta, valor] — arrays y claves excluidas se omiten. */
function hojasComparables(obj: Record<string, unknown>, prefijo = ''): Array<[string, Hoja]> {
  const salida: Array<[string, Hoja]> = []
  for (const [clave, valor] of Object.entries(obj)) {
    if (prefijo === '' && CLAVES_EXCLUIDAS.has(clave)) continue
    const ruta = prefijo ? `${prefijo}.${clave}` : clave
    if (esHoja(valor)) salida.push([ruta, valor])
    else if (esObjetoPlano(valor)) salida.push(...hojasComparables(valor, ruta))
    // Arrays (ninguno queda hoy fuera de CLAVES_EXCLUIDAS): se ignoran, nunca se comparan a ciegas.
  }
  return salida
}

/**
 * Compara el resultado guardado (histórico) contra el que produce el motor actual
 * para el mismo snapshot reconstruido. Nunca decide si el snapshot es válido — eso
 * ya lo resolvió `reconocerSnapshot`. Nunca modifica ni el histórico ni el actual.
 */
export function compararResultados(historico: ResultadoGuardado, actual: ResultadoMetricas): ResultadoComparacionHistorico {
  const hojasHistorico = new Map(hojasComparables(historico as unknown as Record<string, unknown>))
  const hojasActual = new Map(hojasComparables(actual as unknown as Record<string, unknown>))

  const diferencias: DiferenciaComparacion[] = []
  const clavesNoComparables: string[] = []

  for (const [clave, valorActual] of hojasActual) {
    if (!hojasHistorico.has(clave)) {
      clavesNoComparables.push(clave)
      continue
    }
    const valorHistorico = hojasHistorico.get(clave) as Hoja
    const ambosNumeros = typeof valorHistorico === 'number' && typeof valorActual === 'number'
    const diferencia = ambosNumeros ? Math.abs((valorActual as number) - (valorHistorico as number)) : null
    const difiere = ambosNumeros ? (diferencia as number) > TOLERANCIA_COMPARACION : valorHistorico !== valorActual
    if (difiere) diferencias.push({ clave, historico: valorHistorico, actual: valorActual, diferencia })
  }

  const clavesComparadas = hojasActual.size - clavesNoComparables.length
  const estado: ResultadoComparacionHistorico['estado'] =
    clavesComparadas === 0 ? 'NO_COMPARABLE' : diferencias.length > 0 ? 'DIFIERE' : 'COINCIDE'

  const mensaje =
    estado === 'COINCIDE'
      ? 'Resultado actual coincide con el resultado histórico.'
      : estado === 'DIFIERE'
        ? 'El resultado cambia respecto al histórico porque el modelo actual produce un resultado diferente.'
        // Texto provisional (no aprobado, pendiente igual que el resto de textos nuevos — spec.md 38.7):
        // ningún dato del histórico pudo compararse (forma completamente distinta a la actual).
        : 'No hay datos comparables entre el resultado histórico y el resultado actual.'

  return { estado, diferencias, clavesNoComparables, mensaje }
}
