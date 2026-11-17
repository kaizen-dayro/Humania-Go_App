import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, Clock, Gauge, Info, MapPinOff, Route, Timer, Wrench } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { fechaHoyBogota, formatearFechaAdmin, formatearSoloFecha } from '@/lib/format'
import {
  ETIQUETA_CLASIFICACION, MIN_LECTURAS_PROYECCION, PARAMETROS_VACIOS, alertasSinConfigurar, calcularAlertas,
  calcularMantenimientos, calcularProyeccion, calcularResumen, calcularTramos,
  type Clasificacion, type ItemPlan, type LecturaOdometro, type MantenimientoRealizado, type Parametros,
} from '@/lib/domain/analiticaVehicular/calculos'
import { formatearDuracion, resumirViajes, type ViajeTranscrito } from '@/lib/domain/analiticaVehicular/viajes'
import {
  AccionConMotivo, PlanMantenimientoBoton, RegistrarLecturaBoton, RegistrarMantenimientoBoton, TranscribirViajeBoton, UmbralesBoton,
  type FilaParametro, type OpcionLectura,
} from './Formularios'

// Analítica vehicular, Fase 1 (SDD `gps-inteligencia-vehicular`). Solo
// SUPER_ADMIN (D5 a). La autorización real vive en RLS y en las RPC de 00090;
// esta verificación evita mostrar la pantalla a un ADMIN común.

const TIPO_LECTURA: Record<string, string> = {
  INICIAL: 'Inicial (entrega)', PERIODICA: 'Periódica', MANTENIMIENTO: 'En mantenimiento', DEVOLUCION: 'Devolución',
}

const PARAMETROS_UI: { clave: keyof Parametros; etiqueta: string; unidad: string }[] = [
  { clave: 'DIAS_MAX_SIN_LECTURA', etiqueta: 'Días máximos sin lectura del odómetro', unidad: 'días' },
  { clave: 'KM_DIA_MAX_ESPERADO', etiqueta: 'Recorrido diario máximo esperado', unidad: 'km/día' },
  { clave: 'KM_30_DIAS_ELEVADO', etiqueta: 'Kilometraje elevado en 30 días', unidad: 'km' },
  { clave: 'KM_AVISO_MANTENIMIENTO', etiqueta: 'Avisar mantenimiento con esta anticipación', unidad: 'km' },
  { clave: 'DIAS_AVISO_MANTENIMIENTO', etiqueta: 'Avisar mantenimiento con esta anticipación', unidad: 'días' },
]

const km = (v: number) => `${v.toLocaleString('es-CO')} km`

// Formas de las filas que se leen (columnas de 00003/00008/00090).
type FilaActivo = {
  id: string; codigo_interno: string; placa: string | null; estado: string; color: string | null; anio_modelo: number | null
  modelos_vehiculo: { nombre: string; marcas_vehiculo: { nombre: string } | null } | null
}
type FilaContrato = {
  id: string; fecha_asignacion: string; fecha_liberacion: string | null; estatus_contractual_resultante: string | null
  candidatos: { id: string; nombres: string; apellidos: string } | null
}
type FilaLectura = {
  id: string; tipo: LecturaOdometro['tipo']; estado: LecturaOdometro['estado']; fecha_captura: string; valor_km: number
  asset_assignment_history_id: string | null; foto_id: string | null; observacion: string | null; motivo_excepcion: string | null
  motivo_anulacion: string | null; registrado_en: string
}
type FilaPlan = { id: string; concepto: string; intervalo_km: number | null; intervalo_meses: number | null; fuente: string; vigente: boolean }
type FilaMantenimiento = {
  id: string; fecha: string; concepto: string; descripcion: string | null; estado: MantenimientoRealizado['estado']
  lectura_odometro_id: string | null; costo: number | null; motivo_anulacion: string | null
}
type FilaParametroBD = { parametro: keyof Parametros; valor: number | string | null }
type FilaViaje = {
  id: string; inicio: string; fin: string; duracion_mostrada_min: number; velocidad_mostrada_kmh: number | string
  municipio_mostrado: string; interpretacion_hora: ViajeTranscrito['interpretacion']; estado: ViajeTranscrito['estado']
  captura_referencia: string; hora_inicio_mostrada: string; hora_fin_mostrada: string; fecha_grupo_mostrada: string
  motivo_anulacion: string | null
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function EtiquetaClasificacion({ c }: { c: Clasificacion }) {
  const estilo = c === 'MEDIDO' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : c === 'CALCULADO' ? 'bg-sky-50 text-sky-800 border-sky-200'
    : c === 'REPORTADO_GPS' ? 'bg-violet-50 text-violet-800 border-violet-200'
    : 'bg-amber-50 text-amber-800 border-amber-200'
  return <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${estilo}`}>{ETIQUETA_CLASIFICACION[c]}</span>
}

function Tarjeta({ titulo, valor, detalle, clasificacion, icono, apagada }: {
  titulo: string; valor: string; detalle?: string; clasificacion?: Clasificacion; icono: React.ReactNode; apagada?: boolean
}) {
  return (
    <div className={`rounded-lg border shadow-sm p-4 flex flex-col gap-2 ${apagada ? 'bg-neutral-50 border-dashed border-neutral-300' : 'bg-white border-neutral-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-humania-gray/70">{titulo}</p>
        <span className={apagada ? 'text-neutral-300' : 'text-humania-blue'}>{icono}</span>
      </div>
      <p className={`text-2xl font-bold ${apagada ? 'text-neutral-400' : 'text-humania-blue'}`}>{valor}</p>
      {clasificacion && <div><EtiquetaClasificacion c={clasificacion} /></div>}
      {detalle && <p className="text-xs text-humania-gray">{detalle}</p>}
    </div>
  )
}

function Seccion({ titulo, children, acciones }: { titulo: string; children: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-humania-blue">{titulo}</h2>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>
      {children}
    </section>
  )
}

export default async function AnaliticaVehicularPage({ searchParams }: { searchParams: Promise<{ activo?: string }> }) {
  const { activo: activoParam } = await searchParams
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')
  const { data: caller } = await supabase.from('admin_users').select('role, activo').eq('id', session.user.id).single()
  if (!caller || !caller.activo || caller.role !== 'SUPER_ADMIN') redirect('/admin')

  const { data: activos } = await supabase
    .from('activos')
    .select('id, codigo_interno, placa, estado, color, anio_modelo, modelos_vehiculo(nombre, marcas_vehiculo(nombre))')
    .order('codigo_interno')
  const lista = (activos ?? []) as unknown as FilaActivo[]
  const activo = lista.find(a => a.id === activoParam) ?? lista.find(a => a.estado === 'ASIGNADO') ?? lista[0]

  if (!activo) {
    return <p className="text-humania-gray">No hay vehículos registrados.</p>
  }

  const [contratosR, lecturasR, planR, mantR, paramsR, viajesR] = await Promise.all([
    supabase.from('asset_assignment_history')
      .select('id, fecha_asignacion, fecha_liberacion, estatus_contractual_resultante, candidatos(id, nombres, apellidos)')
      .eq('activo_id', activo.id).order('fecha_asignacion', { ascending: true }),
    supabase.from('activo_odometro_lecturas').select('*').eq('activo_id', activo.id).order('fecha_captura', { ascending: true }),
    supabase.from('activo_plan_mantenimiento').select('*').eq('activo_id', activo.id).order('registrado_en', { ascending: true }),
    supabase.from('activo_mantenimientos').select('*').eq('activo_id', activo.id).order('fecha', { ascending: true }),
    supabase.from('analitica_vehicular_parametros').select('parametro, valor').order('id', { ascending: false }),
    supabase.from('gps_viajes_transcritos').select('*').eq('activo_id', activo.id).order('inicio', { ascending: false }),
  ])

  // Adenda 1: si la migración 00091 todavía no se ejecutó, la tabla no existe.
  // No es un error del tablero: la sección de viajes lo indica aparte.
  const tablaViajesPendiente = !!viajesR.error && ['42P01', 'PGRST205'].includes(viajesR.error.code ?? '')

  // Auditoría de accesos (AC-12). Un fallo aquí no impide ver el tablero, pero se avisa.
  const { error: errAcceso } = await supabase.rpc('registrar_acceso_analitica_vehicular', { p_activo_id: activo.id, p_vista: 'RESUMEN' })

  const errorCarga = [contratosR.error, lecturasR.error, planR.error, mantR.error, paramsR.error, errAcceso,
    tablaViajesPendiente ? null : viajesR.error].find(Boolean)

  const contratos = (contratosR.data ?? []) as unknown as FilaContrato[]
  const contratoVigente = contratos.find(c => c.fecha_liberacion === null) ?? null
  const conductor = contratoVigente?.candidatos ?? null

  const filasLectura = (lecturasR.data ?? []) as FilaLectura[]
  const lecturas: LecturaOdometro[] = filasLectura.map(l => ({
    id: l.id, fechaCaptura: l.fecha_captura, valorKm: l.valor_km, tipo: l.tipo, estado: l.estado, contratoId: l.asset_assignment_history_id,
  }))

  const filasPlan = (planR.data ?? []) as FilaPlan[]
  const planVigente: ItemPlan[] = filasPlan.filter(p => p.vigente).map(p => ({
    id: p.id, concepto: p.concepto, intervaloKm: p.intervalo_km, intervaloMeses: p.intervalo_meses, fuente: p.fuente,
  }))

  const kmPorLectura = new Map(filasLectura.filter(l => l.estado === 'CONFIRMADA').map(l => [l.id, l.valor_km]))
  const filasMant = (mantR.data ?? []) as FilaMantenimiento[]
  const realizados: MantenimientoRealizado[] = filasMant.map(m => ({
    id: m.id, fecha: m.fecha, concepto: m.concepto, estado: m.estado,
    kmLectura: m.lectura_odometro_id ? kmPorLectura.get(m.lectura_odometro_id) ?? null : null,
  }))

  const parametros: Parametros = { ...PARAMETROS_VACIOS }
  const vistos = new Set<string>()
  for (const p of (paramsR.data ?? []) as FilaParametroBD[]) {
    if (vistos.has(p.parametro)) continue
    vistos.add(p.parametro)
    parametros[p.parametro] = p.valor === null ? null : Number(p.valor)
  }

  // Fotografías de las lecturas: URL firmada de corta duración (bucket privado).
  const fotoIds = filasLectura.map(l => l.foto_id).filter(Boolean) as string[]
  const urlPorFoto = new Map<string, string>()
  if (fotoIds.length > 0) {
    const { data: fotos } = await supabase.from('activo_fotos').select('id, storage_path').in('id', fotoIds)
    const rutas = (fotos ?? []).map(f => f.storage_path)
    if (rutas.length > 0) {
      const { data: firmadas } = await supabase.storage.from('activo-fotos-evidencia').createSignedUrls(rutas, 600)
      for (const f of fotos ?? []) {
        const s = firmadas?.find(x => x.path === f.storage_path)
        if (s?.signedUrl) urlPorFoto.set(f.id, s.signedUrl)
      }
    }
  }

  const filasViaje = (viajesR.data ?? []) as FilaViaje[]
  const viajes: ViajeTranscrito[] = filasViaje.map(v => ({
    id: v.id, inicio: v.inicio, fin: v.fin, duracionMin: v.duracion_mostrada_min, velocidadKmh: Number(v.velocidad_mostrada_kmh),
    municipio: v.municipio_mostrado, interpretacion: v.interpretacion_hora, estado: v.estado,
  }))
  const resumenViajes = resumirViajes(viajes)
  const maxPorHora = Math.max(1, ...resumenViajes.porHora)

  const ahora = new Date()
  const hoy = fechaHoyBogota()
  const contratoId = contratoVigente?.id ?? null
  const resumen = calcularResumen(lecturas, contratoId, ahora)
  const tramos = calcularTramos(lecturas)
  const proyeccion = calcularProyeccion(lecturas, contratoId)
  const mantenimientos = calcularMantenimientos(
    planVigente, realizados, resumen.odometroActual?.valor ?? null,
    proyeccion.disponible ? proyeccion.kmDia : null, parametros, hoy,
  )
  const alertas = calcularAlertas(lecturas, contratoId, mantenimientos, parametros, ahora)
  const sinConfigurar = alertasSinConfigurar(parametros)

  const proximoMant = mantenimientos
    .filter(m => m.estado !== 'SIN_BASE')
    .sort((a, b) => (a.kmRestantes ?? Infinity) - (b.kmRestantes ?? Infinity))[0] ?? null

  const marca = activo.modelos_vehiculo?.marcas_vehiculo?.nombre ?? ''
  const modelo = activo.modelos_vehiculo?.nombre ?? ''

  const opcionesLectura: OpcionLectura[] = filasLectura
    .filter(l => l.estado === 'CONFIRMADA')
    .reverse()
    .map(l => ({ id: l.id, etiqueta: `${formatearFechaAdmin(l.fecha_captura)} — ${km(l.valor_km)} (${TIPO_LECTURA[l.tipo]})` }))

  const filasParametro: FilaParametro[] = PARAMETROS_UI.map(p => ({
    clave: p.clave, etiqueta: p.etiqueta, unidad: p.unidad,
    valorActual: parametros[p.clave] === null ? null : (parametros[p.clave] as number).toLocaleString('es-CO'),
  }))

  const maxPromedio = Math.max(1, ...tramos.map(t => t.promedioDiario ?? 0))

  // Historial: contratos, lecturas (también anuladas) y mantenimientos, del más reciente al más antiguo.
  type Evento = { fecha: string; titulo: string; detalle: string; tono: 'normal' | 'anulado' | 'contrato' }
  const eventos: Evento[] = [
    ...contratos.flatMap(c => {
      const nombre = c.candidatos ? `${c.candidatos.nombres} ${c.candidatos.apellidos}` : 'Conductor'
      const e: Evento[] = [{ fecha: c.fecha_asignacion, titulo: 'Asignación del vehículo', detalle: nombre, tono: 'contrato' }]
      if (c.fecha_liberacion) e.push({ fecha: c.fecha_liberacion, titulo: 'Liberación del vehículo', detalle: `${nombre} — ${c.estatus_contractual_resultante ?? ''}`, tono: 'contrato' })
      return e
    }),
    ...filasLectura.map(l => ({
      fecha: l.fecha_captura,
      titulo: `Lectura del odómetro: ${km(l.valor_km)}`,
      detalle: `${TIPO_LECTURA[l.tipo]}${l.estado === 'ANULADA' ? ` — Anulada: ${l.motivo_anulacion}` : ''}${l.motivo_excepcion ? ` — Motivo: ${l.motivo_excepcion}` : ''}`,
      tono: (l.estado === 'ANULADA' ? 'anulado' : 'normal') as Evento['tono'],
    })),
    ...filasMant.map(m => ({
      fecha: `${m.fecha}T12:00:00-05:00`,
      titulo: `Mantenimiento: ${m.concepto}`,
      detalle: `${m.descripcion ?? ''}${m.estado === 'ANULADO' ? ` — Anulado: ${m.motivo_anulacion}` : ''}`,
      tono: (m.estado === 'ANULADO' ? 'anulado' : 'normal') as Evento['tono'],
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-humania-blue">Analítica vehicular</h1>
          <p className="text-humania-gray">Kilometraje, mantenimiento y uso del vehículo — exclusivo SUPER_ADMIN</p>
        </div>
        {lista.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {lista.map(a => (
              <Link key={a.id} href={`/admin/analitica-vehicular?activo=${a.id}`}
                className={`text-xs px-3 py-1.5 border rounded-full ${a.id === activo.id ? 'bg-humania-blue text-white border-humania-blue' : 'bg-white text-humania-gray border-neutral-300 hover:border-humania-blue'}`}>
                {a.placa || a.codigo_interno}
              </Link>
            ))}
          </div>
        )}
      </div>

      {errorCarga && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md">
          No se pudo cargar toda la información: {errorCarga.message}
        </div>
      )}

      {/* Identificación: vehículo, conductor y período (AC-09) */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5 grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-humania-gray/70">Vehículo</p>
          <p className="text-lg font-bold text-humania-blue">{marca} {modelo}{activo.anio_modelo ? ` ${activo.anio_modelo}` : ''}</p>
          <p className="text-sm text-humania-gray">Placa {activo.placa ?? 'sin registrar'} · {activo.codigo_interno}{activo.color ? ` · ${activo.color}` : ''}</p>
          {!activo.anio_modelo && <p className="text-xs text-amber-700 mt-1">Falta el año del modelo: regístralo en la ficha del activo.</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-humania-gray/70">Conductor</p>
          {conductor ? (
            <Link href={`/admin/candidatos/${conductor.id}`} className="text-lg font-bold text-humania-blue hover:underline">{conductor.nombres} {conductor.apellidos}</Link>
          ) : <p className="text-lg font-bold text-humania-gray">Sin contrato vigente</p>}
          <p className="text-sm text-humania-gray">Estado del vehículo: {activo.estado}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-humania-gray/70">Período analizado</p>
          <p className="text-lg font-bold text-humania-blue">{contratoVigente ? `Desde ${formatearFechaAdmin(contratoVigente.fecha_asignacion)}` : 'Sin contrato vigente'}</p>
          <p className="text-sm text-humania-gray">{resumen.totalLecturas} lecturas confirmadas del odómetro</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <RegistrarLecturaBoton activoId={activo.id} contratoVigenteId={contratoId} tieneInicial={!!resumen.lecturaInicialDelContrato} />
        <RegistrarMantenimientoBoton activoId={activo.id} conceptos={planVigente.map(p => p.concepto)} lecturas={opcionesLectura} hoy={hoy} />
        <PlanMantenimientoBoton activoId={activo.id} />
        <UmbralesBoton filas={filasParametro} />
      </div>

      {/* Resumen ejecutivo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Odómetro actual" icono={<Gauge className="w-5 h-5" />}
          valor={resumen.odometroActual ? km(resumen.odometroActual.valor) : 'Sin lecturas'}
          clasificacion={resumen.odometroActual ? 'MEDIDO' : undefined}
          detalle={resumen.odometroActual ? `Lectura del ${formatearFechaAdmin(resumen.odometroActual.fecha)}` : 'Registra la primera lectura del odómetro.'} />
        <Tarjeta titulo="Km desde la entrega" icono={<Route className="w-5 h-5" />}
          valor={resumen.kmDesdeAsignacion ? km(resumen.kmDesdeAsignacion.valor) : 'Sin datos'}
          clasificacion={resumen.kmDesdeAsignacion?.clasificacion}
          detalle={resumen.kmDesdeAsignacion?.base ?? 'Necesita la lectura inicial y al menos una posterior.'} />
        <Tarjeta titulo="Km por cada 30 días" icono={<Route className="w-5 h-5" />}
          valor={resumen.ventana30 ? km(resumen.ventana30.valor) : 'Sin datos'}
          clasificacion={resumen.ventana30?.clasificacion}
          detalle={resumen.ventana30 ? `${resumen.ventana30.base}: ${formatearFechaAdmin(resumen.ventana30.desde)} a ${formatearFechaAdmin(resumen.ventana30.hasta)}.` : 'Necesita lecturas separadas por al menos 30 días.'} />
        <Tarjeta titulo="Promedio diario" icono={<Gauge className="w-5 h-5" />}
          valor={resumen.promedioDiario ? `${resumen.promedioDiario.valor.toLocaleString('es-CO')} km/día` : 'Sin datos'}
          clasificacion={resumen.promedioDiario?.clasificacion}
          detalle={resumen.promedioDiario?.base ?? 'Necesita la lectura inicial y al menos una posterior.'} />
        <Tarjeta titulo="Próximo mantenimiento" icono={<Wrench className="w-5 h-5" />}
          valor={planVigente.length === 0 ? 'Plan sin configurar' : proximoMant ? proximoMant.plan.concepto : 'Sin base'}
          clasificacion={proximoMant?.fechaEstimadaPorKm ? 'PREDICCION' : undefined}
          detalle={planVigente.length === 0 ? 'Agrega los intervalos del fabricante.'
            : proximoMant ? `${proximoMant.detalle}${proximoMant.fechaEstimadaPorKm ? ` Fecha estimada por kilometraje: ${formatearSoloFecha(proximoMant.fechaEstimadaPorKm)}.` : ''}`
            : 'Registra el último mantenimiento realizado de cada concepto.'} />
        {resumenViajes.viajes + resumenViajes.sinMovimiento > 0 ? (
          <>
            <Tarjeta titulo="Viajes transcritos" icono={<Route className="w-5 h-5" />} clasificacion="REPORTADO_GPS"
              valor={`${resumenViajes.viajes} viajes`}
              detalle={`${resumenViajes.diasConActividad} días con actividad entre el ${formatearFechaAdmin(resumenViajes.desde)} y el ${formatearFechaAdmin(resumenViajes.hasta)}${resumenViajes.sinMovimiento ? `; ${resumenViajes.sinMovimiento} registros sin movimiento no cuentan` : ''}. Solo lo transcrito.`} />
            <Tarjeta titulo="Tiempo en movimiento" icono={<Timer className="w-5 h-5" />} clasificacion="REPORTADO_GPS"
              valor={formatearDuracion(resumenViajes.minutosEnMovimiento)}
              detalle="Suma de las duraciones que muestra la app para los viajes transcritos." />
            <Tarjeta titulo="Última actividad GPS conocida" icono={<Clock className="w-5 h-5" />} clasificacion="REPORTADO_GPS"
              valor={formatearFechaAdmin(resumenViajes.ultimaActividad) ?? ''}
              detalle="Fin del último viaje transcrito, en hora de Colombia." />
          </>
        ) : (
          <>
            <Tarjeta apagada titulo="Viajes realizados" icono={<Route className="w-5 h-5" />} valor="Sin viajes" detalle="Transcribe los viajes que muestra la app del GPS." />
            <Tarjeta apagada titulo="Tiempo de conducción" icono={<Timer className="w-5 h-5" />} valor="Sin viajes" detalle="Se calcula con los viajes transcritos." />
            <Tarjeta apagada titulo="Última actividad GPS" icono={<MapPinOff className="w-5 h-5" />} valor="Sin viajes" detalle="Pendiente de transcribir o de la respuesta de Road Track." />
          </>
        )}
      </div>

      {/* Viajes transcritos de la app (adenda 1) */}
      <Seccion titulo="Viajes transcritos de la app del GPS" acciones={tablaViajesPendiente ? undefined : <TranscribirViajeBoton activoId={activo.id} hoy={hoy} />}>
        {tablaViajesPendiente ? (
          <p className="text-sm text-humania-gray">Falta ejecutar la migración 00091 en la base de datos para registrar viajes.</p>
        ) : filasViaje.length === 0 ? (
          <p className="text-sm text-humania-gray">Todavía no hay viajes transcritos. La app solo muestra los últimos 3 días: transcribe cada 2 o 3 días para no perderlos.</p>
        ) : (
          <>
            <p className="text-xs text-humania-gray">
              <EtiquetaClasificacion c="REPORTADO_GPS" /> Dato del proveedor copiado a mano de capturas de la app; no lo mide Humania Go.
              Horas en hora de Colombia{resumenViajes.interpretaciones.includes('UTC') ? ', convertidas desde la hora UTC que muestra la app (lectura confirmada por la administración)' : ''}.
              Sin direcciones ni coordenadas: solo el municipio. Los viajes no se suman con el kilometraje del odómetro.
            </p>
            {resumenViajes.viajes > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-humania-gray/70 mb-2">Viajes por hora de inicio</p>
                  <svg role="img" aria-label="Viajes por hora de inicio" viewBox="0 0 480 120" className="w-full h-auto">
                    {resumenViajes.porHora.map((n, h) => (
                      <g key={h}>
                        <rect x={h * 20 + 2} y={95 - (n / maxPorHora) * 80} width={16} height={Math.max((n / maxPorHora) * 80, n > 0 ? 2 : 0.5)} className={n > 0 ? 'fill-violet-500' : 'fill-neutral-200'} />
                        {h % 3 === 0 && <text x={h * 20 + 10} y={112} textAnchor="middle" className="fill-humania-gray text-[10px]">{h}</text>}
                      </g>
                    ))}
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-humania-gray/70 mb-2">Viajes por día de la semana</p>
                  <div className="flex gap-2 items-end h-24">
                    {resumenViajes.porDiaSemana.map((n, d) => (
                      <div key={d} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-humania-gray">{n || ''}</span>
                        <div className={`w-full ${n > 0 ? 'bg-violet-500' : 'bg-neutral-200'}`} style={{ height: `${Math.max(4, (n / Math.max(1, ...resumenViajes.porDiaSemana)) * 64)}px` }} />
                        <span className="text-[10px] text-humania-gray">{DIAS_SEMANA[d]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-humania-gray/70 border-b">
                  <th className="py-2 pr-4">Inicio (Colombia)</th><th className="py-2 pr-4">Fin</th><th className="py-2 pr-4">Duración</th><th className="py-2 pr-4">Velocidad</th><th className="py-2 pr-4">Municipio</th><th className="py-2 pr-4">Mostrado en la app</th><th className="py-2 pr-4">Estado</th><th className="py-2"></th>
                </tr></thead>
                <tbody>
                  {filasViaje.map(v => {
                    const sinMovimiento = Number(v.velocidad_mostrada_kmh) === 0
                    return (
                      <tr key={v.id} className={`border-b border-neutral-100 align-top ${v.estado === 'ANULADO' ? 'text-neutral-400' : ''}`}>
                        <td className="py-2 pr-4 whitespace-nowrap">{formatearFechaAdmin(v.inicio)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{formatearFechaAdmin(v.fin)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{formatearDuracion(v.duracion_mostrada_min)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{Number(v.velocidad_mostrada_kmh).toLocaleString('es-CO')} km/h</td>
                        <td className="py-2 pr-4">{v.municipio_mostrado}</td>
                        <td className="py-2 pr-4 text-xs text-humania-gray">{formatearSoloFecha(v.fecha_grupo_mostrada)} {v.hora_inicio_mostrada.slice(0, 5)} – {v.hora_fin_mostrada.slice(0, 5)} ({v.interpretacion_hora === 'UTC' ? 'UTC' : 'hora de Colombia'}) · {v.captura_referencia}</td>
                        <td className="py-2 pr-4 text-xs">{v.estado === 'ANULADO' ? `Anulado: ${v.motivo_anulacion}` : sinMovimiento ? 'Sin movimiento (no cuenta)' : 'Viaje'}</td>
                        <td className="py-2">{v.estado === 'CONFIRMADO' && <AccionConMotivo tipo="viaje" id={v.id} descripcion={`Se anulará el viaje del ${formatearFechaAdmin(v.inicio)}`} />}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Seccion>

      {/* Alertas */}
      <Seccion titulo="Alertas">
        {alertas.length === 0 ? (
          <p className="text-sm text-humania-gray">Sin alertas con la información y los umbrales actuales.</p>
        ) : (
          <ul className="space-y-2">
            {alertas.map((a, i) => (
              <li key={i} className={`flex gap-2 text-sm p-3 rounded-md border ${a.nivel === 'ALTA' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{a.mensaje}
              </li>
            ))}
          </ul>
        )}
        {sinConfigurar.length > 0 && (
          <p className="text-xs text-humania-gray flex gap-2"><Info className="w-4 h-4 shrink-0" />Alertas sin umbral (no se calculan): {sinConfigurar.join(', ')}.</p>
        )}
      </Seccion>

      {/* Actividad por tramos */}
      <Seccion titulo="Actividad entre lecturas">
        {tramos.length === 0 ? (
          <p className="text-sm text-humania-gray">Se necesitan al menos dos lecturas confirmadas para mostrar recorridos.</p>
        ) : (
          <>
            <p className="text-xs text-humania-gray"><EtiquetaClasificacion c="CALCULADO" /> Promedio de kilómetros por día en cada tramo entre dos lecturas. No es un dato diario: la resolución depende de la frecuencia de las fotografías.</p>
            <div className="overflow-x-auto">
              <svg role="img" aria-label="Promedio diario por tramo" width={Math.max(320, tramos.length * 56)} height={170} className="block">
                {tramos.map((t, i) => {
                  const alto = t.promedioDiario === null ? 0 : (t.promedioDiario / maxPromedio) * 120
                  const x = i * 56 + 12
                  return (
                    <g key={t.hasta.id}>
                      <rect x={x} y={140 - alto} width={36} height={Math.max(alto, 1)} className={t.inconsistente ? 'fill-red-300' : t.compartido ? 'fill-humania-sand' : 'fill-humania-blue'} />
                      <text x={x + 18} y={134 - alto} textAnchor="middle" className="fill-humania-gray text-[10px]">{t.promedioDiario === null ? 'n/d' : t.promedioDiario.toLocaleString('es-CO')}</text>
                      <text x={x + 18} y={156} textAnchor="middle" className="fill-humania-gray text-[10px]">{formatearFechaAdmin(t.hasta.fechaCaptura)?.slice(0, 5)}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-humania-gray/70 border-b">
                  <th className="py-2 pr-4">Desde</th><th className="py-2 pr-4">Hasta</th><th className="py-2 pr-4">Días</th><th className="py-2 pr-4">Km</th><th className="py-2 pr-4">Km por día</th><th className="py-2">Observación</th>
                </tr></thead>
                <tbody>
                  {[...tramos].reverse().map(t => (
                    <tr key={t.hasta.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-4 whitespace-nowrap">{formatearFechaAdmin(t.desde.fechaCaptura)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatearFechaAdmin(t.hasta.fechaCaptura)}</td>
                      <td className="py-2 pr-4">{t.dias.toLocaleString('es-CO')}</td>
                      <td className="py-2 pr-4">{t.km.toLocaleString('es-CO')}</td>
                      <td className="py-2 pr-4">{t.promedioDiario === null ? 'n/d' : t.promedioDiario.toLocaleString('es-CO')}</td>
                      <td className="py-2 text-xs text-humania-gray">{t.inconsistente ? 'Lectura menor que la anterior' : t.compartido ? 'Tramo compartido entre dos contratos' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Seccion>

      {/* Proyección */}
      <Seccion titulo="Proyección de kilometraje">
        {!proyeccion.disponible ? (
          <p className="text-sm text-humania-gray">{proyeccion.motivo}</p>
        ) : (
          <>
            <p className="text-xs text-humania-gray"><EtiquetaClasificacion c="PREDICCION" /> Estimación lineal con {proyeccion.lecturasUsadas} lecturas entre el {formatearFechaAdmin(proyeccion.desde)} y el {formatearFechaAdmin(proyeccion.hasta)} ({proyeccion.kmDia.toLocaleString('es-CO')} km/día). No es un dato medido: supone que el uso sigue igual.</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {proyeccion.horizontes.map(h => (
                <div key={h.dias} className="border border-amber-200 bg-amber-50/40 rounded-md p-3">
                  <p className="text-xs uppercase text-humania-gray/70 font-semibold">En {h.etiqueta}</p>
                  <p className="text-lg font-bold text-humania-blue">+{km(h.kmAdicionales)}</p>
                  <p className="text-xs text-humania-gray">Odómetro estimado: {km(h.odometroEstimado)}</p>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="text-xs text-humania-gray">Mínimo de lecturas para proyectar: {MIN_LECTURAS_PROYECCION}. El desgaste mecánico no se estima: el kilometraje solo no lo determina.</p>
      </Seccion>

      {/* Mantenimiento */}
      <Seccion titulo="Mantenimiento">
        {planVigente.length === 0 ? (
          <p className="text-sm text-humania-gray">Plan de mantenimiento sin configurar. Agrega los intervalos del manual del fabricante con su fuente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-humania-gray/70 border-b">
                <th className="py-2 pr-4">Concepto</th><th className="py-2 pr-4">Intervalo</th><th className="py-2 pr-4">Último</th><th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Detalle</th><th className="py-2"></th>
              </tr></thead>
              <tbody>
                {mantenimientos.map(m => (
                  <tr key={m.plan.id} className="border-b border-neutral-100 align-top">
                    <td className="py-2 pr-4 font-medium text-humania-blue">{m.plan.concepto}<p className="text-xs text-humania-gray font-normal">Fuente: {m.plan.fuente}</p></td>
                    <td className="py-2 pr-4 whitespace-nowrap">{[m.plan.intervaloKm ? km(m.plan.intervaloKm) : null, m.plan.intervaloMeses ? `${m.plan.intervaloMeses} meses` : null].filter(Boolean).join(' o ')}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{m.ultimo ? formatearSoloFecha(m.ultimo.fecha) : 'Sin registro'}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${m.estado === 'VENCIDO' ? 'bg-red-100 text-red-800' : m.estado === 'PROXIMO' ? 'bg-amber-100 text-amber-900' : m.estado === 'AL_DIA' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>
                        {m.estado === 'VENCIDO' ? 'Vencido' : m.estado === 'PROXIMO' ? 'Próximo' : m.estado === 'AL_DIA' ? 'Al día' : 'Sin base'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-humania-gray">{m.detalle}{m.fechaEstimadaPorKm ? ` Estimado por km: ${formatearSoloFecha(m.fechaEstimadaPorKm)} (predicción).` : ''}</td>
                    <td className="py-2"><AccionConMotivo tipo="plan" id={m.plan.id} descripcion={`Se retirará el intervalo de ${m.plan.concepto}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filasMant.length > 0 && (
          <div className="overflow-x-auto">
            <p className="text-sm font-semibold text-humania-blue mb-2">Mantenimientos registrados</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-humania-gray/70 border-b">
                <th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Concepto</th><th className="py-2 pr-4">Odómetro</th><th className="py-2 pr-4">Costo</th><th className="py-2 pr-4">Estado</th><th className="py-2"></th>
              </tr></thead>
              <tbody>
                {[...filasMant].reverse().map(m => (
                  <tr key={m.id} className={`border-b border-neutral-100 ${m.estado === 'ANULADO' ? 'text-neutral-400 line-through' : ''}`}>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatearSoloFecha(m.fecha)}</td>
                    <td className="py-2 pr-4">{m.concepto}</td>
                    <td className="py-2 pr-4">{m.lectura_odometro_id && kmPorLectura.has(m.lectura_odometro_id) ? km(kmPorLectura.get(m.lectura_odometro_id)!) : 'Sin lectura'}</td>
                    <td className="py-2 pr-4">{m.costo !== null ? `$ ${Number(m.costo).toLocaleString('es-CO')}` : ''}</td>
                    <td className="py-2 pr-4 no-underline">{m.estado === 'ANULADO' ? 'Anulado' : 'Vigente'}</td>
                    <td className="py-2">{m.estado === 'VIGENTE' && <AccionConMotivo tipo="mantenimiento" id={m.id} descripcion={`Se anulará el mantenimiento de ${m.concepto}`} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {/* Lecturas */}
      <Seccion titulo="Lecturas del odómetro">
        {filasLectura.length === 0 ? (
          <p className="text-sm text-humania-gray">Todavía no hay lecturas. Empieza por la lectura inicial (kilometraje de entrega del Anexo 1).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-humania-gray/70 border-b">
                <th className="py-2 pr-4">Fecha de la foto</th><th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Kilometraje</th><th className="py-2 pr-4">Foto</th><th className="py-2 pr-4">Registrada</th><th className="py-2 pr-4">Estado</th><th className="py-2"></th>
              </tr></thead>
              <tbody>
                {[...filasLectura].reverse().map(l => (
                  <tr key={l.id} className={`border-b border-neutral-100 align-top ${l.estado === 'ANULADA' ? 'text-neutral-400' : ''}`}>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatearFechaAdmin(l.fecha_captura)}</td>
                    <td className="py-2 pr-4">{TIPO_LECTURA[l.tipo]}</td>
                    <td className={`py-2 pr-4 font-semibold ${l.estado === 'ANULADA' ? 'line-through' : 'text-humania-blue'}`}>{km(l.valor_km)}</td>
                    <td className="py-2 pr-4">{l.foto_id && urlPorFoto.has(l.foto_id) ? <a href={urlPorFoto.get(l.foto_id)} target="_blank" rel="noreferrer" className="text-humania-blue underline">Ver</a> : (l.observacion ?? 'Sin foto')}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs">{formatearFechaAdmin(l.registrado_en)}</td>
                    <td className="py-2 pr-4 text-xs">
                      {l.estado === 'ANULADA' ? `Anulada: ${l.motivo_anulacion}` : 'Confirmada'}
                      {l.motivo_excepcion && <p className="text-amber-800">Motivo: {l.motivo_excepcion}</p>}
                    </td>
                    <td className="py-2">{l.estado === 'CONFIRMADA' && <AccionConMotivo tipo="lectura" id={l.id} descripcion={`Se anulará la lectura de ${km(l.valor_km)}`} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {/* Historial */}
      <Seccion titulo="Historial del vehículo">
        {eventos.length === 0 ? (
          <p className="text-sm text-humania-gray">Sin eventos registrados.</p>
        ) : (
          <ol className="relative border-l border-neutral-200 ml-2 space-y-4">
            {eventos.map((e, i) => (
              <li key={i} className="ml-4">
                <span className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full ${e.tono === 'contrato' ? 'bg-humania-sand' : e.tono === 'anulado' ? 'bg-neutral-300' : 'bg-humania-blue'}`} />
                <p className="text-xs text-humania-gray">{formatearFechaAdmin(e.fecha)}</p>
                <p className={`text-sm font-semibold ${e.tono === 'anulado' ? 'text-neutral-400 line-through' : 'text-humania-blue'}`}>{e.titulo}</p>
                {e.detalle && <p className="text-xs text-humania-gray">{e.detalle}</p>}
              </li>
            ))}
          </ol>
        )}
      </Seccion>

      <p className="text-xs text-humania-gray flex gap-2">
        <Info className="w-4 h-4 shrink-0" />
        Fuentes: lecturas del odómetro confirmadas por un SUPER_ADMIN y viajes transcritos a mano de capturas de la app del GPS (decisión de Dayro del 16-11-2026, mientras Road Track responde). No se guardan rutas, direcciones ni coordenadas. Cada consulta a esta pantalla queda registrada.
      </p>
    </div>
  )
}
