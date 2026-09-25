'use client'

// Calculadora de Presupuesto (KAI-29) — interfaz interactiva. El motor
// (web/src/lib/domain/presupuesto/) es una función pura sin
// dependencias de Next.js/Supabase — se ejecuta directamente en el
// cliente (useMemo) para recálculo instantáneo, sin ida y vuelta al
// servidor por cada cambio de parámetro. Guardar sí pasa por el
// servidor (`guardarPresupuesto`), que RECALCULA los resultados, el
// veredicto D8 y el abono mínimo D6 — nunca persiste lo que el cliente
// calculó (plan.md Sección 6).
//
// Layout de cierre (spec.md 39.4, aprobado 2026-09-25), en tres zonas:
// 1. Ejecutiva: contexto y avisos, modalidad, resumen, decisión (D8 + D6),
//    estado de la operación y alertas.
// 2. Análisis: flujo contractual (D7-1), estructura de capital y flujo del
//    contrato, costos, paybacks, amortización (saldo D7-2, sensibilidad D7-3
//    y financiación del seguro de la cotización).
// 3. Configuración: parámetros (incluido el abono y la política D8), guardar
//    y presupuestos guardados.
//
// Textos: los aprobados literalmente viven en `textosInterfaz.ts`
// (TEXTOS_APROBADOS); los nuevos, pendientes de aprobación, en
// TEXTOS_NUEVOS_PENDIENTES del mismo archivo. Los gráficos son SVG propio,
// sin librerías (D7).

import { useMemo, useState, useEffect, useCallback } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calcularMetricas, type ResultadoMetricas } from '@/lib/domain/presupuesto/metricas'
import { hayDatosNoConfirmadosEnCalculo } from '@/lib/domain/presupuesto/datosNoConfirmados'
import { compararResultados, type ResultadoGuardado } from '@/lib/domain/presupuesto/compararHistorico'
import type { CotizacionSeguro, EstadoLecturaCotizacion } from '@/lib/domain/seguros/adaptador'
import { construirVistaCotizacionSeguro, type VistaCotizacionSeguro } from '@/lib/domain/seguros/vistaCotizacion'
import {
  POLITICA_FINANCIERA_V1,
  evaluarPolitica,
  validarPolitica,
  type ClasificacionPayback,
  type ClasificacionRoi,
  type EvaluacionPolitica,
  type PoliticaFinanciera,
  type Veredicto,
} from '@/lib/domain/presupuesto/politicaFinanciera'
import { calcularAbonoMinimo, type ResultadoAbonoMinimo } from '@/lib/domain/presupuesto/abonoMinimo'
import {
  modeloGraficoFlujo,
  modeloGraficoSaldo,
  sensibilidadAbono,
  type ModeloGraficoFlujo,
  type ModeloGraficoSaldo,
  type PuntoSensibilidad,
} from '@/lib/domain/presupuesto/vistasGraficos'
import {
  TEXTOS_APROBADOS as T,
  TEXTOS_CLASIFICACION_PAYBACK,
  TEXTOS_CLASIFICACION_ROI,
  TEXTOS_NUEVOS_PENDIENTES as TN,
  etiquetarErrorValidacion,
  textoIncumplimiento,
  textoObservacion,
} from '@/lib/domain/presupuesto/textosInterfaz'
import {
  PARAMETROS_REFERENCIA,
  PORCENTAJE_ABONO_CAPITAL_MAXIMO,
  conSeguroLegacy,
  equityConductorSemanal,
  flujoOperativoHumaniaSemanal,
  validarParametros,
  type ModalidadAdquisicion,
  type ParametrosPresupuesto,
  type SeguroLegacyParametros,
} from '@/lib/domain/presupuesto/parametros'
import { formatearFechaAdmin } from '@/lib/format'
import { guardarPresupuesto, listarPresupuestos, obtenerPresupuesto, type ResultadoObtenerPresupuesto } from './actions'

const cop = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`
const copCompacto = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}$${(abs / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })}M`
  return cop(v)
}
const pct = (v: number) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
/** Dos decimales para las razones del veredicto: evita leer "30,0% por debajo de 30,0%" en un borde. */
const pct2 = (v: number) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
const semanaTexto = (v: number | null, siNull: string) => (v === null ? siNull : `Semana ${v.toLocaleString('es-CO')}`)
const mesesDe = (semanas: number, p: ParametrosPresupuesto) =>
  (semanas / (p.semanasPorAno / p.mesesPorAno)).toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const paybackConEquivalencia = (semana: number | null, p: ParametrosPresupuesto) =>
  semana === null ? T.paybackNoAlcanzadoReal : T.equivalencia(semana, mesesDe(semana, p))

const copiarPolitica = (p: PoliticaFinanciera): PoliticaFinanciera => ({
  version: p.version,
  roiCortes: [...p.roiCortes],
  paybackCortesSemanas: [...p.paybackCortesSemanas],
})

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

/**
 * Bloque de SOLO LECTURA "Financiación del seguro" dentro de "Amortización del crédito" (spec.md 36).
 * Es una obligación INDEPENDIENTE del crédito del vehículo: no se suma ni se combina con él.
 * Estrictamente informativo: no calcula nada, no toca ningún indicador y muestra el estado documental
 * de cada dato tal como consta (nunca lo promueve). Los textos vienen aprobados de `vistaCotizacion.ts`.
 */
function BloqueFinanciacionSeguro({ vista }: { vista: VistaCotizacionSeguro }) {
  const formato = (f: VistaCotizacionSeguro['filas'][number]) => (f.tipo === 'moneda' ? cop(f.valor as number) : String(f.valor))
  return (
    <section data-bloque="financiacion-seguro" className="border border-neutral-200 rounded-md p-4">
      <div>
        <h4 className="text-sm font-bold text-humania-blue uppercase tracking-wide">{vista.titulo}</h4>
        <p className="text-xs text-humania-gray/70 mt-1 mb-4">{vista.subtitulo}</p>
        <div>
          {vista.filas.map((f) => (
            <div key={f.etiqueta} className="flex items-baseline justify-between gap-4 py-2 border-b border-neutral-100 last:border-0">
              <span className="text-sm text-humania-gray">{f.etiqueta}</span>
              <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 text-right">
                <span className="text-sm font-mono tabular-nums font-medium text-neutral-800">{formato(f)}</span>
                {f.estado && (
                  <span className="text-[11px] rounded-sm border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 text-humania-gray/80">{f.estado}</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-neutral-200 pt-2">
          {vista.totales.map((t) => (
            <Fila key={t.etiqueta} label={t.etiqueta} valor={formato(t)} />
          ))}
        </div>
        <p className="text-sm text-humania-gray mt-4">{vista.fechaPrimeraCuota}</p>
        <p className="text-xs text-humania-gray/70 mt-3">{vista.nota}</p>
      </div>
    </section>
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

// ===== Clasificaciones y veredicto (D8) =====

const TONO_ROI: Record<ClasificacionRoi, string> = {
  MUY_BAJO: 'bg-red-50 text-red-800 border-red-200',
  BAJO: 'bg-amber-50 text-amber-900 border-amber-300',
  BUENO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  EXCELENTE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
}
const TONO_PAYBACK: Record<ClasificacionPayback, string> = {
  RIESGO_BAJO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  RIESGO_MEDIO: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  RIESGO_ELEVADO: 'bg-amber-50 text-amber-900 border-amber-300',
  RIESGO_ALTO: 'bg-red-50 text-red-800 border-red-200',
}
const TONO_VEREDICTO: Record<Veredicto, string> = {
  CUMPLE: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  CUMPLE_CON_OBSERVACIONES: 'bg-amber-50 text-amber-900 border-amber-300',
  NO_CUMPLE: 'bg-red-50 text-red-800 border-red-300',
}

function EtiquetaClasificacion({ texto, tono }: { texto: string; tono: string }) {
  return <span className={`inline-block text-[11px] font-bold tracking-wide rounded-sm border px-1.5 py-0.5 ${tono}`}>{texto}</span>
}

// ===== Resumen ejecutivo =====

function MetricaSecundaria({ label, valor, nota, tono = 'neutral' }: { label: string; valor: string; nota?: string; tono?: 'neutral' | 'positivo' | 'negativo' }) {
  const colorValor = { neutral: 'text-humania-blue', positivo: 'text-emerald-700', negativo: 'text-red-700' }[tono]
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-humania-gray/60 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${colorValor}`}>{valor}</p>
      {nota && <p className="text-xs text-humania-gray/60">{nota}</p>}
    </div>
  )
}

function ResumenEjecutivo({
  resultado,
  parametros,
  evaluacion,
}: {
  resultado: ResultadoMetricas
  parametros: ParametrosPresupuesto
  evaluacion: EvaluacionPolitica | null
}) {
  const payback = resultado.paybackFlujoContractualCompleto
  return (
    <Tarjeta className="border-2 border-humania-blue/10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-lg font-bold text-humania-blue">Resumen de la operación</h2>
        <Badge variant="outline" className="rounded-sm border-humania-blue/30 text-humania-blue">
          {parametros.modalidadAdquisicion === 'CREDITO' ? 'Crédito bancario' : 'Recursos propios (de contado)'}
        </Badge>
      </div>

      {/* Indicadores principales de la política D8 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-neutral-100">
        <div className="space-y-1.5" data-metrica="roi-inversion-total">
          <p className="text-xs font-semibold text-humania-gray/60 uppercase tracking-wide">{T.roiPrincipal}</p>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-3xl md:text-4xl font-extrabold tabular-nums text-humania-blue">{pct(resultado.roiSobreInversionTotal)}</p>
            {evaluacion && <EtiquetaClasificacion texto={TEXTOS_CLASIFICACION_ROI[evaluacion.clasificacionRoi]} tono={TONO_ROI[evaluacion.clasificacionRoi]} />}
          </div>
          <p className="text-xs text-humania-gray/60">No equivale a recuperación de inversión ni representa necesariamente ROI anualizado.</p>
        </div>
        <div className="space-y-1.5" data-metrica="payback-contractual">
          <p className="text-xs font-semibold text-humania-gray/60 uppercase tracking-wide">{T.paybackPrincipal(cop(parametros.cuotaSemanalConductor))}</p>
          <div className="flex flex-wrap items-center gap-3">
            <p className={`text-3xl md:text-4xl font-extrabold tabular-nums ${payback === null ? 'text-amber-700' : 'text-humania-blue'}`}>
              {paybackConEquivalencia(payback, parametros)}
            </p>
            {evaluacion && (
              <EtiquetaClasificacion texto={TEXTOS_CLASIFICACION_PAYBACK[evaluacion.clasificacionPayback]} tono={TONO_PAYBACK[evaluacion.clasificacionPayback]} />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-5 pt-6">
        <MetricaSecundaria label="Inversión inicial" valor={copCompacto(resultado.inversionInicialTotal)} />
        <MetricaSecundaria label="Ingreso operativo Humania" valor={copCompacto(resultado.flujo.ingresoOperativoHumania)} />
        <MetricaSecundaria
          label="Margen de venta del activo"
          valor={copCompacto(resultado.margenVentaActivo)}
          tono={resultado.margenVentaActivo >= 0 ? 'positivo' : 'negativo'}
        />
        <MetricaSecundaria
          label="Resultado neto (rentabilidad)"
          valor={copCompacto(resultado.resultadoNeto)}
          tono={resultado.resultadoNeto >= 0 ? 'positivo' : 'negativo'}
        />
        <MetricaSecundaria
          label={T.roiComplementario}
          valor={resultado.roiSobreRecursosPropios === null ? T.roiNoDefinido : pct(resultado.roiSobreRecursosPropios)}
          nota={T.roiNotaComplementario}
        />
      </div>
    </Tarjeta>
  )
}

// ===== Decisión de la operación (D8 + D6) =====

function TextoAbonoMinimo({ abono, parametros }: { abono: ResultadoAbonoMinimo; parametros: ParametrosPresupuesto }) {
  switch (abono.estado) {
    case 'YA_CUMPLE_SIN_ABONO':
      return <p className="text-sm text-humania-gray">{T.abonoMinimo.yaCumple}</p>
    case 'ENCONTRADO': {
      const d = abono.detalle
      return (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-humania-blue">{T.abonoMinimo.encontrado(pct(d.porcentaje), cop(d.montoMensual), d.mesInicio)}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <Fila label={T.roiPrincipal} valor={pct(d.roi)} />
              <Fila label={T.paybackPrincipal(cop(parametros.cuotaSemanalConductor))} valor={paybackConEquivalencia(d.payback, parametros)} />
              <Fila label="Meses reales para pagar" valor={`${d.mesesReales} meses`} />
            </div>
            <div>
              <Fila label="Meses ahorrados" valor={`${d.mesesAhorrados} meses`} />
              <Fila label="Ahorro en intereses" valor={cop(d.ahorroIntereses)} />
              <Fila label="Flujo de caja neto — vista de caja (capital + interés)" valor={cop(d.flujoDeCajaNeto)} />
            </div>
          </div>
        </div>
      )
    }
    case 'NO_ALCANZABLE_POR_PAYBACK':
      return <p className="text-sm text-amber-900">{T.abonoMinimo.noAlcanzablePayback}</p>
    case 'NO_ALCANZABLE_POR_ROI':
      return <p className="text-sm text-amber-900">{T.abonoMinimo.noAlcanzableRoi(pct(abono.porcentajeMaximo), pct(abono.roiMinimo))}</p>
    case 'NO_APLICA_RECURSOS_PROPIOS':
      return <p className="text-sm text-humania-gray">{T.abonoMinimo.soloCredito}</p>
    case 'PARAMETROS_INVALIDOS':
      return <p className="text-sm text-red-800">{abono.errores.map(etiquetarErrorValidacion).join(' ')}</p>
    case 'ERROR_MONOTONIA':
      return <p className="text-sm text-red-800">{abono.detalle}</p>
  }
}

function DecisionOperacion({
  evaluacion,
  abonoMinimo,
  parametros,
  sinPolitica,
  politicaInvalida,
}: {
  evaluacion: EvaluacionPolitica | null
  abonoMinimo: ResultadoAbonoMinimo | null
  parametros: ParametrosPresupuesto
  sinPolitica: boolean
  /** La política existe pero sus umbrales no son válidos: no se evalúa (nunca se inventa un veredicto). */
  politicaInvalida: boolean
}) {
  return (
    <Tarjeta titulo="Decisión de la operación">
      <p className="text-xs text-humania-gray/60 mb-4">
        Esta sección evalúa exclusivamente la operación financiera del activo — no tiene relación con la evaluación de candidatos.
      </p>
      {sinPolitica && <p className="text-sm font-medium text-amber-900">{T.sinPolitica}</p>}
      {politicaInvalida && (
        <div role="alert" data-estado-politica="INVALIDA" className="p-3 rounded-md text-sm font-medium flex items-start gap-2 bg-red-50 border border-red-200 text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {TN.politicaInvalida}
        </div>
      )}
      {evaluacion && (
        <div className="space-y-3" data-veredicto={evaluacion.veredicto}>
          <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 ${TONO_VEREDICTO[evaluacion.veredicto]}`}>
            {evaluacion.veredicto === 'CUMPLE' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : evaluacion.veredicto === 'NO_CUMPLE' ? (
              <XCircle className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <span className="text-sm font-bold tracking-wide">{T.veredictos[evaluacion.veredicto]}</span>
          </div>
          {(evaluacion.incumplimientos.length > 0 || evaluacion.observaciones.length > 0) && (
            <ul className="text-sm space-y-1 list-disc list-inside text-humania-gray">
              {evaluacion.incumplimientos.map((i) => (
                <li key={i.tipo}>{textoIncumplimiento(i, pct2)}</li>
              ))}
              {evaluacion.observaciones.map((o) => (
                <li key={o.tipo}>{textoObservacion(o)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {abonoMinimo && (
        <div className="mt-6 pt-5 border-t border-neutral-100" data-abono-minimo={abonoMinimo.estado}>
          <h4 className="text-xs font-bold text-humania-gray/60 uppercase tracking-wide mb-3">{T.abonoMinimo.titulo}</h4>
          <TextoAbonoMinimo abono={abonoMinimo} parametros={parametros} />
        </div>
      )}
    </Tarjeta>
  )
}

// ===== Estado de la operación — conclusión y alertas por separado =====

function EstadoOperacion({ resultado, parametros }: { resultado: ResultadoMetricas; parametros: ParametrosPresupuesto }) {
  const semanasPorMes = parametros.semanasPorAno / parametros.mesesPorAno
  const mesAlFinDelContrato = resultado.flujo.duracionContratoSemanas / semanasPorMes
  // Con abono a capital el crédito dura menos que su plazo nominal: se compara la duración REAL (`mesesCreditoReales`).
  const creditoSobrevive = resultado.creditoSobreviveAlContrato

  // El estado general (verde/ámbar) se decide con el payback de flujo contractual completo — "el valor real que
  // recibe Humania". Las demás vistas se muestran siempre como alertas: nunca se ocultan.
  const recuperaInversion = resultado.paybackFlujoContractualCompleto !== null

  const alertas: string[] = []
  if (resultado.paybackOperativo === null) {
    alertas.push('Sin contar el componente de adquisición del conductor, el ingreso operativo de Humania por sí solo no alcanza a cubrir la inversión inicial dentro del contrato.')
  }
  if (resultado.paybackFinancieroRentabilidad === null) {
    alertas.push('Después de restar intereses y costos recurrentes (vista de rentabilidad), la inversión no se recupera dentro del plazo contractual.')
  }
  if (resultado.paybackFinancieroCaja === null) {
    alertas.push('Después de restar la cuota bancaria completa y costos recurrentes (vista de flujo de caja), la inversión no se recupera dentro del plazo contractual.')
  }
  if (creditoSobrevive) {
    alertas.push(
      `El crédito bancario (plazo ${resultado.mesesCreditoReales} meses) continúa pagándose después de finalizar el contrato con el conductor (contrato ≈ ${mesAlFinDelContrato.toFixed(1)} meses).`,
    )
  }
  if (resultado.resultadoNeto < 0) {
    alertas.push('El resultado neto (vista rentabilidad, sin contar el componente de adquisición) es negativo al cierre del contrato.')
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-5 ${recuperaInversion ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          {recuperaInversion ? <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" /> : <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0" />}
          <div className="flex-1">
            <h3 className={`text-sm font-bold uppercase tracking-wide ${recuperaInversion ? 'text-emerald-800' : 'text-amber-800'}`}>Estado de la operación</h3>
            <p className={`text-sm font-semibold mt-1 ${recuperaInversion ? 'text-emerald-800' : 'text-amber-900'}`}>
              {recuperaInversion
                ? `La operación recupera la inversión dentro del plazo contractual — semana ${resultado.paybackFlujoContractualCompleto} (flujo contractual completo, incluye el valor de venta del activo).`
                : `La operación no recupera la inversión dentro del plazo contractual, ni siquiera contando el flujo contractual completo (${cop(parametros.cuotaSemanalConductor)}/semana + valor de venta del activo).`}
            </p>
          </div>
        </div>
      </div>
      {alertas.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-5" data-bloque="alertas">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-800">{T.alertas}</h3>
              <ul className="text-sm mt-2 space-y-1 list-disc list-inside text-amber-900">
                {alertas.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== D7-1 — flujo contractual acumulado, inversión y payback (SVG, sin librería) =====

function FlujoChart({ modelo }: { modelo: ModeloGraficoFlujo }) {
  const { contractualReal, contractualExtrapolado, operativoReal, inversion, duracionContratoSemanas, paybackSemana, horizonteSemanas, maximoY } = modelo

  const W = 640, H = 260
  const ML = 76, MR = 16, MT = 20, MB = 34
  const PW = W - ML - MR, PH = H - MT - MB
  const x = (semana: number) => ML + (semana / horizonteSemanas) * PW
  const y = (valor: number) => MT + PH - (Math.max(valor, 0) / maximoY) * PH

  const ruta = (valores: number[], semanaInicial: number) =>
    valores.length > 0 ? `M ${valores.map((v, i) => `${x(semanaInicial + i)},${y(v)}`).join(' L ')}` : ''
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximoY)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={TN.tituloGraficoFlujo}>
        {gridY.map((v) => (
          <g key={v}>
            <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="#e5e5e5" strokeWidth={1} />
            <text x={ML - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#78716c" fontFamily="monospace">
              {copCompacto(v)}
            </text>
          </g>
        ))}

        {/* Inversión inicial */}
        <line x1={ML} x2={W - MR} y1={y(inversion)} y2={y(inversion)} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={W - MR} y={y(inversion) - 6} textAnchor="end" fontSize={11} fill="#b91c1c" fontWeight={600}>
          Inversión inicial {copCompacto(inversion)}
        </text>

        {/* Fin del contrato */}
        <line x1={x(duracionContratoSemanas)} x2={x(duracionContratoSemanas)} y1={MT} y2={MT + PH} stroke="#a3a3a3" strokeWidth={1} strokeDasharray="2 3" />
        <text x={x(duracionContratoSemanas)} y={MT - 6} textAnchor="middle" fontSize={10} fill="#737373">
          Fin del contrato
        </text>

        {/* Serie secundaria: ingreso operativo */}
        <path d={ruta(operativoReal, 1)} fill="none" stroke="#002B4A" strokeWidth={1.25} opacity={0.3} />
        {/* Serie principal: flujo contractual (real sólida, extrapolación punteada) */}
        <path d={ruta(contractualReal, 1)} fill="none" stroke="#002B4A" strokeWidth={2.5} strokeLinecap="round" />
        <path d={ruta(contractualExtrapolado, duracionContratoSemanas)} fill="none" stroke="#002B4A" strokeWidth={2} strokeLinecap="round" strokeDasharray="1 5" opacity={0.55} />

        {/* Marca del payback contractual: mismo valor que la cifra principal */}
        {paybackSemana !== null && (
          <g data-marca="payback">
            <line x1={x(paybackSemana)} x2={x(paybackSemana)} y1={y(inversion)} y2={MT + PH} stroke="#047857" strokeWidth={1.5} />
            <circle cx={x(paybackSemana)} cy={y(inversion)} r={4} fill="#047857" />
            <text x={x(paybackSemana) + 6} y={y(inversion) + 16} fontSize={11} fill="#047857" fontWeight={600}>
              {TN.marcaPayback(paybackSemana)}
            </text>
          </g>
        )}

        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} stroke="#d4d4d4" strokeWidth={1} />
        <text x={ML} y={H - 8} fontSize={10} fill="#78716c">0</text>
        <text x={x(duracionContratoSemanas)} y={H - 8} textAnchor="middle" fontSize={10} fill="#78716c">
          {duracionContratoSemanas} sem.
        </text>
        <text x={W - MR} y={H - 8} textAnchor="end" fontSize={10} fill="#78716c">
          {horizonteSemanas} sem.
        </text>
      </svg>
      <p className="text-xs text-humania-gray/60 mt-2">{TN.notaGraficoFlujo}</p>
    </div>
  )
}

// ===== D7-2 — evolución del saldo del crédito =====

/** Colores compartidos por las líneas y su leyenda, para que siempre coincidan. */
const COLOR_SALDO_NORMAL = '#002B4A'
const COLOR_SALDO_CON_ABONO = '#047857'
const OPACIDAD_SALDO_NORMAL_CON_ABONO = 0.45

function SaldoChart({ modelo }: { modelo: ModeloGraficoSaldo }) {
  const { normal, conAbono, mesFinContrato, mesFinCredito, principal } = modelo
  const W = 640, H = 220
  const ML = 76, MR = 16, MT = 20, MB = 30
  const PW = W - ML - MR, PH = H - MT - MB
  const mesMax = Math.max(normal[normal.length - 1]?.mes ?? 1, Math.ceil(mesFinContrato), 1)
  const x = (mes: number) => ML + (mes / mesMax) * PW
  const y = (saldo: number) => MT + PH - (saldo / (principal || 1)) * PH
  const ruta = (puntos: { mes: number; saldo: number }[]) => `M ${puntos.map((p) => `${x(p.mes)},${y(p.saldo)}`).join(' L ')}`

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={TN.tituloGraficoSaldo}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={ML} x2={W - MR} y1={y(f * principal)} y2={y(f * principal)} stroke="#e5e5e5" strokeWidth={1} />
            <text x={ML - 8} y={y(f * principal)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#78716c" fontFamily="monospace">
              {copCompacto(f * principal)}
            </text>
          </g>
        ))}
        <line x1={x(mesFinContrato)} x2={x(mesFinContrato)} y1={MT} y2={MT + PH} stroke="#a3a3a3" strokeWidth={1} strokeDasharray="2 3" />
        <text x={x(mesFinContrato)} y={MT - 6} textAnchor="middle" fontSize={10} fill="#737373">
          Fin del contrato
        </text>
        <path d={ruta(normal)} fill="none" stroke={COLOR_SALDO_NORMAL} strokeWidth={conAbono ? 1.5 : 2.5} opacity={conAbono ? OPACIDAD_SALDO_NORMAL_CON_ABONO : 1} />
        {conAbono && <path d={ruta(conAbono)} fill="none" stroke={COLOR_SALDO_CON_ABONO} strokeWidth={2.5} />}
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} stroke="#d4d4d4" strokeWidth={1} />
        <text x={ML} y={H - 8} fontSize={10} fill="#78716c">0</text>
        <text x={W - MR} y={H - 8} textAnchor="end" fontSize={10} fill="#78716c">
          {mesMax} meses
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-humania-gray/70 mt-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ backgroundColor: COLOR_SALDO_NORMAL, opacity: conAbono ? OPACIDAD_SALDO_NORMAL_CON_ABONO : 1 }} /> {TN.leyendaSaldoNormal}
        </span>
        {conAbono && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5" style={{ backgroundColor: COLOR_SALDO_CON_ABONO }} /> {TN.leyendaSaldoConAbono}
          </span>
        )}
        <span>{TN.finCredito(mesFinCredito)}</span>
      </div>
    </div>
  )
}

// ===== D7-3 — sensibilidad del abono =====

function SensibilidadAbono({
  puntos,
  politica,
  parametros,
}: {
  puntos: PuntoSensibilidad[]
  politica: PoliticaFinanciera
  parametros: ParametrosPresupuesto
}) {
  const W = 640, H = 200
  const ML = 56, MR = 16, MT = 14, MB = 30
  const PW = W - ML - MR, PH = H - MT - MB
  const abonoMax = PORCENTAJE_ABONO_CAPITAL_MAXIMO
  const roiMax = Math.max(...puntos.map((p) => p.roi), politica.roiCortes[2], 0.01) * 1.1
  const roiMinGrafico = Math.min(0, ...puntos.map((p) => p.roi))
  const x = (a: number) => ML + (a / abonoMax) * PW
  const y = (roi: number) => MT + PH - ((roi - roiMinGrafico) / (roiMax - roiMinGrafico)) * PH
  const ruta = `M ${puntos.map((p) => `${x(p.porcentaje)},${y(p.roi)}`).join(' L ')}`
  const minimo = politica.roiCortes[1]
  const marcasY = [0, 0.25, 0.5, 0.75, 1].map((f) => roiMinGrafico + f * (roiMax - roiMinGrafico))

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={TN.tituloSensibilidad}>
        {/* Bandas de ROI de la política */}
        <rect x={ML} width={PW} y={y(roiMax)} height={Math.max(0, y(minimo) - y(roiMax))} fill="#ecfdf5" />
        {/* Eje Y: solo presentación, misma escala que la curva */}
        {marcasY.map((v) => (
          <g key={v}>
            <line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="#e5e5e5" strokeWidth={1} />
            <text x={ML - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#78716c" fontFamily="monospace">
              {pct(v)}
            </text>
          </g>
        ))}
        <line x1={ML} x2={W - MR} y1={y(minimo)} y2={y(minimo)} stroke="#047857" strokeWidth={1.25} strokeDasharray="4 3" />
        <text x={W - MR} y={y(minimo) - 5} textAnchor="end" fontSize={10} fill="#047857" fontWeight={600}>
          {T.roiPrincipal} ≥ {pct(minimo)}
        </text>
        <path d={ruta} fill="none" stroke="#002B4A" strokeWidth={2.25} />
        {puntos.map((p) => (
          <circle
            key={p.porcentaje}
            cx={x(p.porcentaje)}
            cy={y(p.roi)}
            r={p.esActual || p.esMinimo ? 5 : 3}
            fill={p.esMinimo ? '#047857' : p.esActual ? '#D9C4A1' : '#002B4A'}
            stroke={p.esActual ? '#002B4A' : 'none'}
          />
        ))}
        <line x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} stroke="#d4d4d4" strokeWidth={1} />
        <text x={ML} y={H - 8} fontSize={10} fill="#78716c">0%</text>
        <text x={W - MR} y={H - 8} textAnchor="end" fontSize={10} fill="#78716c">
          {pct(abonoMax)}
        </text>
      </svg>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-humania-gray/60 uppercase tracking-wide border-b border-neutral-200">
              <th className="py-2 font-medium">{TN.columnaAbono}</th>
              <th className="py-2 font-medium">{T.roiPrincipal}</th>
              <th className="py-2 font-medium">{T.paybackPrincipal(cop(parametros.cuotaSemanalConductor))}</th>
              <th className="py-2 font-medium">Meses reales para pagar</th>
              <th className="py-2 font-medium">Costos financieros — vista rentabilidad (solo interés)</th>
              <th className="py-2 font-medium">Flujo de caja neto — vista de caja (capital + interés)</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.porcentaje} className={`border-b border-neutral-100 last:border-0 ${p.esMinimo ? 'bg-emerald-50/60' : p.esActual ? 'bg-humania-sand/10' : ''}`}>
                <td className="py-2 font-mono tabular-nums">
                  {pct(p.porcentaje)}
                  {p.esActual && <span className="ml-2 text-[11px] text-humania-gray/70">({TN.marcaActual})</span>}
                  {p.esMinimo && <span className="ml-2 text-[11px] text-emerald-800">({TN.marcaMinimo})</span>}
                </td>
                <td className="py-2 font-mono tabular-nums">
                  {pct(p.roi)} <span className="text-[11px] text-humania-gray/70">{TEXTOS_CLASIFICACION_ROI[p.clasificacionRoi]}</span>
                </td>
                <td className="py-2 font-mono tabular-nums">{paybackConEquivalencia(p.payback, parametros)}</td>
                <td className="py-2 font-mono tabular-nums">{p.mesesReales} meses</td>
                <td className="py-2 font-mono tabular-nums">{cop(p.costosFinancierosRentabilidad)}</td>
                <td className="py-2 font-mono tabular-nums">{cop(p.flujoDeCajaNeto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-humania-gray/60">{TN.notaSensibilidad}</p>
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

function TituloGrupo({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-bold text-humania-gray/50 uppercase tracking-wide mb-3">{children}</h4>
}

interface PresupuestoGuardado {
  id: string
  financial_model_version: string
  etiqueta: string | null
  semanas_aplazatorias_usadas: number
  resultados: ResultadoMetricas & { evaluacionPolitica?: EvaluacionPolitica }
  created_at: string
}

/**
 * KAI-29 B3 — de qué simulación viene el estado actual (plan.md 18.1). NUEVA: parámetros
 * de referencia + cotización global + política vigente. CARGADA: snapshot reconstruido por
 * B1 vía `obtenerPresupuesto` (B2), o el presupuesto recién guardado (spec.md 39.4, punto 12)
 * — `resultadosHistoricos` es exclusivamente para comparar (`compararHistorico.ts`), nunca se
 * usa para reconstruir `parametros`.
 */
type ContextoPresupuesto =
  | { tipo: 'NUEVA' }
  | { tipo: 'CARGADA'; id: string; etiqueta: string | null; createdAt: string; resultadosHistoricos: ResultadoGuardado }

interface EstadoSimulacion {
  parametros: ParametrosPresupuesto
  semanas: number
  /** Política D8 de esta simulación; null solo para un presupuesto guardado antes de D8 (nunca se completa en silencio). */
  politica: PoliticaFinanciera | null
}

/** Mensaje de error al abrir un presupuesto — nunca oculta la razón real detrás de un texto genérico. */
function mensajeErrorApertura(r: Exclude<ResultadoObtenerPresupuesto, { estado: 'OK' }>): string {
  switch (r.estado) {
    case 'NO_ENCONTRADO':
      return 'No se encontró ese presupuesto guardado.'
    case 'ID_INVALIDO':
      return 'El identificador del presupuesto no es válido.'
    case 'NO_AUTORIZADO':
      return 'No autorizado: solo un SUPER_ADMIN puede abrir presupuestos guardados.'
    case 'ESTRUCTURA_NO_RECONOCIDA':
      return 'El presupuesto guardado tiene una estructura que el sistema no reconoce.'
    case 'DATOS_INVALIDOS':
      return `El presupuesto guardado tiene datos inválidos: ${r.errores.join('; ')}`
    case 'NO_DETERMINISTA':
      return `El presupuesto guardado no se puede reconstruir de forma confiable: ${r.razon}`
    case 'ERROR':
      return r.mensaje
  }
}

/** Claves de `ParametrosPresupuesto` cuyo valor es un número (las editables con un campo numérico). */
type ClaveNumericaParametros = { [K in keyof ParametrosPresupuesto]: ParametrosPresupuesto[K] extends number ? K : never }[keyof ParametrosPresupuesto]

interface CalculadoraPresupuestoProps {
  /** Datos de la financiación vigente del seguro leídos en el servidor. Informativos: no entran a ningún indicador. */
  cotizacionSeguro?: CotizacionSeguro | null
  estadoCotizacionSeguro?: EstadoLecturaCotizacion
}

export function CalculadoraPresupuesto({ cotizacionSeguro = null, estadoCotizacionSeguro = 'SIN_COTIZACION' }: CalculadoraPresupuestoProps) {
  // Estado de referencia: parámetros de referencia + cotización global + política vigente (D8).
  const estadoInicial = useCallback(
    (): EstadoSimulacion => ({
      parametros: { ...PARAMETROS_REFERENCIA, seguro: { ...PARAMETROS_REFERENCIA.seguro, cotizacion: cotizacionSeguro } },
      semanas: 0,
      politica: copiarPolitica(POLITICA_FINANCIERA_V1),
    }),
    [cotizacionSeguro],
  )

  const [parametros, setParametros] = useState<ParametrosPresupuesto>(() => estadoInicial().parametros)
  const [semanasAplazatoriasUsadas, setSemanasAplazatoriasUsadas] = useState(0)
  const [politica, setPolitica] = useState<PoliticaFinanciera | null>(() => estadoInicial().politica)
  const [etiqueta, setEtiqueta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [errorApertura, setErrorApertura] = useState<string | null>(null)
  const [guardados, setGuardados] = useState<PresupuestoGuardado[] | null>(null)
  const [cargandoGuardados, setCargandoGuardados] = useState(false)
  const [cargandoInicial, setCargandoInicial] = useState(true)

  // KAI-29 B3 — contexto de la simulación actual (NUEVA/CARGADA) y detección de cambios sin
  // guardar. `baseline` es "lo último guardado o cargado".
  const [contexto, setContexto] = useState<ContextoPresupuesto>({ tipo: 'NUEVA' })
  const [baseline, setBaseline] = useState<EstadoSimulacion>(estadoInicial)
  const [cargandoApertura, setCargandoApertura] = useState<string | null>(null)
  const [confirmandoAperturaId, setConfirmandoAperturaId] = useState<string | null>(null)

  const errores = useMemo(() => validarParametros(parametros), [parametros])
  const erroresPolitica = useMemo(() => (politica ? validarPolitica(politica) : []), [politica])
  const politicaValida = politica !== null && erroresPolitica.length === 0 ? politica : null
  const resultado = useMemo(
    () => (errores.length === 0 ? calcularMetricas(parametros, semanasAplazatoriasUsadas) : null),
    [parametros, semanasAplazatoriasUsadas, errores],
  )
  // D8 y D6: funciones puras encima del motor; nunca cambian `resultado` ni `parametros` (AC-49).
  const evaluacion = useMemo(() => (resultado && politicaValida ? evaluarPolitica(resultado, politicaValida) : null), [resultado, politicaValida])
  const abonoMinimo = useMemo(
    () => (resultado && politicaValida ? calcularAbonoMinimo(parametros, semanasAplazatoriasUsadas, politicaValida) : null),
    [resultado, politicaValida, parametros, semanasAplazatoriasUsadas],
  )
  const porcentajeAbonoMinimo =
    abonoMinimo?.estado === 'ENCONTRADO' || abonoMinimo?.estado === 'YA_CUMPLE_SIN_ABONO' ? abonoMinimo.detalle.porcentaje : null
  const puntosSensibilidad = useMemo(
    () => (resultado && politicaValida ? sensibilidadAbono(parametros, semanasAplazatoriasUsadas, politicaValida, porcentajeAbonoMinimo) : null),
    [resultado, politicaValida, parametros, semanasAplazatoriasUsadas, porcentajeAbonoMinimo],
  )
  const modeloFlujo = useMemo(() => (resultado ? modeloGraficoFlujo(resultado) : null), [resultado])
  const modeloSaldo = useMemo(() => (resultado ? modeloGraficoSaldo(resultado, parametros) : null), [resultado, parametros])

  // Financiación del seguro DE ESTE PRESUPUESTO (spec.md 36): sale solo de sus parámetros (`seguro.cotizacion`) y de su
  // cronograma nominal; no es un valor global y no participa en ningún indicador.
  const vistaCotizacion = useMemo(
    () => (resultado ? construirVistaCotizacionSeguro(parametros.seguro.cotizacion, resultado.seguroNominal) : null),
    [resultado, parametros.seguro.cotizacion],
  )

  // KAI-29 B3 — ¿la simulación actual difiere de lo último guardado/cargado? Incluye la política D8.
  const hayCambiosSinGuardar = useMemo(
    () =>
      semanasAplazatoriasUsadas !== baseline.semanas ||
      JSON.stringify(parametros) !== JSON.stringify(baseline.parametros) ||
      JSON.stringify(politica) !== JSON.stringify(baseline.politica),
    [parametros, semanasAplazatoriasUsadas, politica, baseline],
  )

  // Histórico (guardado) vs. actual (recalculado) — spec.md 38.5. Solo presentación.
  const comparacion = useMemo(() => {
    if (contexto.tipo !== 'CARGADA' || !resultado || hayCambiosSinGuardar) return null
    return compararResultados(contexto.resultadosHistoricos, resultado)
  }, [contexto, resultado, hayCambiosSinGuardar])

  async function abrirPresupuesto(id: string) {
    setCargandoApertura(id)
    setMensaje(null)
    setErrorApertura(null)
    const r = await obtenerPresupuesto(id)
    setCargandoApertura(null)
    if (r.estado !== 'OK') {
      // El estado actual no se toca en absoluto ante cualquier fallo (decisión 6, spec.md 38.2).
      setErrorApertura(mensajeErrorApertura(r))
      return
    }
    // Reemplazo atómico completo — nunca `prev => ({...prev, ...})` (evita residuos A -> B -> A).
    setParametros(r.parametros)
    setSemanasAplazatoriasUsadas(r.semanasAplazatoriasUsadas)
    setPolitica(r.politicaFinanciera)
    setBaseline({ parametros: r.parametros, semanas: r.semanasAplazatoriasUsadas, politica: r.politicaFinanciera })
    setEtiqueta('')
    setContexto({ tipo: 'CARGADA', id: r.id, etiqueta: r.etiqueta, createdAt: r.createdAt, resultadosHistoricos: r.resultadosHistoricos })
  }

  function handleClickFila(id: string) {
    if (cargandoApertura) return
    if (hayCambiosSinGuardar) {
      setConfirmandoAperturaId(id)
      return
    }
    abrirPresupuesto(id)
  }

  function confirmarApertura() {
    const id = confirmandoAperturaId
    setConfirmandoAperturaId(null)
    if (id) abrirPresupuesto(id)
  }

  function handleNuevaSimulacion() {
    const nuevo = estadoInicial()
    setParametros(nuevo.parametros)
    setSemanasAplazatoriasUsadas(nuevo.semanas)
    setPolitica(nuevo.politica)
    setBaseline(nuevo)
    setEtiqueta('')
    setMensaje(null)
    setErrorApertura(null)
    setContexto({ tipo: 'NUEVA' })
  }

  const setParam = <K extends ClaveNumericaParametros>(campo: K) => (valor: number) =>
    setParametros((prev) => ({ ...prev, [campo]: valor }))

  // Datos del modelo anterior del seguro (anidados en `seguro.legacy`, separados del crédito del vehículo).
  const setSeguroLegacy = (campo: keyof SeguroLegacyParametros) => (valor: number) =>
    setParametros((prev) => conSeguroLegacy(prev, { [campo]: valor }))

  const setModalidad = (modalidad: ModalidadAdquisicion) => setParametros((prev) => ({ ...prev, modalidadAdquisicion: modalidad }))

  const setCortePolitica = (tipo: 'roiCortes' | 'paybackCortesSemanas', indice: 0 | 1 | 2) => (valor: number) =>
    setPolitica((prev) => {
      if (!prev) return prev
      const cortes = [...prev[tipo]] as [number, number, number]
      cortes[indice] = tipo === 'roiCortes' ? valor / 100 : Math.round(valor)
      return { ...prev, [tipo]: cortes }
    })

  // Plazo de adquisición editable: recalcula hacia atrás `valorVentaContractualActivo` con el
  // componente de adquisición semanal (ahorro + bono patrimonial).
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
    if (!politica) return
    setGuardando(true)
    setMensaje(null)
    const etiquetaGuardada = etiqueta.trim() || null
    const res = await guardarPresupuesto(parametros, semanasAplazatoriasUsadas, etiqueta, politica)
    setGuardando(false)
    if (!res.success) {
      setMensaje({ tipo: 'error', texto: res.error || 'No se pudo guardar el presupuesto.' })
      return
    }
    // spec.md 39.4, punto 12: la simulación pasa a ser el presupuesto recién creado, sin cambios pendientes.
    // Guardar siempre es un INSERT: el presupuesto de origen (si lo había) queda intacto (D17).
    if (res.id && res.createdAt && res.resultadosGuardados) {
      setBaseline({ parametros, semanas: semanasAplazatoriasUsadas, politica })
      setContexto({ tipo: 'CARGADA', id: res.id, etiqueta: etiquetaGuardada, createdAt: res.createdAt, resultadosHistoricos: res.resultadosGuardados })
    }
    setMensaje({ tipo: 'exito', texto: 'Presupuesto guardado correctamente.' })
    setEtiqueta('')
    cargarGuardados()
  }

  const seguroEnCalculo = parametros.seguro.modo === 'LEGACY_NO_CONFIRMADO'
  const operativoSemanal = cop(flujoOperativoHumaniaSemanal(parametros))

  // Recuadro del modelo anterior del seguro: en Recursos propios solo el capital entra al cálculo
  // (pagado de contado), así que solo ese campo se muestra ahí (spec.md 39.4).
  const bloqueModeloAnteriorSeguro = (
    <div data-bloque="seguro-legacy" className="mt-6 rounded-md border border-amber-300 bg-amber-50/60 p-4">
      <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wide">{T.modeloAnteriorTitulo}</h5>
      <p className="text-xs text-amber-900/80 mt-1 mb-4">
        Estos valores no representan la cotización actualmente cargada ni deben confundirse con la financiación del seguro de la cotización. Solo se conservan para reproducir el modelo anterior y los presupuestos históricos.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <CampoNumero label="Principal financiación del seguro" valor={parametros.seguro.legacy.principalFinanciacion} onChange={setSeguroLegacy('principalFinanciacion')} />
        {parametros.modalidadAdquisicion === 'CREDITO' && (
          <>
            <CampoNumero
              label="Costo financiero del seguro (estimado)"
              descripcion="Supuesto lineal, no un cronograma bancario confirmado."
              valor={parametros.seguro.legacy.costoFinancieroEstimado}
              onChange={setSeguroLegacy('costoFinancieroEstimado')}
            />
            <CampoNumero
              label="Plazo de la financiación del seguro"
              suffix="meses"
              descripcion={T.modeloAnteriorPlazo}
              valor={parametros.seguro.legacy.plazoMeses}
              onChange={setSeguroLegacy('plazoMeses')}
            />
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-8" data-cotizacion-seguro={estadoCotizacionSeguro} data-cotizacion-seguro-datos={cotizacionSeguro ? Object.keys(cotizacionSeguro.estadoDatos).length : 0}>
      {/* ================= ZONA EJECUTIVA ================= */}

      {/* KAI-29 B3 — contexto de presupuesto cargado (plan.md 18.1). */}
      {contexto.tipo === 'CARGADA' && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-humania-sand/10 border border-humania-sand rounded-md" data-contexto-presupuesto="CARGADA" data-presupuesto-id={contexto.id}>
          <Badge className="bg-humania-blue hover:bg-humania-blue/90">PRESUPUESTO CARGADO</Badge>
          <span className="text-sm text-humania-gray">
            {contexto.etiqueta || 'Sin etiqueta'} — {formatearFechaAdmin(contexto.createdAt)}
          </span>
          <Button variant="outline" size="sm" onClick={handleNuevaSimulacion} className="ml-auto rounded-none">
            Nueva simulación
          </Button>
        </div>
      )}

      {/* Decisión D17 (spec.md 38.9) — el histórico es inmutable: guardar crea una fila nueva. */}
      {contexto.tipo === 'CARGADA' && hayCambiosSinGuardar && (
        <div role="status" className="p-3 rounded-md text-sm font-medium flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Has modificado un presupuesto guardado. Si lo guardas, se creará una nueva versión y el presupuesto original permanecerá sin cambios.
        </div>
      )}

      {/* Modalidad de adquisición: cambia toda la página, por eso va en la zona ejecutiva (spec.md 39.4). */}
      <div>
        <TituloGrupo>Modalidad de adquisición del activo</TituloGrupo>
        <div className="flex flex-wrap gap-2">
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

      {errores.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-start gap-3 rounded-md">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Parámetros inválidos — corrige antes de continuar:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {errores.map((e) => (
                <li key={e}>{etiquetarErrorValidacion(e)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {resultado && (
        <>
          {/* Advertencia persistente (M6, spec.md 27.4): texto literal aprobado, con su origen debajo (39.4.1). */}
          {hayDatosNoConfirmadosEnCalculo(resultado.datosNoConfirmados) && (
            <div role="status" className="p-4 bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-3 rounded-md">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold tracking-wide">MODELO CON DATOS NO CONFIRMADOS</p>
                <p className="mt-1">{T.origenAvisoM6}</p>
              </div>
            </div>
          )}
          {/* KAI-29 B3, spec.md 38.5 — histórico (guardado) vs. actual (recalculado). Puramente informativo. */}
          {comparacion && (
            <div
              role="status"
              className={`p-3 rounded-md text-sm font-medium flex items-center gap-2 ${
                comparacion.estado === 'COINCIDE' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-300 text-amber-900'
              }`}
            >
              {comparacion.estado === 'COINCIDE'
                ? '✅ Resultado actual coincide con el presupuesto guardado.'
                : comparacion.estado === 'NO_COMPARABLE'
                  ? '⚠️ No es posible comparar este resultado con el presupuesto guardado.'
                  : '⚠️ El resultado cambia respecto al presupuesto guardado.'}
            </div>
          )}

          <ResumenEjecutivo resultado={resultado} parametros={parametros} evaluacion={evaluacion} />
          <DecisionOperacion evaluacion={evaluacion} abonoMinimo={abonoMinimo} parametros={parametros} sinPolitica={politica === null} politicaInvalida={politica !== null && erroresPolitica.length > 0} />
          <EstadoOperacion resultado={resultado} parametros={parametros} />

          {/* ================= ZONA DE ANÁLISIS ================= */}
          <div className="pt-6 border-t border-neutral-200 space-y-8">
            {modeloFlujo && (
              <Tarjeta titulo={TN.tituloGraficoFlujo}>
                <FlujoChart modelo={modeloFlujo} />
              </Tarjeta>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Tarjeta titulo="Estructura de capital">
                <Fila label="Modalidad de adquisición" valor={parametros.modalidadAdquisicion === 'CREDITO' ? 'Crédito bancario' : 'Recursos propios (de contado)'} />
                <Fila label="Costo / inversión inicial" valor={cop(resultado.inversionInicialTotal)} destacado />
                <Fila label="Recursos propios de Humania" valor={cop(resultado.recursosPropios)} />
                <Fila label="Financiación bancaria" valor={cop(resultado.financiacionBancaria)} />
                <Fila label="Financiación del seguro" valor={cop(resultado.principalFinanciacionSeguro)} />
                <Fila label={T.seguroUsado.etiqueta} valor={seguroEnCalculo ? T.seguroUsado.modeloAnterior : T.seguroUsado.noIncluido} />
                <Fila label="% financiado" valor={pct((resultado.financiacionBancaria + resultado.principalFinanciacionSeguro) / resultado.inversionInicialTotal)} />
                <Fila label="% capital propio" valor={pct(resultado.recursosPropios / resultado.inversionInicialTotal)} />
              </Tarjeta>
              <Tarjeta titulo={T.flujoContrato}>
                <Fila label="Flujo contractual bruto" valor={cop(resultado.flujo.flujoContractualTotal)} />
                <Fila label="Flujo de adquisición/patrimonial (no es ingreso de Humania)" valor={cop(resultado.flujo.equityAdministradoAcumulado)} />
                <Fila label="Ingreso operativo Humania" valor={cop(resultado.flujo.ingresoOperativoHumania)} />
                <Fila label="Ingreso adicional por aplazatorias" valor={cop(resultado.flujo.ingresoAplazatoriasAcumulado)} />
                <Fila label="Duración real del contrato" valor={`${resultado.flujo.duracionContratoSemanas} semanas`} />
                <Fila label="Cuota final de adquisición (pago único)" valor={cop(resultado.flujo.adquisicion.cuotaFinalAdquisicion)} />
                <Fila label="Margen de venta del activo (valor de venta − precio de compra)" valor={cop(resultado.margenVentaActivo)} />
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
                      <td className="py-2.5 font-semibold text-humania-blue">{T.paybackPrincipal(cop(parametros.cuotaSemanalConductor))}</td>
                      <td className="py-2.5 font-mono tabular-nums font-semibold">{paybackConEquivalencia(resultado.paybackFlujoContractualCompleto, parametros)}</td>
                      <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackFlujoContractualCompletoExtrapolado, T.paybackNoAlcanzadoExtrapolado)}</td>
                    </tr>
                    <tr className="border-b border-neutral-100">
                      <td className="py-2.5 text-humania-gray">{T.paybackOperativo(operativoSemanal)}</td>
                      <td className="py-2.5 font-mono tabular-nums">{semanaTexto(resultado.paybackOperativo, T.paybackNoAlcanzadoReal)}</td>
                      <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackOperativoExtrapolado, T.paybackNoAlcanzadoExtrapolado)}</td>
                    </tr>
                    <tr className="border-b border-neutral-100">
                      <td className="py-2.5 text-humania-gray">Payback financiero — vista rentabilidad ({operativoSemanal}, menos intereses/costos)</td>
                      <td className="py-2.5 font-mono tabular-nums">{semanaTexto(resultado.paybackFinancieroRentabilidad, T.paybackNoAlcanzadoReal)}</td>
                      <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackFinancieroRentabilidadExtrapolado, T.paybackNoAlcanzadoExtrapolado)}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-humania-gray">Payback financiero — vista de caja ({operativoSemanal}, menos cuota bancaria completa)</td>
                      <td className="py-2.5 font-mono tabular-nums">{semanaTexto(resultado.paybackFinancieroCaja, T.paybackNoAlcanzadoReal)}</td>
                      <td className="py-2.5 font-mono tabular-nums text-humania-gray/70">{semanaTexto(resultado.paybackFinancieroCajaExtrapolado, T.paybackNoAlcanzadoExtrapolado)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-neutral-100">
                <Fila label="Resultado neto — vista rentabilidad (solo interés)" valor={cop(resultado.resultadoNeto)} />
                <Fila label="Flujo de caja neto — vista de caja (capital + interés)" valor={cop(resultado.flujoDeCajaNeto)} />
              </div>
            </Tarjeta>

            {parametros.modalidadAdquisicion === 'CREDITO' && resultado.amortizacionNormal && (
              <Colapsable
                titulo="Amortización del crédito"
                subtitulo="Tabla completa mes a mes — normal y con abono a capital. Con abono activo, los paybacks financieros de arriba ya usan este cronograma."
              >
                <div className="space-y-6 pt-4">
                  <p className="text-xs text-humania-gray/70">
                    Obligaciones financieras asociadas a este presupuesto. El crédito del vehículo y la financiación del seguro son independientes: no se suman ni se combinan.
                  </p>
                  <section data-bloque="credito-vehiculo" className="border border-neutral-200 rounded-md p-4 space-y-8">
                    <h4 className="text-sm font-bold text-humania-blue uppercase tracking-wide">Crédito del vehículo</h4>

                    {resultado.amortizacionConAbono && (
                      <div>
                        <TituloGrupo>Comparador — normal vs. acelerado</TituloGrupo>
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

                    {modeloSaldo && (
                      <div data-grafico="saldo-credito">
                        <TituloGrupo>{TN.tituloGraficoSaldo}</TituloGrupo>
                        <SaldoChart modelo={modeloSaldo} />
                      </div>
                    )}

                    {puntosSensibilidad && politicaValida && (
                      <div data-grafico="sensibilidad-abono">
                        <TituloGrupo>{TN.tituloSensibilidad}</TituloGrupo>
                        <SensibilidadAbono puntos={puntosSensibilidad} politica={politicaValida} parametros={parametros} />
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
                  </section>
                  {vistaCotizacion && <BloqueFinanciacionSeguro vista={vistaCotizacion} />}
                </div>
              </Colapsable>
            )}
          </div>
        </>
      )}

      {/* ================= ZONA DE CONFIGURACIÓN ================= */}
      <div className="pt-6 border-t border-neutral-200 space-y-8">
        <Colapsable titulo="Configuración de parámetros" subtitulo="Editar los inputs recalcula todos los resultados de arriba al instante.">
          <div className="space-y-6 pt-4">
            <div>
              <TituloGrupo>{T.grupos.economiaActivo}</TituloGrupo>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <CampoNumero label="Precio real de compra" valor={parametros.precioCompra} onChange={setParam('precioCompra')} />
                <CampoNumero label="Traspaso" valor={parametros.traspaso} onChange={setParam('traspaso')} />
                {parametros.modalidadAdquisicion === 'CREDITO' ? (
                  <CampoNumero label="Recursos propios (capital) aportados por Humania" valor={parametros.capitalPropioDeclarado} onChange={setParam('capitalPropioDeclarado')} />
                ) : (
                  <CampoNumero
                    label="Otros costos iniciales (ej. GPS)"
                    descripcion="No se rastrea un costo de GPS separado — usa este campo si aplica en esta operación."
                    valor={parametros.otrosCostosInicialesRecursosPropios}
                    onChange={setParam('otrosCostosInicialesRecursosPropios')}
                  />
                )}
              </div>
            </div>

            <div>
              <TituloGrupo>{T.grupos.financiacionBancaria}</TituloGrupo>
              {parametros.modalidadAdquisicion === 'CREDITO' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <CampoNumero label="Principal financiado (crédito vehículo+GPS)" valor={parametros.principalCreditoBancario} onChange={setParam('principalCreditoBancario')} />
                    <CampoNumero
                      label="Tasa efectiva anual del crédito"
                      suffix="% EA"
                      valor={Math.round(parametros.tasaEfectivaAnualCredito * 1000) / 10}
                      onChange={(v) => setParam('tasaEfectivaAnualCredito')(v / 100)}
                    />
                    <CampoNumero label="Plazo del crédito bancario" suffix="meses" valor={parametros.mesesCreditoVehiculo} onChange={setParam('mesesCreditoVehiculo')} />
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
                  <p className="text-xs text-humania-gray/60 mt-4">
                    El plazo del crédito es una dimensión independiente de la duración del contrato con el conductor — no se asumen iguales.
                  </p>
                </>
              )}
              {bloqueModeloAnteriorSeguro}
            </div>

            <div>
              <TituloGrupo>{T.grupos.contratoConductor}</TituloGrupo>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <CampoNumero
                  label="Valor de venta contractual del activo"
                  descripcion="Independiente del precio real de compra."
                  valor={parametros.valorVentaContractualActivo}
                  onChange={setParam('valorVentaContractualActivo')}
                />
                <CampoNumero
                  label="Plazo de adquisición (semanas)"
                  descripcion={T.plazoAdquisicion(cop(equityConductorSemanal(parametros)))}
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
                  descripcion="100% ingreso operativo de Humania, nunca equity."
                  valor={semanasAplazatoriasUsadas}
                  onChange={(v) => setSemanasAplazatoriasUsadas(Math.max(0, Math.round(v)))}
                />
              </div>
            </div>

            <div>
              <TituloGrupo>Costos recurrentes anuales</TituloGrupo>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <CampoNumero label="SOAT anual" valor={parametros.soatAnual} onChange={setParam('soatAnual')} />
                <CampoNumero label="Tecnomecánica anual" valor={parametros.tecnomecanicaAnual} onChange={setParam('tecnomecanicaAnual')} />
                <CampoNumero label="Impuestos anuales" valor={parametros.impuestosAnuales} onChange={setParam('impuestosAnuales')} />
              </div>
              <p className="text-xs text-humania-gray/60 mt-4">
                El año 1 ya está incluido en la inversión inicial — estos valores proyectan las renovaciones dentro de la duración real del contrato.
              </p>
            </div>

            <div data-bloque="politica-financiera">
              <TituloGrupo>{TN.politicaTitulo}</TituloGrupo>
              {politica ? (
                <>
                  <p className="text-xs text-humania-gray/60 mb-4">{TN.politicaDescripcion}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <CampoNumero label={TN.politicaCampos.roiInicioBajo} suffix="%" valor={Math.round(politica.roiCortes[0] * 1000) / 10} onChange={setCortePolitica('roiCortes', 0)} />
                    <CampoNumero label={TN.politicaCampos.roiMinimo} suffix="%" valor={Math.round(politica.roiCortes[1] * 1000) / 10} onChange={setCortePolitica('roiCortes', 1)} />
                    <CampoNumero label={TN.politicaCampos.roiInicioExcelente} suffix="%" valor={Math.round(politica.roiCortes[2] * 1000) / 10} onChange={setCortePolitica('roiCortes', 2)} />
                    <CampoNumero label={TN.politicaCampos.paybackFinBajo} suffix="semanas" valor={politica.paybackCortesSemanas[0]} onChange={setCortePolitica('paybackCortesSemanas', 0)} />
                    <CampoNumero label={TN.politicaCampos.paybackFinMedio} suffix="semanas" valor={politica.paybackCortesSemanas[1]} onChange={setCortePolitica('paybackCortesSemanas', 1)} />
                    <CampoNumero label={TN.politicaCampos.paybackMaximo} suffix="semanas" valor={politica.paybackCortesSemanas[2]} onChange={setCortePolitica('paybackCortesSemanas', 2)} />
                  </div>
                  {erroresPolitica.length > 0 && (
                    <ul className="mt-4 p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md list-disc list-inside space-y-0.5">
                      {erroresPolitica.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-amber-900">{T.sinPolitica}</p>
                  <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPolitica(copiarPolitica(POLITICA_FINANCIERA_V1))}>
                    {TN.usarPoliticaVigente}
                  </Button>
                </div>
              )}
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
              {mensaje.tipo === 'error' ? etiquetarErrorValidacion(mensaje.texto) : mensaje.texto}
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
              disabled={guardando || errores.length > 0 || politicaValida === null}
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
          {errorApertura && (
            <div role="alert" className="mb-4 p-3 rounded-md text-sm font-medium flex items-center gap-2 bg-red-50 border border-red-200 text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorApertura}
            </div>
          )}
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
                    <th className="py-2 font-medium">{TN.columnaVeredicto}</th>
                    <th className="py-2 font-medium">Modelo</th>
                  </tr>
                </thead>
                <tbody>
                  {guardados.map((g) => {
                    const estaCargada = contexto.tipo === 'CARGADA' && contexto.id === g.id
                    const abriendoEsta = cargandoApertura === g.id
                    const veredictoGuardado = g.resultados.evaluacionPolitica?.veredicto
                    return (
                      <tr
                        key={g.id}
                        onClick={() => handleClickFila(g.id)}
                        aria-current={estaCargada ? 'true' : undefined}
                        className={`border-b border-neutral-100 last:border-0 cursor-pointer transition-colors ${
                          estaCargada ? 'bg-humania-sand/20 border-l-4 border-l-humania-blue' : 'hover:bg-neutral-50'
                        } ${abriendoEsta ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <td className="py-2.5 text-humania-gray">{formatearFechaAdmin(g.created_at)}</td>
                        <td className="py-2.5">{g.etiqueta || '—'}</td>
                        <td className="py-2.5 font-mono tabular-nums">{cop(g.resultados.resultadoNeto)}</td>
                        <td className="py-2.5 font-mono tabular-nums">{pct(g.resultados.roiSobreInversionTotal)}</td>
                        <td className="py-2.5 text-xs font-semibold">{veredictoGuardado ? T.veredictos[veredictoGuardado] : '—'}</td>
                        <td className="py-2.5 text-xs text-humania-gray/60">{g.financial_model_version}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Colapsable>
      </div>

      {/* KAI-29 B3 — confirmación antes de reemplazar una simulación con cambios sin guardar. */}
      <Dialog open={confirmandoAperturaId !== null} onOpenChange={(open) => { if (!open) setConfirmandoAperturaId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reemplazar simulación actual</DialogTitle>
            <DialogDescription>
              Se cargará el presupuesto seleccionado y se perderán los cambios no guardados de la simulación actual.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoAperturaId(null)} className="rounded-none">
              Cancelar
            </Button>
            <Button onClick={confirmarApertura} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none">
              Cargar presupuesto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
