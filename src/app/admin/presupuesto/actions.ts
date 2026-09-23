'use server'

// Calculadora de Presupuesto (KAI-29) — persistencia de presupuestos
// financieros (D5, spec.md Sección 11). El cálculo NUNCA se confía al
// cliente: `guardarPresupuesto` recibe solo `parametros` y recalcula
// `resultados` aquí mismo con `calcularMetricas` antes de insertar —
// mismo criterio de "el frontend nunca es la autoridad del cálculo"
// usado en el resto del panel (plan.md Sección 6).

import { createClient } from '@/utils/supabase/server'
import { calcularMetricas } from '@/lib/domain/presupuesto/metricas'
import type { ResultadoGuardado } from '@/lib/domain/presupuesto/compararHistorico'
import { clavesDesconocidas } from '@/lib/domain/presupuesto/esquemaSnapshot'
import { validarParametros, type ParametrosPresupuesto } from '@/lib/domain/presupuesto/parametros'
import { reconocerSnapshot, type ResultadoReconocimientoSnapshot } from '@/lib/domain/presupuesto/reconocerSnapshot'
import { FINANCIAL_MODEL_VERSION } from '@/lib/domain/presupuesto/version'
import { leerCotizacionSeguroVigente } from './cotizacionSeguro'

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { supabase, session: null, autorizado: false as const }

  const { data: caller } = await supabase.from('admin_users').select('role, activo').eq('id', session.user.id).single()
  const autorizado = !!caller && caller.activo && caller.role === 'SUPER_ADMIN'
  return { supabase, session, autorizado }
}

export async function guardarPresupuesto(parametrosCliente: ParametrosPresupuesto, semanasAplazatoriasUsadas: number, etiqueta?: string) {
  const { supabase, session, autorizado } = await requireSuperAdmin()
  if (!session) return { success: false, error: 'No autorizado.' }
  if (!autorizado) return { success: false, error: 'No autorizado: solo un SUPER_ADMIN puede guardar presupuestos.' }

  // KAI-29 B2 (plan.md 18.6/18.2, spec.md 38.7): a diferencia de `reconocerSnapshot` (que
  // al CARGAR tolera una clave de más porque puede ser dato histórico legítimo), un objeto
  // recién construido por la propia interfaz nunca debería traer una clave que
  // `ParametrosPresupuesto` no conoce — si la trae, es un request manipulado o un bug, y se
  // rechaza, nunca se guarda ni parcial ni silenciosamente filtrado.
  const clavesInesperadas = clavesDesconocidas(parametrosCliente as unknown as Record<string, unknown>)
  if (clavesInesperadas.length > 0) {
    return { success: false, error: `parametros contiene clave(s) no permitida(s): ${clavesInesperadas.join(', ')}` }
  }

  // La cotización del seguro es INFORMATIVA (no entra a ningún indicador) y la base de datos es la
  // autoridad: se descarta la que traiga el cliente y se relee aquí (regla 1 de CLAUDE.md).
  const lecturaCotizacion = await leerCotizacionSeguroVigente(supabase)
  if (lecturaCotizacion.estado === 'ERROR') console.error('No se pudo leer la cotización del seguro al guardar:', lecturaCotizacion.mensaje)
  const parametros: ParametrosPresupuesto = {
    ...parametrosCliente,
    seguro: { ...parametrosCliente.seguro, cotizacion: lecturaCotizacion.cotizacion },
  }

  const errores = validarParametros(parametros)
  if (errores.length > 0) {
    return { success: false, error: `Parámetros inválidos: ${errores.join('; ')}` }
  }
  if (!Number.isInteger(semanasAplazatoriasUsadas) || semanasAplazatoriasUsadas < 0) {
    return { success: false, error: 'semanasAplazatoriasUsadas debe ser un entero mayor o igual a 0.' }
  }

  const resultados = calcularMetricas(parametros, semanasAplazatoriasUsadas)
  // Las series semana a semana (serieIngresoOperativoAcumulado/
  // serieIngresoOperativoExtrapolada/serieFlujoContractualAcumulado/
  // serieFlujoContractualExtrapolado, hasta 900 posiciones cada una) y
  // los cronogramas completos de amortización (amortizacionNormal/
  // amortizacionConAbono, hasta 72 filas cada uno) son detalle
  // intermedio de simulación, no parte del resultado que el usuario
  // revisa — se excluyen del snapshot persistido (lista blanca
  // explícita abajo) para no guardar miles de números irrelevantes por
  // fila; siempre se pueden regenerar recalculando desde `parametros`
  // con el mismo `financial_model_version`.
  const resultadosSinSeries = {
    inversionInicialTotal: resultados.inversionInicialTotal,
    recursosPropios: resultados.recursosPropios,
    financiacionBancaria: resultados.financiacionBancaria,
    principalFinanciacionSeguro: resultados.principalFinanciacionSeguro,
    costosFinancierosRentabilidad: resultados.costosFinancierosRentabilidad,
    costosFinancierosCaja: resultados.costosFinancierosCaja,
    costosRecurrentes: resultados.costosRecurrentes,
    paybackOperativo: resultados.paybackOperativo,
    paybackOperativoExtrapolado: resultados.paybackOperativoExtrapolado,
    paybackFlujoContractualCompleto: resultados.paybackFlujoContractualCompleto,
    paybackFlujoContractualCompletoExtrapolado: resultados.paybackFlujoContractualCompletoExtrapolado,
    paybackFinancieroRentabilidad: resultados.paybackFinancieroRentabilidad,
    paybackFinancieroRentabilidadExtrapolado: resultados.paybackFinancieroRentabilidadExtrapolado,
    paybackFinancieroCaja: resultados.paybackFinancieroCaja,
    paybackFinancieroCajaExtrapolado: resultados.paybackFinancieroCajaExtrapolado,
    roiSobreInversionTotal: resultados.roiSobreInversionTotal,
    roiSobreRecursosPropios: resultados.roiSobreRecursosPropios,
    resultadoNeto: resultados.resultadoNeto,
    flujoDeCajaNeto: resultados.flujoDeCajaNeto,
    margenVentaActivo: resultados.margenVentaActivo,
    // Marcado aditivo (spec.md 27.4): las filas guardadas antes de este campo lo
    // tienen ausente y se consideran modelo legacy; nunca se reescriben.
    datosNoConfirmados: resultados.datosNoConfirmados,
  }
  const { flujo } = resultados
  const flujoSinSeries = {
    duracionContratoSemanas: flujo.duracionContratoSemanas,
    adquisicion: flujo.adquisicion,
    flujoContractualTotal: flujo.flujoContractualTotal,
    equityAdministradoAcumulado: flujo.equityAdministradoAcumulado,
    ingresoOperativoHumania: flujo.ingresoOperativoHumania,
    ingresoAplazatoriasAcumulado: flujo.ingresoAplazatoriasAcumulado,
  }
  const resultadosParaGuardar = { ...resultadosSinSeries, flujo: flujoSinSeries }

  const { data, error } = await supabase
    .from('presupuestos_financieros')
    .insert({
      financial_model_version: FINANCIAL_MODEL_VERSION,
      etiqueta: etiqueta?.trim() || null,
      parametros,
      semanas_aplazatorias_usadas: semanasAplazatoriasUsadas,
      resultados: resultadosParaGuardar,
      creado_por: session.user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error guardando presupuesto financiero:', error)
    return { success: false, error: error.message }
  }

  return { success: true, id: data.id, resultados }
}

export async function listarPresupuestos() {
  const { supabase, session, autorizado } = await requireSuperAdmin()
  if (!session) return { success: false, error: 'No autorizado.', presupuestos: [] }
  if (!autorizado) return { success: false, error: 'No autorizado: solo un SUPER_ADMIN puede ver presupuestos guardados.', presupuestos: [] }

  const { data, error } = await supabase
    .from('presupuestos_financieros')
    .select('id, financial_model_version, etiqueta, semanas_aplazatorias_usadas, resultados, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error listando presupuestos financieros:', error)
    return { success: false, error: error.message, presupuestos: [] }
  }

  return { success: true, presupuestos: data || [] }
}

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * KAI-29 B2 (plan.md 18.2, spec.md 38.7) — lectura por `id` de un presupuesto guardado
 * para "abrir" (B3, sin implementar todavía). Reutiliza `reconocerSnapshot` (B1) para
 * decidir si el snapshot puede reconstruirse de forma determinista: esta función NO
 * reimplementa reconocimiento, normalización ni validación de `parametros`.
 *
 * `resultadosHistoricos` es exclusivamente el resultado guardado al momento de guardar
 * (decisión 2, spec.md 38.2): se devuelve solo para comparar contra lo que el motor actual
 * recalcule (compararHistorico.ts, B1) — nunca entra a `reconocerSnapshot` ni participa en
 * la reconstrucción de `parametros`.
 *
 * Solo lectura: sin UPDATE ni DELETE, sin fila nueva, sin tocar el estado actual de nadie
 * — si algo falla, la función simplemente informa el motivo real.
 */
export type ResultadoObtenerPresupuesto =
  | { estado: 'NO_AUTORIZADO' }
  | { estado: 'ID_INVALIDO' }
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'ERROR'; mensaje: string }
  | Exclude<ResultadoReconocimientoSnapshot, { estado: 'DETERMINISTA' }>
  | {
      estado: 'OK'
      id: string
      etiqueta: string | null
      financialModelVersion: string
      semanasAplazatoriasUsadas: number
      parametros: ParametrosPresupuesto
      resultadosHistoricos: ResultadoGuardado
      versionConocida: boolean
      clavesIgnoradas: readonly string[]
      createdAt: string
    }

export async function obtenerPresupuesto(id: string): Promise<ResultadoObtenerPresupuesto> {
  const { supabase, session, autorizado } = await requireSuperAdmin()
  if (!session || !autorizado) return { estado: 'NO_AUTORIZADO' }

  if (typeof id !== 'string' || !REGEX_UUID.test(id)) return { estado: 'ID_INVALIDO' }

  const { data, error } = await supabase
    .from('presupuestos_financieros')
    .select('id, financial_model_version, etiqueta, parametros, semanas_aplazatorias_usadas, resultados, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('Error leyendo presupuesto financiero:', error)
    return { estado: 'ERROR', mensaje: error.message }
  }
  if (!data) return { estado: 'NO_ENCONTRADO' }

  const reconocido = reconocerSnapshot(data.parametros, data.financial_model_version)
  if (reconocido.estado !== 'DETERMINISTA') return reconocido

  if (!Number.isInteger(data.semanas_aplazatorias_usadas) || data.semanas_aplazatorias_usadas < 0) {
    return { estado: 'DATOS_INVALIDOS', errores: ['semanas_aplazatorias_usadas debe ser un entero mayor o igual a 0'] }
  }

  return {
    estado: 'OK',
    id: data.id,
    etiqueta: data.etiqueta,
    financialModelVersion: data.financial_model_version,
    semanasAplazatoriasUsadas: data.semanas_aplazatorias_usadas,
    parametros: reconocido.parametros,
    resultadosHistoricos: data.resultados as ResultadoGuardado,
    versionConocida: reconocido.versionConocida,
    clavesIgnoradas: reconocido.clavesIgnoradas,
    createdAt: data.created_at,
  }
}
