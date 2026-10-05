'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

/**
 * Cliente con Secret key: exclusivamente server-side, para URLs firmadas
 * de Storage (mismo patron que web/src/app/admin/actions.ts).
 */
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Actualiza la cuota semanal/aplazatoria acordada para un ciclo de
 * contrato (asset_assignment_history). KAI-30, spec.md 4.6/11.1: varia
 * por contrato, se edita desde la propia seccion "Pagos Semanales", no
 * desde el flujo de seleccion de candidato.
 */
export async function actualizarTerminosContrato(
  candidatoId: string,
  assignmentId: string,
  cuotaSemanalAcordada: number | null,
  cuotaAplazatoriaAcordada: number | null
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('actualizar_terminos_contrato', {
    p_asset_assignment_history_id: assignmentId,
    p_cuota_semanal_acordada: cuotaSemanalAcordada,
    p_cuota_aplazatoria_acordada: cuotaAplazatoriaAcordada,
  })

  if (error) {
    console.error('Error actualizando terminos del contrato:', error)
    return { success: false, error: error.message || 'No se pudieron guardar los términos del contrato.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Registra el pago de una semana nueva. El UNIQUE de la tabla impide
 * duplicar semana dentro del mismo ciclo de contrato (spec.md AC-05).
 */
export async function registrarPagoSemanal(
  candidatoId: string,
  assignmentId: string,
  numeroSemana: number,
  tipoPago: 'NORMAL' | 'APLAZATORIA' | 'NO_PAGO',
  montoPagado: number,
  fechaPago: string | null,
  observaciones: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('registrar_pago_semanal', {
    p_asset_assignment_history_id: assignmentId,
    p_numero_semana: numeroSemana,
    p_tipo_pago: tipoPago,
    p_monto_pagado: montoPagado,
    p_fecha_pago: fechaPago,
    p_observaciones: observaciones?.trim() || null,
  })

  if (error) {
    console.error('Error registrando pago semanal:', error)
    const mensaje = error.message?.includes('duplicate key')
      ? 'Ya existe un pago registrado para esa semana en este contrato.'
      : (error.message || 'No se pudo registrar el pago.')
    return { success: false, error: mensaje }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Corrige un pago ya registrado (nunca UPDATE directo desde el cliente).
 * Exige motivo; la RPC deja el valor anterior en
 * pagos_semanales_correcciones antes de sobrescribir (spec.md regla 3).
 */
export async function corregirPagoSemanal(
  candidatoId: string,
  pagoId: string,
  tipoPago: 'NORMAL' | 'APLAZATORIA' | 'NO_PAGO',
  montoPagado: number,
  fechaPago: string | null,
  observaciones: string,
  motivo: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'Debes indicar el motivo de la corrección.' }
  }

  const { error } = await supabase.rpc('corregir_pago_semanal', {
    p_pago_id: pagoId,
    p_tipo_pago: tipoPago,
    p_monto_pagado: montoPagado,
    p_fecha_pago: fechaPago,
    p_observaciones: observaciones?.trim() || null,
    p_motivo: motivo.trim(),
  })

  if (error) {
    console.error('Error corrigiendo pago semanal:', error)
    return { success: false, error: error.message || 'No se pudo corregir el pago.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Registra una evidencia fotografica ya subida a Storage (el archivo se
 * sube directo desde el navegador; esta accion solo deja el registro en
 * BD). Si el registro falla, intenta eliminar el archivo recien subido
 * para no dejarlo huerfano -- mismo patron que registrarActivoFoto.
 */
export async function registrarPagoEvidencia(
  candidatoId: string,
  pagoSemanalId: string,
  storagePath: string,
  descripcion: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('registrar_pago_evidencia', {
    p_pago_semanal_id: pagoSemanalId,
    p_storage_path: storagePath,
    p_descripcion: descripcion?.trim() || null,
  })

  if (error) {
    console.error('Error registrando evidencia de pago en BD, limpiando archivo huerfano en Storage:', error)
    const { error: deleteError } = await supabase.storage.from('pagos-evidencia').remove([storagePath])
    if (deleteError) {
      console.error('No se pudo eliminar el archivo huerfano en Storage:', deleteError)
    }
    return { success: false, error: 'No se pudo registrar la evidencia. Intenta nuevamente.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Elimina (desactiva de forma trazable) una evidencia ya subida, para
 * corregir un error humano -- mismo patron que eliminarActivoFoto. La
 * corrección de un pago y la eliminación de una evidencia son
 * operaciones distintas (spec.md regla 3 vs. 7).
 */
export async function eliminarPagoEvidencia(candidatoId: string, evidenciaId: string, motivo: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'Debes indicar el motivo de la eliminación.' }
  }

  const { data: evidencia } = await supabase.from('pagos_semanales_evidencia').select('storage_path').eq('id', evidenciaId).single()

  const { error } = await supabase.rpc('eliminar_pago_evidencia', {
    p_evidencia_id: evidenciaId,
    p_motivo: motivo.trim(),
  })

  if (error) {
    console.error('Error eliminando evidencia de pago:', error)
    return { success: false, error: error.message || 'No se pudo eliminar la evidencia.' }
  }

  if (evidencia) {
    const { error: removeError } = await supabase.storage.from('pagos-evidencia').remove([evidencia.storage_path])
    if (removeError) {
      console.error('No se pudo eliminar el archivo en Storage tras la eliminación lógica:', removeError)
    }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Registra un abono extraordinario nuevo. Entidad independiente de
 * pagos_semanales (KAI-30 addendum, spec.md Seccion 12) -- la RPC valida
 * la elegibilidad (18 meses desde fecha_asignacion desde KAI-123, o la
 * fecha manual de SUPER_ADMIN, + 0 NO_PAGO en las primeras 52 semanas)
 * como autoridad real; el mensaje de error de la
 * RPC ya es especifico, se propaga tal cual.
 */
export async function registrarAbonoExtraordinario(
  candidatoId: string,
  assignmentId: string,
  fechaAbono: string,
  valorAbono: number,
  observaciones: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('registrar_abono_extraordinario', {
    p_asset_assignment_history_id: assignmentId,
    p_fecha_abono: fechaAbono,
    p_valor_abono: valorAbono,
    p_observaciones: observaciones?.trim() || null,
  })

  if (error) {
    console.error('Error registrando abono extraordinario:', error)
    return { success: false, error: error.message || 'No se pudo registrar el abono extraordinario.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Corrige un abono extraordinario ya registrado (nunca UPDATE directo
 * desde el cliente). Exige motivo; la RPC deja el valor anterior en
 * abonos_extraordinarios_correcciones antes de sobrescribir.
 */
export async function corregirAbonoExtraordinario(
  candidatoId: string,
  abonoId: string,
  fechaAbono: string,
  valorAbono: number,
  observaciones: string,
  motivo: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'Debes indicar el motivo de la corrección.' }
  }

  const { error } = await supabase.rpc('corregir_abono_extraordinario', {
    p_abono_id: abonoId,
    p_fecha_abono: fechaAbono,
    p_valor_abono: valorAbono,
    p_observaciones: observaciones?.trim() || null,
    p_motivo: motivo.trim(),
  })

  if (error) {
    console.error('Error corrigiendo abono extraordinario:', error)
    return { success: false, error: error.message || 'No se pudo corregir el abono extraordinario.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Obtiene los abonos extraordinarios de un ciclo de contrato, con el
 * correo del admin que registro cada uno -- mismo patron que
 * getPagosSemanales.
 */
export async function getAbonosExtraordinarios(assignmentId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', abonos: [] }

  const { data: abonos, error } = await supabase
    .from('abonos_extraordinarios')
    .select('id, fecha_abono, valor_abono, observaciones, registrado_por, created_at, updated_at')
    .eq('asset_assignment_history_id', assignmentId)
    .order('fecha_abono', { ascending: true })

  if (error || !abonos) {
    console.error('Error obteniendo abonos extraordinarios:', error)
    return { success: false, error: 'No se pudieron cargar los abonos extraordinarios.', abonos: [] }
  }

  const serviceClient = getServiceClient()
  const usuarioIds = [...new Set(abonos.map(a => a.registrado_por))]
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all(usuarioIds.map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  const resultado = abonos.map(a => ({
    ...a,
    registrado_por_email: emailPorUsuario[a.registrado_por] || 'Administrador',
  }))

  return { success: true, abonos: resultado }
}

/**
 * Fija (o revierte a automático, con fechaInicio = null) la fecha de
 * inicio manual de elegibilidad de Abonos Extraordinarios (KAI-30
 * addendum 2, spec.md Sección 12.4). Exclusivo SUPER_ADMIN -- la RPC
 * valida is_super_admin() internamente como autoridad real; esta accion
 * no repite esa validacion (seria redundante y podria desincronizarse),
 * solo propaga el error especifico de la RPC si el usuario no es
 * SUPER_ADMIN.
 */
export async function activarFechaInicioAbonosManual(
  candidatoId: string,
  assignmentId: string,
  fechaInicio: string | null,
  motivo: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'Debes indicar el motivo del cambio.' }
  }

  const { error } = await supabase.rpc('activar_abonos_extraordinarios_manual', {
    p_asset_assignment_history_id: assignmentId,
    p_fecha_inicio: fechaInicio,
    p_motivo: motivo.trim(),
  })

  if (error) {
    console.error('Error activando fecha de inicio manual de abonos extraordinarios:', error)
    return { success: false, error: error.message || 'No se pudo actualizar la fecha de inicio.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * Historial de cambios de la fecha de inicio manual (quién/cuándo/por
 * qué) -- se usa para mostrar en el bloque "Configuración avanzada"
 * quién fijó el valor vigente.
 */
export async function getFechaInicioAbonosHistorial(assignmentId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', historial: [] }

  const { data: historial, error } = await supabase
    .from('abonos_extraordinarios_fecha_inicio_historial')
    .select('id, fecha_anterior, fecha_nueva, motivo, establecido_por, establecido_en')
    .eq('asset_assignment_history_id', assignmentId)
    .order('establecido_en', { ascending: false })

  if (error || !historial) {
    console.error('Error obteniendo historial de fecha de inicio de abonos:', error)
    return { success: false, error: 'No se pudo cargar el historial.', historial: [] }
  }

  const serviceClient = getServiceClient()
  const usuarioIds = [...new Set(historial.map(h => h.establecido_por))]
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all(usuarioIds.map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  const resultado = historial.map(h => ({
    ...h,
    establecido_por_email: emailPorUsuario[h.establecido_por] || 'Administrador',
  }))

  return { success: true, historial: resultado }
}

/**
 * Obtiene los pagos semanales de un ciclo de contrato, con sus
 * evidencias (URLs firmadas de corta duracion) y el correo del admin
 * que registro cada pago -- mismo patron que getActivoFotos.
 */
export async function getPagosSemanales(assignmentId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', pagos: [] }

  const { data: pagos, error } = await supabase
    .from('pagos_semanales')
    .select('id, numero_semana, tipo_pago, monto_pagado, fecha_pago, observaciones, registrado_por, created_at, updated_at')
    .eq('asset_assignment_history_id', assignmentId)
    .order('numero_semana', { ascending: true })

  if (error || !pagos) {
    console.error('Error obteniendo pagos semanales:', error)
    return { success: false, error: 'No se pudieron cargar los pagos semanales.', pagos: [] }
  }

  const pagoIds = pagos.map(p => p.id)
  const { data: evidenciaRows } = pagoIds.length
    ? await supabase
      .from('pagos_semanales_evidencia')
      .select('id, pago_semanal_id, storage_path, descripcion, usuario_id, activo, created_at')
      .in('pago_semanal_id', pagoIds)
      .order('created_at', { ascending: false })
    : { data: [] as { id: string; pago_semanal_id: string; storage_path: string; descripcion: string | null; usuario_id: string; activo: boolean; created_at: string }[] }

  const serviceClient = getServiceClient()

  const usuarioIds = [...new Set([...pagos.map(p => p.registrado_por), ...(evidenciaRows || []).map(e => e.usuario_id)])]
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all(usuarioIds.map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  const evidenciaPorPago: Record<string, Array<{ id: string; descripcion: string | null; usuario_email: string; activo: boolean; created_at: string; url: string | null }>> = {}
  for (const e of evidenciaRows || []) {
    if (!e.activo) continue
    const { data: signed } = await serviceClient.storage.from('pagos-evidencia').createSignedUrl(e.storage_path, 300)
    if (!evidenciaPorPago[e.pago_semanal_id]) evidenciaPorPago[e.pago_semanal_id] = []
    evidenciaPorPago[e.pago_semanal_id].push({
      id: e.id,
      descripcion: e.descripcion,
      usuario_email: emailPorUsuario[e.usuario_id] || 'Administrador',
      activo: e.activo,
      created_at: e.created_at,
      url: signed?.signedUrl || null,
    })
  }

  const resultado = pagos.map(p => ({
    ...p,
    registrado_por_email: emailPorUsuario[p.registrado_por] || 'Administrador',
    evidencia: evidenciaPorPago[p.id] || [],
  }))

  return { success: true, pagos: resultado }
}

/**
 * KAI-121: guarda las semanas pactadas del contrato (D1). RPC aparte de
 * actualizar_terminos_contrato para no cambiar su firma (plan.md C.1.2).
 * `null` = aún no definidas.
 */
export async function actualizarSemanasPactadas(
  candidatoId: string,
  assignmentId: string,
  semanasPactadas: number | null
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('actualizar_semanas_pactadas', {
    p_asset_assignment_history_id: assignmentId,
    p_semanas_pactadas: semanasPactadas,
  })

  if (error) {
    console.error('Error actualizando semanas pactadas:', error)
    return { success: false, error: error.message || 'No se pudieron guardar las semanas pactadas.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * KAI-122: registra el depósito inicial del contrato (uno por contrato,
 * D6). La RPC es la autoridad: valida valor, fecha, finalidad y el
 * duplicado, y su mensaje se propaga tal cual.
 */
export async function registrarDeposito(
  candidatoId: string,
  assignmentId: string,
  valor: number,
  fechaPago: string,
  finalidadCondiciones: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('registrar_deposito_contrato', {
    p_asset_assignment_history_id: assignmentId,
    p_valor: valor,
    p_fecha_pago: fechaPago,
    p_finalidad_condiciones: finalidadCondiciones,
  })

  if (error) {
    console.error('Error registrando depósito:', error)
    return { success: false, error: error.message || 'No se pudo registrar el depósito.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * KAI-122: corrige el depósito. Exige motivo; la RPC guarda el valor
 * anterior en depositos_contrato_correcciones antes de sobrescribir.
 */
export async function corregirDeposito(
  candidatoId: string,
  depositoId: string,
  valor: number,
  fechaPago: string,
  finalidadCondiciones: string,
  motivo: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'Debes indicar el motivo de la corrección.' }
  }

  const { error } = await supabase.rpc('corregir_deposito_contrato', {
    p_deposito_id: depositoId,
    p_valor: valor,
    p_fecha_pago: fechaPago,
    p_finalidad_condiciones: finalidadCondiciones,
    p_motivo: motivo.trim(),
  })

  if (error) {
    console.error('Error corrigiendo depósito:', error)
    return { success: false, error: error.message || 'No se pudo corregir el depósito.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * KAI-122: registra el comprobante del depósito ya subido a Storage
 * (bucket pagos-evidencia, mismo flujo que registrarPagoEvidencia). Si el
 * registro falla, elimina el archivo recién subido para no dejarlo
 * huérfano y devuelve el error real.
 */
export async function registrarDepositoEvidencia(
  candidatoId: string,
  depositoId: string,
  storagePath: string,
  descripcion: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('registrar_deposito_evidencia', {
    p_deposito_id: depositoId,
    p_storage_path: storagePath,
    p_descripcion: descripcion?.trim() || null,
  })

  if (error) {
    console.error('Error registrando comprobante del depósito en BD, limpiando archivo huerfano en Storage:', error)
    const { error: deleteError } = await supabase.storage.from('pagos-evidencia').remove([storagePath])
    if (deleteError) {
      console.error('No se pudo eliminar el archivo huerfano en Storage:', deleteError)
    }
    return { success: false, error: error.message || 'No se pudo registrar el comprobante.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

/**
 * KAI-122: elimina (baja lógica trazable, con motivo) un comprobante del
 * depósito -- mismo patrón que eliminarPagoEvidencia.
 */
export async function eliminarDepositoEvidencia(candidatoId: string, evidenciaId: string, motivo: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'Debes indicar el motivo de la eliminación.' }
  }

  const { data: evidencia } = await supabase.from('depositos_contrato_evidencia').select('storage_path').eq('id', evidenciaId).single()

  const { error } = await supabase.rpc('eliminar_deposito_evidencia', {
    p_evidencia_id: evidenciaId,
    p_motivo: motivo.trim(),
  })

  if (error) {
    console.error('Error eliminando comprobante del depósito:', error)
    return { success: false, error: error.message || 'No se pudo eliminar el comprobante.' }
  }

  if (evidencia) {
    const { error: removeError } = await supabase.storage.from('pagos-evidencia').remove([evidencia.storage_path])
    if (removeError) {
      console.error('No se pudo eliminar el archivo en Storage tras la eliminación lógica:', removeError)
    }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}

export interface DepositoContrato {
  id: string
  valor: number
  fecha_pago: string
  finalidad_condiciones: string
  registrado_por_email: string
  created_at: string
  updated_at: string
  correcciones: Array<{
    id: string
    valor_anterior: number
    fecha_pago_anterior: string
    finalidad_condiciones_anterior: string
    motivo_correccion: string
    corregido_por_email: string
    corregido_en: string
  }>
  evidencia: Array<{ id: string; descripcion: string | null; usuario_email: string; created_at: string; url: string | null }>
}

/**
 * KAI-122: obtiene el depósito del contrato (o `null` si no existe), con
 * sus correcciones y comprobantes vigentes (URLs firmadas de 300 s).
 */
export async function getDeposito(assignmentId: string): Promise<{ success: boolean; error?: string; deposito: DepositoContrato | null }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', deposito: null }

  const { data: dep, error } = await supabase
    .from('depositos_contrato')
    .select('id, valor, fecha_pago, finalidad_condiciones, registrado_por, created_at, updated_at')
    .eq('asset_assignment_history_id', assignmentId)
    .maybeSingle()

  if (error) {
    console.error('Error obteniendo depósito:', error)
    return { success: false, error: error.message || 'No se pudo cargar el depósito.', deposito: null }
  }
  if (!dep) return { success: true, deposito: null }

  const [{ data: correcciones }, { data: evidenciaRows }] = await Promise.all([
    supabase
      .from('depositos_contrato_correcciones')
      .select('id, valor_anterior, fecha_pago_anterior, finalidad_condiciones_anterior, motivo_correccion, corregido_por, corregido_en')
      .eq('deposito_id', dep.id)
      .order('corregido_en', { ascending: false }),
    supabase
      .from('depositos_contrato_evidencia')
      .select('id, storage_path, descripcion, usuario_id, activo, created_at')
      .eq('deposito_id', dep.id)
      .eq('activo', true)
      .order('created_at', { ascending: false }),
  ])

  const serviceClient = getServiceClient()
  const usuarioIds = [...new Set([
    dep.registrado_por,
    ...(correcciones || []).map(c => c.corregido_por),
    ...(evidenciaRows || []).map(e => e.usuario_id),
  ])]
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all(usuarioIds.map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  const evidencia = await Promise.all((evidenciaRows || []).map(async (e) => {
    const { data: signed } = await serviceClient.storage.from('pagos-evidencia').createSignedUrl(e.storage_path, 300)
    return {
      id: e.id,
      descripcion: e.descripcion,
      usuario_email: emailPorUsuario[e.usuario_id] || 'Administrador',
      created_at: e.created_at,
      url: signed?.signedUrl || null,
    }
  }))

  return {
    success: true,
    deposito: {
      id: dep.id,
      valor: Number(dep.valor),
      fecha_pago: dep.fecha_pago,
      finalidad_condiciones: dep.finalidad_condiciones,
      registrado_por_email: emailPorUsuario[dep.registrado_por] || 'Administrador',
      created_at: dep.created_at,
      updated_at: dep.updated_at,
      correcciones: (correcciones || []).map(c => ({
        id: c.id,
        valor_anterior: Number(c.valor_anterior),
        fecha_pago_anterior: c.fecha_pago_anterior,
        finalidad_condiciones_anterior: c.finalidad_condiciones_anterior,
        motivo_correccion: c.motivo_correccion,
        corregido_por_email: emailPorUsuario[c.corregido_por] || 'Administrador',
        corregido_en: c.corregido_en,
      })),
      evidencia,
    },
  }
}

/**
 * KAI-128: valores de compra del contrato (valor de venta, ahorro semanal y
 * bono semanal) con su historial. Lectura con la sesión del administrador
 * (RLS de solo lectura, 00082/00083).
 */
export type ValoresCompraHistorial = {
  id: string
  valor_venta_anterior: number | null
  aporte_ahorro_semanal_anterior: number | null
  aporte_bono_semanal_anterior: number | null
  valor_venta_nuevo: number
  aporte_ahorro_semanal_nuevo: number
  aporte_bono_semanal_nuevo: number
  motivo: string | null
  registrado_por_email: string
  registrado_en: string
}

export async function getValoresCompra(assignmentId: string): Promise<{
  success: boolean
  error?: string
  valores: { valor_venta: number | null; aporte_ahorro_semanal: number | null; aporte_bono_semanal: number | null } | null
  historial: ValoresCompraHistorial[]
}> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', valores: null, historial: [] }

  const [{ data: contrato, error: errContrato }, { data: filas, error: errHistorial }] = await Promise.all([
    supabase
      .from('asset_assignment_history')
      .select('valor_venta, aporte_ahorro_semanal, aporte_bono_semanal')
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('contrato_valores_compra_historial')
      .select('id, valor_venta_anterior, aporte_ahorro_semanal_anterior, aporte_bono_semanal_anterior, valor_venta_nuevo, aporte_ahorro_semanal_nuevo, aporte_bono_semanal_nuevo, motivo, registrado_por, registrado_en')
      .eq('asset_assignment_history_id', assignmentId)
      .order('registrado_en', { ascending: false }),
  ])

  const errorCarga = errContrato || errHistorial
  if (errorCarga) {
    console.error('Error obteniendo valores de compra:', errorCarga)
    return { success: false, error: errorCarga.message || 'No se pudieron cargar los valores de compra.', valores: null, historial: [] }
  }

  const serviceClient = getServiceClient()
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all([...new Set((filas || []).map(f => f.registrado_por))].map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    success: true,
    valores: contrato
      ? { valor_venta: num(contrato.valor_venta), aporte_ahorro_semanal: num(contrato.aporte_ahorro_semanal), aporte_bono_semanal: num(contrato.aporte_bono_semanal) }
      : null,
    historial: (filas || []).map(f => ({
      id: f.id,
      valor_venta_anterior: num(f.valor_venta_anterior),
      aporte_ahorro_semanal_anterior: num(f.aporte_ahorro_semanal_anterior),
      aporte_bono_semanal_anterior: num(f.aporte_bono_semanal_anterior),
      valor_venta_nuevo: Number(f.valor_venta_nuevo),
      aporte_ahorro_semanal_nuevo: Number(f.aporte_ahorro_semanal_nuevo),
      aporte_bono_semanal_nuevo: Number(f.aporte_bono_semanal_nuevo),
      motivo: f.motivo,
      registrado_por_email: emailPorUsuario[f.registrado_por] || 'Administrador',
      registrado_en: f.registrado_en,
    })),
  }
}

/**
 * KAI-128: registra o cambia los valores de compra. La RPC exige motivo
 * cuando ya había valores y deja cada guardado en el historial.
 */
export async function guardarValoresCompra(
  candidatoId: string,
  assignmentId: string,
  valorVenta: number,
  aporteAhorroSemanal: number,
  aporteBonoSemanal: number,
  motivo: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('guardar_valores_compra_contrato', {
    p_asset_assignment_history_id: assignmentId,
    p_valor_venta: valorVenta,
    p_aporte_ahorro_semanal: aporteAhorroSemanal,
    p_aporte_bono_semanal: aporteBonoSemanal,
    p_motivo: motivo,
  })

  if (error) {
    console.error('Error guardando valores de compra:', error)
    return { success: false, error: error.message || 'No se pudieron guardar los valores de compra.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)
  return { success: true }
}
