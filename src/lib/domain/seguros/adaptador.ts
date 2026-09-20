// KAI-29 — Adaptador entre una financiación de seguro registrada (fila de
// `financiaciones_seguro`, migración 00076) y el cronograma nominal
// (spec.md 28.10-28.12, decisión 16).
//
// Función pura: sin Next.js, sin Supabase. NO lee la base de datos: recibe
// la fila ya leída (la lectura vive en app/admin/presupuesto/cotizacionSeguro.ts).
// Es integración de DATOS (plan.md 15/16): ningún resultado financiero depende
// de este módulo.
//
// Reglas que respeta:
// - No inventa datos: si falta un dato indispensable del cronograma
//   (número de cuotas, valor de la cuota, día de vencimiento, periodicidad)
//   no hay cotización utilizable y devuelve null.
// - No promueve estados: el estado de cada dato se copia tal cual desde
//   `estado_datos_campos`; nada se convierte en CONFIRMADO_DOCUMENTALMENTE.
// - No usa tasa, sistema de amortización ni valores legacy.

import { generarCronogramaNominal, type CronogramaNominal, type EntradaCronogramaNominal } from './cronogramaNominal'
import type { EstadoDato } from './tipos'

/** Subconjunto de `public.financiaciones_seguro` que consume el cronograma nominal. */
export interface FinanciacionSeguroRegistro {
  valor_financiado: number | string | null
  pago_inicial: number | string | null
  gravamen_4x1000: number | string | null
  numero_cuotas: number | string | null
  periodicidad: string | null
  dia_vencimiento: number | string | null
  cuota_valor: number | string | null
  cuota_es_aproximada: boolean | null
  fecha_inicio: string | null
  fecha_primera_cuota: string | null
  estado_datos_campos: Record<string, unknown> | null
}

/**
 * Datos nominales de una financiación de seguro tal como los conoce el
 * sistema, más el estado documental de cada dato. Es INFORMATIVO: no entra
 * a ningún indicador de la calculadora (spec.md 29.2).
 */
export interface CotizacionSeguro {
  entrada: EntradaCronogramaNominal
  /** Estado documental por dato, con el nombre del campo de `entrada`. */
  estadoDatos: Partial<Record<keyof EntradaCronogramaNominal, EstadoDato>>
}

const ESTADOS_VALIDOS: ReadonlySet<string> = new Set<EstadoDato>([
  'CONFIRMADO_POR_COTIZACION',
  'CONFIRMADO_DOCUMENTALMENTE',
  'REPORTADO_SIN_SOPORTE_DOCUMENTAL',
  'DERIVADO',
  'DERIVADA_POR_COTIZACION',
  'LEGACY_NO_CONFIRMADO',
  'PENDIENTE',
])

// Columna de la base de datos -> campo de la entrada nominal.
const COLUMNA_A_CAMPO: Record<string, keyof EntradaCronogramaNominal> = {
  valor_financiado: 'valorFinanciado',
  pago_inicial: 'pagoInicial',
  gravamen_4x1000: 'gravamen4x1000',
  numero_cuotas: 'numeroCuotas',
  periodicidad: 'periodicidad',
  dia_vencimiento: 'diaVencimiento',
  cuota_valor: 'valorCuota',
  cuota_es_aproximada: 'cuotaEsAproximada',
  fecha_inicio: 'fechaOperacion',
  fecha_primera_cuota: 'fechaPrimeraCuota',
}

// NUMERIC puede llegar como cadena desde el cliente; se convierte sin inventar: null sigue siendo null.
function aNumero(valor: number | string | null): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : null
}

/**
 * Convierte una fila de `financiaciones_seguro` en los datos nominales.
 * Devuelve null si falta algún dato indispensable del cronograma: sin
 * cuotas, valor de cuota, día de vencimiento y periodicidad no hay flujo
 * nominal y no se rellena con valores por defecto.
 */
export function cotizacionDesdeRegistro(registro: FinanciacionSeguroRegistro): CotizacionSeguro | null {
  const numeroCuotas = aNumero(registro.numero_cuotas)
  const valorCuota = aNumero(registro.cuota_valor)
  const diaVencimiento = aNumero(registro.dia_vencimiento)
  if (numeroCuotas === null || valorCuota === null || diaVencimiento === null || registro.periodicidad === null) return null

  const entrada: EntradaCronogramaNominal = {
    numeroCuotas,
    valorCuota,
    diaVencimiento,
    periodicidad: registro.periodicidad as EntradaCronogramaNominal['periodicidad'],
    cuotaEsAproximada: registro.cuota_es_aproximada,
    valorFinanciado: aNumero(registro.valor_financiado),
    pagoInicial: aNumero(registro.pago_inicial),
    gravamen4x1000: aNumero(registro.gravamen_4x1000),
    fechaOperacion: registro.fecha_inicio,
    fechaPrimeraCuota: registro.fecha_primera_cuota,
  }

  const estadoDatos: CotizacionSeguro['estadoDatos'] = {}
  for (const [columna, estado] of Object.entries(registro.estado_datos_campos ?? {})) {
    const campo = COLUMNA_A_CAMPO[columna]
    // Solo se copian estados del vocabulario oficial; un valor desconocido no se interpreta.
    if (campo && typeof estado === 'string' && ESTADOS_VALIDOS.has(estado)) estadoDatos[campo] = estado as EstadoDato
  }
  return { entrada, estadoDatos }
}

export interface ResultadoCronogramaSeguro {
  cronograma: CronogramaNominal | null
  /** Motivo por el cual los datos no producen un cronograma (dato inválido). Nunca se oculta. */
  error: string | null
}

/** Cronograma nominal a partir de los datos de una financiación; un dato inválido se informa, no se corrige ni lanza. */
export function calcularCronogramaSeguro(cotizacion: CotizacionSeguro): ResultadoCronogramaSeguro {
  try {
    return { cronograma: generarCronogramaNominal(cotizacion.entrada), error: null }
  } catch (err) {
    return { cronograma: null, error: err instanceof Error ? err.message : String(err) }
  }
}

// ===== Selección de la financiación vigente (lectura desde el servidor, plan.md 15/16) =====

/**
 * Columnas de `financiaciones_seguro` que necesita el adaptador. Fuente única:
 * la usan la lectura del servidor y las pruebas contra el esquema real.
 */
export const COLUMNAS_FINANCIACION_COTIZACION =
  'id, valor_financiado, pago_inicial, gravamen_4x1000, numero_cuotas, periodicidad, dia_vencimiento, cuota_valor, cuota_es_aproximada, fecha_inicio, fecha_primera_cuota, estado_datos_campos'

export type FinanciacionSeguroFila = FinanciacionSeguroRegistro & { id: string }

export type EstadoLecturaCotizacion =
  | 'SIN_COTIZACION' // no hay ninguna financiación ACTIVE
  | 'CARGADA' // exactamente una, con los datos indispensables
  | 'DATOS_INCOMPLETOS' // exactamente una, pero le faltan datos indispensables del cronograma
  | 'VARIAS_ACTIVAS' // más de una: no se adivina cuál usar
  | 'ERROR' // la lectura falló (lo asigna quien lee la base de datos)

export interface LecturaCotizacion {
  estado: EstadoLecturaCotizacion
  financiacionId: string | null
  cotizacion: CotizacionSeguro | null
  /** Motivo real cuando no hay cotización utilizable. Nunca se sustituye por un texto genérico. */
  mensaje: string | null
}

/**
 * Decide cuál financiación alimenta `seguro.cotizacion`. Hoy la calculadora
 * modela una sola operación y no está ligada a un activo, así que solo se usa
 * la financiación cuando existe EXACTAMENTE una activa; con varias no se elige
 * ninguna (elegir una sería un supuesto: hace falta un selector por activo).
 */
export function resolverLecturaCotizacion(filasActivas: FinanciacionSeguroFila[]): LecturaCotizacion {
  if (filasActivas.length === 0) {
    return { estado: 'SIN_COTIZACION', financiacionId: null, cotizacion: null, mensaje: null }
  }
  if (filasActivas.length > 1) {
    return {
      estado: 'VARIAS_ACTIVAS',
      financiacionId: null,
      cotizacion: null,
      mensaje: `Hay ${filasActivas.length} financiaciones de seguro activas; no se elige ninguna automáticamente.`,
    }
  }
  const fila = filasActivas[0]
  const cotizacion = cotizacionDesdeRegistro(fila)
  if (!cotizacion) {
    return {
      estado: 'DATOS_INCOMPLETOS',
      financiacionId: fila.id,
      cotizacion: null,
      mensaje: 'La financiación activa no tiene todos los datos indispensables del cronograma (número de cuotas, valor de cuota, día de vencimiento, periodicidad).',
    }
  }
  return { estado: 'CARGADA', financiacionId: fila.id, cotizacion, mensaje: null }
}
