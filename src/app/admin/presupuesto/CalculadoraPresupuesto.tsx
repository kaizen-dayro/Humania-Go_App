'use client'

// Calculadora de Presupuesto (KAI-29) — interfaz interactiva. El motor
// (web/src/lib/domain/presupuesto/) es una función pura sin
// dependencias de Next.js/Supabase — se ejecuta directamente en el
// cliente (useMemo) para recálculo instantáneo, sin ida y vuelta al
// servidor por cada cambio de parámetro. Guardar sí pasa por el
// servidor (`guardarPresupuesto`), que RECALCULA los resultados ahí —
// nunca persiste lo que el cliente calculó (plan.md Sección 6).
//
// Layout (revisión de UX, 2026-09-01, pedida explícitamente por
// Humania Go tras la primera versión): Resumen ejecutivo → Estado de
// la operación (diagnóstico, nunca oculta un problema) → Flujo (con
// gráfico) → Estructura de capital y costos → Análisis detallado
// (paybacks real/extrapolado, ROI reetiquetado para no sugerir
// recuperación de inversión) → Decisión → Configuración (parámetros,
// colapsable) → Guardar / Guardados.
//
// Modalidad de adquisición (Crédito / Recursos Propios) — pedido
// explícito de Humania Go, 2026-09-01, ambas existen en el negocio.
// Plazo de adquisición en semanas — editable, recalcula hacia atrás
// `valorVentaContractualActivo` con el componente de adquisición
// semanal fijo (D3, $210.000), pedido explícito de Humania Go.
//
// Alcance de esta versión (D6/D7/D8 siguen abiertas, no bloqueantes,
// spec.md Sección 11): gráfico artesanal en SVG, sin librería nueva
// (D7, Opción 1 ya recomendada); sin veredicto automático con umbrales
// (D8, se muestra "sin definir" explícito, nunca un umbral inventado);
// sin grilla de sensibilidad ni amortización acelerada (D15, cerrada
// conceptualmente, motor todavía sin implementar) todavía.

import { useMemo, useState, useEffect, useCallback } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calcularMetricas, type ResultadoMetricas } from '@/lib/domain/presupuesto/metricas'
import { hayDatosNoConfirmadosEnCalculo } from '@/lib/domain/presupuesto/datosNoConfirmados'
import type { CotizacionSeguro, EstadoLecturaCotizacion } from '@/lib/domain/seguros/adaptador'
import { calcularVeredicto } from '@/lib/domain/presupuesto/veredicto'
import {
  PARAMETROS_REFERENCIA,
  PORCENTAJE_ABONO_CAPITAL_MAXIMO,
  conSeguroLegacy,
  equityConductorSemanal,
  validarParametros,
  type ModalidadAdquisicion,
  type ParametrosPresupuesto,
  type SeguroLegacyParametros,
} from '@/lib/domain/presupuesto/parametros'
import { formatearFechaAdmin } from '@/lib/format'
import { guardarPresupuesto, listarPresupuestos } from './actions'

const cop = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`
const copCompacto = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}$${(abs / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M`
  return cop(v)
}
const pct = (v: number) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
const semanaTexto = (v: number | null) => (v === null ? 'No se alcanza' : `Semana ${v.toLocaleString('es-CO')}`)

// ===== Bloques de presentación =====

function Tarjeta({ titulo, children, className = '' }: { titulo?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-neutral-200 rounded-lg shadow-sm p-6 ${className}`}>
      {titulo && <h3 className="text-sm font-bold text-humania-blue uppercase tracking-wide mb-4">{titulo}</h3>}
      {children}
    </div>
  )
}

function Fila({ label, valor, destacado = false }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-neutral-100 last:border-0">
      <span className="text-sm text-humania-gray">{label}</span>
      <span className={`text-sm font-mono tabular-nums text-right ${destacado ? 'font-bold text-humania-blue text-base' : 'font-medium text-neutral-800'}`}>
        {valor}
      </span>
    </div>
  )
}

function Colapsable({
  titulo,
  subtitulo,
  abiertoInicial = false,
  children,
}: {
  titulo: string
  subtitulo?: string
  /** Abierto al montar; después el usuario lo abre o cierra libremente (el estado lo lleva el navegador). */
  abiertoInicial?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="bg-white border border-neutral-200 rounded-lg shadow-sm group" open={abiertoInicial}>
      <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none">
        <div>
          <h3 className="text-sm font-bold text-humania-blue uppercase tracking-wide">{titulo}</h3>
          {subtitulo && <p className="text-xs text-humania-gray/60 mt-0.5">{subtitulo}</p>}
        </div>
        <ChevronDown className="w-5 h-5 text-humania-gray/50 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-6 pb-6 pt-2 border-t border-neutral-100">{children}</div>
    </details>
  )
}

/** Versión liviana de `Colapsable`, sin tarjeta propia — para anidar tablas largas (ej. amortización) dentro de una sección ya colapsable. */
function SubColapsable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group border border-neutral-200 rounded-md">
      <summary className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer list-none select-none">
        <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide">{titulo}</h4>
        <ChevronDown className="w-4 h-4 text-humania-gray/50 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 pt-1 border-t border-neutral-100">{children}</div>
    </details>
  )
}

// ===== Resumen ejecutivo =====

function MetricaResumen({ label, valor, tono = 'neutral' }: { label: string; valor: string; tono?: 'neutral' | 'positivo' | 'negativo' | 'advertencia' }) {
  const colorValor = {
    neutral: 'text-humania-blue',
    positivo: 'text-emerald-700',
    negativo: 'text-red-700',
    advertencia: 'text-amber-700',
  }[tono]
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-humania-gray/60 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl md:text-3xl font-extrabold tabular-nums ${colorValor}`}>{valor}</p>
    </div>
  )
}

function ResumenEjecutivo({ resultado }: { resultado: ResultadoMetricas }) {
  // D3 refinada (2026-09-01, spec.md Sección 23): el payback destacado
  // aquí usa el flujo contractual COMPLETO (450.000/semana, "el valor
  // real que recibe Humania") — pedido explícito de Humania Go, no solo
  // el componente operativo de 240.000. Las demás vistas de payback
  // (operativo puro, financiero neto de costos) siguen visibles en la
  // tabla de "Análisis detallado", nunca ocultas.
  const paybackPrincipal = resultado.paybackFlujoContractualCompleto
  return (
    <Tarjeta className="border-2 border-humania-blue/10">
      <h3 className="text-xs font-bold text-humania-gray/50 uppercase tracking-widest mb-5">Resumen de la operación</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6">
        <MetricaResumen label="Inversión inicial" valor={copCompacto(resultado.inversionInicialTotal)} />
        <MetricaResumen label="Ingreso operativo Humania" valor={copCompacto(resultado.flujo.ingresoOperativoHumania)} />
        <MetricaResumen
          label="Margen de venta del activo"
          valor={copCompacto(resultado.margenVentaActivo)}
          tono={resultado.margenVentaActivo >= 0 ? 'positivo' : 'negativo'}
        />
        <MetricaResumen
          label="Resultado neto (rentabilidad)"
          valor={copCompacto(resultado.resultadoNeto)}
          tono={resultado.resultadoNeto >= 0 ? 'positivo' : 'negativo'}
        />
        <MetricaResumen label="ROI acumulado al cierre" valor={pct(resultado.roiSobreInversionTotal)} />
        <MetricaResumen
          label="ROI sobre recursos propios"
          valor={resultado.roiSobreRecursosPropios === null ? 'No definido' : pct(resultado.roiSobreRecursosPropios)}
        />
        <MetricaResumen
          label="Payback (flujo contractual completo)"
          valor={semanaTexto(paybackPrincipal)}
          tono={paybackPrincipal === null ? 'advertencia' : 'positivo'}
        />
      </div>
    </Tarjeta>
  )
}

// ===== Estado de la operación — diagnóstico, nunca oculta un problema =====

function EstadoOperacion({ resultado, parametros }: { resultado: ResultadoMetricas; parametros: ParametrosPresupuesto }) {
  const semanasPorMes = parametros.semanasPorAno / parametros.mesesPorAno
  const mesAlFinDelContrato = resultado.flujo.duracionContratoSemanas / semanasPorMes
  const creditoSobrevive = parametros.modalidadAdquisicion === 'CREDITO' && mesAlFinDelContrato < parametros.mesesCreditoVehiculo

  // D3 refinada (2026-09-01, spec.md Sección 23): el estado general
  // (verde/ámbar) se decide con el payback de flujo contractual
  // completo — "el valor real que recibe Humania", pedido explícito
  // del usuario. Las demás vistas (operativo puro, financiero neto de
  // costos) se muestran siempre como detalle — nunca se ocultan,
  // aunque ya no determinen el semáforo principal.
  const recuperaInversion = resultado.paybackFlujoContractualCompleto !== null

  const detalles: string[] = []
  if (resultado.paybackOperativo === null) {
    detalles.push('Sin contar el componente de adquisición del conductor, el ingreso operativo de Humania por sí solo no alcanza a cubrir la inversión inicial dentro del contrato.')
  }
  if (resultado.paybackFinancieroRentabilidad === null) {
    detalles.push('Después de restar intereses y costos recurrentes (vista de rentabilidad), la inversión no se recupera dentro del plazo contractual.')
  }
  if (resultado.paybackFinancieroCaja === null) {
    detalles.push('Después de restar la cuota bancaria completa y costos recurrentes (vista de flujo de caja), la inversión no se recupera dentro del plazo contractual.')
  }
  if (creditoSobrevive) {
    detalles.push(
      `El crédito bancario (plazo ${parametros.mesesCreditoVehiculo} meses) continúa pagándose después de finalizar el contrato con el conductor (contrato ≈ ${mesAlFinDelContrato.toFixed(1)} meses).`,
    )
  }
  if (resultado.resultadoNeto < 0) {
    detalles.push('El resultado neto (vista rentabilidad, sin contar el componente de adquisición) es negativo al cierre del contrato.')
  }

  return (
    <div className={`rounded-lg border p-6 ${recuperaInversion ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-start gap-3">
        {recuperaInversion ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0" />
        )}
        <div className="flex-1">
          <h3 className={`text-sm font-bold uppercase tracking-wide ${recuperaInversion ? 'text-emerald-800' : 'text-amber-800'}`}>
            Estado de la operación
          </h3>
          <p className={`text-sm font-semibold mt-1 ${recuperaInversion ? 'text-emerald-800' : 'text-amber-900'}`}>
            {recuperaInversion
              ? `La operación recupera la inversión dentro del plazo contractual — semana ${resultado.paybackFlujoContractualCompleto} (flujo contractual completo, incluye el valor de venta del activo).`
              : 'La operación no recupera la inversión dentro del plazo contractual, ni siquiera contando el flujo contractual completo (450.000/semana + valor de venta del activo).'}
          </p>
          {detalles.length > 0 && (
            <ul className="text-sm mt-2 space-y-1 list-disc list-inside text-amber-800">
              {detalles.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Gráfico de flujo — SVG artesanal, sin librería nueva (D7) =====

function FlujoChart({ resultado }: { resultado: ResultadoMetricas }) {
  const { serieIngresoOperativoAcumulado, serieIngresoOperativoExtrapolada, duracionContratoSemanas } = resultado.flujo
  const inversion = resultado.inversionInicialTotal
  const paybackRef = resultado.paybackOperativoExtrapolado ?? duracionContratoSemanas

  const xMax = Math.max(duracionContratoSemanas, paybackRef, 40) * 1.15
  const yMax = Math.max(inversion, serieIngresoOperativoExtrapolada[Math.min(Math.ceil(xMax), serieIngresoOperativoExtrapolada.length) - 1] || 0) * 1.08

  const W = 640, H = 260
  const ML = 76, MR = 16, MT = 16, MB = 34
  const PW = W - ML - MR, PH = H - MT - MB

  const x = (semana: number) => ML + (semana / xMax) * PW
  const y = (valor: number) => MT + PH - (valor / yMax) * PH

  const semanaFin = Math.min(Math.round(xMax), duracionContratoSemanas)
  const puntosReales = serieIngresoOperativoAcumulado.slice(0, semanaFin).map((v, i) => `${x(i + 1)},${y(v)}`)
  const rutaReal = puntosReales.length > 0 ? `M ${puntosReales.join(' L ')}` : ''

  const semanaHastaExtrap = Math.min(Math.round(xMax), serieIngresoOperativoExtrapolada.length)
  const puntosExtrap = serieIngresoOperativoExtrapolada
    .slice(Math.max(duracionContratoSemanas - 1, 0), semanaHastaExtrap)
    .map((v, i) => `${x(duracionContratoSemanas + i)},${y(v)}`)
  const rutaExtrap = puntosExtrap.length > 0 ? `M ${puntosExtrap.join(' L ')}` : ''

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Flujo operativo acumulado de Humania frente a la inversión inicial">
        {gridY.map((v) => (
          <g key={v}>
            <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="#e5e5e5" strokeWidth={1} />
            <text x={ML - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#78716c" fontFamily="monospace">
              {copCompacto(v)}
            </text>
          </g>
        ))}

        {/* Línea de inversión inicial */}
        <line x1={ML} x2={W - MR} y1={y(inversion)} y2={y(inversion)} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={W - MR} y={y(inversion) - 6} textAnchor="end" fontSize={11} fill="#b91c1c" fontWeight={600}>
          Inversión inicial {copCompacto(inversion)}
        </text>

        {/* Marca de fin de contrato */}
        <line x1={x(duracionContratoSemanas)} x2={x(duracionContratoSemanas)} y1={MT} y2={MT + PH} stroke="#a3a3a3" strokeWidth={1} strokeDasharray="2 3" />
        <text x={x(duracionContratoSemanas)} y={MT - 4} textAnchor="middle" fontSize={10} fill="#737373">
          Fin del contrato
        </text>

        {/* Línea real (sólida) y extrapolada (punteada) */}
        <path d={rutaReal} fill="none" stroke="#002B4A" strokeWidth={2.5} strokeLinecap="round" />
        <path d={rutaExtrap} fill="none" stroke="#002B4A" strokeWidth={2} strokeLinecap="round" strokeDasharray="1 5" opacity={0.55} />

        {/* Eje X */}
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} stroke="#d4d4d4" strokeWidth={1} />
        <text x={ML} y={H - 8} fontSize={10} fill="#78716c">0</text>
        <text x={x(duracionContratoSemanas)} y={H - 8} textAnchor="middle" fontSize={10} fill="#78716c">
          {duracionContratoSemanas} sem.
        </text>
        <text x={W - MR} y={H - 8} textAnchor="end" fontSize={10} fill="#78716c">
          {Math.round(xMax)} sem.
        </text>
      </svg>
      <p className="text-xs text-humania-gray/60 mt-2">
        Ingreso operativo acumulado de Humania (línea sólida = real, dentro del contrato; línea punteada = extrapolación hipotética, benchmark — el
        contrato no genera ingreso después de finalizar). Las vistas de rentabilidad/caja (con costos financieros y recurrentes descontados) se
        muestran en la tabla de paybacks más abajo.
      </p>
    </div>
  )
}

// ===== Inputs =====

function CampoNumero({
  label,
  descripcion,
  valor,
  onChange,
  suffix,
}: {
  label: string
  descripcion?: string
  valor: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-humania-gray font-medium text-sm">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          // `e.target.value` (string) + Number(), no `valueAsNumber` —
          // mismo patrón ya probado en el resto del panel
          // (DemoModeCard.tsx/EvaluacionForm.tsx). El componente `Input`
          // de este proyecto envuelve `Field.Control` de base-ui, que
          // gestiona su propio estado interno de "value" — pasar y leer
          // como string evita cualquier desajuste entre ese estado
          // interno y `valueAsNumber` del input nativo (bug real
          // encontrado en pruebas: los cambios no se reflejaban).
          value={String(valor)}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="rounded-none border-neutral-300 h-11"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-humania-gray/60">{suffix}</span>}
      </div>
      {descripcion && <p className="text-xs text-humania-gray/60">{descripcion}</p>}
    </div>
  )
}

interface PresupuestoGuardado {
  id: string
  financial_model_version: string
  etiqueta: string | null
  semanas_aplazatorias_usadas: number
  resultados: ResultadoMetricas
  created_at: string
}

/** Claves de `ParametrosPresupuesto` cuyo valor es un número (las editables con un campo numérico). */
type ClaveNumericaParametros = { [K in keyof ParametrosPresupuesto]: ParametrosPresupuesto[K] extends number ? K : never }[keyof ParametrosPresupuesto]

interface CalculadoraPresupuestoProps {
  /** Datos de la financiación vigente del seguro leídos en el servidor. Informativos: no entran a ningún indicador. */
  cotizacionSeguro?: CotizacionSeguro | null
  estadoCotizacionSeguro?: EstadoLecturaCotizacion
}

export function CalculadoraPresupuesto({ cotizacionSeguro = null, estadoCotizacionSeguro = 'SIN_COTIZACION' }: CalculadoraPresupuestoProps) {
  const [parametros, setParametros] = useState<ParametrosPresupuesto>(() => ({
    ...PARAMETROS_REFERENCIA,
    seguro: { ...PARAMETROS_REFERENCIA.seguro, cotizacion: cotizacionSeguro },
  }))
  const [semanasAplazatoriasUsadas, setSemanasAplazatoriasUsadas] = useState(0)
  const [etiqueta, setEtiqueta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [guardados, setGuardados] = useState<PresupuestoGuardado[] | null>(null)
  const [cargandoGuardados, setCargandoGuardados] = useState(false)
  const [cargandoInicial, setCargandoInicial] = useState(true)

  const errores = useMemo(() => validarParametros(parametros), [parametros])
  const resultado = useMemo(
    () => (errores.length === 0 ? calcularMetricas(parametros, semanasAplazatoriasUsadas) : null),
    [parametros, semanasAplazatoriasUsadas, errores],
  )
  const veredicto = useMemo(() => (resultado ? calcularVeredicto(resultado) : null), [resultado])

  const setParam = <K extends ClaveNumericaParametros>(campo: K) => (valor: number) =>
    setParametros((prev) => ({ ...prev, [campo]: valor }))

  // Datos del modelo LEGACY del seguro (anidados en `seguro.legacy`, separados del crédito del vehículo).
  const setSeguroLegacy = (campo: keyof SeguroLegacyParametros) => (valor: number) =>
    setParametros((prev) => conSeguroLegacy(prev, { [campo]: valor }))

  const setModalidad = (modalidad: ModalidadAdquisicion) => setParametros((prev) => ({ ...prev, modalidadAdquisicion: modalidad }))

  // Plazo de adquisición editable (pedido explícito de Humania Go,
  // 2026-09-01) — recalcula hacia atrás `valorVentaContractualActivo`
  // con el componente de adquisición semanal fijo (D3, $210.000):
  // plazoSemanas × componenteAdquisicionSemanal = valorVentaContractualActivo.
  // El campo "Valor de venta contractual" sigue editable por separado —
  // ambos representan la misma relación, cualquiera de los dos puede
  // ser el que se ajuste último.
  const plazoAdquisicionSemanas = Math.round(parametros.valorVentaContractualActivo / equityConductorSemanal(parametros))
  const setPlazoAdquisicionSemanas = (semanas: number) =>
    setParametros((prev) => ({ ...prev, valorVentaContractualActivo: Math.max(0, Math.round(semanas)) * equityConductorSemanal(prev) }))

  const cargarGuardados = useCallback(async () => {
    setCargandoGuardados(true)
    const res = await listarPresupuestos()
    if (res.success) setGuardados(res.presupuestos as unknown as PresupuestoGuardado[])
    setCargandoGuardados(false)
  }, [])

  useEffect(() => {
    let cancelado = false
    listarPresupuestos().then((res) => {
      if (cancelado) return
      if (res.success) setGuardados(res.presupuestos as unknown as PresupuestoGuardado[])
      setCargandoInicial(false)
    })
    return () => {
      cancelado = true
    }
  }, [])

  async function handleGuardar() {
    setGuardando(true)
    setMensaje(null)
    const res = await guardarPresupuesto(parametros, semanasAplazatoriasUsadas, etiqueta)
    setGuardando(false)
    if (!res.success) {
      setMensaje({ tipo: 'error', texto: res.error || 'No se pudo guardar el presupuesto.' })
      return
    }
    setMensaje({ tipo: 'exito', texto: 'Presupuesto guardado correctamente.' })
    setEtiqueta('')
    cargarGuardados()
  }

  return (
    <div className="space-y-10" data-cotizacion-seguro={estadoCotizacionSeguro} data-cotizacion-seguro-datos={cotizacionSeguro ? Object.keys(cotizacionSeguro.estadoDatos).length : 0}>
      {errores.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-start gap-3 rounded-md">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Parámetros inválidos — corrige antes de continuar:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {resultado && (
        <>
          {/* Advertencia persistente (M6, spec.md 27.4): texto literal aprobado por Humania Go.
              Se muestra mientras el modelo use datos sin soporte documental. */}
          {hayDatosNoConfirmadosEnCalculo(resultado.datosNoConfirmados) && (
            <div role="status" className="p-4 bg-amber-50 border border-amber-300 text-amber-900 text-sm font-bold flex items-center gap-3 rounded-md">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="tracking-wide">MODELO CON DATOS NO CONFIRMADOS</p>
            </div>
          )}
          <ResumenEjecutivo resultado={resultado} />
          <EstadoOperacion resultado={resultado} parametros={parametros} />

          <Tarjeta titulo="Flujo operativo acumulado vs. inversión inicial">
            <FlujoChart resultado={resultado} />
          </Tarjeta>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Tarjeta titulo="Estructura de capital">
              <Fila label="Modalidad de adquisición" valor={parametros.modalidadAdquisicion === 'CREDITO' ? 'Crédito bancario' : 'Recursos propios (de contado)'} />
              <Fila label="Costo / inversión inicial" valor={cop(resultado.inversionInicialTotal)} destacado />
              <Fila label="Recursos propios de Humania" valor={cop(resultado.recursosPropios)} />
              <Fila label="Financiación bancaria" valor={cop(resultado.financiacionBancaria)} />
              <Fila label="Financiación del seguro" valor={cop(resultado.principalFinanciacionSeguro)} />
              <Fila label="% financiado" valor={pct((resultado.financiacionBancaria + resultado.principalFinanciacionSeguro) / resultado.inversionInicialTotal)} />
              <Fila label="% capital propio" valor={pct(resultado.recursosPropios / resultado.inversionInicialTotal)} />
            </Tarjeta>
            <Tarjeta titulo="Flujo del contrato (nunca mezclados)">
              <Fila label="Flujo contractual bruto" valor={cop(resultado.flujo.flujoContractualTotal)} />
              <Fila label="Flujo de adquisición/patrimonial (no es ingreso de Humania)" valor={cop(resultado.flujo.equityAdministradoAcumulado)} />
              <Fila label="Ingreso operativo Humania" valor={cop(resultado.flujo.ingresoOperativoHumania)} destacado />
              <Fila label="Ingreso adicional por aplazatorias" valor={cop(resultado.flujo.ingresoAplazatoriasAcumulado)} />
              <Fila label="Duración real del contrato" valor={`${resultado.flujo.duracionContratoSemanas} semanas`} />
              <Fila label="Cuota final de adquisición (pago único, D14)" valor={cop(resultado.flujo.adquisicion.cuotaFinalAdquisicion)} />
              <Fila
                label="Margen de venta del activo (valor de venta − precio de compra)"
                valor={cop(resultado.margenVentaActivo)}
                destacado
              />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Costos al final del contrato">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <div>
                <Fila label="Costos financieros — vista rentabilidad (solo interés)" valor={cop(resultado.costosFinancierosRentabilidad)} />
                <Fila label="Costos financieros — vista de caja (capital + interés)" valor={cop(resultado.costosFinancierosCaja)} />
              </div>
              <div>
                <Fila label="SOAT (renovaciones adicionales)" valor={cop(resultado.costosRecurrentes.soat.totalAdicional)} />
                <Fila label="Tecnomecánica (renovaciones adicionales)" valor={cop(resultado.costosRecurrentes.tecnomecanica.totalAdicional)} />
                <Fila label="Impuestos (renovaciones adicionales)" valor={cop(resultado.costosRecurrentes.impuestos.totalAdicional)} />
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Análisis detallado — payback (real dentro del contrato vs. extrapolado)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-humania-gray/60 uppercase tracking-wide border-b border-neutral-200">
                    <th className="py-2 font-medium">Métrica</th>
                    <th className="py-2 font-medium">Real (dentro del contrato)</th>
                    <th className="py-2 font-medium">Extrapolado (benchmark, no es una fecha real)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-neutral-100 bg-humania-sand/10">
                    <td className="py-2.5 font-semibold text-humania-blue">Payback — flujo contractual completo (450.000/semana)</td>
                    <td className="py-2.5 font-mono tabular-nums font-semibold">{semanaTexto(resultado.paybackFlujoContractualCompleto)}</td>
                    <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackFlujoContractualCompletoExtrapolado)}</td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2.5 text-humania-gray">Payback operativo (solo 240.000/semana, sin el componente de adquisición)</td>
                    <td className="py-2.5 font-mono tabular-nums">{semanaTexto(resultado.paybackOperativo)}</td>
                    <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackOperativoExtrapolado)}</td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2.5 text-humania-gray">Payback financiero — vista rentabilidad (240.000, menos intereses/costos)</td>
                    <td className="py-2.5 font-mono tabular-nums">{semanaTexto(resultado.paybackFinancieroRentabilidad)}</td>
                    <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackFinancieroRentabilidadExtrapolado)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 text-humania-gray">Payback financiero — vista de caja (240.000, menos cuota bancaria completa)</td>
                    <td className="py-2.5 font-mono tabular-nums">{semanaTexto(resultado.paybackFinancieroCaja)}</td>
                    <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackFinancieroCajaExtrapolado)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-neutral-100">
              <div>
                <p className="text-xs font-semibold text-humania-gray/60 uppercase tracking-wide mb-1">ROI acumulado al cierre contractual</p>
                <p className="text-2xl font-bold text-humania-blue tabular-nums">{pct(resultado.roiSobreInversionTotal)}</p>
                <p className="text-xs text-humania-gray/60 mt-1">No equivale a recuperación de inversión ni representa necesariamente ROI anualizado.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-humania-gray/60 uppercase tracking-wide mb-1">ROI acumulado sobre recursos propios</p>
                <p className="text-2xl font-bold text-humania-blue tabular-nums">
                  {resultado.roiSobreRecursosPropios === null ? 'No definido (100% financiado)' : pct(resultado.roiSobreRecursosPropios)}
                </p>
                <p className="text-xs text-humania-gray/60 mt-1">Refleja apalancamiento — no es un retorno anual.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-neutral-100">
              <Fila label="Resultado neto — vista rentabilidad (solo interés)" valor={cop(resultado.resultadoNeto)} destacado />
              <Fila label="Flujo de caja neto — vista de caja (capital + interés)" valor={cop(resultado.flujoDeCajaNeto)} destacado />
            </div>
          </Tarjeta>

          <Tarjeta titulo="Decisión de la operación">
            <p className="text-xs text-humania-gray/60 mb-3">
              Esta sección evalúa exclusivamente la operación financiera del activo — no tiene relación con la evaluación de candidatos.
            </p>
            <p className="text-sm text-humania-gray">
              Veredicto automático:{' '}
              <span className="font-semibold text-neutral-700">{veredicto?.veredicto === 'SIN_DEFINIR' ? 'Sin definir' : veredicto?.veredicto}</span>
            </p>
            <p className="text-xs text-humania-gray/60 mt-1">{veredicto?.razon}</p>
          </Tarjeta>

          {parametros.modalidadAdquisicion === 'CREDITO' && resultado.amortizacionNormal && (
            <Colapsable
              titulo="Amortización del crédito"
              subtitulo="Tabla completa mes a mes — normal y con abono a capital (D15). Con abono activo, los paybacks financieros de arriba ya usan este cronograma."
            >
              <div className="space-y-8 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <CampoNumero
                    label="Porcentaje de abono a capital"
                    descripcion={`Máximo ${PORCENTAJE_ABONO_CAPITAL_MAXIMO * 100}% de la cuota mensual original, 100% a capital, reducción de plazo. 0% = sin abono.`}
                    suffix="%"
                    valor={Math.round(parametros.porcentajeAbonoCapital * 1000) / 10}
                    onChange={(v) => setParam('porcentajeAbonoCapital')(Math.min(PORCENTAJE_ABONO_CAPITAL_MAXIMO, Math.max(0, v) / 100))}
                  />
                  <CampoNumero
                    label="Mes desde el cual aplica el abono"
                    suffix="mes"
                    valor={parametros.mesInicioAbonoCapital}
                    onChange={(v) => setParam('mesInicioAbonoCapital')(Math.max(1, Math.round(v)))}
                  />
                </div>

                {resultado.amortizacionConAbono && (
                  <div>
                    <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide mb-3">Comparador — normal vs. acelerado</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-humania-gray/60 uppercase tracking-wide border-b border-neutral-200">
                            <th className="py-2 font-medium">Métrica</th>
                            <th className="py-2 font-medium">Normal</th>
                            <th className="py-2 font-medium">Con abono</th>
                            <th className="py-2 font-medium">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-neutral-100">
                            <td className="py-2.5 text-humania-gray">Plazo</td>
                            <td className="py-2.5 font-mono tabular-nums">{parametros.mesesCreditoVehiculo} meses</td>
                            <td className="py-2.5 font-mono tabular-nums font-semibold">{resultado.amortizacionConAbono.mesesReales} meses</td>
                            <td className="py-2.5 font-mono tabular-nums text-emerald-700">−{resultado.amortizacionConAbono.mesesAhorrados} meses</td>
                          </tr>
                          <tr className="border-b border-neutral-100">
                            <td className="py-2.5 text-humania-gray">Intereses totales</td>
                            <td className="py-2.5 font-mono tabular-nums">{cop(resultado.amortizacionNormal.interesTotalMeses)}</td>
                            <td className="py-2.5 font-mono tabular-nums font-semibold">{cop(resultado.amortizacionConAbono.interesTotalConAbono)}</td>
                            <td className="py-2.5 font-mono tabular-nums text-emerald-700">−{cop(resultado.amortizacionConAbono.ahorroIntereses)}</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-humania-gray">Total pagado (capital + interés)</td>
                            <td className="py-2.5 font-mono tabular-nums">{cop(parametros.principalCreditoBancario + resultado.amortizacionNormal.interesTotalMeses)}</td>
                            <td className="py-2.5 font-mono tabular-nums font-semibold">{cop(resultado.amortizacionConAbono.totalPagado)}</td>
                            <td className="py-2.5 font-mono tabular-nums text-emerald-700">
                              −{cop(parametros.principalCreditoBancario + resultado.amortizacionNormal.interesTotalMeses - resultado.amortizacionConAbono.totalPagado)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <SubColapsable titulo="Amortización normal (sin abono)">
                  <div className="overflow-auto max-h-96 border border-neutral-200 rounded-md">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-neutral-50">
                        <tr className="text-left text-xs text-humania-gray/60 uppercase tracking-wide border-b border-neutral-200">
                          <th className="py-2 px-2 font-medium">Mes</th>
                          <th className="py-2 px-2 font-medium">Saldo inicial</th>
                          <th className="py-2 px-2 font-medium">Cuota</th>
                          <th className="py-2 px-2 font-medium">Interés</th>
                          <th className="py-2 px-2 font-medium">Capital</th>
                          <th className="py-2 px-2 font-medium">Saldo final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.amortizacionNormal.cronograma.map((c) => (
                          <tr key={c.mes} className="border-b border-neutral-100 last:border-0">
                            <td className="py-1.5 px-2 font-mono tabular-nums">{c.mes}</td>
                            <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.saldo + c.abonoCapital)}</td>
                            <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.cuota)}</td>
                            <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.interes)}</td>
                            <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.abonoCapital)}</td>
                            <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SubColapsable>

                {resultado.amortizacionConAbono && (
                  <SubColapsable titulo="Amortización con abono a capital">
                    <div className="overflow-auto max-h-96 border border-neutral-200 rounded-md">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-neutral-50">
                          <tr className="text-left text-xs text-humania-gray/60 uppercase tracking-wide border-b border-neutral-200">
                            <th className="py-2 px-2 font-medium">Mes</th>
                            <th className="py-2 px-2 font-medium">Saldo inicial</th>
                            <th className="py-2 px-2 font-medium">Pago total</th>
                            <th className="py-2 px-2 font-medium">Interés</th>
                            <th className="py-2 px-2 font-medium">Capital (ordinario+abono)</th>
                            <th className="py-2 px-2 font-medium">Abono extra</th>
                            <th className="py-2 px-2 font-medium">Saldo final</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultado.amortizacionConAbono.cronograma.map((c) => (
                            <tr key={c.mes} className={`border-b border-neutral-100 last:border-0 ${c.abonoExtra > 0 ? 'bg-humania-sand/10' : ''}`}>
                              <td className="py-1.5 px-2 font-mono tabular-nums">{c.mes}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.saldoInicial)}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.pagoTotal)}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.interes)}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.capitalTotal)}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums">{c.abonoExtra > 0 ? cop(c.abonoExtra) : '—'}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums">{cop(c.saldoFinal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                      <Fila label="Meses reales para pagar" valor={`${resultado.amortizacionConAbono.mesesReales} meses`} />
                      <Fila label="Meses ahorrados" valor={`${resultado.amortizacionConAbono.mesesAhorrados} meses`} />
                      <Fila label="Ahorro en intereses" valor={cop(resultado.amortizacionConAbono.ahorroIntereses)} />
                      <Fila label="Total abonos extra realizados" valor={cop(resultado.amortizacionConAbono.totalAbonosExtra)} />
                      <Fila label="Interés total con abono" valor={cop(resultado.amortizacionConAbono.interesTotalConAbono)} />
                      <Fila label="Total pagado (capital+interés)" valor={cop(resultado.amortizacionConAbono.totalPagado)} />
                    </div>
                  </SubColapsable>
                )}
              </div>
            </Colapsable>
          )}

          <Colapsable titulo="Configuración de parámetros" subtitulo="Editar los inputs recalcula todos los resultados de arriba al instante.">
            <div className="space-y-6 pt-4">
              <div>
                <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide mb-3">Modalidad de adquisición del activo</h4>
                <div className="flex gap-2">
                  {(['CREDITO', 'RECURSOS_PROPIOS'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModalidad(m)}
                      className={`px-4 py-2 text-sm font-medium rounded-none border ${
                        parametros.modalidadAdquisicion === m
                          ? 'bg-humania-blue text-white border-humania-blue'
                          : 'bg-white text-humania-gray border-neutral-300 hover:border-humania-blue/40'
                      }`}
                    >
                      {m === 'CREDITO' ? 'Crédito bancario' : 'Recursos propios (de contado)'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-humania-gray/60 mt-2">
                  {parametros.modalidadAdquisicion === 'CREDITO'
                    ? 'El activo se financia con crédito bancario + financiación del seguro.'
                    : 'El activo se paga de contado — vehículo, traspaso y seguro incluido, sin financiación ni intereses.'}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide mb-3">Capa A — economía del activo</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <CampoNumero label="Precio real de compra" valor={parametros.precioCompra} onChange={setParam('precioCompra')} />
                  <CampoNumero label="Traspaso" valor={parametros.traspaso} onChange={setParam('traspaso')} />
                  {parametros.modalidadAdquisicion === 'CREDITO' ? (
                    <CampoNumero label="Recursos propios (capital) aportados por Humania" valor={parametros.capitalPropioDeclarado} onChange={setParam('capitalPropioDeclarado')} />
                  ) : (
                    <CampoNumero
                      label="Otros costos iniciales (ej. GPS)"
                      descripcion="No se rastrea un costo de GPS separado desde D1 — usa este campo si aplica en esta operación."
                      valor={parametros.otrosCostosInicialesRecursosPropios}
                      onChange={setParam('otrosCostosInicialesRecursosPropios')}
                    />
                  )}
                </div>
              </div>

              {parametros.modalidadAdquisicion === 'CREDITO' && (
                <div>
                  <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide mb-3">Capa B — financiación bancaria</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <CampoNumero label="Principal financiado (crédito vehículo+GPS)" valor={parametros.principalCreditoBancario} onChange={setParam('principalCreditoBancario')} />
                    <CampoNumero label="Principal financiación del seguro" valor={parametros.seguro.legacy.principalFinanciacion} onChange={setSeguroLegacy('principalFinanciacion')} />
                    <CampoNumero
                      label="Costo financiero del seguro (estimado)"
                      descripcion="Supuesto lineal, no un cronograma bancario confirmado."
                      valor={parametros.seguro.legacy.costoFinancieroEstimado}
                      onChange={setSeguroLegacy('costoFinancieroEstimado')}
                    />
                    <CampoNumero
                      label="Plazo de la financiación del seguro"
                      suffix="meses"
                      descripcion="Dato legacy no confirmado; independiente del plazo del crédito."
                      valor={parametros.seguro.legacy.plazoMeses}
                      onChange={setSeguroLegacy('plazoMeses')}
                    />
                    <CampoNumero
                      label="Tasa efectiva anual del crédito"
                      suffix="% EA"
                      valor={Math.round(parametros.tasaEfectivaAnualCredito * 1000) / 10}
                      onChange={(v) => setParam('tasaEfectivaAnualCredito')(v / 100)}
                    />
                    <CampoNumero label="Plazo del crédito bancario" suffix="meses" valor={parametros.mesesCreditoVehiculo} onChange={setParam('mesesCreditoVehiculo')} />
                  </div>
                  <p className="text-xs text-humania-gray/60 mt-4">
                    El plazo del crédito es una dimensión independiente de la duración del contrato con el conductor (D12) — no se asumen iguales.
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide mb-3">Capa C — contrato Humania ↔ conductor</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <CampoNumero
                    label="Valor de venta contractual del activo"
                    descripcion="Independiente del precio real de compra (D10)."
                    valor={parametros.valorVentaContractualActivo}
                    onChange={setParam('valorVentaContractualActivo')}
                  />
                  <CampoNumero
                    label="Plazo de adquisición (semanas)"
                    descripcion="Editable — recalcula el valor de venta contractual con el componente de $210.000/semana fijo (D3)."
                    suffix="semanas"
                    valor={plazoAdquisicionSemanas}
                    onChange={setPlazoAdquisicionSemanas}
                  />
                  <CampoNumero label="Cuota semanal total del conductor" valor={parametros.cuotaSemanalConductor} onChange={setParam('cuotaSemanalConductor')} />
                  <CampoNumero label="Componente de ahorro semanal" valor={parametros.ahorroSemanalConductor} onChange={setParam('ahorroSemanalConductor')} />
                  <CampoNumero label="Componente de bono patrimonial semanal" valor={parametros.bonoPatrimonialSemanal} onChange={setParam('bonoPatrimonialSemanal')} />
                  <CampoNumero label="Cuota de semana aplazatoria" valor={parametros.cuotaSemanaAplazatoria} onChange={setParam('cuotaSemanaAplazatoria')} />
                  <CampoNumero
                    label="Semanas aplazatorias a simular"
                    descripcion="100% ingreso operativo de Humania, nunca equity (D11)."
                    valor={semanasAplazatoriasUsadas}
                    onChange={(v) => setSemanasAplazatoriasUsadas(Math.max(0, Math.round(v)))}
                  />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide mb-3">Costos recurrentes anuales</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <CampoNumero label="SOAT anual" valor={parametros.soatAnual} onChange={setParam('soatAnual')} />
                  <CampoNumero label="Tecnomecánica anual" valor={parametros.tecnomecanicaAnual} onChange={setParam('tecnomecanicaAnual')} />
                  <CampoNumero label="Impuestos anuales" valor={parametros.impuestosAnuales} onChange={setParam('impuestosAnuales')} />
                </div>
                <p className="text-xs text-humania-gray/60 mt-4">
                  El año 1 ya está incluido en la inversión inicial (D9) — estos valores proyectan las renovaciones dentro de la duración real del contrato.
                </p>
              </div>
            </div>
          </Colapsable>

          <Tarjeta titulo="Guardar este presupuesto">
            {mensaje && (
              <div
                className={`mb-4 p-3 rounded-md text-sm font-medium flex items-center gap-2 ${
                  mensaje.tipo === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'
                }`}
              >
                {mensaje.tipo === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                {mensaje.texto}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Etiqueta (opcional) — ej. Escenario base septiembre 2026"
                value={etiqueta}
                onChange={(e) => setEtiqueta(e.target.value)}
                className="rounded-none border-neutral-300 h-11 flex-1"
              />
              <Button
                onClick={handleGuardar}
                disabled={guardando || errores.length > 0}
                className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-8 shadow-sm h-11"
              >
                {guardando ? 'Guardando...' : 'Guardar presupuesto'}
              </Button>
            </div>
          </Tarjeta>

          <Colapsable
            titulo="Presupuestos guardados"
            subtitulo={guardados && guardados.length > 0 ? `${guardados.length} guardado${guardados.length === 1 ? '' : 's'}` : undefined}
            abiertoInicial
          >
            {(cargandoInicial || cargandoGuardados) && <p className="text-sm text-humania-gray">Cargando...</p>}
            {!(cargandoInicial || cargandoGuardados) && guardados && guardados.length === 0 && <p className="text-sm text-humania-gray">Todavía no hay presupuestos guardados.</p>}
            {!(cargandoInicial || cargandoGuardados) && guardados && guardados.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-humania-gray/60 uppercase tracking-wide border-b border-neutral-200">
                      <th className="py-2 font-medium">Fecha</th>
                      <th className="py-2 font-medium">Etiqueta</th>
                      <th className="py-2 font-medium">Resultado neto</th>
                      <th className="py-2 font-medium">ROI inversión total</th>
                      <th className="py-2 font-medium">Modelo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardados.map((g) => (
                      <tr key={g.id} className="border-b border-neutral-100 last:border-0">
                        <td className="py-2.5 text-humania-gray">{formatearFechaAdmin(g.created_at)}</td>
                        <td className="py-2.5">{g.etiqueta || '—'}</td>
                        <td className="py-2.5 font-mono tabular-nums">{cop(g.resultados.resultadoNeto)}</td>
                        <td className="py-2.5 font-mono tabular-nums">{pct(g.resultados.roiSobreInversionTotal)}</td>
                        <td className="py-2.5 text-xs text-humania-gray/60">{g.financial_model_version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Colapsable>
        </>
      )}
    </div>
  )
}
