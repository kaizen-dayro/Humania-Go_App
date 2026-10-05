// KAI-128 — Acumulado para la compra y saldo del valor de venta (SDD
// `valores-compra-contrato`, spec.md R3-R5).
//
// Módulo puro: sin Supabase, sin Next.js. La autoridad de los valores
// guardados es PostgreSQL (migración 00083); esto solo calcula al leer.
//
// - D3: acumulado = semanas ordinarias pagadas × aporte semanal + abonos
//   extraordinarios. Las aplazatorias y las semanas sin pago no suman
//   (Cláusula Novena del contrato).
// - D4: el depósito inicial no cuenta (es un fondo de garantía, Cláusula
//   Décima Séptima).
// - D2: el aporte se separa en ahorro (se devuelve si el contrato termina sin
//   compra) y bono contractual (condicionado al cumplimiento).

export interface EntradaCompra {
  valorVenta: number | null
  aporteAhorroSemanal: number | null
  aporteBonoSemanal: number | null
  /** Semanas NORMAL registradas (`calcularPlazo().ordinariasPagadas`). */
  ordinariasPagadas: number
  /** Suma de los abonos extraordinarios vigentes. */
  totalAbonos: number
}

export interface ResultadoCompra {
  valorVenta: number
  aporteSemanal: number
  acumuladoAhorro: number
  acumuladoBono: number
  abonos: number
  /** Ahorro + bono + abonos. */
  acumulado: number
  /** máx(0, valor de venta − acumulado). */
  saldo: number
  /** Acumulado / valor de venta, entre 0 y 1. */
  avance: number
}

/** `null` mientras los valores de compra no estén registrados. */
export function calcularCompra({ valorVenta, aporteAhorroSemanal, aporteBonoSemanal, ordinariasPagadas, totalAbonos }: EntradaCompra): ResultadoCompra | null {
  if (valorVenta === null || aporteAhorroSemanal === null || aporteBonoSemanal === null) return null
  const venta = Number(valorVenta)
  const ahorro = Number(aporteAhorroSemanal)
  const bono = Number(aporteBonoSemanal)
  if (!(venta > 0) || !(ahorro >= 0) || !(bono >= 0)) return null

  const semanas = Math.max(0, ordinariasPagadas)
  const abonos = Math.max(0, Number(totalAbonos) || 0)
  const acumuladoAhorro = semanas * ahorro
  const acumuladoBono = semanas * bono
  const acumulado = acumuladoAhorro + acumuladoBono + abonos

  return {
    valorVenta: venta,
    aporteSemanal: ahorro + bono,
    acumuladoAhorro,
    acumuladoBono,
    abonos,
    acumulado,
    saldo: Math.max(0, venta - acumulado),
    avance: Math.min(1, acumulado / venta),
  }
}
