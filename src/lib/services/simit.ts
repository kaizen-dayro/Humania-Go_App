const SIMIT_API_BASE = 'https://humania-go-api.vercel.app/api/check-fines'
const SIMIT_TIMEOUT_MS = 8000

// Umbral de comparendos que requieren validación complementaria (Fase 18,
// 2026-08-25): 0 = aprobación automática; 1 a SIMIT_MAX_FINES_REQUIRING_VALIDATION
// (inclusive) = requiere que el candidato declare paz y salvo o acuerdo de
// pago (ver evaluateComparendosFilter en eligibility.ts); más de este
// número = descarte automático, sin excepción. La decisión de PASA/NO PASA
// ya no vive aquí -- este archivo solo consulta la API y devuelve el dato
// crudo, igual que el resto de servicios de integración del proyecto.
export const SIMIT_MAX_FINES_REQUIRING_VALIDATION = 4

export type SimitQueryResult = {
  /** true si la API respondió exitosamente con un número de multas válido. */
  consultado: boolean
  number_fines: number | null
  total_fines: number | null
  consultado_at: string
  respuesta_raw: unknown
}

/**
 * Consulta multas de tránsito (SIMIT) para un número de documento.
 * Decisión de negocio (fail-open): cualquier fallo, timeout, límite de
 * consultas (429) o documento compartido por varias personas (409) deja
 * `consultado: false` -- nunca bloquea ni descarta al candidato por sí
 * mismo. Quien decide qué hacer con el resultado es evaluateComparendosFilter
 * (eligibility.ts), usando el número declarado como respaldo.
 */
export async function checkSimitFines(numeroDocumento: string): Promise<SimitQueryResult> {
  const consultadoAt = new Date().toISOString()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SIMIT_TIMEOUT_MS)

  try {
    const res = await fetch(`${SIMIT_API_BASE}/${encodeURIComponent(numeroDocumento)}`, {
      signal: controller.signal
    })
    const body = await res.json().catch(() => null)

    if (!res.ok || !body || typeof body.number_fines !== 'number') {
      return {
        consultado: false,
        number_fines: null,
        total_fines: null,
        consultado_at: consultadoAt,
        respuesta_raw: { http_status: res.status, body }
      }
    }

    const numberFines: number = body.number_fines
    const totalFines: number | null = typeof body.total_fines === 'number' ? body.total_fines : null

    return {
      consultado: true,
      number_fines: numberFines,
      total_fines: totalFines,
      consultado_at: consultadoAt,
      respuesta_raw: body
    }
  } catch (err) {
    return {
      consultado: false,
      number_fines: null,
      total_fines: null,
      consultado_at: consultadoAt,
      respuesta_raw: { error: err instanceof Error ? err.message : String(err) }
    }
  } finally {
    clearTimeout(timeout)
  }
}
