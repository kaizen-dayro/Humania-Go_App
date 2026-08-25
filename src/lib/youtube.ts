const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * Extrae el ID de video de YouTube desde cualquier formato habitual de
 * enlace (watch, youtu.be, embed, shorts) o desde el ID pegado directo.
 * Devuelve null si no se pudo reconocer un ID válido de 11 caracteres.
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (VIDEO_ID_RE.test(trimmed)) return trimmed

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1)
    return VIDEO_ID_RE.test(id) ? id : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v')
      return id && VIDEO_ID_RE.test(id) ? id : null
    }
    const match = url.pathname.match(/^\/(embed|shorts)\/([A-Za-z0-9_-]{11})/)
    if (match) return match[2]
  }

  return null
}
