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
 * la elegibilidad (12 meses desde fecha_asignacion + 0 NO_PAGO en las
 * primeras 52 semanas) como autoridad real; el mensaje de error de la
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
