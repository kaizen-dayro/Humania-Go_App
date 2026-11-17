'use server'

// Analítica vehicular, Fase 1 (SDD `gps-inteligencia-vehicular`). Todas las
// escrituras pasan por las RPC de la migración 00090, que validan
// is_super_admin() por dentro (regla 9). Aquí se repite la validación de rol
// solo para dar un error claro antes de llamar a la base, y se devuelve el
// mensaje real de Postgres (memoria "errores no genéricos").

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

const RUTA = '/admin/analitica-vehicular'

type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; motivoRequerido?: boolean }

async function clienteSuperAdmin() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { supabase, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  const { data: caller } = await supabase.from('admin_users').select('role, activo').eq('id', session.user.id).single()
  if (!caller || !caller.activo || caller.role !== 'SUPER_ADMIN') {
    return { supabase, error: 'Solo un SUPER_ADMIN activo puede registrar información de analítica vehicular.' }
  }
  return { supabase, error: null }
}

function textoONulo(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

function enteroONulo(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Registra en BD una fotografía del tablero ya subida al bucket privado y
 * devuelve su id. Si el registro falla, borra el archivo para no dejarlo
 * huérfano (mismo criterio que registrarActivoFoto).
 */
export async function registrarFotoTablero(activoId: string, storagePath: string): Promise<Resultado<{ fotoId: string }>> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }

  const { data, error } = await supabase.rpc('registrar_activo_foto', {
    p_activo_id: activoId,
    p_bucket: 'activo-fotos-evidencia',
    p_storage_path: storagePath,
    p_categoria: 'TABLERO',
    p_descripcion: null,
  })
  if (error || !data) {
    await supabase.storage.from('activo-fotos-evidencia').remove([storagePath])
    return { ok: false, error: `No se pudo registrar la fotografía: ${error?.message ?? 'la base no devolvió el identificador'}` }
  }
  return { ok: true, data: { fotoId: data as string } }
}

export type DatosLectura = {
  activoId: string
  tipo: 'INICIAL' | 'PERIODICA' | 'MANTENIMIENTO' | 'DEVOLUCION'
  fechaCaptura: string // ISO con zona
  valorKm: number
  fotoId: string | null
  contratoId: string | null
  motivoExcepcion: string | null
  observacion: string | null
}

export async function registrarLectura(d: DatosLectura): Promise<Resultado<{ lecturaId: string }>> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }

  if (!Number.isInteger(d.valorKm) || d.valorKm < 0 || d.valorKm > 2000000) {
    return { ok: false, error: 'El kilometraje debe ser un número entero entre 0 y 2.000.000.' }
  }

  const { data, error } = await supabase.rpc('registrar_lectura_odometro', {
    p_activo_id: d.activoId,
    p_tipo: d.tipo,
    p_fecha_captura: d.fechaCaptura,
    p_valor_km: d.valorKm,
    p_foto_id: d.fotoId,
    p_valor_ocr: null,
    p_ocr_confianza: null,
    p_ocr_motor: null,
    p_asset_assignment_history_id: d.tipo === 'INICIAL' || d.tipo === 'DEVOLUCION' ? d.contratoId : null,
    p_motivo_excepcion: textoONulo(d.motivoExcepcion),
    p_observacion: textoONulo(d.observacion),
  })
  if (error) {
    return { ok: false, error: error.message, motivoRequerido: error.hint === 'MOTIVO_REQUERIDO' }
  }
  revalidatePath(RUTA)
  return { ok: true, data: { lecturaId: data as string } }
}

export async function anularLectura(lecturaId: string, motivo: string): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('anular_lectura_odometro', { p_lectura_id: lecturaId, p_motivo: motivo })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

export async function guardarPlan(d: {
  activoId: string; concepto: string; intervaloKm: string; intervaloMeses: string; fuente: string; motivo: string
}): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('guardar_plan_mantenimiento', {
    p_activo_id: d.activoId,
    p_concepto: d.concepto,
    p_intervalo_km: enteroONulo(d.intervaloKm),
    p_intervalo_meses: enteroONulo(d.intervaloMeses),
    p_fuente: d.fuente,
    p_motivo: textoONulo(d.motivo),
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

export async function retirarPlan(planId: string, motivo: string): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('retirar_plan_mantenimiento', { p_plan_id: planId, p_motivo: motivo })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

export async function registrarMantenimiento(d: {
  activoId: string; fecha: string; concepto: string; descripcion: string; lecturaId: string | null
  costo: string; responsablePago: string
}): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('registrar_mantenimiento', {
    p_activo_id: d.activoId,
    p_fecha: d.fecha,
    p_concepto: d.concepto,
    p_descripcion: textoONulo(d.descripcion),
    p_lectura_odometro_id: d.lecturaId,
    p_costo: enteroONulo(d.costo),
    p_responsable_pago: textoONulo(d.responsablePago),
    p_evidencia_foto_id: null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

export async function anularMantenimiento(mantenimientoId: string, motivo: string): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('anular_mantenimiento', { p_mantenimiento_id: mantenimientoId, p_motivo: motivo })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

// Adenda 1 (spec Sección 17): viajes transcritos a mano de la app Ituran GO+.
export type DatosViaje = {
  activoId: string
  capturaReferencia: string
  fechaGrupo: string // YYYY-MM-DD
  horaInicio: string // HH:mm, tal como la muestra la app
  horaFin: string
  duracionMin: number
  velocidadKmh: number
  distanciaKm: string
  municipio: string
  interpretacion: 'UTC' | 'HORA_COLOMBIA'
}

export async function registrarViajeTranscrito(d: DatosViaje): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('registrar_viaje_transcrito', {
    p_activo_id: d.activoId,
    p_captura_referencia: d.capturaReferencia,
    p_fecha_grupo: d.fechaGrupo,
    p_hora_inicio: d.horaInicio,
    p_hora_fin: d.horaFin,
    p_duracion_min: d.duracionMin,
    p_velocidad_kmh: d.velocidadKmh,
    p_distancia_km: enteroONulo(d.distanciaKm),
    p_municipio: d.municipio,
    p_interpretacion: d.interpretacion,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

export async function anularViajeTranscrito(viajeId: string, motivo: string): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('anular_viaje_transcrito', { p_viaje_id: viajeId, p_motivo: motivo })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

export async function guardarParametro(parametro: string, valor: string, motivo: string): Promise<Resultado> {
  const { supabase, error: errAuth } = await clienteSuperAdmin()
  if (errAuth) return { ok: false, error: errAuth }
  const { error } = await supabase.rpc('guardar_parametro_analitica_vehicular', {
    p_parametro: parametro,
    p_valor: valor.trim() === '' ? null : Number(valor),
    p_motivo: motivo,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}
