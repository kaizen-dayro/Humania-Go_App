// Calculadora de Presupuesto (KAI-41) — seguro del activo con datos digitados por presupuesto.
//
// Reglas aprobadas por Humania Go (2026-09-27, spec.md Sección 41):
// 1. La póliza es anual y se renueva cada `periodo` meses (un año) con los mismos valores, como el SOAT.
// 2. El pago inicial de la primera póliza entra a la inversión inicial (con lo financiado, en Crédito).
// 3. El costo de la financiación de cada póliza es la diferencia entre sus cuotas y lo financiado; se
//    reparte en partes iguales entre sus cuotas (la misma estructura lineal del modelo anterior).
// 4. Si el crédito del vehículo termina antes que la financiación del seguro (spec.md 27.5), las cuotas
//    pendientes dejan de contarse (quedan solo como dato informativo) y las renovaciones siguientes, sin
//    crédito vigente, se pagan de contado por el valor de la póliza.
// 5. En Recursos propios la póliza se paga de contado: su valor entra a la inversión y cada renovación
//    cuesta el valor de la póliza.
//
// Funciones puras, sin dependencias del resto del motor: reciben solo los datos del seguro, el periodo
// de renovación, el mes y el mes en que termina el crédito (null = no hay crédito, Recursos propios).

import type { CotizacionSeguro } from '../seguros/adaptador'

export interface SeguroDigitadoParametros {
  /** Valor total de la póliza por un año (lo que se paga de contado). */
  valorPoliza: number
  /** Lo que se paga al contratar (o renovar) la póliza financiada; puede incluir el 4×1000. */
  pagoInicial: number
  /** Parte de la póliza que se paga en cuotas. */
  valorFinanciado: number
  /** Entre 1 y el periodo de renovación: la financiación termina antes de la siguiente renovación. */
  numeroCuotas: number
  /** Valor mensual de cada cuota. */
  valorCuota: number
}

/** Costo de la financiación de UNA póliza: cuotas totales menos lo financiado (la validación exige que no sea negativo). */
export function costoFinanciacionPorPoliza(d: SeguroDigitadoParametros): number {
  return d.numeroCuotas * d.valorCuota - d.valorFinanciado
}

/** Una póliza se financia si es la primera o si se renueva mientras el crédito del vehículo sigue vigente. */
function seFinancia(indice: number, inicio: number, mesFinCredito: number | null): boolean {
  return mesFinCredito !== null && (indice === 0 || inicio < mesFinCredito)
}

/** Cuotas de la póliza que inicia en `inicio` ya pagadas al mes `mesEntero`, cortadas al terminar el crédito (27.5). */
function cuotasContadas(d: SeguroDigitadoParametros, inicio: number, mesEntero: number, mesFinCredito: number): number {
  return Math.max(0, Math.min(d.numeroCuotas, Math.min(mesEntero, mesFinCredito) - inicio))
}

/**
 * Renovaciones de la póliza (desde la segunda) ocurridas al mes `mesEntero`, como costo recurrente (igual
 * que el SOAT: el año 1 ya está en la inversión). Financiada: pago inicial + valor financiado al renovar;
 * de contado (Recursos propios, o renovación posterior al fin del crédito): el valor de la póliza.
 */
export function renovacionesSeguroDigitado(
  d: SeguroDigitadoParametros,
  periodo: number,
  mesEntero: number,
  mesFinCredito: number | null,
): { ocurrenciasAdicionales: number; totalAdicional: number } {
  let ocurrenciasAdicionales = 0
  let totalAdicional = 0
  for (let indice = 1; indice * periodo <= mesEntero; indice++) {
    const inicio = indice * periodo
    ocurrenciasAdicionales++
    totalAdicional += seFinancia(indice, inicio, mesFinCredito) ? d.pagoInicial + d.valorFinanciado : d.valorPoliza
  }
  return { ocurrenciasAdicionales, totalAdicional }
}

/**
 * Costo de financiación acumulado del seguro al mes `mesEntero` (solo Crédito). Vista rentabilidad: la
 * parte de costo de cada cuota (costo de la financiación ÷ cuotas). Vista caja: en la primera póliza, la
 * cuota completa (su capital está en la inversión, igual que el crédito del vehículo); en las renovaciones,
 * solo la parte de costo, porque la prima completa ya se registró como costo recurrente al renovar.
 */
export function costoFinancieroSeguroDigitado(
  d: SeguroDigitadoParametros,
  periodo: number,
  mesEntero: number,
  mesFinCredito: number,
  vista: 'rentabilidad' | 'caja',
): number {
  const costoPorCuota = costoFinanciacionPorPoliza(d) / d.numeroCuotas
  let total = 0
  for (let indice = 0; indice * periodo < mesEntero; indice++) {
    const inicio = indice * periodo
    if (!seFinancia(indice, inicio, mesFinCredito)) continue
    const cuotas = cuotasContadas(d, inicio, mesEntero, mesFinCredito)
    total += cuotas * (vista === 'caja' && indice === 0 ? d.valorCuota : costoPorCuota)
  }
  return total
}

export interface CuotasPendientesSeguro {
  /** Mes en que termina el crédito del vehículo. */
  mes: number
  cuotas: number
  /** Valor nominal de esas cuotas (dato informativo: no se cuenta como costo, spec.md 27.5). */
  monto: number
}

/**
 * Cuotas del seguro que quedan pendientes cuando el crédito del vehículo termina antes que la financiación
 * de la póliza en curso (spec.md 27.5, punto 2). null si no hay crédito o si ninguna queda pendiente.
 */
export function cuotasPendientesAlTerminarCredito(
  d: SeguroDigitadoParametros,
  periodo: number,
  mesFinCredito: number | null,
): CuotasPendientesSeguro | null {
  if (mesFinCredito === null) return null
  for (let indice = 0; indice * periodo < mesFinCredito; indice++) {
    const inicio = indice * periodo
    const fin = inicio + d.numeroCuotas
    if (seFinancia(indice, inicio, mesFinCredito) && mesFinCredito < fin) {
      const cuotas = fin - mesFinCredito
      return { mes: mesFinCredito, cuotas, monto: cuotas * d.valorCuota }
    }
  }
  return null
}

/**
 * Datos iniciales para digitar el seguro a partir de la cotización actual (solo una ayuda de captura: el
 * usuario los revisa y los puede cambiar; una vez en el presupuesto son datos digitados, sin soporte
 * documental). El pago inicial incluye el 4×1000, porque es lo que realmente se paga al contratar. Si la
 * cotización no trae el valor de la póliza, se toma pago inicial + financiado sin el 4×1000. null si la
 * cotización no tiene los datos mínimos (pago inicial y valor financiado).
 */
export function seguroDigitadoDesdeCotizacion(cotizacion: CotizacionSeguro | null): SeguroDigitadoParametros | null {
  if (!cotizacion) return null
  const { pagoInicial, gravamen4x1000, valorFinanciado, numeroCuotas, valorCuota } = cotizacion.entrada
  if (pagoInicial == null || valorFinanciado == null) return null
  return {
    valorPoliza: cotizacion.poliza?.valorPoliza ?? pagoInicial + valorFinanciado,
    pagoInicial: pagoInicial + (gravamen4x1000 ?? 0),
    valorFinanciado,
    numeroCuotas,
    valorCuota,
  }
}

/** Datos vacíos para digitar cuando no hay cotización: la validación pide completarlos (nunca se inventan valores). */
export const SEGURO_DIGITADO_VACIO: SeguroDigitadoParametros = { valorPoliza: 0, pagoInicial: 0, valorFinanciado: 0, numeroCuotas: 0, valorCuota: 0 }
