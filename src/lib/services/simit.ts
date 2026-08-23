const SIMIT_API_BASE = 'https://humania-go-api.vercel.app/api/check-fines'
const SIMIT_TIMEOUT_MS = 8000

// Umbral de multas permitidas (más de este número descarta al candidato).
// Alineado con el límite de comparendos ya usado en evaluateCandidateRequirements.
export const NUMBER_FINES = 3

export type SimitResult = {
  simit_estado: 'APROBADO' | 'DESCARTADO' | 'NO_CONSULTADO'
  simit_number_fines: number | null
  simit_total_fines: number | null
  simit_consultado_at: string
  simit_respuesta_raw: unknown
}

/**
 * Consulta multas de tránsito (SIMIT) para un número de documento.
 * Decisión de negocio (fail-open): cualquier fallo, timeout, límite de
 * consultas (429) o documento compartido por varias personas (409) NO
 * bloquea ni descarta al candidato — queda NO_CONSULTADO para revisión
 * manual posterior.
 */
export async function checkSimitFines(numeroDocumento: string): Promise<SimitResult> {
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
        simit_estado: 'NO_CONSULTADO',
        simit_number_fines: null,
        simit_total_fines: null,
        simit_consultado_at: consultadoAt,
        simit_respuesta_raw: { http_status: res.status, body }
      }
    }

    const numberFines: number = body.number_fines
    const totalFines: number | null = typeof body.total_fines === 'number' ? body.total_fines : null

    return {
      simit_estado: numberFines > NUMBER_FINES ? 'DESCARTADO' : 'APROBADO',
      simit_number_fines: numberFines,
      simit_total_fines: totalFines,
      simit_consultado_at: consultadoAt,
      simit_respuesta_raw: body
    }
  } catch (err) {
    return {
      simit_estado: 'NO_CONSULTADO',
      simit_number_fines: null,
      simit_total_fines: null,
      simit_consultado_at: consultadoAt,
      simit_respuesta_raw: { error: err instanceof Error ? err.message : String(err) }
    }
  } finally {
    clearTimeout(timeout)
  }
}
