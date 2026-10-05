// KAI-127 — Estado de cuenta del conductor (SDD `estado-cuenta-conductor`,
// spec.md R5 y R6). Módulo puro: sin Supabase, sin Next.js. Solo decide qué
// registros entran en el periodo elegido y suma los totales.

import { fechaBogota, sumarDias, type TipoPagoSemanal } from './plazo'

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

export interface PagoEstadoCuenta {
  numero_semana: number
  tipo_pago: TipoPagoSemanal
  monto_pagado: number
  /** TIMESTAMPTZ en ISO; `null` en semanas sin pago. */
  fecha_pago: string | null
}

export interface AbonoEstadoCuenta {
  /** TIMESTAMPTZ en ISO. */
  fecha_abono: string
  valor_abono: number
}

export interface EntradaEstadoCuenta {
  /** `asset_assignment_history.fecha_asignacion` (TIMESTAMPTZ en ISO). */
  fechaAsignacion: string
  /** Hoy en Bogotá, `YYYY-MM-DD`. */
  hoy: string
  desde?: string
  hasta?: string
  pagos: PagoEstadoCuenta[]
  abonos: AbonoEstadoCuenta[]
}

export interface ResultadoEstadoCuenta {
  /** Fecha de entrega en Bogotá, `YYYY-MM-DD`. */
  entrega: string
  desde: string
  hasta: string
  /** `desde` > `hasta`: se usa el periodo completo (spec AC-03). */
  rangoInvalido: boolean
  /** `fecha`: fecha del pago en Bogotá, o el inicio de la semana si no hay fecha de pago. */
  pagos: (PagoEstadoCuenta & { fecha: string })[]
  abonos: (AbonoEstadoCuenta & { fecha: string })[]
  totalPagos: number
  totalAbonos: number
}

export function filtrarEstadoCuenta({ fechaAsignacion, hoy, desde, hasta, pagos, abonos }: EntradaEstadoCuenta): ResultadoEstadoCuenta {
  const entrega = fechaBogota(fechaAsignacion) ?? hoy
  const desdePedido = desde && FECHA_ISO.test(desde) ? desde : entrega
  const hastaPedido = hasta && FECHA_ISO.test(hasta) ? hasta : hoy
  const rangoInvalido = desdePedido > hastaPedido
  const d = rangoInvalido ? entrega : desdePedido
  const h = rangoInvalido ? hoy : hastaPedido
  const enRango = (fecha: string | null): fecha is string => !!fecha && fecha >= d && fecha <= h

  // R5: un pago entra por su fecha de pago; una semana sin fecha, por el inicio de esa semana.
  const pagosPeriodo = pagos
    .map(p => ({ ...p, fecha: (p.fecha_pago ? fechaBogota(p.fecha_pago) : sumarDias(entrega, 7 * (p.numero_semana - 1))) as string }))
    .filter(p => enRango(p.fecha))
  const abonosPeriodo = abonos
    .map(a => ({ ...a, fecha: fechaBogota(a.fecha_abono) as string }))
    .filter(a => enRango(a.fecha))

  return {
    entrega,
    desde: d,
    hasta: h,
    rangoInvalido,
    pagos: pagosPeriodo,
    abonos: abonosPeriodo,
    totalPagos: pagosPeriodo.reduce((s, p) => s + Number(p.monto_pagado || 0), 0),
    totalAbonos: abonosPeriodo.reduce((s, a) => s + Number(a.valor_abono || 0), 0),
  }
}
