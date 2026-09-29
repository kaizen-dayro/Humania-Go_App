// Humania WhatsApp Brain (KAI-44) — consulta pública (spec.md 5.5, plan.md 7).
//
// ESTA ES LA ÚNICA INTERFAZ QUE LAS FASES POSTERIORES (router de intenciones,
// RAG, transporte de WhatsApp, escalamiento) PUEDEN USAR. No importar
// `validacion`, `versionado` ni `exposicion` desde fuera del módulo para
// responder a un cliente. Debe ejecutarse solo en el servidor.
//
// Garantías:
// - Fallo cerrado: si el conjunto no es válido, la versión no existe o la ficha
//   no es publicable, la respuesta es ESCALAR.
// - Salida mínima: RESPONDER lleva solo fichaId, version, respuesta y audioId,
//   copiados campo por campo (nunca se copia la ficha). ESCALAR lleva solo un
//   código de motivo, nunca texto de la ficha bloqueada.
// - Solo se consulta la versión ACTIVA.

import { evaluarExposicion } from './exposicion'
import type { FichaConocimiento, MotivoEscalamiento, OpcionesValidacion, VersionBrain } from './tipos'
import { validarConjunto, versionActiva } from './versionado'

export type ConsultaPublica = { fichaId: string } | { intencion: string }

export interface OpcionesConsulta extends OpcionesValidacion {
  /**
   * Aserción opcional: la versión del Brain que el llamador espera que esté
   * ACTIVA. Si no coincide con la activa → ESCALAR VERSION_DESCONOCIDA. No
   * permite consultar versiones históricas ni borradores.
   */
  version?: number
}

export interface FichaPublica {
  fichaId: string
  version: number
  respuesta: string
  audioId: string | null
}

export type DecisionPublica =
  | { accion: 'RESPONDER'; brainVersion: number; fichas: FichaPublica[] }
  | { accion: 'ESCALAR'; motivo: MotivoEscalamiento }

const escalar = (motivo: MotivoEscalamiento): DecisionPublica => ({ accion: 'ESCALAR', motivo })

/** Copia campo por campo: si mañana la ficha gana campos nuevos, no se filtran aquí. */
function aFichaPublica(ficha: FichaConocimiento): FichaPublica {
  return { fichaId: ficha.id, version: ficha.version, respuesta: ficha.respuesta, audioId: ficha.audioId }
}

export function consultarPublico(conjunto: readonly unknown[], consulta: ConsultaPublica, opciones: OpcionesConsulta = {}): DecisionPublica {
  // 1. Revalidar siempre, aunque el llamador ya lo haya hecho (plan T6).
  if (!Array.isArray(conjunto)) return escalar('BRAIN_INVALIDO')
  const { errores } = validarConjunto(conjunto, { catalogoAudios: opciones.catalogoAudios })
  if (errores.length > 0) return escalar('BRAIN_INVALIDO')

  // 2. Solo la versión ACTIVA (y la aserción de versión, si viene).
  const activa = versionActiva(conjunto as VersionBrain[])
  if (!activa) return escalar('VERSION_DESCONOCIDA')
  if (opciones.version !== undefined && opciones.version !== activa.version) return escalar('VERSION_DESCONOCIDA')

  // 3-5. Buscar y decidir.
  if (typeof consulta !== 'object' || consulta === null) return escalar('SIN_CONOCIMIENTO')
  if ('fichaId' in consulta && typeof consulta.fichaId === 'string') {
    const ficha = activa.fichas.find((f) => f.id === consulta.fichaId)
    if (!ficha) return escalar('SIN_CONOCIMIENTO')
    const evaluacion = evaluarExposicion(ficha)
    if (!evaluacion.publicable) return escalar(evaluacion.motivo)
    return { accion: 'RESPONDER', brainVersion: activa.version, fichas: [aFichaPublica(ficha)] }
  }
  if ('intencion' in consulta && typeof consulta.intencion === 'string') {
    // No se revela si existían fichas bloqueadas para la intención: sin publicables → SIN_CONOCIMIENTO.
    const publicables = activa.fichas
      .filter((f) => f.intencion === consulta.intencion && evaluarExposicion(f).publicable)
      .sort((a, b) => a.id.localeCompare(b.id))
    if (publicables.length === 0) return escalar('SIN_CONOCIMIENTO')
    return { accion: 'RESPONDER', brainVersion: activa.version, fichas: publicables.map(aFichaPublica) }
  }
  return escalar('SIN_CONOCIMIENTO')
}
