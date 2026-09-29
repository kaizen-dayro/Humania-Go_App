// Humania WhatsApp Brain (KAI-44) — versionado y consistencia entre versiones.
// Ver Documentos/SDD/whatsapp-brain/spec.md 6 y plan.md 6 (paso 3) y 8.
// Ninguna función de este archivo modifica ni elimina sus entradas: las
// versiones existentes del Brain son registro histórico (regla 3 del proyecto).

import type { FichaConocimiento, OpcionesValidacion, ProblemaValidacion, ResultadoValidacion, VersionBrain } from './tipos'
import { camposDelFormato, separar, validarVersionBrain } from './validacion'

/** JSON con claves ordenadas: dos fichas con el mismo contenido producen el mismo texto. */
function jsonEstable(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonEstable).join(',')}]`
  if (typeof valor === 'object' && valor !== null) {
    const obj = valor as Record<string, unknown>
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonEstable(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(valor)
}

/** Contenido comparable de una ficha: solo los campos del formato (sin propiedades desconocidas). */
export function huellaContenido(ficha: FichaConocimiento): string {
  return jsonEstable(camposDelFormato(ficha as unknown as Record<string, unknown>))
}

export interface ComparacionVersiones {
  nuevas: string[]
  modificadas: { id: string; desde: number; hasta: number }[]
  retiradas: string[]
  sinCambio: string[]
  errores: ProblemaValidacion[]
}

function problemaIntegridad(ficha: FichaConocimiento, previa: FichaConocimiento, brainPrevio: number, brainNuevo: number): ProblemaValidacion | null {
  if (ficha.version < previa.version) {
    return {
      nivel: 'ERROR',
      brainVersion: brainNuevo,
      fichaId: ficha.id,
      campo: 'version',
      regla: 'VERSION_REGRESIVA',
      motivo: `la ficha estaba en la versión ${previa.version} (Brain v${brainPrevio}) y bajó a ${ficha.version}; la versión de una ficha nunca baja`,
    }
  }
  if (ficha.version === previa.version && huellaContenido(ficha) !== huellaContenido(previa)) {
    return {
      nivel: 'ERROR',
      brainVersion: brainNuevo,
      fichaId: ficha.id,
      campo: 'version',
      regla: 'INMUTABILIDAD',
      motivo: `el contenido cambió respecto al Brain v${brainPrevio} sin subir la versión de la ficha (${ficha.version}); todo cambio exige una versión nueva`,
    }
  }
  return null
}

/**
 * Compara dos versiones del Brain (spec.md 6.3): fichas nuevas, modificadas,
 * retiradas y sin cambio, más los errores de integridad. Supone versiones ya
 * validadas individualmente.
 */
export function compararVersiones(anterior: VersionBrain, nueva: VersionBrain): ComparacionVersiones {
  const previas = new Map(anterior.fichas.map((f) => [f.id, f] as const))
  const resultado: ComparacionVersiones = { nuevas: [], modificadas: [], retiradas: [], sinCambio: [], errores: [] }
  const idsNuevos = new Set<string>()
  for (const ficha of nueva.fichas) {
    idsNuevos.add(ficha.id)
    const previa = previas.get(ficha.id)
    if (!previa) {
      resultado.nuevas.push(ficha.id)
      continue
    }
    const problema = problemaIntegridad(ficha, previa, anterior.version, nueva.version)
    if (problema) resultado.errores.push(problema)
    else if (ficha.version > previa.version) resultado.modificadas.push({ id: ficha.id, desde: previa.version, hasta: ficha.version })
    else resultado.sinCambio.push(ficha.id)
  }
  for (const id of previas.keys()) if (!idsNuevos.has(id)) resultado.retiradas.push(id)
  return resultado
}

/** La versión ACTIVA de un conjunto válido, o null si no hay ninguna. */
export function versionActiva(versiones: readonly VersionBrain[]): VersionBrain | null {
  return versiones.find((v) => v.estado === 'ACTIVA') ?? null
}

/**
 * Valida un conjunto de versiones del Brain: cada versión por separado y la
 * consistencia entre ellas (spec.md 6, plan.md 6 paso 3):
 * - números de versión únicos;
 * - como máximo una versión ACTIVA (AC-24);
 * - toda HISTORICA con número menor que la ACTIVA;
 * - integridad de cada ficha contra su ÚLTIMA aparición previa, no solo contra
 *   la versión inmediatamente anterior: así también se detecta una ficha retirada
 *   que reaparece con otro contenido y la misma versión, o con una versión menor.
 */
export function validarConjunto(versiones: readonly unknown[], opciones: OpcionesValidacion = {}): ResultadoValidacion {
  const problemas: ProblemaValidacion[] = []
  const validas: VersionBrain[] = []
  for (const entrada of versiones) {
    const r = validarVersionBrain(entrada, opciones)
    problemas.push(...r.errores, ...r.advertencias)
    if (r.errores.length === 0) validas.push(entrada as VersionBrain)
  }

  const porNumero = new Map<number, number>()
  for (const entrada of versiones) {
    const n = typeof entrada === 'object' && entrada !== null ? (entrada as { version?: unknown }).version : undefined
    if (typeof n === 'number') porNumero.set(n, (porNumero.get(n) ?? 0) + 1)
  }
  for (const [n, veces] of porNumero) {
    if (veces > 1) problemas.push({ nivel: 'ERROR', brainVersion: n, campo: 'version', regla: 'VERSION_BRAIN', motivo: `la versión ${n} del Brain aparece ${veces} veces; cada versión es única` })
  }

  const activas = validas.filter((v) => v.estado === 'ACTIVA')
  if (activas.length > 1) {
    problemas.push({
      nivel: 'ERROR',
      campo: 'estado',
      regla: 'VERSIONES_ACTIVAS',
      motivo: `solo una versión puede estar ACTIVA; hay ${activas.length} (versiones ${activas.map((v) => v.version).join(', ')})`,
    })
  }
  if (activas.length === 1) {
    for (const v of validas) {
      if (v.estado === 'HISTORICA' && v.version > activas[0].version) {
        problemas.push({
          nivel: 'ERROR',
          brainVersion: v.version,
          campo: 'estado',
          regla: 'ESTADO_BRAIN',
          motivo: `la versión HISTORICA ${v.version} es posterior a la ACTIVA ${activas[0].version}; una versión histórica siempre es anterior a la activa`,
        })
      }
    }
  }

  const ultimaAparicion = new Map<string, { ficha: FichaConocimiento; brain: number }>()
  for (const v of [...validas].sort((a, b) => a.version - b.version)) {
    for (const ficha of v.fichas) {
      const previa = ultimaAparicion.get(ficha.id)
      if (previa) {
        const problema = problemaIntegridad(ficha, previa.ficha, previa.brain, v.version)
        if (problema) problemas.push(problema)
      }
      ultimaAparicion.set(ficha.id, { ficha, brain: v.version })
    }
  }
  return separar(problemas)
}
