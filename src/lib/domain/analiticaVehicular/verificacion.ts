// Verificación del dominio de analítica vehicular, Fase 1 (SDD
// `gps-inteligencia-vehicular`, plan.md G). Mismo mecanismo que las demás
// suites del dominio: sin framework de pruebas, se compila con `tsc` y se
// ejecuta con node.
//
//   npm run verificar:analitica   (desde web/)

import assert from 'node:assert/strict'
import {
  PARAMETROS_VACIOS, alertasSinConfigurar, calcularAlertas, calcularMantenimientos, calcularProyeccion,
  calcularResumen, calcularTramos, type ItemPlan, type LecturaOdometro, type MantenimientoRealizado, type Parametros,
} from './calculos'
import { formatearDuracion, resumirViajes, type ViajeTranscrito } from './viajes'

let casos = 0
function verificar(nombre: string, fn: () => void) {
  casos++
  try {
    fn()
    console.log(`OK   ${nombre}`)
  } catch (err) {
    console.error(`FAIL ${nombre}`)
    throw err
  }
}

const C1 = 'contrato-1'
const C2 = 'contrato-2'
let n = 0
function lectura(fecha: string, km: number, extra: Partial<LecturaOdometro> = {}): LecturaOdometro {
  n++
  return { id: `l${n}`, fechaCaptura: fecha, valorKm: km, tipo: 'PERIODICA', estado: 'CONFIRMADA', contratoId: C1, ...extra }
}
const AHORA = new Date('2026-12-01T17:00:00Z')

verificar('Sin lecturas: no hay odómetro, ni acumulados, ni proyección', () => {
  const r = calcularResumen([], C1, AHORA)
  assert.equal(r.odometroActual, null)
  assert.equal(r.kmDesdeAsignacion, null)
  assert.equal(r.promedioDiario, null)
  const p = calcularProyeccion([], C1)
  assert.equal(p.disponible, false)
})

verificar('Una sola lectura (inicial): odómetro medido, sin promedio ni proyección', () => {
  const l = [lectura('2026-10-01T14:00:00Z', 30000, { tipo: 'INICIAL' })]
  const r = calcularResumen(l, C1, AHORA)
  assert.equal(r.odometroActual?.valor, 30000)
  assert.equal(r.odometroActual?.clasificacion, 'MEDIDO')
  assert.equal(r.kmDesdeAsignacion, null)
  assert.equal(r.promedioDiario, null)
  assert.equal(calcularProyeccion(l, C1).disponible, false)
})

verificar('Tres lecturas: acumulado y promedio calculados; proyección disponible con su base', () => {
  const l = [
    lectura('2026-10-01T14:00:00Z', 30000, { tipo: 'INICIAL' }),
    lectura('2026-10-11T14:00:00Z', 31000),
    lectura('2026-10-21T14:00:00Z', 32000),
  ]
  const r = calcularResumen(l, C1, AHORA)
  assert.equal(r.kmDesdeAsignacion?.valor, 2000)
  assert.equal(r.kmDesdeAsignacion?.clasificacion, 'CALCULADO')
  assert.equal(r.promedioDiario?.valor, 100)
  const p = calcularProyeccion(l, C1)
  assert.ok(p.disponible)
  if (p.disponible) {
    assert.equal(p.kmDia, 100)
    assert.equal(p.lecturasUsadas, 3)
    assert.equal(p.horizontes[0].kmAdicionales, 3000)
    assert.equal(p.horizontes[0].odometroEstimado, 35000)
    assert.equal(p.horizontes[3].dias, 365)
  }
})

verificar('Dos lecturas no alcanzan el mínimo de 3 para proyectar', () => {
  const l = [lectura('2026-10-01T14:00:00Z', 30000, { tipo: 'INICIAL' }), lectura('2026-10-11T14:00:00Z', 31000)]
  const p = calcularProyeccion(l, C1)
  assert.equal(p.disponible, false)
  if (!p.disponible) assert.match(p.motivo, /al menos 3/)
})

verificar('Lectura menor que la anterior: tramo inconsistente, sin km negativos en el acumulado', () => {
  const l = [
    lectura('2026-10-01T14:00:00Z', 30000, { tipo: 'INICIAL' }),
    lectura('2026-10-11T14:00:00Z', 31000),
    lectura('2026-10-21T14:00:00Z', 500), // tablero cambiado
    lectura('2026-10-31T14:00:00Z', 1500),
  ]
  const t = calcularTramos(l)
  assert.equal(t[1].inconsistente, true)
  assert.equal(t[1].promedioDiario, null)
  const r = calcularResumen(l, C1, AHORA)
  assert.equal(r.kmDesdeAsignacion?.valor, 2000) // 1000 + 1000, sin el tramo negativo
  assert.match(r.kmDesdeAsignacion!.base, /excluye tramos/)
  const a = calcularAlertas(l.slice(0, 3), C1, [], PARAMETROS_VACIOS, AHORA)
  assert.ok(a.some(x => x.codigo === 'LECTURA_INCONSISTENTE'))
})

verificar('Las lecturas anuladas no cuentan', () => {
  const l = [
    lectura('2026-10-01T14:00:00Z', 30000, { tipo: 'INICIAL' }),
    lectura('2026-10-11T14:00:00Z', 99999, { estado: 'ANULADA' }),
    lectura('2026-10-21T14:00:00Z', 32000),
  ]
  assert.equal(calcularTramos(l).length, 1)
  assert.equal(calcularResumen(l, C1, AHORA).odometroActual?.valor, 32000)
})

verificar('Cambio de conductor dentro de un tramo: tramo compartido', () => {
  const l = [lectura('2026-10-01T14:00:00Z', 30000), lectura('2026-10-11T14:00:00Z', 31000, { contratoId: C2 })]
  assert.equal(calcularTramos(l)[0].compartido, true)
})

verificar('Acumulado solo del contrato vigente, desde su lectura inicial', () => {
  const l = [
    lectura('2026-09-01T14:00:00Z', 20000, { contratoId: C2, tipo: 'INICIAL' }),
    lectura('2026-09-20T14:00:00Z', 25000, { contratoId: C2, tipo: 'DEVOLUCION' }),
    lectura('2026-10-01T14:00:00Z', 25100, { tipo: 'INICIAL' }),
    lectura('2026-10-11T14:00:00Z', 26100),
  ]
  assert.equal(calcularResumen(l, C1, AHORA).kmDesdeAsignacion?.valor, 1000)
})

verificar('Lecturas el mismo día: el promedio divide al menos entre 1 día', () => {
  const l = [lectura('2026-10-01T08:00:00Z', 30000), lectura('2026-10-01T20:00:00Z', 30150)]
  assert.equal(calcularTramos(l)[0].promedioDiario, 150)
})

verificar('Ventana de 30 días: solo si hay una lectura con al menos 30 días de antigüedad', () => {
  const corta = [lectura('2026-11-10T14:00:00Z', 30000), lectura('2026-11-30T14:00:00Z', 31000)]
  assert.equal(calcularResumen(corta, C1, AHORA).ventana30, null)
  const larga = [lectura('2026-10-01T14:00:00Z', 29000), lectura('2026-10-31T14:00:00Z', 30000), lectura('2026-11-30T14:00:00Z', 31500)]
  const v = calcularResumen(larga, C1, AHORA).ventana30
  assert.equal(v?.valor, 1500)
  assert.equal(v?.desde, '2026-10-31T14:00:00Z')
})

verificar('Período de 44 días: se lleva a 30 días y se informa el período real (caso real del Spark)', () => {
  const l = [lectura('2026-10-03T23:41:00Z', 99380, { tipo: 'INICIAL' }), lectura('2026-11-16T23:44:00Z', 101086)]
  const v = calcularResumen(l, C1, new Date('2026-11-17T00:00:00Z')).ventana30
  assert.equal(v?.kmPeriodo, 1706)
  assert.equal(v?.diasPeriodo, 44)
  assert.equal(v?.valor, 1163) // 1706 / 44 * 30
  assert.match(v!.base, /44 días/)
})

verificar('Sin lectura inicial en el contrato vigente: alerta alta', () => {
  const a = calcularAlertas([lectura('2026-10-11T14:00:00Z', 31000)], C1, [], PARAMETROS_VACIOS, AHORA)
  assert.ok(a.some(x => x.codigo === 'SIN_LECTURA_INICIAL' && x.nivel === 'ALTA'))
})

verificar('Sin umbrales configurados no se inventan alertas, y se listan como pendientes', () => {
  const l = [lectura('2026-01-01T14:00:00Z', 30000, { tipo: 'INICIAL' }), lectura('2026-01-02T14:00:00Z', 39000)]
  const a = calcularAlertas(l, C1, [], PARAMETROS_VACIOS, AHORA)
  assert.ok(!a.some(x => ['FOTO_PENDIENTE', 'RECORRIDO_INUSUAL', 'KM_30_DIAS_ELEVADO'].includes(x.codigo)))
  assert.equal(alertasSinConfigurar(PARAMETROS_VACIOS).length, 4)
})

verificar('Con umbrales: fotografía pendiente y recorrido inusual', () => {
  const p: Parametros = { ...PARAMETROS_VACIOS, DIAS_MAX_SIN_LECTURA: 8, KM_DIA_MAX_ESPERADO: 300 }
  const l = [lectura('2026-11-01T14:00:00Z', 30000, { tipo: 'INICIAL' }), lectura('2026-11-02T14:00:00Z', 30500)]
  const a = calcularAlertas(l, C1, [], p, AHORA)
  assert.ok(a.some(x => x.codigo === 'FOTO_PENDIENTE'))
  assert.ok(a.some(x => x.codigo === 'RECORRIDO_INUSUAL'))
  assert.equal(alertasSinConfigurar(p).length, 2)
})

const ACEITE: ItemPlan = { id: 'p1', concepto: 'Cambio de aceite', intervaloKm: 5000, intervaloMeses: 6, fuente: 'Manual' }

verificar('Sin mantenimiento anterior: no se inventa la base (SIN_BASE)', () => {
  const m = calcularMantenimientos([ACEITE], [], 31000, 100, PARAMETROS_VACIOS, '2026-12-01')
  assert.equal(m[0].estado, 'SIN_BASE')
  assert.equal(m[0].kmProximo, null)
})

verificar('Por kilometraje: al día, próximo con umbral y vencido', () => {
  const ultimo: MantenimientoRealizado = { id: 'm1', fecha: '2026-11-01', concepto: 'cambio de ACEITE ', estado: 'VIGENTE', kmLectura: 30000 }
  const alDia = calcularMantenimientos([ACEITE], [ultimo], 31000, 100, PARAMETROS_VACIOS, '2026-12-01')[0]
  assert.equal(alDia.estado, 'AL_DIA')
  assert.equal(alDia.kmProximo, 35000)
  assert.equal(alDia.kmRestantes, 4000)
  assert.equal(alDia.fechaEstimadaPorKm, '2027-01-10') // 4000 km / 100 km/día = 40 días
  const proximo = calcularMantenimientos([ACEITE], [ultimo], 34500, 100, { ...PARAMETROS_VACIOS, KM_AVISO_MANTENIMIENTO: 1000 }, '2026-12-01')[0]
  assert.equal(proximo.estado, 'PROXIMO')
  const vencido = calcularMantenimientos([ACEITE], [ultimo], 35200, 100, PARAMETROS_VACIOS, '2026-12-01')[0]
  assert.equal(vencido.estado, 'VENCIDO')
})

verificar('Por tiempo: vencido aunque falten kilómetros; 31 de agosto + 6 meses = 28 de febrero', () => {
  const ultimo: MantenimientoRealizado = { id: 'm1', fecha: '2026-08-31', concepto: 'Cambio de aceite', estado: 'VIGENTE', kmLectura: 30000 }
  const r = calcularMantenimientos([ACEITE], [ultimo], 31000, 100, PARAMETROS_VACIOS, '2027-03-01')[0]
  assert.equal(r.fechaPorTiempo, '2027-02-28')
  assert.equal(r.estado, 'VENCIDO')
})

verificar('Mantenimiento sin lectura enlazada: solo por tiempo y lo dice', () => {
  const ultimo: MantenimientoRealizado = { id: 'm1', fecha: '2026-11-01', concepto: 'Cambio de aceite', estado: 'VIGENTE', kmLectura: null }
  const r = calcularMantenimientos([ACEITE], [ultimo], 31000, 100, PARAMETROS_VACIOS, '2026-12-01')[0]
  assert.equal(r.kmProximo, null)
  assert.match(r.detalle, /solo se controla por tiempo/)
})

verificar('Un mantenimiento anulado no cuenta como base', () => {
  const anulado: MantenimientoRealizado = { id: 'm1', fecha: '2026-11-01', concepto: 'Cambio de aceite', estado: 'ANULADO', kmLectura: 30000 }
  assert.equal(calcularMantenimientos([ACEITE], [anulado], 31000, 100, PARAMETROS_VACIOS, '2026-12-01')[0].estado, 'SIN_BASE')
})

verificar('Las alertas de mantenimiento salen del cálculo de mantenimientos', () => {
  const ultimo: MantenimientoRealizado = { id: 'm1', fecha: '2026-11-01', concepto: 'Cambio de aceite', estado: 'VIGENTE', kmLectura: 30000 }
  const m = calcularMantenimientos([ACEITE], [ultimo], 35200, 100, PARAMETROS_VACIOS, '2026-12-01')
  const a = calcularAlertas([lectura('2026-11-01T14:00:00Z', 30000, { tipo: 'INICIAL' })], C1, m, PARAMETROS_VACIOS, AHORA)
  assert.ok(a.some(x => x.codigo === 'MANTENIMIENTO_VENCIDO'))
})

// ---------- Viajes transcritos (adenda 1) ----------

// Los 8 registros de las capturas del 16-11-2026 con la interpretación UTC,
// ya convertidos por la base (validacion-local/salida00091.txt).
const V = (id: string, inicio: string, fin: string, dur: number, vel: number, mun = 'La Estrella', estado: ViajeTranscrito['estado'] = 'CONFIRMADO'): ViajeTranscrito =>
  ({ id, inicio, fin, duracionMin: dur, velocidadKmh: vel, municipio: mun, interpretacion: 'UTC', estado })
const CAPTURAS: ViajeTranscrito[] = [
  V('1', '2026-11-16T07:38:00Z', '2026-11-16T08:08:00Z', 29, 31),
  V('2', '2026-11-16T04:23:00Z', '2026-11-16T06:17:00Z', 113, 44),
  V('3', '2026-11-16T04:13:00Z', '2026-11-16T04:23:00Z', 9, 0),
  V('4', '2026-11-15T09:33:00Z', '2026-11-15T12:22:00Z', 168, 23),
  V('5', '2026-11-15T01:09:00Z', '2026-11-15T01:12:00Z', 2, 0),
  V('6', '2026-11-14T21:07:00Z', '2026-11-14T21:25:00Z', 17, 36, 'Caldas'),
  V('7', '2026-11-14T16:31:00Z', '2026-11-14T20:40:00Z', 249, 20),
  V('8', '2026-11-14T16:20:00Z', '2026-11-14T16:30:00Z', 10, 18),
]

verificar('Capturas reales: 6 viajes, 2 sin movimiento, 9 h 46 min, 3 días con actividad', () => {
  const r = resumirViajes(CAPTURAS)
  assert.equal(r.viajes, 6)
  assert.equal(r.sinMovimiento, 2)
  assert.equal(r.minutosEnMovimiento, 586)
  assert.equal(formatearDuracion(r.minutosEnMovimiento), '9 h 46 min')
  assert.equal(r.diasConActividad, 3) // 14, 15 y 16 de noviembre en Colombia
  assert.equal(r.ultimaActividad, '2026-11-16T08:08:00Z')
})

verificar('Horas de actividad en hora de Colombia (23:23 cuenta en la hora 23, no en la 4)', () => {
  const r = resumirViajes(CAPTURAS)
  assert.equal(r.porHora[23], 1) // 15-11 23:23
  assert.equal(r.porHora[2], 1) // 16-11 02:38
  assert.equal(r.porHora[11], 2) // 14-11 11:20 y 11:31
  assert.equal(r.porHora[4], 1) // 15-11 04:33
  assert.equal(r.porHora[16], 1) // 14-11 16:07
  assert.equal(r.porHora.reduce((s, n) => s + n, 0), 6)
})

verificar('Un viaje anulado no cuenta', () => {
  const r = resumirViajes([...CAPTURAS.slice(0, 1), { ...CAPTURAS[1], estado: 'ANULADO' }])
  assert.equal(r.viajes, 1)
})

verificar('Sin viajes: todo en cero y sin fechas', () => {
  const r = resumirViajes([])
  assert.equal(r.viajes, 0)
  assert.equal(r.ultimaActividad, null)
})

console.log(`\nAnalítica vehicular: ${casos} casos verificados.`)
