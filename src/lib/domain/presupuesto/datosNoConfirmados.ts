// KAI-29 — Marcado ADITIVO de datos no confirmados (spec.md 25.4, 27.4, 29;
// plan.md 12.5 M1/M3 y 14). Función pura, sin efecto sobre ningún cálculo:
// solo informa qué datos usa (o tiene estructurados) el modelo del seguro y
// qué estado documental tiene cada uno.
//
// Distingue dos orígenes (spec.md 29.1):
// - MODELO_LEGACY: valores históricos del seguro que SÍ alimentan el cálculo
//   (`integradoEnCalculo: true`), estado LEGACY_NO_CONFIRMADO. Son los que
//   obligan a mostrar MODELO CON DATOS NO CONFIRMADOS.
// - COTIZACION: datos de la financiación vigente (dominio `seguros`). Están
//   estructurados pero NO entran a ningún indicador (`integradoEnCalculo:
//   false`): conservan el estado documental con que se registraron
//   (CONFIRMADO_POR_COTIZACION, REPORTADO_SIN_SOPORTE_DOCUMENTAL…). Nunca se
//   promueven a CONFIRMADO_DOCUMENTALMENTE (spec.md 25.7).
//
// `indicadoresAfectados` de los datos legacy se obtuvo variando SOLO el dato
// en el motor y comparando todas las salidas (spec.md 25.4, plan.md 12.2); la
// verificación `verificar:presupuesto` comprueba que la lista sigue siendo un
// superconjunto de lo que realmente cambia.

import type { EstadoDato } from '../seguros/tipos'
import type { ParametrosPresupuesto } from './parametros'

export type ClasificacionOrigen = 'RESIDUAL_NO_DETERMINADO'

export type OrigenDato =
  | 'MODELO_LEGACY' // valor histórico del modelo anterior
  | 'COTIZACION' // dato de la financiación vigente (dominio seguros)
  | 'SEGURO_NO_MODELADO' // el seguro no entra al modelo (modo SIN_MODELAR)

export interface DatoNoConfirmado {
  /** Dato del modelo del seguro (ruta dentro de `ParametrosPresupuesto.seguro`). */
  campo: string
  estado: EstadoDato
  origen: OrigenDato
  /** true = el dato alimenta el cálculo; false = está estructurado o ausente pero NO entra a ningún indicador. */
  integradoEnCalculo: boolean
  clasificacionOrigen?: ClasificacionOrigen
  /** Salidas de `ResultadoMetricas` que dependen de este dato (vacío si no está integrado). */
  indicadoresAfectados: string[]
}

const CAPITAL_SEGURO_CREDITO = [
  'inversionInicialTotal',
  'principalFinanciacionSeguro',
  'costosFinancierosCaja',
  'flujoDeCajaNeto',
  'roiSobreInversionTotal',
  'paybackOperativo',
  'paybackOperativoExtrapolado',
  'paybackFlujoContractualCompleto',
  'paybackFlujoContractualCompletoExtrapolado',
  'paybackFinancieroRentabilidad',
  'paybackFinancieroRentabilidadExtrapolado',
  'paybackFinancieroCaja',
  'paybackFinancieroCajaExtrapolado',
]

const CAPITAL_SEGURO_RECURSOS_PROPIOS = [
  'inversionInicialTotal',
  'recursosPropios',
  'roiSobreInversionTotal',
  'roiSobreRecursosPropios',
  'paybackOperativo',
  'paybackOperativoExtrapolado',
  'paybackFlujoContractualCompleto',
  'paybackFlujoContractualCompletoExtrapolado',
  'paybackFinancieroRentabilidad',
  'paybackFinancieroRentabilidadExtrapolado',
  'paybackFinancieroCaja',
  'paybackFinancieroCajaExtrapolado',
]

const COSTO_SEGURO_CREDITO = [
  'costosFinancierosRentabilidad',
  'costosFinancierosCaja',
  'resultadoNeto',
  'flujoDeCajaNeto',
  'roiSobreInversionTotal',
  'roiSobreRecursosPropios',
  'paybackFinancieroRentabilidad',
  'paybackFinancieroRentabilidadExtrapolado',
  'paybackFinancieroCaja',
  'paybackFinancieroCajaExtrapolado',
]

/**
 * Datos del modelo del seguro y su estado. Un dato legacy solo se lista si
 * realmente influye en el resultado (valor > 0 y modalidad en la que interviene).
 */
export function calcularDatosNoConfirmados(p: ParametrosPresupuesto): DatoNoConfirmado[] {
  const datos: DatoNoConfirmado[] = []
  const esCredito = p.modalidadAdquisicion === 'CREDITO'
  const { modo, legacy, cotizacion } = p.seguro

  if (modo === 'LEGACY_NO_CONFIRMADO') {
    if (legacy.principalFinanciacion > 0) {
      datos.push({
        campo: 'seguro.legacy.principalFinanciacion',
        estado: 'LEGACY_NO_CONFIRMADO',
        origen: 'MODELO_LEGACY',
        integradoEnCalculo: true,
        clasificacionOrigen: 'RESIDUAL_NO_DETERMINADO',
        indicadoresAfectados: esCredito ? CAPITAL_SEGURO_CREDITO : CAPITAL_SEGURO_RECURSOS_PROPIOS,
      })
    }

    if (esCredito && legacy.costoFinancieroEstimado > 0) {
      datos.push({
        campo: 'seguro.legacy.costoFinancieroEstimado',
        estado: 'LEGACY_NO_CONFIRMADO',
        origen: 'MODELO_LEGACY',
        integradoEnCalculo: true,
        indicadoresAfectados: COSTO_SEGURO_CREDITO,
      })
    }

    // Plazo propio del seguro (ya no acoplado al del crédito). Sigue sin soporte: solo importa si se calcula costo del seguro.
    if (esCredito && (legacy.principalFinanciacion > 0 || legacy.costoFinancieroEstimado > 0)) {
      datos.push({
        campo: 'seguro.legacy.plazoMeses',
        estado: 'LEGACY_NO_CONFIRMADO',
        origen: 'MODELO_LEGACY',
        integradoEnCalculo: true,
        indicadoresAfectados: COSTO_SEGURO_CREDITO,
      })
    }
  } else {
    // SIN_MODELAR: el seguro no entra a ningún indicador. Se deja constancia para que un resultado
    // sin seguro no se confunda con un resultado que incluye un seguro de costo cero.
    datos.push({
      campo: 'seguro',
      estado: 'PENDIENTE',
      origen: 'SEGURO_NO_MODELADO',
      integradoEnCalculo: false,
      indicadoresAfectados: [],
    })
  }

  // Datos de la financiación vigente: estructurados, con su estado real, sin entrar al cálculo.
  if (cotizacion) {
    for (const [campo, estado] of Object.entries(cotizacion.estadoDatos)) {
      if (!estado) continue
      datos.push({
        campo: `seguro.cotizacion.${campo}`,
        estado,
        origen: 'COTIZACION',
        integradoEnCalculo: false,
        indicadoresAfectados: [],
      })
    }
  }

  return datos
}

/**
 * true si el cálculo usa algún dato sin soporte documental definitivo — la
 * condición para mostrar `MODELO CON DATOS NO CONFIRMADOS` (spec.md 27.4).
 * Los datos de la cotización que no entran al cálculo no la activan.
 */
export function hayDatosNoConfirmadosEnCalculo(datos: DatoNoConfirmado[]): boolean {
  return datos.some((d) => d.integradoEnCalculo && d.estado !== 'CONFIRMADO_DOCUMENTALMENTE')
}
