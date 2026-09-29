// Humania WhatsApp Brain (KAI-44) — regla de exposición (spec.md 5.4, plan.md 7 paso 4).
// Decide si una ficha puede comunicarse a un cliente a partir de SUS CAMPOS del
// formato. Nunca lee propiedades fuera del formato (ej. un `publicable: true`
// inyectado): la decisión es la misma con o sin ellas (AC-19).
// `nivelConfianza` NO participa (decisión del Product Owner, 29-09-2026).

import type { FichaConocimiento, MotivoEscalamiento } from './tipos'

export type EvaluacionExposicion = { publicable: true } | { publicable: false; motivo: MotivoEscalamiento }

/**
 * Supone una ficha ya validada (la consulta pública siempre valida antes).
 * Precedencia del motivo, el primero que aplique:
 *   1. CONTRADICTORIO  — el dato no es una verdad única;
 *   2. PENDIENTE       — el dato no está decidido o validado;
 *   3. NO_AUTORIZADO   — es verdad, pero no se puede decir (visibilidad distinta de
 *                        PUBLICO_AUTORIZADO, o CONFIRMADO sin texto aprobado);
 *   4. REQUIERE_HUMANO — se puede decir, pero solo una persona (D4: solo escala).
 * Las condiciones "vigente en la versión activa" y "sin fuente/contradicción" de
 * la regla 5.4 las garantizan la consulta pública y la validación.
 */
export function evaluarExposicion(ficha: FichaConocimiento): EvaluacionExposicion {
  if (ficha.estadoVerdad === 'CONTRADICTORIO' || ficha.contradiccion !== null) return { publicable: false, motivo: 'CONTRADICTORIO' }
  if (ficha.estadoVerdad === 'PENDIENTE_DE_DECISION' || ficha.estadoVerdad === 'PENDIENTE_DE_VALIDACION') {
    return { publicable: false, motivo: 'PENDIENTE' }
  }
  if (ficha.visibilidad !== 'PUBLICO_AUTORIZADO' || ficha.estadoVerdad !== 'CONFIRMADO_APROBADO' || ficha.aprobacion === null) {
    return { publicable: false, motivo: 'NO_AUTORIZADO' }
  }
  if (ficha.requiereHumano !== false) return { publicable: false, motivo: 'REQUIERE_HUMANO' }
  if (ficha.fuentes.length === 0 || ficha.respuesta.trim().length === 0) return { publicable: false, motivo: 'NO_AUTORIZADO' }
  return { publicable: true }
}
