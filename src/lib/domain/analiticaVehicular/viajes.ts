// Viajes transcritos a mano de la app Ituran GO+ (spec.md Sección 17, adenda 1).
// Cálculos puros: la página carga los viajes y este módulo resume. Los
// registros sin movimiento (0 km/h) se conservan pero no cuentan como viaje
// (R23). Los viajes nunca se suman con el kilometraje del odómetro (R2).

export type ViajeTranscrito = {
  id: string
  inicio: string // ISO con zona (instante real calculado por la base)
  fin: string
  duracionMin: number // la que muestra la app
  velocidadKmh: number
  municipio: string
  interpretacion: 'UTC' | 'HORA_COLOMBIA'
  estado: 'CONFIRMADO' | 'ANULADO'
}

export type ResumenViajes = {
  /** Registros confirmados con movimiento (velocidad > 0). */
  viajes: number
  /** Registros confirmados con 0 km/h (no cuentan como viaje). */
  sinMovimiento: number
  minutosEnMovimiento: number
  diasConActividad: number
  desde: string | null
  hasta: string | null
  ultimaActividad: string | null
  /** Viajes por hora de inicio (0-23), hora de Colombia. */
  porHora: number[]
  /** Viajes por día de la semana de inicio (0 = domingo), hora de Colombia. */
  porDiaSemana: number[]
  /** Interpretaciones de la hora presentes (para advertir si hay mezcla). */
  interpretaciones: ('UTC' | 'HORA_COLOMBIA')[]
}

/** Partes de fecha en Colombia (UTC-5 fijo, sin horario de verano). */
function partesBogota(iso: string): { fecha: string; hora: number; diaSemana: number } {
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000)
  return { fecha: d.toISOString().slice(0, 10), hora: d.getUTCHours(), diaSemana: d.getUTCDay() }
}

export function resumirViajes(viajes: ViajeTranscrito[]): ResumenViajes {
  const confirmados = viajes.filter(v => v.estado === 'CONFIRMADO')
  const conMovimiento = confirmados.filter(v => v.velocidadKmh > 0)
  const porHora = Array.from({ length: 24 }, () => 0)
  const porDiaSemana = Array.from({ length: 7 }, () => 0)
  const dias = new Set<string>()
  for (const v of conMovimiento) {
    const p = partesBogota(v.inicio)
    porHora[p.hora]++
    porDiaSemana[p.diaSemana]++
    dias.add(p.fecha)
  }
  const inicios = confirmados.map(v => v.inicio).sort()
  const fines = confirmados.map(v => v.fin).sort()
  return {
    viajes: conMovimiento.length,
    sinMovimiento: confirmados.length - conMovimiento.length,
    minutosEnMovimiento: conMovimiento.reduce((s, v) => s + v.duracionMin, 0),
    diasConActividad: dias.size,
    desde: inicios[0] ?? null,
    hasta: fines[fines.length - 1] ?? null,
    ultimaActividad: fines[fines.length - 1] ?? null,
    porHora,
    porDiaSemana,
    interpretaciones: [...new Set(confirmados.map(v => v.interpretacion))],
  }
}

/** "9 h 46 min" a partir de minutos. */
export function formatearDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}
