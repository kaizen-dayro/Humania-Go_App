// Humania WhatsApp Brain (KAI-44) — fixtures SINTÉTICOS para las pruebas.
// Nada aquí es conocimiento real de Humania: el repositorio es público (spec
// AC-30). Los textos son evidentemente ficticios y los ids usan el rango KB-9xxx.

import type { FichaConocimiento, VersionBrain } from './tipos'

/** Ficha sintética PUBLICABLE (CONFIRMADO_APROBADO + PUBLICO_AUTORIZADO, sin requerir humano). */
export function ficha(cambios: Partial<FichaConocimiento> = {}): FichaConocimiento {
  return {
    id: 'KB-9001',
    version: 1,
    categoria: 'FAQ_OBJECIONES',
    intencion: 'PRUEBA_SINTETICA',
    pregunta: 'Pregunta de prueba 1',
    respuesta: 'Respuesta de prueba 1 (texto sintético, no es conocimiento real).',
    audioId: null,
    fuentes: [{ tipo: 'DECISION_NEGOCIO', referencia: 'Fuente de prueba 1', fecha: '2026-09-29' }],
    nivelConfianza: 'ALTO',
    estadoVerdad: 'CONFIRMADO_APROBADO',
    visibilidad: 'PUBLICO_AUTORIZADO',
    requiereHumano: false,
    motivoEscalamiento: null,
    contradiccion: null,
    aprobacion: { aprobadoPor: 'Aprobador de prueba', rol: 'PRODUCT_OWNER', fecha: '2026-09-29' },
    versionNegocio: 'Versión de negocio de prueba',
    fechaRevision: '2026-09-29',
    notasInternas: 'NOTA INTERNA DE PRUEBA - NUNCA DEBE EXPONERSE',
    ...cambios,
  }
}

/**
 * Ficha sintética válida en cualquier estado de verdad, con los campos que ese
 * estado exige. Fuera de CONFIRMADO_APROBADO la visibilidad por defecto es
 * NO_AUTORIZADO_PARA_CLIENTE: PUBLICO_AUTORIZADO sin aprobación es un ERROR
 * (NIVEL_PUBLICO_NO_APROBADO, decisión del 29-09-2026).
 */
export function fichaEnEstado(estadoVerdad: FichaConocimiento['estadoVerdad'], cambios: Partial<FichaConocimiento> = {}): FichaConocimiento {
  const visibilidad = estadoVerdad === 'CONFIRMADO_APROBADO' ? 'PUBLICO_AUTORIZADO' : 'NO_AUTORIZADO_PARA_CLIENTE'
  const base = ficha({ estadoVerdad, visibilidad, aprobacion: null, contradiccion: null })
  if (estadoVerdad === 'CONFIRMADO_APROBADO') base.aprobacion = ficha().aprobacion
  if (estadoVerdad === 'CONTRADICTORIO') {
    base.contradiccion = { descripcion: 'Contradicción de prueba', decisionRequerida: 'Decisión de prueba' }
    base.fuentes = [
      { tipo: 'DOCUMENTO', referencia: 'Fuente de prueba A' },
      { tipo: 'CODIGO', referencia: 'Fuente de prueba B' },
    ]
  }
  return { ...base, ...cambios }
}

/** Versión sintética del Brain. */
export function version(numero: number, estado: VersionBrain['estado'], fichas: FichaConocimiento[], cambios: Partial<VersionBrain> = {}): VersionBrain {
  const activada = estado === 'BORRADOR' ? null : '2026-09-29T10:30:00-05:00'
  return {
    formato: 'HUMANIA_BRAIN_V1',
    version: numero,
    estado,
    creadaEn: '2026-09-29T09:00:00-05:00',
    activadaEn: activada,
    aprobadaPor: activada ? 'Aprobador de prueba' : null,
    descripcionCambios: `Versión de prueba ${numero}`,
    fichas,
    ...cambios,
  }
}

/** Copia profunda para comprobar que una función no muta sus entradas. */
export const clonar = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T
