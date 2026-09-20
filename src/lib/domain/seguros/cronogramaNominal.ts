// KAI-29 — Cronograma NOMINAL de una financiación de seguro
// (spec.md 28.10-28.12; decisión 15 = DIA_5_CADA_MES; decisión 16 = solo
// cronograma nominal).
//
// Función pura: sin Next.js, sin Supabase, sin estado. Recibe los datos
// contractuales/reportados de UNA financiación y devuelve el flujo nominal
// de pagos: pago inicial + cuotas.
//
// Reglas que este módulo respeta (y por qué):
// - NO usa ninguna tasa ni sistema de amortización: la cuota no se divide
//   en capital e intereses (decisión 16). Por eso el resultado no tiene
//   ningún campo de tasa, interés, capital pendiente ni saldo.
// - NO inventa fechas: mientras `fechaPrimeraCuota` sea PENDIENTE (null),
//   las cuotas se identifican solo por su índice relativo (1..n).
// - Vencimiento el día indicado de cada mes (decisión 15): las fechas
//   siguientes conservan el mismo día del mes; nunca se suman 30 días.
// - NO define qué ocurre si el vencimiento cae en día no hábil ni si el día
//   no existe en el mes (R15, BLOQUEADA): en vez de inventar una regla, se
//   rechaza cualquier día mayor a 28, donde esa duda podría aparecer.
// - `costoFinancieroNominalTotal` es solo la diferencia entre la suma
//   nominal de las cuotas y el valor financiado (spec.md 28.5): NO se llama
//   ni se trata como interés.

import type { Periodicidad } from './tipos'

export interface EntradaCronogramaNominal {
  /** Fecha del pago inicial (AAAA-MM-DD). null = pendiente. */
  fechaOperacion?: string | null
  /** Fecha de la primera cuota (AAAA-MM-DD). null = PENDIENTE (no se infiere). */
  fechaPrimeraCuota?: string | null
  numeroCuotas: number
  valorCuota: number
  /** La cotización describe la cuota como "aproximada" (spec.md 26.1). null = no informado. */
  cuotaEsAproximada?: boolean | null
  diaVencimiento: number
  periodicidad: Periodicidad
  pagoInicial?: number | null
  gravamen4x1000?: number | null
  valorFinanciado?: number | null
}

export interface PagoInicialNominal {
  monto: number
  gravamen: number | null
  /** monto + gravamen; null si el gravamen no fue informado. */
  total: number | null
  fecha: string | null
}

export interface CuotaNominal {
  /** Índice relativo de la cuota (1..n). */
  indice: number
  monto: number
  /** null mientras `fechaPrimeraCuota` sea PENDIENTE. */
  fecha: string | null
  /** Estado derivado de si la fecha puede o no determinarse (no implica pagada ni vencida). */
  estado: 'SIN_FECHA' | 'CON_FECHA'
}

export interface CronogramaNominal {
  pagoInicial: PagoInicialNominal | null
  cuotas: CuotaNominal[]
  totalCuotasNominal: number
  /** totalCuotasNominal − valorFinanciado; null si no se informó el valor financiado. NO es interés. */
  costoFinancieroNominalTotal: number | null
  /** total del pago inicial + totalCuotasNominal; null si el pago inicial total no es determinable. */
  totalNominal: number | null
  cuotaEsAproximada: boolean | null
  /** Notas para quien consuma el cronograma (no son textos de interfaz). */
  advertencias: string[]
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

interface FechaCivil {
  y: number
  m: number
  d: number
}

function parseFecha(valor: string, nombre: string): FechaCivil {
  const r = RE_FECHA.exec(valor)
  if (!r) throw new RangeError(`${nombre} debe tener formato AAAA-MM-DD (recibido: ${valor})`)
  const y = Number(r[1])
  const m = Number(r[2])
  const d = Number(r[3])
  const control = new Date(Date.UTC(y, m - 1, d))
  if (control.getUTCFullYear() !== y || control.getUTCMonth() !== m - 1 || control.getUTCDate() !== d) {
    throw new RangeError(`${nombre} no es una fecha válida (${valor})`)
  }
  return { y, m, d }
}

const dos = (n: number) => String(n).padStart(2, '0')

/** Suma meses de calendario conservando el día (válido porque el día es ≤ 28). */
function sumarMeses(base: FechaCivil, meses: number): string {
  const total = base.m - 1 + meses
  const y = base.y + Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${dos(m)}-${dos(base.d)}`
}

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function exigirNoNegativo(valor: number | null | undefined, nombre: string): void {
  if (valor != null && (!Number.isFinite(valor) || valor < 0)) {
    throw new RangeError(`${nombre} no puede ser negativo ni no finito (recibido: ${valor})`)
  }
}

export function generarCronogramaNominal(entrada: EntradaCronogramaNominal): CronogramaNominal {
  const { numeroCuotas, valorCuota, diaVencimiento, periodicidad } = entrada

  if (periodicidad !== 'MENSUAL') {
    throw new RangeError(`periodicidad no soportada: ${String(periodicidad)} (solo MENSUAL está documentada)`)
  }
  if (!Number.isInteger(numeroCuotas) || numeroCuotas < 1) {
    throw new RangeError(`numeroCuotas debe ser un entero mayor o igual a 1 (recibido: ${numeroCuotas})`)
  }
  if (!Number.isFinite(valorCuota) || valorCuota <= 0) {
    throw new RangeError(`valorCuota debe ser mayor que 0 (recibido: ${valorCuota})`)
  }
  if (!Number.isInteger(diaVencimiento) || diaVencimiento < 1 || diaVencimiento > 31) {
    throw new RangeError(`diaVencimiento debe ser un entero entre 1 y 31 (recibido: ${diaVencimiento})`)
  }
  if (diaVencimiento > 28) {
    throw new RangeError(
      `diaVencimiento ${diaVencimiento}: la regla para fechas inexistentes en algún mes está PENDIENTE (R15); no se inventa`,
    )
  }
  exigirNoNegativo(entrada.pagoInicial, 'pagoInicial')
  exigirNoNegativo(entrada.gravamen4x1000, 'gravamen4x1000')
  exigirNoNegativo(entrada.valorFinanciado, 'valorFinanciado')

  const advertencias: string[] = []

  // Fecha de la primera cuota: dato PENDIENTE; si llega, debe coincidir con el día de vencimiento.
  let base: FechaCivil | null = null
  if (entrada.fechaPrimeraCuota) {
    base = parseFecha(entrada.fechaPrimeraCuota, 'fechaPrimeraCuota')
    if (base.d !== diaVencimiento) {
      throw new RangeError(
        `fechaPrimeraCuota (${entrada.fechaPrimeraCuota}) no coincide con el día de vencimiento ${diaVencimiento}`,
      )
    }
  } else {
    advertencias.push('fecha_primera_cuota PENDIENTE: las cuotas se identifican por índice relativo, sin fecha.')
  }

  const cuotas: CuotaNominal[] = []
  for (let i = 1; i <= numeroCuotas; i++) {
    const fecha = base ? sumarMeses(base, i - 1) : null
    cuotas.push({ indice: i, monto: redondear2(valorCuota), fecha, estado: fecha ? 'CON_FECHA' : 'SIN_FECHA' })
  }
  const totalCuotasNominal = redondear2(valorCuota * numeroCuotas)

  const cuotaEsAproximada = entrada.cuotaEsAproximada ?? null
  if (cuotaEsAproximada === true) {
    advertencias.push('Valor de cuota aproximado: los totales derivados heredan la aproximación.')
  }

  // Pago inicial: solo si fue informado (nunca se rellena por defecto).
  let pagoInicial: PagoInicialNominal | null = null
  if (entrada.pagoInicial != null) {
    const gravamen = entrada.gravamen4x1000 ?? null
    const fecha = entrada.fechaOperacion ? formatearFechaValidada(entrada.fechaOperacion, 'fechaOperacion') : null
    pagoInicial = {
      monto: redondear2(entrada.pagoInicial),
      gravamen: gravamen === null ? null : redondear2(gravamen),
      total: gravamen === null ? null : redondear2(entrada.pagoInicial + gravamen),
      fecha,
    }
    if (gravamen === null) advertencias.push('Gravamen 4×1000 no informado: el pago inicial total no es determinable.')
    if (fecha === null) advertencias.push('Fecha de operación PENDIENTE: el pago inicial no tiene fecha.')
  }

  const costoFinancieroNominalTotal =
    entrada.valorFinanciado != null ? redondear2(totalCuotasNominal - entrada.valorFinanciado) : null
  if (costoFinancieroNominalTotal !== null && costoFinancieroNominalTotal < 0) {
    advertencias.push('La suma nominal de las cuotas es menor que el valor financiado: revisar los datos de origen.')
  }

  const totalNominal = pagoInicial && pagoInicial.total !== null ? redondear2(pagoInicial.total + totalCuotasNominal) : null

  return { pagoInicial, cuotas, totalCuotasNominal, costoFinancieroNominalTotal, totalNominal, cuotaEsAproximada, advertencias }
}

function formatearFechaValidada(valor: string, nombre: string): string {
  const f = parseFecha(valor, nombre)
  return `${f.y}-${dos(f.m)}-${dos(f.d)}`
}
