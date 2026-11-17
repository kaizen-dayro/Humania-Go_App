// Analítica vehicular, Fase 1 (SDD `gps-inteligencia-vehicular`, spec.md 4 y 6).
//
// Cálculos puros sobre las lecturas del odómetro, el plan de mantenimiento y
// los mantenimientos registrados. Sin acceso a red ni a base de datos: la
// página los carga y este módulo solo calcula. Todo valor que sale de aquí
// lleva su clasificación (R1): MEDIDO, CALCULADO o PREDICCION. Nunca se suman
// ni se promedian mediciones de distinto origen (R2).
//
//   npm run verificar:analitica   (desde web/)

export type Clasificacion = 'MEDIDO' | 'CALCULADO' | 'PREDICCION' | 'REPORTADO_GPS'

export const ETIQUETA_CLASIFICACION: Record<Clasificacion, string> = {
  MEDIDO: 'Medido en el odómetro',
  CALCULADO: 'Calculado entre lecturas',
  PREDICCION: 'Predicción',
  // Adenda 1 (spec R30): viajes transcritos a mano de la app del proveedor.
  REPORTADO_GPS: 'Reportado por el GPS (transcrito)',
}

/** Lecturas confirmadas mínimas para mostrar una proyección (spec D9 = 3). */
export const MIN_LECTURAS_PROYECCION = 3

/** Horizontes de proyección del spec (sección 8): 30 días, 3, 6 y 12 meses. */
export const HORIZONTES_PROYECCION = [
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '3 meses' },
  { dias: 180, etiqueta: '6 meses' },
  { dias: 365, etiqueta: '12 meses' },
] as const

const MS_DIA = 24 * 60 * 60 * 1000

export type LecturaOdometro = {
  id: string
  fechaCaptura: string // ISO con zona
  valorKm: number
  tipo: 'INICIAL' | 'PERIODICA' | 'MANTENIMIENTO' | 'DEVOLUCION'
  estado: 'CONFIRMADA' | 'ANULADA'
  contratoId: string | null
}

export type ItemPlan = {
  id: string
  concepto: string
  intervaloKm: number | null
  intervaloMeses: number | null
  fuente: string
}

export type MantenimientoRealizado = {
  id: string
  fecha: string // YYYY-MM-DD
  concepto: string
  estado: 'VIGENTE' | 'ANULADO'
  /** Kilometraje de la lectura enlazada (si existe y está confirmada). */
  kmLectura: number | null
}

export type Parametros = {
  DIAS_MAX_SIN_LECTURA: number | null
  KM_DIA_MAX_ESPERADO: number | null
  KM_30_DIAS_ELEVADO: number | null
  KM_AVISO_MANTENIMIENTO: number | null
  DIAS_AVISO_MANTENIMIENTO: number | null
}

export const PARAMETROS_VACIOS: Parametros = {
  DIAS_MAX_SIN_LECTURA: null,
  KM_DIA_MAX_ESPERADO: null,
  KM_30_DIAS_ELEVADO: null,
  KM_AVISO_MANTENIMIENTO: null,
  DIAS_AVISO_MANTENIMIENTO: null,
}

export type Medida = {
  valor: number
  unidad: 'km' | 'km/día' | 'días'
  clasificacion: Clasificacion
  /** De dónde sale el número, para mostrarlo junto a él. */
  base: string
}

export type Tramo = {
  desde: LecturaOdometro
  hasta: LecturaOdometro
  dias: number
  /** Diferencia hasta − desde. Negativa = lectura inconsistente. */
  km: number
  /** km ÷ días, solo si km >= 0. Con menos de un día se divide entre 1. */
  promedioDiario: number | null
  /** Las dos lecturas pertenecen a contratos distintos (cambio de conductor). */
  compartido: boolean
  inconsistente: boolean
}

function ms(fecha: string): number {
  return new Date(fecha).getTime()
}

function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales
  return Math.round(valor * f) / f
}

/** Lecturas confirmadas, de la más antigua a la más reciente. */
export function lecturasConfirmadas(lecturas: LecturaOdometro[]): LecturaOdometro[] {
  return lecturas
    .filter(l => l.estado === 'CONFIRMADA')
    .sort((a, b) => ms(a.fechaCaptura) - ms(b.fechaCaptura))
}

export function calcularTramos(lecturas: LecturaOdometro[]): Tramo[] {
  const ordenadas = lecturasConfirmadas(lecturas)
  const tramos: Tramo[] = []
  for (let i = 1; i < ordenadas.length; i++) {
    const desde = ordenadas[i - 1]
    const hasta = ordenadas[i]
    const dias = (ms(hasta.fechaCaptura) - ms(desde.fechaCaptura)) / MS_DIA
    const km = hasta.valorKm - desde.valorKm
    const inconsistente = km < 0
    tramos.push({
      desde,
      hasta,
      dias: redondear(dias, 2),
      km,
      promedioDiario: inconsistente ? null : redondear(km / Math.max(dias, 1)),
      compartido: desde.contratoId !== hasta.contratoId,
      inconsistente,
    })
  }
  return tramos
}

export type Resumen = {
  odometroActual: (Medida & { fecha: string }) | null
  kmDesdeAsignacion: Medida | null
  promedioDiario: Medida | null
  /**
   * Kilómetros equivalentes a 30 días: km del período ÷ días del período ×
   * 30. El período va de la lectura más reciente con al menos 30 días de
   * antigüedad hasta la última; casi nunca dura exactamente 30 días, por eso
   * se normaliza y se informa el período real (kmPeriodo, diasPeriodo).
   */
  ventana30: (Medida & { desde: string; hasta: string; kmPeriodo: number; diasPeriodo: number }) | null
  diasDesdeUltimaLectura: number | null
  lecturaInicialDelContrato: LecturaOdometro | null
  totalLecturas: number
}

/**
 * Promedio diario sobre los tramos consistentes (km >= 0) de un conjunto de
 * lecturas. Un tramo inconsistente (tablero cambiado, error de digitación) no
 * se mezcla con los demás.
 */
function promedioSobreTramos(tramos: Tramo[]): { kmDia: number; km: number; dias: number } | null {
  const validos = tramos.filter(t => !t.inconsistente)
  const km = validos.reduce((s, t) => s + t.km, 0)
  const dias = validos.reduce((s, t) => s + t.dias, 0)
  if (validos.length === 0 || dias <= 0) return null
  return { kmDia: km / Math.max(dias, 1), km, dias }
}

export function calcularResumen(
  lecturas: LecturaOdometro[],
  contratoVigenteId: string | null,
  ahora: Date,
): Resumen {
  const ordenadas = lecturasConfirmadas(lecturas)
  const ultima = ordenadas[ordenadas.length - 1] ?? null
  const inicial = contratoVigenteId
    ? ordenadas.find(l => l.tipo === 'INICIAL' && l.contratoId === contratoVigenteId) ?? null
    : null

  const odometroActual = ultima
    ? { valor: ultima.valorKm, unidad: 'km' as const, clasificacion: 'MEDIDO' as const, base: 'Última lectura confirmada', fecha: ultima.fechaCaptura }
    : null

  // Kilómetros desde la asignación: tramos consistentes desde la lectura
  // INICIAL del contrato vigente hasta la última lectura del mismo contrato.
  let kmDesdeAsignacion: Medida | null = null
  let promedioDiario: Medida | null = null
  if (inicial) {
    const delContrato = ordenadas.filter(l => l.contratoId === contratoVigenteId && ms(l.fechaCaptura) >= ms(inicial.fechaCaptura))
    const tramos = calcularTramos(delContrato)
    const p = promedioSobreTramos(tramos)
    if (p) {
      const hayInconsistentes = tramos.some(t => t.inconsistente)
      const base = `${delContrato.length} lecturas desde la entrega${hayInconsistentes ? '; excluye tramos con lectura menor que la anterior' : ''}`
      kmDesdeAsignacion = { valor: p.km, unidad: 'km', clasificacion: 'CALCULADO', base }
      promedioDiario = { valor: redondear(p.kmDia), unidad: 'km/día', clasificacion: 'CALCULADO', base: `${base}, en ${redondear(p.dias)} días` }
    }
  }

  // Ventana de 30 días: desde la última lectura hacia atrás, tomando la
  // lectura más reciente que tenga al menos 30 días de antigüedad respecto de
  // la última. Si no existe, no hay dato (no se interpola).
  let ventana30: Resumen['ventana30'] = null
  if (ultima) {
    const limite = ms(ultima.fechaCaptura) - 30 * MS_DIA
    const base = [...ordenadas].reverse().find(l => ms(l.fechaCaptura) <= limite)
    if (base) {
      const tramos = calcularTramos(ordenadas.filter(l => ms(l.fechaCaptura) >= ms(base.fechaCaptura)))
      const p = promedioSobreTramos(tramos)
      if (p) {
        const diasPeriodo = redondear(p.dias)
        ventana30 = {
          valor: Math.round((p.km / Math.max(p.dias, 1)) * 30),
          unidad: 'km',
          clasificacion: 'CALCULADO',
          base: `${p.km.toLocaleString('es-CO')} km en ${diasPeriodo.toLocaleString('es-CO')} días, llevados a 30 días`,
          desde: base.fechaCaptura,
          hasta: ultima.fechaCaptura,
          kmPeriodo: p.km,
          diasPeriodo,
        }
      }
    }
  }

  return {
    odometroActual,
    kmDesdeAsignacion,
    promedioDiario,
    ventana30,
    diasDesdeUltimaLectura: ultima ? Math.floor((ahora.getTime() - ms(ultima.fechaCaptura)) / MS_DIA) : null,
    lecturaInicialDelContrato: inicial,
    totalLecturas: ordenadas.length,
  }
}

export type Proyeccion =
  | { disponible: false; motivo: string; lecturasUsadas: number }
  | {
      disponible: true
      kmDia: number
      lecturasUsadas: number
      desde: string
      hasta: string
      horizontes: { dias: number; etiqueta: string; kmAdicionales: number; odometroEstimado: number }[]
    }

/**
 * Proyección lineal simple (spec 6): promedio diario de los tramos
 * consistentes × días del horizonte. Se muestra siempre con su base.
 */
export function calcularProyeccion(lecturas: LecturaOdometro[], contratoVigenteId: string | null): Proyeccion {
  const ordenadas = lecturasConfirmadas(lecturas).filter(l => !contratoVigenteId || l.contratoId === contratoVigenteId)
  if (ordenadas.length < MIN_LECTURAS_PROYECCION) {
    return {
      disponible: false,
      motivo: `Historial insuficiente: se necesitan al menos ${MIN_LECTURAS_PROYECCION} lecturas confirmadas del contrato vigente (hay ${ordenadas.length}).`,
      lecturasUsadas: ordenadas.length,
    }
  }
  const p = promedioSobreTramos(calcularTramos(ordenadas))
  if (!p) {
    return { disponible: false, motivo: 'No hay tramos consistentes entre las lecturas.', lecturasUsadas: ordenadas.length }
  }
  const ultima = ordenadas[ordenadas.length - 1]
  return {
    disponible: true,
    kmDia: redondear(p.kmDia),
    lecturasUsadas: ordenadas.length,
    desde: ordenadas[0].fechaCaptura,
    hasta: ultima.fechaCaptura,
    horizontes: HORIZONTES_PROYECCION.map(h => {
      const kmAdicionales = Math.round(p.kmDia * h.dias)
      return { dias: h.dias, etiqueta: h.etiqueta, kmAdicionales, odometroEstimado: ultima.valorKm + kmAdicionales }
    }),
  }
}

export type EstadoMantenimiento = 'SIN_BASE' | 'AL_DIA' | 'PROXIMO' | 'VENCIDO'

export type ProximoMantenimiento = {
  plan: ItemPlan
  estado: EstadoMantenimiento
  ultimo: MantenimientoRealizado | null
  /** Kilometraje en que toca, si hay intervalo en km y el último tiene lectura. */
  kmProximo: number | null
  kmRestantes: number | null
  /** Fecha por tiempo (último + meses). */
  fechaPorTiempo: string | null
  /** Fecha estimada por kilometraje (PREDICCION). */
  fechaEstimadaPorKm: string | null
  detalle: string
}

function sumarMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const r = new Date(Date.UTC(y, m - 1 + meses, d))
  // Si el día no existe en el mes destino (31 → 30), JavaScript avanza al
  // mes siguiente; se corrige al último día del mes destino.
  if (r.getUTCDate() !== d) r.setUTCDate(0)
  return r.toISOString().slice(0, 10)
}

function diasEntreFechas(desde: string, hasta: string): number {
  return Math.round((Date.UTC(...(hasta.split('-').map(Number) as [number, number, number])) - Date.UTC(...(desde.split('-').map(Number) as [number, number, number]))) / MS_DIA)
}

function normalizarConcepto(c: string): string {
  return c.trim().toLowerCase()
}

/**
 * Próximo mantenimiento por concepto (spec R18-R20). Sin un mantenimiento
 * anterior registrado no se inventa la base: el estado es SIN_BASE.
 * `hoy` en formato YYYY-MM-DD (hora de Bogotá).
 */
export function calcularMantenimientos(
  plan: ItemPlan[],
  realizados: MantenimientoRealizado[],
  odometroActual: number | null,
  kmDiaProyeccion: number | null,
  parametros: Parametros,
  hoy: string,
): ProximoMantenimiento[] {
  return plan.map(item => {
    const delConcepto = realizados
      .filter(m => m.estado === 'VIGENTE' && normalizarConcepto(m.concepto) === normalizarConcepto(item.concepto))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    const ultimo = delConcepto[0] ?? null

    if (!ultimo) {
      return {
        plan: item, estado: 'SIN_BASE', ultimo: null, kmProximo: null, kmRestantes: null,
        fechaPorTiempo: null, fechaEstimadaPorKm: null,
        detalle: 'Registra el último mantenimiento realizado de este concepto para calcular el siguiente.',
      }
    }

    const kmProximo = item.intervaloKm !== null && ultimo.kmLectura !== null ? ultimo.kmLectura + item.intervaloKm : null
    const kmRestantes = kmProximo !== null && odometroActual !== null ? kmProximo - odometroActual : null
    const fechaPorTiempo = item.intervaloMeses !== null ? sumarMeses(ultimo.fecha, item.intervaloMeses) : null

    let fechaEstimadaPorKm: string | null = null
    if (kmRestantes !== null && kmRestantes > 0 && kmDiaProyeccion && kmDiaProyeccion > 0) {
      const dias = Math.ceil(kmRestantes / kmDiaProyeccion)
      const [y, m, d] = hoy.split('-').map(Number)
      fechaEstimadaPorKm = new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
    }

    const diasPorTiempo = fechaPorTiempo ? diasEntreFechas(hoy, fechaPorTiempo) : null
    const vencido = (kmRestantes !== null && kmRestantes <= 0) || (diasPorTiempo !== null && diasPorTiempo <= 0)
    const proximo = !vencido && (
      (kmRestantes !== null && parametros.KM_AVISO_MANTENIMIENTO !== null && kmRestantes <= parametros.KM_AVISO_MANTENIMIENTO) ||
      (diasPorTiempo !== null && parametros.DIAS_AVISO_MANTENIMIENTO !== null && diasPorTiempo <= parametros.DIAS_AVISO_MANTENIMIENTO)
    )

    const partes: string[] = []
    if (item.intervaloKm !== null && ultimo.kmLectura === null) partes.push('El último mantenimiento no tiene lectura del odómetro: solo se controla por tiempo.')
    if (kmRestantes !== null) partes.push(kmRestantes <= 0 ? `Pasado por ${Math.abs(kmRestantes).toLocaleString('es-CO')} km.` : `Faltan ${kmRestantes.toLocaleString('es-CO')} km.`)
    if (diasPorTiempo !== null) partes.push(diasPorTiempo <= 0 ? `Vencido por tiempo hace ${Math.abs(diasPorTiempo)} días.` : `Faltan ${diasPorTiempo} días por tiempo.`)

    return {
      plan: item,
      estado: vencido ? 'VENCIDO' : proximo ? 'PROXIMO' : 'AL_DIA',
      ultimo, kmProximo, kmRestantes, fechaPorTiempo, fechaEstimadaPorKm,
      detalle: partes.join(' '),
    }
  })
}

export type Alerta = {
  codigo: 'SIN_LECTURA_INICIAL' | 'FOTO_PENDIENTE' | 'RECORRIDO_INUSUAL' | 'KM_30_DIAS_ELEVADO' | 'LECTURA_INCONSISTENTE' | 'MANTENIMIENTO_VENCIDO' | 'MANTENIMIENTO_PROXIMO'
  nivel: 'ALTA' | 'MEDIA'
  mensaje: string
}

/** Alertas que dependen de un umbral que Dayro todavía no definió (spec D10). */
export function alertasSinConfigurar(parametros: Parametros): string[] {
  const faltan: string[] = []
  if (parametros.DIAS_MAX_SIN_LECTURA === null) faltan.push('Fotografía periódica pendiente')
  if (parametros.KM_DIA_MAX_ESPERADO === null) faltan.push('Recorrido diario inusual')
  if (parametros.KM_30_DIAS_ELEVADO === null) faltan.push('Kilometraje elevado en 30 días')
  if (parametros.KM_AVISO_MANTENIMIENTO === null && parametros.DIAS_AVISO_MANTENIMIENTO === null) faltan.push('Aviso anticipado de mantenimiento')
  return faltan
}

export function calcularAlertas(
  lecturas: LecturaOdometro[],
  contratoVigenteId: string | null,
  mantenimientos: ProximoMantenimiento[],
  parametros: Parametros,
  ahora: Date,
): Alerta[] {
  const alertas: Alerta[] = []
  const resumen = calcularResumen(lecturas, contratoVigenteId, ahora)
  const tramos = calcularTramos(lecturas)
  const ultimoTramo = tramos[tramos.length - 1] ?? null

  if (contratoVigenteId && !resumen.lecturaInicialDelContrato) {
    alertas.push({ codigo: 'SIN_LECTURA_INICIAL', nivel: 'ALTA', mensaje: 'El contrato vigente no tiene registrada la lectura inicial del odómetro (kilometraje de entrega).' })
  }
  if (parametros.DIAS_MAX_SIN_LECTURA !== null && resumen.diasDesdeUltimaLectura !== null && resumen.diasDesdeUltimaLectura > parametros.DIAS_MAX_SIN_LECTURA) {
    alertas.push({ codigo: 'FOTO_PENDIENTE', nivel: 'MEDIA', mensaje: `Han pasado ${resumen.diasDesdeUltimaLectura} días desde la última lectura del odómetro (umbral: ${parametros.DIAS_MAX_SIN_LECTURA}).` })
  }
  if (ultimoTramo?.inconsistente) {
    alertas.push({ codigo: 'LECTURA_INCONSISTENTE', nivel: 'ALTA', mensaje: `La última lectura (${ultimoTramo.hasta.valorKm.toLocaleString('es-CO')} km) es menor que la anterior (${ultimoTramo.desde.valorKm.toLocaleString('es-CO')} km).` })
  }
  const promedioUltimo = ultimoTramo?.promedioDiario ?? null
  if (parametros.KM_DIA_MAX_ESPERADO !== null && promedioUltimo !== null && promedioUltimo > parametros.KM_DIA_MAX_ESPERADO) {
    alertas.push({ codigo: 'RECORRIDO_INUSUAL', nivel: 'MEDIA', mensaje: `El último tramo promedió ${promedioUltimo.toLocaleString('es-CO')} km por día (umbral: ${parametros.KM_DIA_MAX_ESPERADO}).` })
  }
  if (parametros.KM_30_DIAS_ELEVADO !== null && resumen.ventana30 && resumen.ventana30.valor > parametros.KM_30_DIAS_ELEVADO) {
    alertas.push({ codigo: 'KM_30_DIAS_ELEVADO', nivel: 'MEDIA', mensaje: `Ritmo de ${resumen.ventana30.valor.toLocaleString('es-CO')} km por cada 30 días (${resumen.ventana30.base}; umbral: ${parametros.KM_30_DIAS_ELEVADO.toLocaleString('es-CO')}).` })
  }
  for (const m of mantenimientos) {
    if (m.estado === 'VENCIDO') alertas.push({ codigo: 'MANTENIMIENTO_VENCIDO', nivel: 'ALTA', mensaje: `${m.plan.concepto}: mantenimiento vencido. ${m.detalle}` })
    if (m.estado === 'PROXIMO') alertas.push({ codigo: 'MANTENIMIENTO_PROXIMO', nivel: 'MEDIA', mensaje: `${m.plan.concepto}: mantenimiento próximo. ${m.detalle}` })
  }
  return alertas
}
