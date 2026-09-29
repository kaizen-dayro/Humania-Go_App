// Humania WhatsApp Brain (KAI-44) — validación de fichas y versiones.
// Ver Documentos/SDD/whatsapp-brain/spec.md 5.1 y plan.md 6. La entrada se
// trata siempre como no confiable (`unknown`): llega de un archivo JSON.
// Cada problema identifica ficha, campo, regla y motivo (esperado vs. recibido).

import {
  CAMPOS_FICHA,
  CAMPOS_VERSION,
  CATEGORIAS,
  ESTADOS_BRAIN,
  ESTADOS_VERDAD,
  FORMATO_BRAIN,
  NIVELES_CONFIANZA,
  PATRON_AUDIO,
  PATRON_ID_FICHA,
  PATRON_INTENCION,
  ROLES_APROBACION,
  TIPOS_FUENTE,
  VISIBILIDADES,
  type CodigoRegla,
  type OpcionesValidacion,
  type ProblemaValidacion,
  type ResultadoValidacion,
} from './tipos'

/**
 * Nivel del problema "ficha PUBLICO_AUTORIZADO sin estado CONFIRMADO_APROBADO"
 * (plan.md 12.2). ERROR bloqueante por decisión del Product Owner (29-09-2026):
 * una inconsistencia de autorización no puede entrar como contenido válido,
 * aunque `publico.ts` también la bloquee. Los dos ejes (estado de verdad y
 * visibilidad) siguen siendo independientes: esta regla solo impide la
 * combinación incompatible con la política de publicación.
 */
export const NIVEL_PUBLICO_NO_APROBADO: ProblemaValidacion['nivel'] = 'ERROR'

// ---------------------------------------------------------------- fechas ISO

const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
}

function esFechaReal(anio: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false
  const maximo = mes === 2 && esBisiesto(anio) ? 29 : DIAS_POR_MES[mes - 1]
  return dia <= maximo
}

/** `YYYY-MM-DD` con una fecha que existe (rechaza `2026-02-30`). No usa `new Date(texto)`, que corrige fechas imposibles. */
export function esFechaIso(valor: unknown): boolean {
  if (typeof valor !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  return !!m && esFechaReal(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** ISO 8601 con zona horaria obligatoria (`Z` o `±HH:MM`), ej. `2026-09-29T10:30:00-05:00`. */
export function esFechaHoraIso(valor: unknown): boolean {
  if (typeof valor !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(valor)
  if (!m || !esFechaReal(Number(m[1]), Number(m[2]), Number(m[3]))) return false
  const [hora, minuto, segundo] = [Number(m[4]), Number(m[5]), m[6] === undefined ? 0 : Number(m[6])]
  if (hora > 23 || minuto > 59 || segundo > 59) return false
  if (m[7] !== 'Z' && (Number(m[9]) > 14 || Number(m[10]) > 59)) return false
  return true
}

// ---------------------------------------------------------------- utilidades

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esTextoNoVacio = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const describir = (v: unknown): string => {
  if (v === undefined) return 'ausente'
  if (v === null) return 'null'
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 60)}…"` : `"${v}"`
  if (Array.isArray(v)) return `lista de ${v.length}`
  if (typeof v === 'object') return 'objeto'
  return `${typeof v} ${String(v)}`
}

/** Divide una lista de problemas en errores y advertencias. */
export function separar(problemas: ProblemaValidacion[]): ResultadoValidacion {
  return {
    errores: problemas.filter((p) => p.nivel === 'ERROR'),
    advertencias: problemas.filter((p) => p.nivel === 'ADVERTENCIA'),
  }
}

/** Solo los campos del formato de una ficha (sin propiedades desconocidas), en orden fijo. */
export function camposDelFormato(ficha: Record<string, unknown>): Record<string, unknown> {
  const limpio: Record<string, unknown> = {}
  for (const campo of CAMPOS_FICHA) limpio[campo] = ficha[campo]
  return limpio
}

// ---------------------------------------------------------------- ficha

/**
 * Valida una ficha (spec.md 5.1). Devuelve todos los problemas encontrados, no
 * solo el primero. Nunca lanza, sin importar la forma de la entrada.
 */
export function validarFicha(entrada: unknown, opciones: OpcionesValidacion = {}): ProblemaValidacion[] {
  const problemas: ProblemaValidacion[] = []
  if (!esObjeto(entrada)) {
    return [{ nivel: 'ERROR', regla: 'TIPO_INVALIDO', campo: '(ficha)', motivo: `se esperaba un objeto; se recibió ${describir(entrada)}` }]
  }
  const f = entrada
  const fichaId = typeof f.id === 'string' ? f.id : undefined
  const agregar = (campo: string, regla: CodigoRegla, motivo: string, nivel: ProblemaValidacion['nivel'] = 'ERROR') =>
    problemas.push({ nivel, fichaId, campo, regla, motivo })

  // Campos obligatorios: deben estar presentes aunque su valor permitido sea null.
  for (const campo of CAMPOS_FICHA) {
    if (!(campo in f) || f[campo] === undefined) agregar(campo, 'CAMPO_OBLIGATORIO', 'el campo es obligatorio y no está presente')
  }
  const presente = (campo: string) => campo in f && f[campo] !== undefined

  if (presente('id') && !(typeof f.id === 'string' && PATRON_ID_FICHA.test(f.id))) {
    agregar('id', 'FORMATO_ID', `se esperaba el formato KB-NNNN; se recibió ${describir(f.id)}`)
  }
  if (presente('version') && !(typeof f.version === 'number' && Number.isInteger(f.version) && f.version >= 1)) {
    agregar('version', 'VALOR_NO_PERMITIDO', `se esperaba un entero mayor o igual a 1; se recibió ${describir(f.version)}`)
  }
  const enLista = (campo: string, lista: readonly string[]) => {
    if (presente(campo) && !(typeof f[campo] === 'string' && lista.includes(f[campo] as string))) {
      agregar(campo, 'VALOR_NO_PERMITIDO', `se esperaba uno de ${lista.join(', ')}; se recibió ${describir(f[campo])}`)
    }
  }
  enLista('categoria', CATEGORIAS)
  enLista('nivelConfianza', NIVELES_CONFIANZA)
  enLista('estadoVerdad', ESTADOS_VERDAD)
  enLista('visibilidad', VISIBILIDADES)

  if (presente('intencion') && !(typeof f.intencion === 'string' && PATRON_INTENCION.test(f.intencion))) {
    agregar('intencion', 'FORMATO_INTENCION', `se esperaba un código en MAYÚSCULAS_CON_GUION_BAJO; se recibió ${describir(f.intencion)}`)
  }
  for (const campo of ['pregunta', 'versionNegocio'] as const) {
    if (!presente(campo)) continue
    if (typeof f[campo] !== 'string') agregar(campo, 'TIPO_INVALIDO', `se esperaba texto; se recibió ${describir(f[campo])}`)
    else if (!esTextoNoVacio(f[campo])) agregar(campo, 'TEXTO_VACIO', 'el texto no puede estar vacío')
  }

  // Respuesta: texto; obligatoria (no vacía) en estados confirmados (AC-08).
  if (presente('respuesta')) {
    if (typeof f.respuesta !== 'string') agregar('respuesta', 'TIPO_INVALIDO', `se esperaba texto; se recibió ${describir(f.respuesta)}`)
    else if ((f.estadoVerdad === 'CONFIRMADO' || f.estadoVerdad === 'CONFIRMADO_APROBADO') && !esTextoNoVacio(f.respuesta)) {
      agregar('respuesta', 'RESPUESTA_VACIA', `una ficha ${f.estadoVerdad} debe tener una respuesta no vacía`)
    }
  }

  // Audio: null o AUDIO-NNN; si hay catálogo, debe estar en él (AC-20, AC-21).
  if (presente('audioId') && f.audioId !== null) {
    if (!(typeof f.audioId === 'string' && PATRON_AUDIO.test(f.audioId))) {
      agregar('audioId', 'AUDIO_FORMATO', `se esperaba null o el formato AUDIO-NNN; se recibió ${describir(f.audioId)}`)
    } else if (opciones.catalogoAudios && !opciones.catalogoAudios.has(f.audioId)) {
      agregar('audioId', 'AUDIO_DESCONOCIDO', `el audio ${f.audioId} no existe en el catálogo de audios`)
    }
  }

  // Fuentes: al menos una; cada una con tipo válido y referencia (AC-04).
  if (presente('fuentes')) {
    if (!Array.isArray(f.fuentes)) agregar('fuentes', 'TIPO_INVALIDO', `se esperaba una lista; se recibió ${describir(f.fuentes)}`)
    else {
      if (f.fuentes.length === 0) agregar('fuentes', 'FUENTES', 'se requiere al menos una fuente')
      f.fuentes.forEach((fuente, i) => {
        const campo = `fuentes[${i}]`
        if (!esObjeto(fuente)) return agregar(campo, 'FUENTES', `se esperaba un objeto; se recibió ${describir(fuente)}`)
        if (!(typeof fuente.tipo === 'string' && (TIPOS_FUENTE as readonly string[]).includes(fuente.tipo))) {
          agregar(`${campo}.tipo`, 'FUENTES', `se esperaba uno de ${TIPOS_FUENTE.join(', ')}; se recibió ${describir(fuente.tipo)}`)
        }
        if (!esTextoNoVacio(fuente.referencia)) agregar(`${campo}.referencia`, 'FUENTES', 'la referencia de la fuente es obligatoria y no puede estar vacía')
        if (fuente.fecha !== undefined && fuente.fecha !== null && !esFechaIso(fuente.fecha)) {
          agregar(`${campo}.fecha`, 'FECHA_ISO', `se esperaba YYYY-MM-DD válida; se recibió ${describir(fuente.fecha)}`)
        }
      })
    }
  }

  if (presente('requiereHumano') && typeof f.requiereHumano !== 'boolean') {
    agregar('requiereHumano', 'TIPO_INVALIDO', `se esperaba true o false; se recibió ${describir(f.requiereHumano)}`)
  }
  if (presente('motivoEscalamiento') && f.motivoEscalamiento !== null && typeof f.motivoEscalamiento !== 'string') {
    agregar('motivoEscalamiento', 'TIPO_INVALIDO', `se esperaba texto o null; se recibió ${describir(f.motivoEscalamiento)}`)
  }
  if (f.requiereHumano === true && !esTextoNoVacio(f.motivoEscalamiento)) {
    agregar('motivoEscalamiento', 'ESCALAMIENTO', 'una ficha con requiereHumano = true debe indicar el motivo de escalamiento (AC-07)')
  }

  // Contradicción: si y solo si CONTRADICTORIO; con ≥ 2 fuentes (AC-05).
  if (presente('contradiccion')) {
    const c = f.contradiccion
    if (c !== null) {
      if (!esObjeto(c)) agregar('contradiccion', 'TIPO_INVALIDO', `se esperaba un objeto o null; se recibió ${describir(c)}`)
      else {
        if (!esTextoNoVacio(c.descripcion)) agregar('contradiccion.descripcion', 'CONTRADICCION', 'la descripción de la contradicción es obligatoria')
        if (!esTextoNoVacio(c.decisionRequerida)) agregar('contradiccion.decisionRequerida', 'CONTRADICCION', 'la decisión humana requerida es obligatoria')
      }
      if (f.estadoVerdad !== 'CONTRADICTORIO') {
        agregar('contradiccion', 'CONTRADICCION', `solo una ficha CONTRADICTORIO puede tener contradicción; el estado es ${describir(f.estadoVerdad)}`)
      }
      if (Array.isArray(f.fuentes) && f.fuentes.length < 2) {
        agregar('fuentes', 'CONTRADICCION', `una contradicción debe registrar al menos 2 fuentes; hay ${f.fuentes.length}`)
      }
    } else if (f.estadoVerdad === 'CONTRADICTORIO') {
      agregar('contradiccion', 'CONTRADICCION', 'una ficha CONTRADICTORIO debe registrar la contradicción (descripción y decisión requerida)')
    }
  }

  // Aprobación: si y solo si CONFIRMADO_APROBADO; rol PRODUCT_OWNER (AC-06, D5).
  if (presente('aprobacion')) {
    const a = f.aprobacion
    if (a !== null) {
      if (!esObjeto(a)) agregar('aprobacion', 'TIPO_INVALIDO', `se esperaba un objeto o null; se recibió ${describir(a)}`)
      else {
        if (!esTextoNoVacio(a.aprobadoPor)) agregar('aprobacion.aprobadoPor', 'APROBACION', 'quién aprobó es obligatorio')
        if (!(typeof a.rol === 'string' && (ROLES_APROBACION as readonly string[]).includes(a.rol))) {
          agregar('aprobacion.rol', 'APROBACION', `se esperaba uno de ${ROLES_APROBACION.join(', ')}; se recibió ${describir(a.rol)}`)
        }
        if (!esFechaIso(a.fecha)) agregar('aprobacion.fecha', 'FECHA_ISO', `se esperaba YYYY-MM-DD válida; se recibió ${describir(a.fecha)}`)
      }
      if (f.estadoVerdad !== 'CONFIRMADO_APROBADO') {
        agregar('aprobacion', 'APROBACION', `solo una ficha CONFIRMADO_APROBADO puede tener aprobación; el estado es ${describir(f.estadoVerdad)}`)
      }
    } else if (f.estadoVerdad === 'CONFIRMADO_APROBADO') {
      agregar('aprobacion', 'APROBACION', 'una ficha CONFIRMADO_APROBADO debe registrar la aprobación (quién, rol y fecha)')
    }
  }

  if (presente('fechaRevision') && !esFechaIso(f.fechaRevision)) {
    agregar('fechaRevision', 'FECHA_ISO', `se esperaba YYYY-MM-DD válida; se recibió ${describir(f.fechaRevision)}`)
  }
  if (presente('notasInternas') && f.notasInternas !== null && typeof f.notasInternas !== 'string') {
    agregar('notasInternas', 'TIPO_INVALIDO', `se esperaba texto o null; se recibió ${describir(f.notasInternas)}`)
  }

  // Advertencias (no bloquean).
  for (const clave of Object.keys(f)) {
    if (!(CAMPOS_FICHA as readonly string[]).includes(clave)) {
      agregar(clave, 'PROPIEDAD_DESCONOCIDA', 'la propiedad no pertenece al formato; se ignora y nunca participa en la exposición', 'ADVERTENCIA')
    }
  }
  if (f.visibilidad === 'PUBLICO_AUTORIZADO' && typeof f.estadoVerdad === 'string' && f.estadoVerdad !== 'CONFIRMADO_APROBADO') {
    agregar(
      'visibilidad',
      'PUBLICO_NO_APROBADO',
      `una ficha PUBLICO_AUTORIZADO debe estar CONFIRMADO_APROBADO (texto aprobado por el Product Owner); su estado es ${f.estadoVerdad}. Cambiar la visibilidad a NO_AUTORIZADO_PARA_CLIENTE o INTERNO hasta aprobarla`,
      NIVEL_PUBLICO_NO_APROBADO,
    )
  }
  return problemas
}

// ---------------------------------------------------------------- versión del Brain

/** Valida una versión del Brain (spec.md 6.1, plan.md 5.2) y todas sus fichas. Nunca lanza. */
export function validarVersionBrain(entrada: unknown, opciones: OpcionesValidacion = {}): ResultadoValidacion {
  if (!esObjeto(entrada)) {
    return separar([{ nivel: 'ERROR', regla: 'TIPO_INVALIDO', campo: '(versión)', motivo: `se esperaba un objeto; se recibió ${describir(entrada)}` }])
  }
  const v = entrada
  const brainVersion = typeof v.version === 'number' ? v.version : undefined
  const problemas: ProblemaValidacion[] = []
  const agregar = (campo: string, regla: CodigoRegla, motivo: string, nivel: ProblemaValidacion['nivel'] = 'ERROR') =>
    problemas.push({ nivel, brainVersion, campo, regla, motivo })

  for (const campo of CAMPOS_VERSION) {
    if (!(campo in v) || v[campo] === undefined) agregar(campo, 'CAMPO_OBLIGATORIO', 'el campo es obligatorio y no está presente')
  }
  if (v.formato !== undefined && v.formato !== FORMATO_BRAIN) agregar('formato', 'VALOR_NO_PERMITIDO', `se esperaba "${FORMATO_BRAIN}"; se recibió ${describir(v.formato)}`)
  if (v.version !== undefined && !(typeof v.version === 'number' && Number.isInteger(v.version) && v.version >= 1)) {
    agregar('version', 'VERSION_BRAIN', `se esperaba un entero mayor o igual a 1; se recibió ${describir(v.version)}`)
  }
  if (v.estado !== undefined && !(typeof v.estado === 'string' && (ESTADOS_BRAIN as readonly string[]).includes(v.estado))) {
    agregar('estado', 'VALOR_NO_PERMITIDO', `se esperaba uno de ${ESTADOS_BRAIN.join(', ')}; se recibió ${describir(v.estado)}`)
  }
  if (v.creadaEn !== undefined && !esFechaHoraIso(v.creadaEn)) {
    agregar('creadaEn', 'FECHA_ISO', `se esperaba fecha y hora ISO 8601 con zona horaria; se recibió ${describir(v.creadaEn)}`)
  }
  if (v.activadaEn !== undefined && v.activadaEn !== null && !esFechaHoraIso(v.activadaEn)) {
    agregar('activadaEn', 'FECHA_ISO', `se esperaba null o fecha y hora ISO 8601 con zona horaria; se recibió ${describir(v.activadaEn)}`)
  }
  if (v.aprobadaPor !== undefined && v.aprobadaPor !== null && !esTextoNoVacio(v.aprobadaPor)) {
    agregar('aprobadaPor', 'TIPO_INVALIDO', `se esperaba null o texto no vacío; se recibió ${describir(v.aprobadaPor)}`)
  }
  if ((v.estado === 'ACTIVA' || v.estado === 'HISTORICA') && (!esTextoNoVacio(v.activadaEn) || !esTextoNoVacio(v.aprobadaPor))) {
    agregar('estado', 'ESTADO_BRAIN', `una versión ${v.estado} debe tener activadaEn y aprobadaPor`)
  }
  if (v.descripcionCambios !== undefined && !esTextoNoVacio(v.descripcionCambios)) {
    agregar('descripcionCambios', 'TEXTO_VACIO', 'la descripción de cambios es obligatoria')
  }
  for (const clave of Object.keys(v)) {
    if (!(CAMPOS_VERSION as readonly string[]).includes(clave)) {
      agregar(clave, 'PROPIEDAD_DESCONOCIDA', 'la propiedad no pertenece al formato de la versión; se ignora', 'ADVERTENCIA')
    }
  }

  if (v.fichas === undefined) {
    // Ya reportado como CAMPO_OBLIGATORIO.
  } else if (!Array.isArray(v.fichas)) {
    agregar('fichas', 'TIPO_INVALIDO', `se esperaba una lista de fichas; se recibió ${describir(v.fichas)}`)
  } else {
    const vistos = new Set<string>()
    for (const ficha of v.fichas) {
      for (const p of validarFicha(ficha, opciones)) problemas.push({ ...p, brainVersion })
      const id = esObjeto(ficha) && typeof ficha.id === 'string' ? ficha.id : null
      if (id !== null) {
        if (vistos.has(id)) problemas.push({ nivel: 'ERROR', brainVersion, fichaId: id, campo: 'id', regla: 'ID_DUPLICADO', motivo: `el id ${id} aparece más de una vez en la versión` })
        vistos.add(id)
      }
    }
  }
  return separar(problemas)
}
