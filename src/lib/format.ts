/**
 * Formato estándar de fecha/hora para toda visualización administrativa
 * de Humania Go (estándar del proyecto, Linear, sección 9 — "FECHAS Y
 * HORAS"): DD-MM-YYYY HH:mm, 24 horas, sin AM/PM. Colombia no tiene
 * horario de verano, así que "America/Bogota" es un offset fijo (UTC-5)
 * -- se fija explícitamente para que el resultado sea idéntico sin
 * importar en qué zona horaria corra el proceso de Node (en producción,
 * Vercel corre en UTC; en local, la máquina del usuario ya está en
 * Bogotá) -- evita también un desajuste de hidratación en componentes
 * cliente, donde el render del servidor y el del navegador deben
 * producir exactamente el mismo texto.
 */
export function formatearFechaAdmin(fecha: string | Date | null | undefined): string | null {
  if (!fecha) return null
  const d = new Date(fecha)
  if (isNaN(d.getTime())) return null

  const partes = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)

  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? ''
  // hour12:false en algunos entornos de ICU devuelve "24" en vez de "00"
  // para la medianoche -- se normaliza explícitamente.
  const hora = parte('hour') === '24' ? '00' : parte('hour')

  return `${parte('day')}-${parte('month')}-${parte('year')} ${hora}:${parte('minute')}`
}
