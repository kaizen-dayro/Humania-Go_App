'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sendCandidateEmail } from '@/lib/services/email'
import { PHONE_CO, LETTERS_ONLY, LETTERS_WITH_PUNCTUATION } from '@/lib/validation'

/**
 * URL real del sitio para construir redirectTo en correos de Supabase Auth
 * (invitacion, recuperacion de contraseña). Antes, tanto inviteAdminUser
 * como aprobarRecuperacionAction caian en silencio a
 * 'http://localhost:3000' si la variable no estaba definida -- eso envio
 * un enlace de recuperacion real a localhost en produccion (bug real
 * encontrado por Dayro, 2026-08-24). Ahora falla con un error explicito
 * en vez de enviar un enlace roto sin que nadie se entere.
 */
function getSiteUrlOrThrow(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL
  if (!url) {
    throw new Error('Falta la variable de entorno NEXT_PUBLIC_SITE_URL en este despliegue. Configúrala en Vercel (Project Settings → Environment Variables) con la URL real del sitio antes de continuar.')
  }
  if (process.env.VERCEL_ENV === 'production' && url.includes('localhost')) {
    throw new Error('NEXT_PUBLIC_SITE_URL está configurada como localhost en un despliegue de producción. Corrígela en Vercel (Project Settings → Environment Variables) antes de continuar.')
  }
  return url
}

/** Fase 13 (Documento 17/18): segunda validacion server-side, min/max/charset. */
function esTextoValido(v: string | null | undefined, regex: RegExp, min: number, max: number): boolean {
  const t = v?.trim() || ''
  return t.length >= min && t.length <= max && regex.test(t)
}

/**
 * Fase 13 (Documento 17/18, migracion 00031): nombre de modelo alfanumerico
 * (letras, numeros, espacios; sin caracteres especiales), min 4 / max 21
 * -- min ajustado desde 5 por el modelo real "Atos" (4 caracteres), decision
 * de Dayro 2026-08-23. Sin capitalizacion forzada a proposito: nombres
 * reales como "SANDERO"/"YBR 125" no deben reescribirse.
 */
const MODELO_NOMBRE_REGEX = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]+$/

/**
 * Fase 13 (Documento 17/18, migracion 00031): image_url acepta una URL
 * externa completa (http/https) o una ruta relativa interna (empieza por
 * "/"), decision de Dayro 2026-08-23 alineada con el placeholder ya
 * existente del formulario. Vacio siempre es valido (campo opcional).
 */
function esImageUrlValida(v: string | null | undefined): boolean {
  const t = v?.trim() || ''
  if (!t) return true
  return /^(https?:\/\/.+|\/.+)$/.test(t)
}

/**
 * Cliente con Secret key: exclusivamente server-side, para operaciones que
 * requieren saltar RLS de forma controlada (URLs firmadas de Storage).
 * Nunca debe importarse desde un componente cliente.
 */
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Registra una fotografia de activo ya subida a Storage (el archivo se sube
 * directo desde el navegador; esta accion solo dej el registro en BD).
 * Si el registro en BD falla, intenta eliminar el archivo recien subido
 * para no dejarlo huerfano, e informa el error real al administrador.
 */
export async function registrarActivoFoto(
  activoId: string,
  bucket: 'activo-fotos-publicas' | 'activo-fotos-evidencia',
  storagePath: string,
  categoria: string,
  descripcion: string
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const descripcionTrim = descripcion?.trim() || ''
  if (descripcionTrim && !esTextoValido(descripcionTrim, LETTERS_WITH_PUNCTUATION, 10, 111)) {
    return { success: false, error: 'La descripción, si se completa, debe tener entre 10 y 111 caracteres (letras, espacios y puntuación básica).' }
  }

  const { error } = await supabase.rpc('registrar_activo_foto', {
    p_activo_id: activoId,
    p_bucket: bucket,
    p_storage_path: storagePath,
    p_categoria: categoria,
    p_descripcion: descripcion?.trim() || null
  })

  if (error) {
    console.error('Error registrando foto en BD, limpiando archivo huerfano en Storage:', error)
    const { error: deleteError } = await supabase.storage.from(bucket).remove([storagePath])
    if (deleteError) {
      console.error('No se pudo eliminar el archivo huerfano en Storage:', deleteError)
    }
    return { success: false, error: 'No se pudo registrar la fotografía. Intenta nuevamente.' }
  }

  revalidatePath(`/admin/activos/${activoId}/editar`)
  return { success: true }
}

/**
 * Elimina (desactiva de forma trazable) una fotografia ya subida, para
 * corregir un error humano. La RPC es la autoridad final: exige admin
 * y motivo, y deja registrado quien y cuando. El archivo fisico en
 * Storage se elimina despues, una vez confirmada la eliminacion logica.
 */
export async function eliminarActivoFoto(activoId: string, fotoId: string, motivo: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'Debes indicar el motivo de la eliminación.' }
  }

  const { data: foto } = await supabase.from('activo_fotos').select('bucket, storage_path').eq('id', fotoId).single()

  const { error } = await supabase.rpc('eliminar_activo_foto', {
    p_foto_id: fotoId,
    p_motivo: motivo.trim()
  })

  if (error) {
    console.error('Error eliminando foto:', error)
    return { success: false, error: error.message || 'No se pudo eliminar la fotografía.' }
  }

  if (foto) {
    const { error: removeError } = await supabase.storage.from(foto.bucket).remove([foto.storage_path])
    if (removeError) {
      console.error('No se pudo eliminar el archivo en Storage tras la eliminación lógica:', removeError)
    }
  }

  revalidatePath(`/admin/activos/${activoId}/editar`)
  return { success: true }
}

/**
 * Obtiene las fotografias de un activo (principal publica + evidencia
 * privada), generando URLs firmadas de corta duracion para la evidencia.
 */
export async function getActivoFotos(activoId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', principales: [], evidencia: [] }

  const { data: fotos, error } = await supabase
    .from('activo_fotos')
    .select('id, bucket, storage_path, categoria, descripcion, usuario_id, activo, created_at')
    .eq('activo_id', activoId)
    .order('created_at', { ascending: false })

  if (error || !fotos) {
    console.error('Error obteniendo fotos del activo:', error)
    return { success: false, error: 'No se pudieron cargar las fotografías', principales: [], evidencia: [] }
  }

  const serviceClient = getServiceClient()

  // Resuelve el correo del administrador que registro cada foto (volumen pequeño de admins).
  const usuarioIds = [...new Set(fotos.map(f => f.usuario_id))]
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all(usuarioIds.map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  const principales = fotos
    .filter(f => f.bucket === 'activo-fotos-publicas')
    .map(f => ({
      ...f,
      usuario_email: emailPorUsuario[f.usuario_id] || 'Administrador',
      url: supabase.storage.from('activo-fotos-publicas').getPublicUrl(f.storage_path).data.publicUrl
    }))

  const evidenciaRaw = fotos.filter(f => f.bucket === 'activo-fotos-evidencia')
  const evidencia = await Promise.all(evidenciaRaw.map(async (f) => {
    const { data: signed } = await serviceClient.storage.from('activo-fotos-evidencia').createSignedUrl(f.storage_path, 300)
    return { ...f, usuario_email: emailPorUsuario[f.usuario_id] || 'Administrador', url: signed?.signedUrl || null }
  }))

  return { success: true, principales, evidencia }
}

/**
 * Obtiene el historial completo de cambios de un candidato (estado y
 * eventos contractuales -- misma tabla, candidate_status_history),
 * resolviendo el correo del administrador responsable de cada evento.
 * Fase 11, Subfase 11B (Documento 16 S11/S12).
 */
export async function getCandidateStatusHistory(candidatoId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', historial: [] }

  const { data: historial, error } = await supabase
    .from('candidate_status_history')
    .select('id, estado_anterior, estado_nuevo, estatus_contractual_anterior, estatus_contractual_nuevo, motivo, usuario_id, tipo_evento, created_at')
    .eq('candidato_id', candidatoId)
    .order('created_at', { ascending: false })

  if (error || !historial) {
    console.error('Error obteniendo historial del candidato:', error)
    return { success: false, error: 'No se pudo cargar el historial', historial: [] }
  }

  const serviceClient = getServiceClient()
  const usuarioIds = [...new Set(historial.map(h => h.usuario_id))]
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all(usuarioIds.map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  return {
    success: true,
    historial: historial.map(h => ({ ...h, usuario_email: emailPorUsuario[h.usuario_id] || 'Administrador' }))
  }
}

/**
 * Server Actions del catalogo maestro: Marcas y Modelos
 */
export async function createMarca(formData: FormData) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const nombre = (formData.get('nombre') as string)?.trim()
  if (!nombre) return { success: false, error: 'El nombre es obligatorio' }

  const { error } = await supabase.from('marcas_vehiculo').insert({ nombre })
  if (error) {
    console.error('Error creando marca:', error)
    if (error.code === '23505') return { success: false, error: 'Ya existe una marca con ese nombre.' }
    return { success: false, error: 'Error interno de base de datos' }
  }

  revalidatePath('/admin/marcas')
  revalidatePath('/admin/modelos')
  revalidatePath('/admin/activos/nuevo')
  return { success: true }
}

export async function updateMarca(marcaId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const nombre = (formData.get('nombre') as string)?.trim()
  const activo = formData.get('activo') === 'true'
  if (!nombre) return { success: false, error: 'El nombre es obligatorio' }

  const { error } = await supabase.from('marcas_vehiculo').update({ nombre, activo }).eq('id', marcaId)
  if (error) {
    console.error('Error actualizando marca:', error)
    if (error.code === '23505') return { success: false, error: 'Ya existe una marca con ese nombre.' }
    return { success: false, error: 'Error interno de base de datos' }
  }

  revalidatePath('/admin/marcas')
  revalidatePath('/admin/modelos')
  revalidatePath('/admin/activos/nuevo')
  return { success: true }
}

export async function createModelo(formData: FormData) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const tipo_id = formData.get('tipo_id') as string
  const marca_id = formData.get('marca_id') as string
  const nombre = (formData.get('nombre') as string)?.trim()
  const image_url = formData.get('image_url') as string

  if (!tipo_id || !marca_id || !nombre) {
    return { success: false, error: 'Faltan campos obligatorios' }
  }
  if (!esTextoValido(nombre, MODELO_NOMBRE_REGEX, 4, 21)) {
    return { success: false, error: 'El nombre del modelo debe tener entre 4 y 21 caracteres (letras, números y espacios, sin caracteres especiales).' }
  }
  if (!esImageUrlValida(image_url)) {
    return { success: false, error: 'La URL de imagen debe ser una ruta interna (que empiece por /) o una URL completa (http:// o https://).' }
  }

  const { error } = await supabase.from('modelos_vehiculo').insert({
    tipo_id, marca_id, nombre, image_url: image_url?.trim() || null
  })
  if (error) {
    console.error('Error creando modelo:', error)
    if (error.code === '23505') return { success: false, error: 'Ya existe un modelo con ese nombre para esa marca.' }
    return { success: false, error: 'Error interno de base de datos' }
  }

  revalidatePath('/admin/modelos')
  revalidatePath('/admin/activos/nuevo')
  return { success: true }
}

export async function updateModelo(modeloId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const tipo_id = formData.get('tipo_id') as string
  const marca_id = formData.get('marca_id') as string
  const nombre = (formData.get('nombre') as string)?.trim()
  const image_url = formData.get('image_url') as string

  if (!tipo_id || !marca_id || !nombre) {
    return { success: false, error: 'Faltan campos obligatorios' }
  }
  if (!esTextoValido(nombre, MODELO_NOMBRE_REGEX, 4, 21)) {
    return { success: false, error: 'El nombre del modelo debe tener entre 4 y 21 caracteres (letras, números y espacios, sin caracteres especiales).' }
  }
  if (!esImageUrlValida(image_url)) {
    return { success: false, error: 'La URL de imagen debe ser una ruta interna (que empiece por /) o una URL completa (http:// o https://).' }
  }

  // Fase 13 (Documento 17 sección 8): "activo" YA NO se toca desde aquí --
  // se separó a su propia RPC (set_modelo_activo, vía Server Action
  // setModeloActivo) para que el historial de activación nunca se registre
  // por editar nombre/marca/tipo/imagen.
  const { error } = await supabase.from('modelos_vehiculo').update({
    tipo_id, marca_id, nombre, image_url: image_url?.trim() || null
  }).eq('id', modeloId)
  if (error) {
    console.error('Error actualizando modelo:', error)
    if (error.code === '23505') return { success: false, error: 'Ya existe un modelo con ese nombre para esa marca.' }
    return { success: false, error: 'Error interno de base de datos' }
  }

  revalidatePath('/admin/modelos')
  revalidatePath('/admin/activos/nuevo')
  return { success: true }
}

/**
 * Server Action para actualizar un activo (estado, codigo, imagen)
 */
export async function updateAsset(activoId: string, formData: FormData) {
  const supabase = await createClient()

  // 1. Validar sesión
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { success: false, error: 'No autorizado' }
  }

  // 2. Validar que el usuario sea un admin ACTIVO (da un error claro antes
  // de intentar el UPDATE; RLS ya lo bloquearía igual si esto se omitiera).
  const { data: adminRow, error: adminErr } = await supabase
    .from('admin_users')
    .select('id, activo')
    .eq('id', session.user.id)
    .single()

  if (adminErr || !adminRow || !adminRow.activo) {
    return { success: false, error: 'Permisos insuficientes' }
  }

  // 2.1 Consultar estado actual: ASIGNADO/TRANSFERIDO bloquean toda edición de información
  const { data: activoActual, error: fetchErr } = await supabase
    .from('activos')
    .select('estado')
    .eq('id', activoId)
    .single()

  if (fetchErr || !activoActual) {
    return { success: false, error: 'Activo no encontrado' }
  }
  if (activoActual.estado === 'ASIGNADO' || activoActual.estado === 'TRANSFERIDO') {
    return { success: false, error: `Este activo está ${activoActual.estado} y su información no puede editarse desde este flujo.` }
  }

  const estado = formData.get('estado') as string
  const placa = formData.get('placa') as string
  const color = formData.get('color') as string
  const vencimiento_tecnomecanica = formData.get('vencimiento_tecnomecanica') as string
  const vencimiento_soat = formData.get('vencimiento_soat') as string
  const vencimiento_impuestos = formData.get('vencimiento_impuestos') as string
  const estado_fisico = formData.get('estado_fisico') as string

  if (!estado || !estado_fisico?.trim()) {
    return { success: false, error: 'Faltan campos obligatorios (Estado y Estado Físico son obligatorios)' }
  }
  if (!esTextoValido(estado_fisico, LETTERS_WITH_PUNCTUATION, 10, 111)) {
    return { success: false, error: 'El Estado Físico debe tener entre 10 y 111 caracteres (letras, espacios y puntuación básica).' }
  }
  if (estado === 'ASIGNADO' || estado === 'TRANSFERIDO') {
    return { success: false, error: 'ASIGNADO y TRANSFERIDO solo pueden establecerse desde el flujo contractual del candidato.' }
  }

  // 3. Ejecutar UPDATE (codigo_interno nunca se envía: es inmutable y lo protege un trigger de BD)
  // image_url ya no se edita desde este formulario: la fotografía real
  // del activo se gestiona con Supabase Storage (pestaña Fotografías).
  const { error } = await supabase
    .from('activos')
    .update({
      estado,
      placa: placa?.trim() ? placa.trim().toUpperCase() : null,
      color: color?.trim() || null,
      vencimiento_tecnomecanica: vencimiento_tecnomecanica || null,
      vencimiento_soat: vencimiento_soat || null,
      vencimiento_impuestos: vencimiento_impuestos || null,
      estado_fisico: estado_fisico.trim()
    })
    .eq('id', activoId)

  if (error) {
    console.error('Error actualizando activo:', error)
    if (error.code === '23505') {
      return { success: false, error: 'Esa placa ya está registrada en otro activo.' }
    }
    return { success: false, error: 'Error interno de base de datos' }
  }

  // 4. Revalidar cachés para que el frontend y dashboard se actualicen
  revalidatePath('/admin/activos')
  revalidatePath('/admin')
  revalidatePath('/') // Landing page para que refresque oportunidades
  
  return { success: true }
}

/**
 * Server Action para crear un nuevo activo
 */
export async function createAsset(formData: FormData) {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const modelo_id = formData.get('modelo_id') as string
  const estado = formData.get('estado') as string
  const placa = formData.get('placa') as string
  const color = formData.get('color') as string
  const vencimiento_tecnomecanica = formData.get('vencimiento_tecnomecanica') as string
  const vencimiento_soat = formData.get('vencimiento_soat') as string
  const vencimiento_impuestos = formData.get('vencimiento_impuestos') as string
  const estado_fisico = formData.get('estado_fisico') as string

  if (!modelo_id || !estado || !estado_fisico?.trim()) {
    return { success: false, error: 'Faltan campos obligatorios (Estado y Estado Físico son obligatorios)' }
  }
  if (!esTextoValido(estado_fisico, LETTERS_WITH_PUNCTUATION, 10, 111)) {
    return { success: false, error: 'El Estado Físico debe tener entre 10 y 111 caracteres (letras, espacios y puntuación básica).' }
  }
  if (estado === 'ASIGNADO' || estado === 'TRANSFERIDO') {
    return { success: false, error: 'ASIGNADO y TRANSFERIDO solo pueden establecerse desde el flujo contractual del candidato.' }
  }

  // codigo_interno NO se envía: lo genera automáticamente un trigger de BD (ACT-000001, ...)
  // image_url ya no se establece desde este formulario: la fotografía
  // principal se sube después, desde la pestaña Fotografías, vía Storage.
  const { data: nuevoActivo, error } = await supabase
    .from('activos')
    .insert({
      modelo_id,
      estado,
      placa: placa?.trim() ? placa.trim().toUpperCase() : null,
      color: color?.trim() || null,
      vencimiento_tecnomecanica: vencimiento_tecnomecanica || null,
      vencimiento_soat: vencimiento_soat || null,
      vencimiento_impuestos: vencimiento_impuestos || null,
      estado_fisico: estado_fisico.trim()
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error creando activo:', error)
    if (error.code === '23505') { // Unique violation
      return { success: false, error: 'El código interno o la placa ya existen' }
    }
    return { success: false, error: 'Error interno de base de datos' }
  }

  revalidatePath('/admin/activos')
  revalidatePath('/admin')
  revalidatePath('/')

  return { success: true, id: nuevoActivo.id }
}

/**
 * Server Action para cambiar el estado de un candidato y enviar correos
 */
export async function changeCandidateState(candidatoId: string, newState: string) {
  const supabase = await createClient()

  // 1. Validar sesión
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  // 2. Ejecutar UPDATE
  const { data: candidato, error: updateErr } = await supabase
    .from('candidatos')
    .update({ estado: newState })
    .eq('id', candidatoId)
    .select(`
      id, nombres, correo_electronico,
      activos (
        modelos_vehiculo (
          nombre,
          marcas_vehiculo (nombre)
        )
      )
    `)
    .single()

  if (updateErr || !candidato) {
    console.error('Error actualizando candidato:', updateErr)
    return { success: false, error: 'Error actualizando el estado.' }
  }

  // 3. Enviar correo dependiendo del estado
  try {
    if (newState === 'ENTREVISTA') {
      await sendCandidateEmail({
        candidateId: candidato.id,
        to: candidato.correo_electronico,
        subject: "Humania Go — Tu proceso continúa",
        eventType: "INTERVIEW_INVITATION",
        html: `
          <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
            <h2>Hola, ${candidato.nombres}.</h2>
            <p>Nuestro equipo humano ha revisado la información inicial de tu postulación y queremos informarte que tu proceso continúa a la siguiente etapa.</p>
            <p>El siguiente paso corresponde a una entrevista y a las verificaciones adicionales de información.</p>
            <p>Nos pondremos en contacto contigo para coordinar el siguiente paso.</p>
            <br>
            <p>Gracias por tu interés en Humania Go.</p>
            <br>
            <p><strong>Equipo Humano</strong><br>Humania Go</p>
          </div>
        `
      })
    } else if (newState === 'NO_ELEGIBLE') {
      await sendCandidateEmail({
        candidateId: candidato.id,
        to: candidato.correo_electronico,
        subject: "Humania Go — Actualización de tu postulación",
        eventType: "APPLICATION_REJECTED",
        html: `
          <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
            <h2>Hola, ${candidato.nombres}.</h2>
            <p>Muchas gracias por tu interés en Humania Go y por haber participado en nuestro proceso.</p>
            <p>Después de revisar la información disponible y realizar las verificaciones correspondientes, nuestro equipo humano ha decidido no continuar con esta postulación en esta ocasión.</p>
            <p>Agradecemos el tiempo que dedicaste al proceso.</p>
            <p>En otra ocasión podrás volver a aplicar a una oportunidad disponible que se ajuste a tu perfil.</p>
            <p>Te deseamos muchos éxitos.</p>
            <br>
            <p><strong>Equipo Humano</strong><br>Humania Go</p>
          </div>
        `
      })
    } else if (newState === 'SELECCIONADO') {
      const activoData = (candidato.activos as any)?.modelos_vehiculo
      const nombreActivo = activoData ? `${activoData.marcas_vehiculo?.nombre} ${activoData.nombre}` : 'la oportunidad de movilidad';
      
      await sendCandidateEmail({
        candidateId: candidato.id,
        to: candidato.correo_electronico,
        subject: "Humania Go — Has sido seleccionado",
        eventType: "FINAL_SELECTION",
        html: `
          <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
            <h2>Hola, ${candidato.nombres}.</h2>
            <p>Nos alegra informarte que has sido seleccionado para continuar con Humania Go en la oportunidad de movilidad correspondiente al activo:</p>
            <h3>${nombreActivo}</h3>
            <p>Nuestro equipo humano ha elegido tu perfil para avanzar hacia la formalización del acuerdo de arrendamiento con opción de compra, de acuerdo con las condiciones que sean pactadas y formalizadas mediante el contrato correspondiente.</p>
            <p>Nuestro equipo se pondrá en contacto contigo para continuar con los siguientes pasos.</p>
            <br>
            <p>Felicitaciones y gracias por confiar en Humania Go.</p>
            <br>
            <p><strong>Equipo Humano</strong><br>Humania Go</p>
          </div>
        `
      })
    }
  } catch (emailErr) {
    console.error('Error no crítico enviando correo:', emailErr)
  }

  revalidatePath('/admin/candidatos')
  revalidatePath(`/admin/candidatos/${candidatoId}`)
  
  return { success: true }
}

/**
 * Server Action para guardar información avanzada de evaluación
 */
export async function saveCandidatoEvaluacion(candidatoId: string, data: any) {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const payload = {
    candidato_id: candidatoId,
    edad: data.edad ? parseInt(data.edad) : null,
    estado_civil: data.estado_civil || null,
    tiene_hijos: data.tiene_hijos === 'true' ? true : data.tiene_hijos === 'false' ? false : null,
    cantidad_hijos: data.cantidad_hijos ? parseInt(data.cantidad_hijos) : null,
    con_quien_vive: data.con_quien_vive || null,
    tiene_conyuge: data.tiene_conyuge === 'true' ? true : data.tiene_conyuge === 'false' ? false : null,
    tiene_hermanos: data.tiene_hermanos === 'true' ? true : data.tiene_hermanos === 'false' ? false : null,
    cantidad_hermanos: data.cantidad_hermanos ? parseInt(data.cantidad_hermanos) : null,
    personas_dependientes: data.personas_dependientes ? parseInt(data.personas_dependientes) : null,
    descripcion_responsabilidades: data.descripcion_responsabilidades || null,
    updated_at: new Date().toISOString()
  }

  // Verificar si ya existe
  const { data: existing } = await supabase.from('candidatos_evaluacion').select('id').eq('candidato_id', candidatoId).single()

  let error = null
  if (existing) {
    const res = await supabase.from('candidatos_evaluacion').update(payload).eq('id', existing.id)
    error = res.error
  } else {
    const res = await supabase.from('candidatos_evaluacion').insert(payload)
    error = res.error
  }

  if (error) {
    console.error('Error guardando evaluacion:', error)
    return { success: false, error: 'Error interno de base de datos' }
  }

  revalidatePath('/admin/candidatos')
  revalidatePath(`/admin/candidatos/${candidatoId}`)
  
  return { success: true }
}

export async function bulkChangeCandidateState(
  candidatoIds: string[], 
  newState: string, 
  motivo: string
) {
  const supabase = await createClient()

  if (!candidatoIds || candidatoIds.length === 0 || !newState || !motivo) {
    return { success: false, error: 'Faltan parámetros requeridos.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('bulk_change_candidate_status', {
    p_candidato_ids: candidatoIds,
    p_new_state: newState,
    p_motivo: motivo
  });

  if (error) {
    console.error('Error en bulk_change_candidate_status:', error)
    return { success: false, error: error.message || 'Error actualizando estados masivamente.' }
  }

  const { data: candidatos } = await supabase
    .from('candidatos')
    .select('id, nombres, correo_electronico, activos(modelos_vehiculo(nombre, marcas_vehiculo(nombre)))')
    .in('id', candidatoIds);

  if (candidatos && candidatos.length > 0) {
    for (const candidato of candidatos) {
      try {
        if (newState === 'ENTREVISTA') {
          await sendCandidateEmail({
            candidateId: candidato.id,
            to: candidato.correo_electronico,
            subject: "Humania Go — Tu proceso continúa",
            eventType: "INTERVIEW_INVITATION",
            html: `
              <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
                <h2>Hola, ${candidato.nombres}.</h2>
                <p>Nuestro equipo humano ha revisado la información inicial de tu postulación y queremos informarte que tu proceso continúa a la siguiente etapa.</p>
                <p>El siguiente paso corresponde a una entrevista y a las verificaciones adicionales de información.</p>
                <p>Nos pondremos en contacto contigo para coordinar el siguiente paso.</p>
                <br>
                <p>Gracias por tu interés en Humania Go.</p>
                <br>
                <p><strong>Equipo Humano</strong><br>Humania Go</p>
              </div>
            `
          })
        } else if (newState === 'DESCARTADO') {
          await sendCandidateEmail({
            candidateId: candidato.id,
            to: candidato.correo_electronico,
            subject: "Humania Go — Actualización de tu postulación",
            eventType: "APPLICATION_REJECTED",
            html: `
              <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
                <h2>Hola, ${candidato.nombres}.</h2>
                <p>Muchas gracias por tu interés en Humania Go y por haber participado en nuestro proceso.</p>
                <p>Después de revisar la información disponible y realizar las verificaciones correspondientes, nuestro equipo humano ha decidido no continuar con esta postulación en esta ocasión.</p>
                <p>Agradecemos el tiempo que dedicaste al proceso.</p>
                <p>En otra ocasión podrás volver a aplicar a una oportunidad disponible que se ajuste a tu perfil.</p>
                <p>Te deseamos muchos éxitos.</p>
                <br>
                <p><strong>Equipo Humano</strong><br>Humania Go</p>
              </div>
            `
          })
        } else if (newState === 'SELECCIONADO') {
          const activoData = (candidato.activos as any)?.modelos_vehiculo
          const nombreActivo = activoData ? `${activoData.marcas_vehiculo?.nombre} ${activoData.nombre}` : 'la oportunidad de movilidad';
          
          await sendCandidateEmail({
            candidateId: candidato.id,
            to: candidato.correo_electronico,
            subject: "Humania Go — Has sido seleccionado",
            eventType: "FINAL_SELECTION",
            html: `
              <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
                <h2>Hola, ${candidato.nombres}.</h2>
                <p>Nos alegra informarte que has sido seleccionado para continuar con Humania Go en la oportunidad de movilidad correspondiente al activo:</p>
                <h3>${nombreActivo}</h3>
                <p>Nuestro equipo humano ha elegido tu perfil para avanzar hacia la formalización del acuerdo de arrendamiento con opción de compra.</p>
                <p>Nuestro equipo se pondrá en contacto contigo para continuar con los siguientes pasos.</p>
                <br>
                <p>Felicitaciones y gracias por confiar en Humania Go.</p>
                <br>
                <p><strong>Equipo Humano</strong><br>Humania Go</p>
              </div>
            `
          })
        } else if (newState === 'BACKUP') {
          await sendCandidateEmail({
            candidateId: candidato.id,
            to: candidato.correo_electronico,
            subject: "Humania Go — Tu perfil continúa en nuestro proceso",
            eventType: "BACKUP_WAITLIST",
            html: `
              <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
                <h2>Hola, ${candidato.nombres}.</h2>
                <p>Nos gustó mucho tu perfil y queremos contarte que continúas siendo una persona de interés para Humania Go.</p>
                <p>En este momento, la oportunidad y el activo al que aplicaste ya fueron asignados. Por esta razón, hemos dejado tu perfil en nuestra <strong>lista de espera</strong>.</p>
                <p>Cuando tengamos disponible una nueva oportunidad que pueda ajustarse a tu perfil, nuestro equipo de Recursos Humanos se pondrá en contacto contigo para continuar el proceso.</p>
                <p>Queremos agradecerte por tu interés en Humania Go y por el tiempo que has dedicado al proceso.</p>
                <br>
                <p><strong>Humania Go</strong><br>Movemos oportunidades</p>
              </div>
            `
          })
        }
      } catch (err) {
        console.error('Error enviando correo en bulk:', err);
      }
    }
  }

  revalidatePath('/admin/candidatos')

  return { success: true }
}

export async function updateContractStatus(
  candidatoId: string,
  nuevoEstatus: string,
  activoId: string | null,
  motivo: string
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  if (!motivo || !motivo.trim()) {
    return { success: false, error: 'El motivo es obligatorio.' }
  }

  const { error } = await supabase.rpc('set_candidate_contract_status', {
    p_candidato_id: candidatoId,
    p_nuevo_estatus: nuevoEstatus,
    p_activo_id: activoId,
    p_motivo: motivo.trim()
  })

  if (error) {
    console.error('Error en set_candidate_contract_status:', error)
    return { success: false, error: error.message || 'Error interno de base de datos.' }
  }

  revalidatePath('/admin/candidatos')
  revalidatePath(`/admin/candidatos/${candidatoId}`)
  revalidatePath('/admin/activos')
  revalidatePath('/')

  return { success: true }
}

/**
 * Campos del formulario de Referencia Laboral (Documento 09, Fase 9D).
 * Todos como string en el cliente (radios/inputs); se normalizan a su
 * tipo real (SMALLINT/TEXT/NULL) antes de persistir.
 */
export type ReferenciaLaboralFormValues = {
  contacto_nombre: string
  contacto_empresa: string
  contacto_cargo: string
  contacto_relacion: string
  contacto_telefono: string
  responsabilidad: string
  cumplimiento: string
  honestidad_transparencia: string
  cuidado_recursos: string
  autonomia: string
  manejo_dificultades: string
  relaciones: string
  pregunta_confianza: string
  recontratacion: string
  destacaria_trabajador: string
  observaciones_previas: string
}

const CAMPOS_REQUERIDOS_FINALIZACION: [keyof ReferenciaLaboralFormValues, string][] = [
  ['contacto_nombre', 'Nombre de la persona que dará la referencia'],
  ['contacto_empresa', 'Empresa donde trabajaron juntos'],
  ['contacto_cargo', 'Cargo de la persona que dará la referencia'],
  ['contacto_relacion', 'Relación con esta persona'],
  ['contacto_telefono', 'Celular de contacto'],
  ['responsabilidad', 'Responsabilidad'],
  ['cumplimiento', 'Cumplimiento'],
  ['honestidad_transparencia', 'Honestidad y transparencia'],
  ['cuidado_recursos', 'Cuidado de recursos'],
  ['autonomia', 'Autonomía'],
  ['manejo_dificultades', 'Manejo de dificultades'],
  ['relaciones', 'Relaciones'],
  ['pregunta_confianza', 'Pregunta de confianza'],
  ['recontratacion', 'Recontratación'],
]

/**
 * Guarda (crea o actualiza) la Referencia Laboral de un candidato.
 *
 * - finalize=false ("Guardar y continuar después"): guarda lo que haya,
 *   completo o no, sin validar. Estado EN_PROGRESO.
 * - finalize=true ("Guardar y continuar"): valida los campos
 *   obligatorios. Si falta alguno, igual persiste el avance (nunca se
 *   pierde información) y devuelve la lista de lo que falta.
 * - Si currentEstado ya es COMPLETADA, es una corrección: no se
 *   revalida ni se toca el estado/fecha de finalización. PostgreSQL
 *   (trigger trg_referencia_laboral_edicion_permitida) es la autoridad
 *   final sobre si esta corrección esta permitida (bloquea DESCARTADO)
 *   y trg_log_correccion_referencia_laboral guarda el snapshot previo.
 */
export async function saveReferenciaLaboral(
  candidatoId: string,
  existingId: string | null,
  currentEstado: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | null,
  formValues: ReferenciaLaboralFormValues,
  finalize: boolean
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const opcionOInt = (v: string) => (v ? parseInt(v) : null)
  const textoOTrim = (v: string) => v?.trim() || null

  /**
   * Fase 13 (Documento 17/18): segunda validacion server-side de formato
   * y longitud para los 5 campos endurecidos en la migracion 00028, antes
   * de que PostgreSQL sea la ultima barrera. Un valor no vacio que no
   * cumple min/max/charset se guarda como null (no se envia a la base de
   * datos) en vez de dejar que el CHECK de Postgres rechace todo el
   * guardado con un error crudo -- consistente con "Guardar y continuar
   * después" (sin validar) mientras el campo sigue incompleto; al
   * finalizar, un valor null ya cae naturalmente en missingFields de
   * abajo, con el mismo mensaje claro que un campo vacio.
   */
  const textoConReglas = (v: string, regex: RegExp, min: number, max: number): string | null => {
    const t = v?.trim()
    if (!t) return null
    if (t.length < min || t.length > max || !regex.test(t)) return null
    return t
  }

  const payload: Record<string, unknown> = {
    contacto_nombre: textoConReglas(formValues.contacto_nombre, LETTERS_ONLY, 5, 33),
    contacto_empresa: textoConReglas(formValues.contacto_empresa, LETTERS_ONLY, 5, 33),
    contacto_cargo: textoConReglas(formValues.contacto_cargo, LETTERS_ONLY, 5, 33),
    contacto_relacion: formValues.contacto_relacion || null,
    contacto_telefono: textoOTrim(formValues.contacto_telefono),
    responsabilidad: opcionOInt(formValues.responsabilidad),
    cumplimiento: opcionOInt(formValues.cumplimiento),
    honestidad_transparencia: opcionOInt(formValues.honestidad_transparencia),
    cuidado_recursos: opcionOInt(formValues.cuidado_recursos),
    autonomia: opcionOInt(formValues.autonomia),
    manejo_dificultades: opcionOInt(formValues.manejo_dificultades),
    relaciones: opcionOInt(formValues.relaciones),
    pregunta_confianza: opcionOInt(formValues.pregunta_confianza),
    recontratacion: opcionOInt(formValues.recontratacion),
    destacaria_trabajador: textoConReglas(formValues.destacaria_trabajador, LETTERS_WITH_PUNCTUATION, 10, 111),
    observaciones_previas: textoConReglas(formValues.observaciones_previas, LETTERS_WITH_PUNCTUATION, 10, 111),
  }

  const esCorreccion = currentEstado === 'COMPLETADA'
  let missingFields: string[] = []

  if (!esCorreccion) {
    if (finalize) {
      missingFields = CAMPOS_REQUERIDOS_FINALIZACION
        .filter(([key]) => payload[key] === null || payload[key] === '')
        .map(([, label]) => label)

      if (typeof payload.contacto_telefono === 'string' && payload.contacto_telefono && !PHONE_CO.test(payload.contacto_telefono)) {
        missingFields.push('Celular de contacto (debe tener exactamente 10 números e iniciar en 3)')
      }

      if (missingFields.length === 0) {
        payload.estado = 'COMPLETADA'
        payload.completado_at = new Date().toISOString()
      } else {
        payload.estado = 'EN_PROGRESO'
      }
    } else {
      payload.estado = 'EN_PROGRESO'
    }
  }
  // esCorreccion: no se toca estado ni completado_at, solo el contenido.

  let error = null
  let savedId = existingId

  if (existingId) {
    const res = await supabase.from('referencia_laboral').update(payload).eq('id', existingId)
    error = res.error
  } else {
    payload.candidato_id = candidatoId
    payload.usuario_id = user.id
    const res = await supabase.from('referencia_laboral').insert(payload).select('id').single()
    error = res.error
    savedId = res.data?.id || null
  }

  if (error) {
    console.error('Error guardando referencia laboral:', error)
    const esExcepcionDeNegocio = error.message?.includes('ENTREVISTA') || error.message?.includes('DESCARTADO')
    return { success: false, error: esExcepcionDeNegocio ? error.message : 'Error interno al guardar la referencia laboral.' }
  }

  revalidatePath(`/admin/candidatos/${candidatoId}`)

  if (finalize && !esCorreccion && missingFields.length > 0) {
    return { success: false, error: 'Faltan campos obligatorios para completar la referencia.', missingFields, id: savedId }
  }

  return { success: true, id: savedId, estado: (payload.estado as string) || currentEstado }
}

/**
 * Modulo de administradores (Fase 11, Subfase 11C). La autoridad real
 * de estas operaciones vive en las RPC SECURITY DEFINER
 * (admin_crear_usuario, admin_set_role, admin_set_activo), que ya
 * validan is_super_admin() en base de datos -- estas Server Actions
 * son el puente hacia la API de administracion de Supabase Auth
 * (que no tiene RLS propia, por eso aqui se valida explicitamente
 * antes de tocarla) y una capa de mensajes claros para la interfaz.
 */
export async function getAdminUsersList() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', usuarios: [] }

  const { data: rows, error } = await supabase
    .from('admin_users')
    .select('id, nombre, role, activo, created_at, created_by')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error obteniendo administradores:', error)
    return { success: false, error: 'No se pudo cargar la lista de administradores.', usuarios: [] }
  }

  const serviceClient = getServiceClient()
  const usuarios = await Promise.all((rows || []).map(async (r) => {
    const { data } = await serviceClient.auth.admin.getUserById(r.id)
    return { ...r, correo: data?.user?.email || '—' }
  }))

  return { success: true, usuarios }
}

export async function inviteAdminUser(correo: string, nombre: string, role: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  // Verificacion explicita server-side antes de tocar la API de Auth
  // (que no tiene RLS propia -- esta es la barrera real para esta
  // operacion puntual, no solo ocultar el boton en la interfaz).
  const { data: caller } = await supabase.from('admin_users').select('role, activo').eq('id', session.user.id).single()
  if (!caller || !caller.activo || caller.role !== 'SUPER_ADMIN') {
    return { success: false, error: 'No autorizado: solo un SUPER_ADMIN puede invitar administradores.' }
  }

  if (!correo?.trim() || !nombre?.trim()) {
    return { success: false, error: 'Correo y nombre son obligatorios.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
    return { success: false, error: 'Ingresa un correo electrónico válido.' }
  }
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    return { success: false, error: 'Rol inválido.' }
  }

  let siteUrl: string
  try {
    siteUrl = getSiteUrlOrThrow()
  } catch (e: any) {
    return { success: false, error: e.message }
  }

  const serviceClient = getServiceClient()
  const { data: invited, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(correo.trim(), {
    redirectTo: `${siteUrl}/crear-password`
  })

  if (inviteErr || !invited?.user) {
    console.error('Error invitando administrador:', inviteErr)
    if (inviteErr?.code === 'over_email_send_rate_limit') {
      return { success: false, error: 'Se alcanzó el límite de envío de correos de Supabase. Espera unos minutos e inténtalo de nuevo, o configura un SMTP propio en el proyecto.' }
    }
    if (inviteErr?.code === 'email_exists') {
      return { success: false, error: 'Ese correo ya está registrado como usuario.' }
    }
    return { success: false, error: inviteErr?.message || 'No se pudo enviar la invitación.' }
  }

  const { error: rpcErr } = await supabase.rpc('admin_crear_usuario', {
    p_user_id: invited.user.id,
    p_nombre: nombre.trim(),
    p_role: role
  })

  if (rpcErr) {
    console.error('Error registrando administrador:', rpcErr)
    // El usuario de Auth ya se creo -- se elimina para no dejar un
    // usuario huerfano sin fila en admin_users.
    await serviceClient.auth.admin.deleteUser(invited.user.id)
    return { success: false, error: rpcErr.message || 'No se pudo registrar el administrador.' }
  }

  revalidatePath('/admin/administradores')
  return { success: true }
}

export async function setAdminRole(adminId: string, newRole: string, motivo: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('admin_set_role', {
    p_admin_id: adminId,
    p_new_role: newRole,
    p_motivo: motivo
  })

  if (error) {
    console.error('Error cambiando rol de administrador:', error)
    return { success: false, error: error.message || 'No se pudo cambiar el rol.' }
  }

  revalidatePath('/admin/administradores')
  return { success: true }
}

export async function setAdminActivo(adminId: string, activo: boolean, motivo: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('admin_set_activo', {
    p_admin_id: adminId,
    p_activo: activo,
    p_motivo: motivo
  })

  if (error) {
    console.error('Error activando/desactivando administrador:', error)
    return { success: false, error: error.message || 'No se pudo actualizar el estado del administrador.' }
  }

  // Capa complementaria (Supabase Auth ban): admin_users.activo ya es
  // la fuente de verdad (RPC de arriba, ya aplicada); esto solo
  // bloquea ademas logins/refrescos nuevos de inmediato. Si falla, no
  // se revierte el cambio en admin_users -- ese es el que realmente
  // protege el sistema tras el retrofit de la Subfase 11C.
  const serviceClient = getServiceClient()
  const { error: banErr } = await serviceClient.auth.admin.updateUserById(adminId, {
    ban_duration: activo ? 'none' : '876000h'
  })
  if (banErr) {
    console.error('Aviso: no se pudo sincronizar el bloqueo de Supabase Auth (no crítico):', banErr)
  }

  revalidatePath('/admin/administradores')
  return { success: true }
}

/**
 * Fase 13 (Documento 17 sección 8, migración 00032): activa/desactiva un
 * modelo, separado del resto de edición. La RPC set_modelo_activo es la
 * autoridad final: exige admin, motivo, y solo registra historial si el
 * valor realmente cambia.
 */
export async function setModeloActivo(modeloId: string, activo: boolean, motivo: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('set_modelo_activo', {
    p_modelo_id: modeloId,
    p_activo: activo,
    p_motivo: motivo
  })

  if (error) {
    console.error('Error activando/desactivando modelo:', error)
    return { success: false, error: error.message || 'No se pudo actualizar el estado del modelo.' }
  }

  revalidatePath('/admin/modelos')
  revalidatePath(`/admin/modelos/${modeloId}/editar`)
  return { success: true }
}

/**
 * Historial de activación/desactivación de un modelo (Fase 13), resolviendo
 * el correo del administrador responsable de cada evento -- mismo patrón
 * que getCandidateStatusHistory.
 */
export async function getModeloActivacionHistory(modeloId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', historial: [] }

  const { data: historial, error } = await supabase
    .from('modelo_activacion_history')
    .select('id, accion, descripcion, realizado_por, created_at')
    .eq('modelo_id', modeloId)
    .order('created_at', { ascending: false })

  if (error || !historial) {
    console.error('Error obteniendo historial del modelo:', error)
    return { success: false, error: 'No se pudo cargar el historial', historial: [] }
  }

  const serviceClient = getServiceClient()
  const usuarioIds = [...new Set(historial.map(h => h.realizado_por))]
  const emailPorUsuario: Record<string, string> = {}
  await Promise.all(usuarioIds.map(async (uid) => {
    const { data } = await serviceClient.auth.admin.getUserById(uid)
    if (data?.user?.email) emailPorUsuario[uid] = data.user.email
  }))

  return {
    success: true,
    historial: historial.map(h => ({ ...h, usuario_email: emailPorUsuario[h.realizado_por] || 'Administrador' }))
  }
}

/**
 * Recuperación de contraseña de administradores (Fase 13, Documento 17
 * sección 9, Documento 18 sección 16.3). Solo tiene efecto real para un
 * SUPER_ADMIN -- RLS en admin_password_recovery_requests ya restringe el
 * SELECT a is_super_admin(), y las RPC de aprobar/rechazar exigen lo mismo
 * server-side; un ADMIN que llame estas funciones simplemente no ve filas
 * o recibe el error de la RPC.
 */
export async function listarSolicitudesRecuperacionPendientes() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, solicitudes: [] }

  // admin_password_recovery_requests tiene DOS llaves foraneas hacia
  // admin_users (admin_id y aprobado_por) -- hay que decirle a PostgREST
  // cual usar explicitamente (admin_users!<nombre_constraint>), o falla
  // con PGRST201 "more than one relationship was found". Bug real
  // encontrado en QA (Dayro, 2026-08-24): la solicitud se creaba
  // correctamente, pero esta consulta fallaba en silencio y la
  // notificacion nunca aparecia para el SUPER_ADMIN.
  const { data, error } = await supabase
    .from('admin_password_recovery_requests')
    .select('id, correo, solicitado_en, admin_users!admin_password_recovery_requests_admin_id_fkey(nombre)')
    .eq('estado', 'PENDIENTE')
    .order('solicitado_en', { ascending: true })

  if (error) {
    console.error('Error listando solicitudes de recuperación:', error)
    return { success: false, solicitudes: [] }
  }

  return { success: true, solicitudes: data || [] }
}

export async function aprobarRecuperacionAction(solicitudId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { data: solicitud } = await supabase
    .from('admin_password_recovery_requests')
    .select('correo')
    .eq('id', solicitudId)
    .single()
  if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' }

  const { error: rpcErr } = await supabase.rpc('aprobar_recuperacion_password', { p_solicitud_id: solicitudId })
  if (rpcErr) {
    console.error('Error aprobando recuperación:', rpcErr)
    return { success: false, error: rpcErr.message || 'No se pudo aprobar la solicitud.' }
  }

  // Mecanismo nativo de Supabase Auth (regla no negociable #9: nunca un
  // token propio). Se usa el cliente de Secret Key porque resetPasswordForEmail
  // no depende de RLS ni de sesión -- es el mismo patrón que inviteUserByEmail.
  let siteUrl: string
  try {
    siteUrl = getSiteUrlOrThrow()
  } catch (e: any) {
    // La solicitud ya quedó APROBADA en base de datos (paso anterior) --
    // se puede reintentar el envío una vez se corrija la configuración,
    // sin perder el estado de aprobación.
    return { success: false, error: e.message }
  }

  const serviceClient = getServiceClient()
  const { error: sendErr } = await serviceClient.auth.resetPasswordForEmail(solicitud.correo, {
    redirectTo: `${siteUrl}/crear-password`
  })

  if (sendErr) {
    console.error('Error enviando correo de recuperación:', sendErr)
    // Error real, nunca genérico (regla de este proyecto) -- la solicitud
    // ya quedó APROBADA en base de datos, así que se puede reintentar el
    // envío sin perder el estado de aprobación.
    if ((sendErr as any)?.code === 'over_email_send_rate_limit') {
      return { success: false, error: 'La solicitud quedó aprobada, pero se alcanzó el límite de envío de correos de Supabase. Espera unos minutos e inténtalo de nuevo, o configura un SMTP propio.' }
    }
    return { success: false, error: `La solicitud quedó aprobada, pero no se pudo enviar el correo: ${sendErr.message}` }
  }

  const { error: marcarErr } = await supabase.rpc('marcar_correo_recuperacion_enviado', { p_solicitud_id: solicitudId })
  if (marcarErr) {
    console.error('Aviso: correo enviado pero no se pudo marcar correo_enviado_en:', marcarErr)
  }

  revalidatePath('/admin')
  return { success: true }
}

export async function rechazarRecuperacionAction(solicitudId: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('rechazar_recuperacion_password', { p_solicitud_id: solicitudId })
  if (error) {
    console.error('Error rechazando recuperación:', error)
    return { success: false, error: error.message || 'No se pudo rechazar la solicitud.' }
  }

  revalidatePath('/admin')
  return { success: true }
}

// ==========================================
// Fase 15b — video de /presentacion, editable por el SUPER_ADMIN
// ==========================================

export async function setPresentacionVideo(youtubeVideoId: string, youtubeUrlOriginal: string, titulo: string, motivo: string, perfil: 'GENERAL' | 'CONDUCTOR' | 'INDEPENDIENTE') {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('set_presentacion_video', {
    p_youtube_video_id: youtubeVideoId,
    p_youtube_url_original: youtubeUrlOriginal,
    p_titulo: titulo || null,
    p_motivo: motivo,
    p_perfil: perfil
  })

  if (error) {
    console.error('Error actualizando el video de presentación:', error)
    return { success: false, error: error.message || 'No se pudo actualizar el video.' }
  }

  revalidatePath('/admin/presentacion')
  return { success: true }
}

export async function getPresentacionVideoHistorial() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', historial: [] }

  const { data: historial, error } = await supabase
    .from('presentacion_video_versions')
    .select('id, youtube_video_id, youtube_url_original, titulo, motivo, is_current, perfil, creado_en, admin_users(nombre)')
    .order('creado_en', { ascending: false })

  if (error || !historial) {
    console.error('Error obteniendo historial de videos de presentación:', error)
    return { success: false, error: 'No se pudo cargar el historial', historial: [] }
  }

  return { success: true, historial }
}

export async function getPresentacionConfiguracion() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado', segmentacionActiva: false }

  const { data, error } = await supabase
    .from('presentacion_configuracion')
    .select('segmentacion_activa')
    .eq('id', true)
    .single()

  if (error || !data) {
    console.error('Error obteniendo configuración de presentación:', error)
    return { success: false, error: 'No se pudo cargar la configuración', segmentacionActiva: false }
  }

  return { success: true, segmentacionActiva: data.segmentacion_activa as boolean }
}

export async function setPresentacionSegmentacionActiva(activa: boolean, motivo: string) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.rpc('set_presentacion_segmentacion_activa', {
    p_activa: activa,
    p_motivo: motivo
  })

  if (error) {
    console.error('Error actualizando segmentación de presentación:', error)
    return { success: false, error: error.message || 'No se pudo actualizar la configuración.' }
  }

  revalidatePath('/admin/presentacion')
  return { success: true }
}
