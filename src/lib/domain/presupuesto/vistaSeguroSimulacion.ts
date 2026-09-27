// Calculadora de Presupuesto (KAI-40, ampliada en KAI-41) — modelo de vista de la tarjeta "Seguro en esta simulación".
//
// Función pura y ESTRICTAMENTE DE PRESENTACIÓN: responde qué seguro usa el cálculo, qué datos vienen de
// la cotización actual y cuáles no tienen soporte documental. Solo ordena y rotula datos que ya existen:
// la columna "usado en el cálculo" sale de los parámetros del modo activo (lo mismo que lee el motor) y la
// columna de la cotización sale de la vista ya construida por `construirVistaCotizacionSeguro` (sin tocar
// sus textos ni sus estados). No calcula indicadores, no modifica parámetros y no cambia ningún resultado.

import type { ParametrosPresupuesto } from './parametros'
import { seguroEfectivo } from './parametros'
import { costoFinanciacionPorPoliza, cuotasPendientesAlTerminarCredito } from './seguroDigitado'
import { TEXTOS_APROBADOS } from './textosInterfaz'
import { TEXTOS_VISTA_COTIZACION, type FilaVistaCotizacion, type VistaCotizacionSeguro } from '../seguros/vistaCotizacion'

const T = TEXTOS_APROBADOS.seguroSimulacion

export interface FilaSeguroUsado {
  etiqueta: string
  /**
   * moneda: pesos COP (`valor`); texto: valor ya rotulado (ej. "72 meses");
   * cuotas: `valor` cuotas de `monto` pesos (la interfaz lo rotula con `cuotasDe`).
   */
  tipo: 'moneda' | 'texto' | 'cuotas'
  valor: number | string
  monto?: number
}

export interface VistaSeguroSimulacion {
  titulo: string
  subtitulo: string
  usado: {
    titulo: string
    /** Estado de los datos usados ("No confirmado", "Sin soporte documental"); null si no aplica. */
    etiqueta: string | null
    filas: FilaSeguroUsado[]
    /** Nota del modo (qué supone el cálculo), o el aviso de que el seguro no entra al resultado. */
    nota: string
  }
  cotizacion: {
    titulo: string
    /** Resumen de la cotización con el estado de CADA dato tal como consta (nunca un estado global). */
    filas: FilaVistaCotizacion[]
    /** Por qué la cotización todavía no entra al cálculo, o el aviso de que no hay cotización cargada. */
    nota: string
    /** Enlace al detalle completo; solo existe cuando hay cotización y la amortización del crédito se muestra. */
    enlaceDetalle: string | null
  }
}

/** Filas del detalle de la cotización que se resumen en la tarjeta, en este orden. */
const FILAS_RESUMEN = [
  TEXTOS_VISTA_COTIZACION.etiquetas.valorPoliza,
  TEXTOS_VISTA_COTIZACION.etiquetas.valorFinanciado,
  TEXTOS_VISTA_COTIZACION.etiquetas.numeroCuotas,
] as const
const TOTAL_RESUMEN = TEXTOS_VISTA_COTIZACION.etiquetas.totalNominal

function columnaUsado(p: ParametrosPresupuesto, mesesCreditoReales: number | null): VistaSeguroSimulacion['usado'] {
  const esCredito = p.modalidadAdquisicion === 'CREDITO'
  const { modo } = p.seguro

  if (modo === 'LEGACY_NO_CONFIRMADO') {
    const efectivo = seguroEfectivo(p)
    return {
      titulo: T.usadoHistorico,
      etiqueta: TEXTOS_APROBADOS.noConfirmado,
      filas: esCredito
        ? [
            { etiqueta: T.capitalFinanciado, tipo: 'moneda', valor: efectivo.principal },
            { etiqueta: T.costoFinancieroEstimado, tipo: 'moneda', valor: efectivo.costoFinancieroTotal },
            { etiqueta: T.plazo, tipo: 'texto', valor: T.plazoMeses(efectivo.plazoMeses) },
          ]
        : [{ etiqueta: T.capitalEnInversion, tipo: 'moneda', valor: efectivo.principal }],
      nota: T.notaHistorico,
    }
  }

  const d = modo === 'DIGITADO' ? p.seguro.digitado : undefined
  if (d) {
    const renovacion: FilaSeguroUsado = { etiqueta: T.renovacion, tipo: 'texto', valor: T.renovacionCada(p.mesesPorAno) }
    if (!esCredito) {
      return {
        titulo: T.usadoDigitado,
        etiqueta: T.sinSoporte,
        filas: [{ etiqueta: T.valorPolizaContado, tipo: 'moneda', valor: d.valorPoliza }, renovacion],
        nota: T.notaDigitadoRecursosPropios,
      }
    }
    const filas: FilaSeguroUsado[] = [
      { etiqueta: T.pagoInicial, tipo: 'moneda', valor: d.pagoInicial },
      { etiqueta: T.valorFinanciado, tipo: 'moneda', valor: d.valorFinanciado },
      { etiqueta: T.cuotas, tipo: 'cuotas', valor: d.numeroCuotas, monto: d.valorCuota },
      { etiqueta: T.costoFinanciacion, tipo: 'moneda', valor: costoFinanciacionPorPoliza(d) },
      renovacion,
    ]
    // Regla 27.5: si el crédito termina con la financiación del seguro en curso, sus cuotas pendientes se informan.
    const pendientes = cuotasPendientesAlTerminarCredito(d, p.mesesPorAno, mesesCreditoReales)
    if (pendientes) filas.push({ etiqueta: T.cuotasPendientes, tipo: 'cuotas', valor: pendientes.cuotas, monto: d.valorCuota })
    return { titulo: T.usadoDigitado, etiqueta: T.sinSoporte, filas, nota: T.notaDigitadoCredito }
  }

  if (modo === 'SIN_SEGURO') return { titulo: T.usadoSinSeguro, etiqueta: null, filas: [], nota: T.notaSinSeguroHumania }
  // SIN_MODELAR (solo presupuestos guardados antes de KAI-41).
  return { titulo: T.usadoNinguno, etiqueta: null, filas: [], nota: T.sinSeguro }
}

/**
 * @param p parámetros del presupuesto mostrado (los mismos con los que se calculó el resultado).
 * @param vistaCotizacion la vista de la cotización de ESTE presupuesto, o null si no tiene cotización.
 * @param hayDetalleAmortizacion true si la página muestra "Amortización del crédito" (y con ella el detalle).
 * @param mesesCreditoReales mes en que termina el crédito del vehículo según el resultado (null sin crédito).
 */
export function construirVistaSeguroSimulacion(
  p: ParametrosPresupuesto,
  vistaCotizacion: VistaCotizacionSeguro | null,
  hayDetalleAmortizacion: boolean,
  mesesCreditoReales: number | null = null,
): VistaSeguroSimulacion {
  const filasCotizacion: FilaVistaCotizacion[] = vistaCotizacion
    ? [
        ...FILAS_RESUMEN.flatMap((etiqueta) => vistaCotizacion.filas.filter((f) => f.etiqueta === etiqueta)),
        ...vistaCotizacion.totales.filter((t) => t.etiqueta === TOTAL_RESUMEN),
      ]
    : []

  return {
    titulo: T.titulo,
    subtitulo: T.subtitulo,
    usado: columnaUsado(p, mesesCreditoReales),
    cotizacion: {
      titulo: T.cotizacion,
      filas: filasCotizacion,
      nota: vistaCotizacion ? T.notaCotizacion : T.sinCotizacion,
      enlaceDetalle: vistaCotizacion && hayDetalleAmortizacion ? T.verDetalle : null,
    },
  }
}
