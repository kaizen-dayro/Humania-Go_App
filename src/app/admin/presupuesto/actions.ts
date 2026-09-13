'use server'

// Calculadora de Presupuesto (KAI-29) — persistencia de presupuestos
// financieros (D5, spec.md Sección 11). El cálculo NUNCA se confía al
// cliente: `guardarPresupuesto` recibe solo `parametros` y recalcula
// `resultados` aquí mismo con `calcularMetricas` antes de insertar —
// mismo criterio de "el frontend nunca es la autoridad del cálculo"
// usado en el resto del panel (plan.md Sección 6).

import { createClient } from '@/utils/supabase/server'
import { calcularMetricas } from '@/lib/domain/presupuesto/metricas'
import { validarParametros, type ParametrosPresupuesto } from '@/lib/domain/presupuesto/parametros'

const FINANCIAL_MODEL_VERSION = 'Humania Go Financial Model v1.0'

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

export async function guardarPresupuesto(parametros: ParametrosPresupuesto, semanasAplazatoriasUsadas: number, etiqueta?: string) {
  const { supabase, session, autorizado } = await requireSuperAdmin()
  if (!session) return { success: false, error: 'No autorizado.' }
  if (!autorizado) return { success: false, error: 'No autorizado: solo un SUPER_ADMIN puede guardar presupuestos.' }

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
