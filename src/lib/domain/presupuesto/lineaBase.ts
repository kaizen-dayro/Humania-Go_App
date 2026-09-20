// KAI-29 — Línea base financiera protegida (red de seguridad permanente, CI).
//
// Este módulo NO contiene fórmulas financieras. Consume las mismas funciones
// que la calculadora (`calcularMetricas`, `inversionInicial`) y compara sus
// resultados contra valores ESPERADOS versionados en `lineaBase.json`.
// Cualquier cambio en un resultado protegido debe ser una decisión explícita
// y revisable en Git (spec.md 33): nunca se regenera automáticamente.
//
// Qué protege (50 combinaciones = 25 escenarios × 2 valores de semanas
// aplazatorias, exactamente el conjunto histórico validado):
// - Escalares: inversión inicial, recursos propios, financiación, costos
//   financieros y recurrentes, paybacks, ROI, resultado neto, flujo de caja,
//   duración contractual, duración real del crédito (`mesesCreditoReales`,
//   `creditoSobreviveAlContrato`, PR #16), meses del cronograma con abono, etc.
// - Series completas: las cuatro series semanales del flujo y los cronogramas
//   de amortización (incluido el saldo mes a mes, del que sale el saldo al
//   cierre). Cada serie queda protegida por una HUELLA (sha256) de toda la
//   serie, más huellas por bloque (52 semanas o 12 meses) y puntos de muestra
//   para diagnosticar dónde empieza la diferencia.
//
// Tolerancias (las mismas que ya usan las suites de `verificar:presupuesto`):
// - enteros (semanas, meses, paybacks…), booleanos y null: igualdad EXACTA;
// - montos y razones: diferencia absoluta <= 1e-4.
// La huella de las series se calcula sobre los valores redondeados a 4
// decimales (la escala de esa tolerancia): una diferencia < 5e-5 no cambia la
// huella; una >= 1e-4 sí. Nota: un valor exactamente en la frontera de un
// redondeo podría alterar la huella con una diferencia menor que la tolerancia
// (falso positivo extremadamente improbable; se corregiría con una revisión
// explícita, nunca con una tolerancia más amplia).

import { createHash } from 'node:crypto'
import { calcularMetricas } from './metricas'
import { PARAMETROS_REFERENCIA, conSeguroLegacy, inversionInicial, type ParametrosPresupuesto } from './parametros'

export const TOLERANCIA_ABSOLUTA = 1e-4
export const SEMANAS_APLAZATORIAS_LINEA_BASE = [0, 6] as const
export const BLOQUE_SERIE_LARGA = 52 // semanas (series de más de 100 posiciones)
export const BLOQUE_SERIE_CORTA = 12 // meses (cronogramas de amortización)
const UMBRAL_SERIE_LARGA = 100

// ===== Definición de los 25 escenarios protegidos =====
// Cada escenario es un CAMBIO sobre PARAMETROS_REFERENCIA. Los plazos de crédito
// (plazo_N y venta_70M_plazo_60) fijan también el plazo del seguro, como en la
// línea base histórica (cuando el seguro heredaba el plazo del crédito).

export interface EscenarioLineaBase {
  /** Identificador estable (es la clave de `lineaBase.json`). */
  id: string
  descripcion: string
  parametros: (referencia: ParametrosPresupuesto) => ParametrosPresupuesto
}

const conAbono = (pct: number, inicio: number) => (p: ParametrosPresupuesto): ParametrosPresupuesto => ({ ...p, porcentajeAbonoCapital: pct, mesInicioAbonoCapital: inicio })
const conPlazoAcoplado = (meses: number, cambios: Partial<ParametrosPresupuesto> = {}) => (p: ParametrosPresupuesto): ParametrosPresupuesto =>
  conSeguroLegacy({ ...p, ...cambios, mesesCreditoVehiculo: meses }, { plazoMeses: meses })

export const ESCENARIOS_LINEA_BASE: EscenarioLineaBase[] = [
  { id: 'referencia', descripcion: 'Escenario de referencia, sin abono (0%)', parametros: (p) => p },
  { id: 'recursos_propios', descripcion: 'Recursos Propios, sin abono', parametros: (p) => ({ ...p, modalidadAdquisicion: 'RECURSOS_PROPIOS' }) },
  ...[0.5, 1, 2, 5].flatMap((pct) =>
    [1, 3, 10].map((ini) => ({
      id: `abono_${pct}_ini_${ini}`,
      descripcion: `Abono ${pct * 100}% desde el mes ${ini}`,
      parametros: conAbono(pct, ini),
    })),
  ),
  ...[36, 60, 72, 84].map((m) => ({ id: `plazo_${m}`, descripcion: `Crédito (y seguro) a ${m} meses`, parametros: conPlazoAcoplado(m) })),
  { id: 'seguro_cero', descripcion: 'Seguro legacy con capital y costo en cero', parametros: (p) => conSeguroLegacy(p, { principalFinanciacion: 0, costoFinancieroEstimado: 0 }) },
  { id: 'seguro_solo_capital', descripcion: 'Seguro legacy solo con capital (costo en cero)', parametros: (p) => conSeguroLegacy(p, { costoFinancieroEstimado: 0 }) },
  { id: 'seguro_otro', descripcion: 'Seguro legacy con capital 1.000.000 y costo 700.000', parametros: (p) => conSeguroLegacy(p, { principalFinanciacion: 1_000_000, costoFinancieroEstimado: 700_000 }) },
  { id: 'cuota_500k', descripcion: 'Cuota semanal del conductor de 500.000', parametros: (p) => ({ ...p, cuotaSemanalConductor: 500_000 }) },
  { id: 'venta_70M_contrato_largo', descripcion: 'Valor de venta contractual 70.000.000 (contrato de ~76 meses)', parametros: (p) => ({ ...p, valorVentaContractualActivo: 70_000_000 }) },
  { id: 'venta_70M_plazo_60', descripcion: 'Valor de venta 70.000.000 con crédito (y seguro) a 60 meses', parametros: conPlazoAcoplado(60, { valorVentaContractualActivo: 70_000_000 }) },
  { id: 'rp_abono', descripcion: 'Recursos Propios con abono 200%', parametros: (p) => ({ ...p, modalidadAdquisicion: 'RECURSOS_PROPIOS', porcentajeAbonoCapital: 2 }) },
]

export interface CombinacionLineaBase {
  clave: string
  escenario: EscenarioLineaBase
  semanasAplazatorias: number
  etiqueta: string
}

/** Las 50 combinaciones protegidas (25 escenarios × 2 variantes de semanas aplazatorias). */
export function combinacionesLineaBase(): CombinacionLineaBase[] {
  return ESCENARIOS_LINEA_BASE.flatMap((escenario) =>
    SEMANAS_APLAZATORIAS_LINEA_BASE.map((semanas) => ({
      clave: `${escenario.id}|aplaz${semanas}`,
      escenario,
      semanasAplazatorias: semanas,
      etiqueta: `"${escenario.id}" (${escenario.descripcion}; semanas aplazatorias: ${semanas})`,
    })),
  )
}

// ===== Huella de un resultado =====

export interface HuellaSerie {
  n: number
  bloque: number
  sha256: string
  /** Primeros 12 hex del sha256 de cada bloque. */
  bloques: string[]
  /** Valor (redondeado a 6 decimales) al inicio de cada bloque y en la última posición. */
  muestras: Array<number | null>
}

export interface HuellaCombinacion {
  escalares: Record<string, number | boolean | null>
  series: Record<string, HuellaSerie>
}

export interface LineaBase {
  meta: {
    modelo: string
    tolerancia_absoluta: number
    semanas_aplazatorias: number[]
    escenarios: number
    combinaciones: number
    origen: string
    nota: string
  }
  combinaciones: Record<string, HuellaCombinacion>
}

// Resultados que no forman parte de lo protegido: informativos o no financieros.
const EXCLUIDOS_RAIZ = new Set(['datosNoConfirmados', 'seguroNominal', '_inversion'])

const sha = (texto: string) => createHash('sha256').update(texto).digest('hex')

function formatoValor(v: number | null): string {
  if (v === null) return 'null'
  const t = v.toFixed(4)
  return t === '-0.0000' ? '0.0000' : t
}

const redondear6 = (v: number | null): number | null => (v === null ? null : Math.round(v * 1e6) / 1e6)

function tamanoBloque(n: number): number {
  return n > UMBRAL_SERIE_LARGA ? BLOQUE_SERIE_LARGA : BLOQUE_SERIE_CORTA
}

/** Posiciones (0-based) de las muestras: inicio de cada bloque y última posición. */
export function posicionesMuestra(n: number, bloque: number): number[] {
  const pos: number[] = []
  for (let i = 0; i < n; i += bloque) pos.push(i)
  if (n > 0 && pos[pos.length - 1] !== n - 1) pos.push(n - 1)
  return pos
}

export function huellaDeSerie(valores: Array<number | null>): HuellaSerie {
  const n = valores.length
  const bloque = tamanoBloque(n)
  const texto = valores.map(formatoValor)
  const bloques: string[] = []
  for (let i = 0; i < n; i += bloque) bloques.push(sha(texto.slice(i, i + bloque).join(',')).slice(0, 12))
  return { n, bloque, sha256: sha(texto.join(',')), bloques, muestras: posicionesMuestra(n, bloque).map((i) => redondear6(valores[i])) }
}

function ordenarClaves<T>(objeto: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(objeto).sort().map((k) => [k, objeto[k]]))
}

const esSerieNumerica = (a: unknown[]): a is Array<number | null> => a.every((v) => v === null || typeof v === 'number')

/**
 * Extrae la huella de un resultado de `calcularMetricas` (o de su versión serializada
 * a JSON: es la misma estructura). Escalares exactos y series completas por huella.
 */
export function extraerHuella(resultado: Record<string, unknown>, inversion: number): HuellaCombinacion {
  const escalares: Record<string, number | boolean | null> = { inversionInicial: inversion }
  const crudas: Record<string, Array<number | null>> = {}

  const recorrer = (valor: unknown, ruta: string): void => {
    if (valor === null || typeof valor === 'number' || typeof valor === 'boolean') {
      escalares[ruta] = valor
      return
    }
    if (valor === undefined || typeof valor === 'string') return
    if (Array.isArray(valor)) {
      if (esSerieNumerica(valor)) {
        crudas[ruta] = valor
        return
      }
      const campos = new Set<string>()
      for (const fila of valor) if (fila && typeof fila === 'object') Object.keys(fila).forEach((c) => campos.add(c))
      for (const campo of campos) {
        const columna = valor.map((fila) => (fila as Record<string, unknown>)[campo])
        if (!esSerieNumerica(columna)) throw new Error(`Tipo de columna no soportado en la línea base: ${ruta}[].${campo}`)
        crudas[`${ruta}[].${campo}`] = columna
      }
      return
    }
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (ruta === '' && EXCLUIDOS_RAIZ.has(clave)) continue
      recorrer(v, ruta === '' ? clave : `${ruta}.${clave}`)
    }
  }
  recorrer(resultado, '')

  const series: Record<string, HuellaSerie> = {}
  for (const [ruta, valores] of Object.entries(crudas)) series[ruta] = huellaDeSerie(valores)
  return { escalares: ordenarClaves(escalares), series: ordenarClaves(series) }
}

/** Calcula la huella de una combinación con el MISMO código que usa la calculadora. */
export function calcularHuellaCombinacion(c: CombinacionLineaBase): HuellaCombinacion {
  const parametros = c.escenario.parametros(PARAMETROS_REFERENCIA)
  const resultado = calcularMetricas(parametros, c.semanasAplazatorias)
  return extraerHuella(JSON.parse(JSON.stringify(resultado)) as Record<string, unknown>, inversionInicial(parametros))
}

// ===== Comparación =====

const PATRON_ENTERO_EXACTO =
  /(^|\.)(payback[A-Za-z]*|mesesReales|mesesAhorrados|mesPagoCompleto|duracionContratoSemanas|semanasAdquisicionCompletas|ocurrenciasAdicionales|mesesCreditoReales)$/

/** Enteros de conteo (semanas, meses, paybacks): igualdad exacta. Montos y razones: tolerancia absoluta. */
export function esEnteroExacto(ruta: string): boolean {
  return PATRON_ENTERO_EXACTO.test(ruta)
}

const num = (v: number | boolean | null | undefined) => (v === undefined ? 'ausente' : String(v))

function unidadSerie(ruta: string): { singular: string; plural: string } {
  if (ruta.startsWith('flujo.')) return { singular: 'semana', plural: 'semanas' }
  if (ruta.includes('cronograma')) return { singular: 'mes', plural: 'meses' }
  return { singular: 'posición', plural: 'posiciones' }
}

/**
 * Compara una huella obtenida contra la esperada. Devuelve un mensaje por cada diferencia
 * (vacío = idéntica dentro de las tolerancias). Cada mensaje indica escenario, métrica o
 * serie, valor esperado, valor obtenido y diferencia.
 */
export function compararConLineaBase(etiqueta: string, esperado: HuellaCombinacion, obtenido: HuellaCombinacion): string[] {
  const errores: string[] = []

  for (const ruta of new Set([...Object.keys(esperado.escalares), ...Object.keys(obtenido.escalares)])) {
    const e = esperado.escalares[ruta]
    const o = obtenido.escalares[ruta]
    if (e === undefined || o === undefined) {
      errores.push(`Escenario ${etiqueta} / ${ruta}: esperado ${num(e)}, obtenido ${num(o)} (la métrica ${e === undefined ? 'no estaba' : 'ya no está'} en la línea base)`)
    } else if (typeof e === 'number' && typeof o === 'number') {
      const dif = Math.abs(o - e)
      const fuera = esEnteroExacto(ruta) ? o !== e : dif > TOLERANCIA_ABSOLUTA
      if (fuera) errores.push(`Escenario ${etiqueta} / ${ruta}: esperado ${e}, obtenido ${o}, diferencia ${dif}`)
    } else if (e !== o) {
      errores.push(`Escenario ${etiqueta} / ${ruta}: esperado ${num(e)}, obtenido ${num(o)}`)
    }
  }

  for (const ruta of new Set([...Object.keys(esperado.series), ...Object.keys(obtenido.series)])) {
    const e = esperado.series[ruta]
    const o = obtenido.series[ruta]
    if (!e || !o) {
      errores.push(`Escenario ${etiqueta} / serie ${ruta}: ${!e ? 'no estaba en la línea base' : 'ya no está en el resultado'}`)
      continue
    }
    if (e.n !== o.n) {
      errores.push(`Escenario ${etiqueta} / serie ${ruta}: longitud esperada ${e.n}, obtenida ${o.n}`)
      continue
    }
    if (e.sha256 === o.sha256) continue

    const u = unidadSerie(ruta)
    const primerBloque = e.bloques.findIndex((h, i) => h !== o.bloques[i])
    const desde = primerBloque * e.bloque + 1
    const hasta = Math.min((primerBloque + 1) * e.bloque, e.n)
    const pos = posicionesMuestra(e.n, e.bloque)
    let detalle = ''
    for (let k = 0; k < pos.length; k++) {
      const ve = e.muestras[k]
      const vo = o.muestras[k]
      if (ve === null || vo === null ? ve !== vo : Math.abs(vo - ve) > TOLERANCIA_ABSOLUTA) {
        const dif = ve === null || vo === null ? 'n/a' : String(Math.abs(vo - ve))
        detalle = `; primera muestra distinta en la ${u.singular} ${pos[k] + 1}: esperado ${num(ve)}, obtenido ${num(vo)}, diferencia ${dif}`
        break
      }
    }
    if (detalle === '') detalle = '; ninguna muestra difiere, la diferencia está dentro del bloque (ver rango)'
    errores.push(
      `Escenario ${etiqueta} / serie ${ruta}: la huella de la serie completa difiere (${e.n} posiciones). ` +
        `Primer bloque distinto: ${u.plural} ${desde}–${hasta}${detalle}`,
    )
  }
  return errores
}
