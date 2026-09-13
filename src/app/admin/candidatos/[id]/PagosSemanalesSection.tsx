'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ImageIcon, Pencil, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { formatearFechaAdmin, formatearSoloFecha } from '@/lib/format'
import {
  actualizarTerminosContrato,
  registrarPagoSemanal,
  corregirPagoSemanal,
  registrarPagoEvidencia,
  eliminarPagoEvidencia,
  getPagosSemanales,
  registrarAbonoExtraordinario,
  corregirAbonoExtraordinario,
  getAbonosExtraordinarios,
  activarFechaInicioAbonosManual,
  getFechaInicioAbonosHistorial,
} from './actions'

const TIPOS_PAGO: { value: 'NORMAL' | 'APLAZATORIA' | 'NO_PAGO'; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'APLAZATORIA', label: 'Aplazatoria' },
  { value: 'NO_PAGO', label: 'No pago' },
]

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANO_MAXIMO = 5 * 1024 * 1024 // 5MB

type Evidencia = {
  id: string
  descripcion: string | null
  usuario_email: string
  activo: boolean
  created_at: string
  url: string | null
}

type Pago = {
  id: string
  numero_semana: number
  tipo_pago: 'NORMAL' | 'APLAZATORIA' | 'NO_PAGO'
  monto_pagado: number
  fecha_pago: string | null
  observaciones: string | null
  registrado_por_email: string
  created_at: string
  updated_at: string
  evidencia: Evidencia[]
}

type Abono = {
  id: string
  fecha_abono: string
  valor_abono: number
  observaciones: string | null
  registrado_por_email: string
  created_at: string
  updated_at: string
}

type FechaInicioHistorialEntry = {
  id: string
  fecha_anterior: string | null
  fecha_nueva: string | null
  motivo: string
  establecido_por_email: string
  establecido_en: string
}

function labelTipoPago(t: string) {
  return TIPOS_PAGO.find(o => o.value === t)?.label || t
}

function badgeTipoPago(t: string) {
  if (t === 'NORMAL') return 'bg-green-50 text-green-700 border-green-200'
  if (t === 'APLAZATORIA') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function semanaSugerida(fechaAsignacion: string): number {
  const inicio = new Date(fechaAsignacion).getTime()
  const hoy = Date.now()
  const dias = Math.floor((hoy - inicio) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.floor(dias / 7) + 1)
}

/**
 * Elegibilidad para Abonos Extraordinarios (spec.md Sección 12.2.1 y
 * 12.4, CERRADAS 2026-09-13): con `fechaInicioManual` en null, sigue
 * siendo 12 meses calendario desde fecha_asignacion; con valor, esa
 * fecha exacta REEMPLAZA (no se suma a) el cálculo de 12 meses -- mismo
 * COALESCE que el RPC. Además, siempre 0 NO_PAGO en las primeras 52
 * semanas (APLAZATORIA no cuenta como incumplimiento, y esto no cambia
 * con la fecha manual). Este cálculo es solo para deshabilitar el
 * formulario y mostrar el motivo con antelación -- el RPC repite la
 * misma validación como autoridad real.
 */
function calcularElegibilidadAbono(fechaAsignacion: string, pagos: Pago[], fechaInicioManual: string | null): { elegible: boolean; motivo: string } {
  let fechaElegible: Date
  if (fechaInicioManual) {
    fechaElegible = new Date(fechaInicioManual)
  } else {
    fechaElegible = new Date(fechaAsignacion)
    fechaElegible.setMonth(fechaElegible.getMonth() + 12)
  }
  if (Date.now() < fechaElegible.getTime()) {
    return {
      elegible: false,
      motivo: fechaInicioManual
        ? `El conductor no es elegible para abonos extraordinarios todavía (fecha fijada manualmente: ${formatearSoloFecha(fechaInicioManual)}).`
        : `El conductor debe cumplir 12 meses desde la asignación del activo para poder registrar abonos extraordinarios (elegible desde ${formatearFechaAdmin(fechaElegible.toISOString())}).`,
    }
  }
  const noPagoPrimerAno = pagos.filter(p => p.numero_semana <= 52 && p.tipo_pago === 'NO_PAGO').length
  if (noPagoPrimerAno > 0) {
    return {
      elegible: false,
      motivo: `El conductor tiene ${noPagoPrimerAno} semana(s) sin pago registradas en su primer año de contrato — no es elegible para abonos extraordinarios.`,
    }
  }
  return { elegible: true, motivo: '' }
}

export function PagosSemanalesSection({
  candidatoId,
  assignmentId,
  fechaAsignacion,
  cuotaSemanalInicial,
  cuotaAplazatoriaInicial,
  soloLectura,
  esSuperAdmin,
  fechaInicioManualInicial,
}: {
  candidatoId: string
  assignmentId: string
  fechaAsignacion: string
  cuotaSemanalInicial: number | null
  cuotaAplazatoriaInicial: number | null
  soloLectura: boolean
  esSuperAdmin: boolean
  fechaInicioManualInicial: string | null
}) {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [cuotaSemanal, setCuotaSemanal] = useState(cuotaSemanalInicial != null ? String(cuotaSemanalInicial) : '')
  const [cuotaAplazatoria, setCuotaAplazatoria] = useState(cuotaAplazatoriaInicial != null ? String(cuotaAplazatoriaInicial) : '')
  const [guardandoTerminos, setGuardandoTerminos] = useState(false)
  const [terminosGuardados, setTerminosGuardados] = useState(false)

  const [numeroSemana, setNumeroSemana] = useState(() => String(semanaSugerida(fechaAsignacion)))
  const [tipoPago, setTipoPago] = useState<'NORMAL' | 'APLAZATORIA' | 'NO_PAGO'>('NORMAL')
  const [montoPagado, setMontoPagado] = useState('')
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10))
  const [observaciones, setObservaciones] = useState('')
  const [registrando, setRegistrando] = useState(false)

  const [pagoACorregir, setPagoACorregir] = useState<Pago | null>(null)
  const [corrTipoPago, setCorrTipoPago] = useState<'NORMAL' | 'APLAZATORIA' | 'NO_PAGO'>('NORMAL')
  const [corrMonto, setCorrMonto] = useState('')
  const [corrFecha, setCorrFecha] = useState('')
  const [corrObservaciones, setCorrObservaciones] = useState('')
  const [corrMotivo, setCorrMotivo] = useState('')
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [errorCorreccion, setErrorCorreccion] = useState('')

  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false)

  const [evidenciaAEliminar, setEvidenciaAEliminar] = useState<Evidencia | null>(null)
  const [motivoEliminacion, setMotivoEliminacion] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminacion, setErrorEliminacion] = useState('')

  const [abonos, setAbonos] = useState<Abono[]>([])
  const [fechaAbono, setFechaAbono] = useState(() => new Date().toISOString().slice(0, 10))
  const [valorAbono, setValorAbono] = useState('')
  const [observacionesAbono, setObservacionesAbono] = useState('')
  const [registrandoAbono, setRegistrandoAbono] = useState(false)
  const [errorAbono, setErrorAbono] = useState('')

  const [abonoACorregir, setAbonoACorregir] = useState<Abono | null>(null)
  const [corrFechaAbono, setCorrFechaAbono] = useState('')
  const [corrValorAbono, setCorrValorAbono] = useState('')
  const [corrObservacionesAbono, setCorrObservacionesAbono] = useState('')
  const [corrMotivoAbono, setCorrMotivoAbono] = useState('')
  const [corrigiendoAbono, setCorrigiendoAbono] = useState(false)
  const [errorCorreccionAbono, setErrorCorreccionAbono] = useState('')

  // Configuración avanzada (SUPER_ADMIN) -- fecha de inicio manual de
  // elegibilidad de Abonos Extraordinarios (spec.md Sección 12.4).
  const [fechaInicioManual, setFechaInicioManual] = useState<string | null>(fechaInicioManualInicial)
  const [historialFechaInicio, setHistorialFechaInicio] = useState<FechaInicioHistorialEntry[]>([])
  const [nuevaFechaInicio, setNuevaFechaInicio] = useState('')
  const [motivoFechaInicio, setMotivoFechaInicio] = useState('')
  const [guardandoFechaInicio, setGuardandoFechaInicio] = useState(false)
  const [errorFechaInicio, setErrorFechaInicio] = useState('')

  const cargarPagos = useCallback(async () => {
    setLoading(true)
    const res = await getPagosSemanales(assignmentId)
    if (res.success) {
      setPagos(res.pagos as Pago[])
    } else {
      setError(res.error || 'No se pudieron cargar los pagos semanales.')
    }
    setLoading(false)
  }, [assignmentId])

  const cargarAbonos = useCallback(async () => {
    const res = await getAbonosExtraordinarios(assignmentId)
    if (res.success) {
      setAbonos(res.abonos as Abono[])
    } else {
      setError(res.error || 'No se pudieron cargar los abonos extraordinarios.')
    }
  }, [assignmentId])

  const cargarHistorialFechaInicio = useCallback(async () => {
    const res = await getFechaInicioAbonosHistorial(assignmentId)
    if (res.success) {
      setHistorialFechaInicio(res.historial as FechaInicioHistorialEntry[])
    }
  }, [assignmentId])

  useEffect(() => {
    cargarPagos()
    cargarAbonos()
    if (esSuperAdmin) cargarHistorialFechaInicio()
  }, [cargarPagos, cargarAbonos, cargarHistorialFechaInicio, esSuperAdmin])

  async function guardarTerminos() {
    setGuardandoTerminos(true)
    setTerminosGuardados(false)
    setError('')
    const semanal = cuotaSemanal === '' ? null : Number(cuotaSemanal)
    const aplazatoria = cuotaAplazatoria === '' ? null : Number(cuotaAplazatoria)
    const res = await actualizarTerminosContrato(candidatoId, assignmentId, semanal, aplazatoria)
    setGuardandoTerminos(false)
    if (!res.success) {
      setError(res.error || 'No se pudieron guardar los términos del contrato.')
      return
    }
    setTerminosGuardados(true)
  }

  async function registrarSemana() {
    setError('')
    if (numeroSemana === '' || Number(numeroSemana) < 1) {
      setError('El número de semana debe ser 1 o mayor.')
      return
    }
    setRegistrando(true)
    const res = await registrarPagoSemanal(
      candidatoId,
      assignmentId,
      Number(numeroSemana),
      tipoPago,
      montoPagado === '' ? 0 : Number(montoPagado),
      fechaPago || null,
      observaciones
    )
    setRegistrando(false)
    if (!res.success) {
      setError(res.error || 'No se pudo registrar el pago.')
      return
    }
    setMontoPagado('')
    setObservaciones('')
    setFechaPago(new Date().toISOString().slice(0, 10))
    setNumeroSemana(String(Number(numeroSemana) + 1))
    await cargarPagos()
  }

  function abrirCorreccion(pago: Pago) {
    setPagoACorregir(pago)
    setCorrTipoPago(pago.tipo_pago)
    setCorrMonto(String(pago.monto_pagado))
    setCorrFecha(pago.fecha_pago ? pago.fecha_pago.slice(0, 10) : '')
    setCorrObservaciones(pago.observaciones || '')
    setCorrMotivo('')
    setErrorCorreccion('')
  }

  async function confirmarCorreccion() {
    if (!pagoACorregir) return
    if (!corrMotivo.trim()) {
      setErrorCorreccion('Debes indicar el motivo de la corrección.')
      return
    }
    setCorrigiendo(true)
    setErrorCorreccion('')
    const res = await corregirPagoSemanal(
      candidatoId,
      pagoACorregir.id,
      corrTipoPago,
      corrMonto === '' ? 0 : Number(corrMonto),
      corrFecha || null,
      corrObservaciones,
      corrMotivo
    )
    setCorrigiendo(false)
    if (!res.success) {
      setErrorCorreccion(res.error || 'No se pudo corregir el pago.')
      return
    }
    setPagoACorregir(null)
    await cargarPagos()
  }

  async function registrarAbono() {
    setErrorAbono('')
    if (valorAbono === '' || Number(valorAbono) <= 0) {
      setErrorAbono('El valor del abono debe ser mayor que cero.')
      return
    }
    setRegistrandoAbono(true)
    const res = await registrarAbonoExtraordinario(candidatoId, assignmentId, fechaAbono, Number(valorAbono), observacionesAbono)
    setRegistrandoAbono(false)
    if (!res.success) {
      setErrorAbono(res.error || 'No se pudo registrar el abono extraordinario.')
      return
    }
    setValorAbono('')
    setObservacionesAbono('')
    setFechaAbono(new Date().toISOString().slice(0, 10))
    await cargarAbonos()
  }

  function abrirCorreccionAbono(abono: Abono) {
    setAbonoACorregir(abono)
    setCorrFechaAbono(abono.fecha_abono.slice(0, 10))
    setCorrValorAbono(String(abono.valor_abono))
    setCorrObservacionesAbono(abono.observaciones || '')
    setCorrMotivoAbono('')
    setErrorCorreccionAbono('')
  }

  async function confirmarCorreccionAbono() {
    if (!abonoACorregir) return
    if (!corrMotivoAbono.trim()) {
      setErrorCorreccionAbono('Debes indicar el motivo de la corrección.')
      return
    }
    if (corrValorAbono === '' || Number(corrValorAbono) <= 0) {
      setErrorCorreccionAbono('El valor del abono debe ser mayor que cero.')
      return
    }
    setCorrigiendoAbono(true)
    setErrorCorreccionAbono('')
    const res = await corregirAbonoExtraordinario(
      candidatoId,
      abonoACorregir.id,
      corrFechaAbono,
      Number(corrValorAbono),
      corrObservacionesAbono,
      corrMotivoAbono
    )
    setCorrigiendoAbono(false)
    if (!res.success) {
      setErrorCorreccionAbono(res.error || 'No se pudo corregir el abono extraordinario.')
      return
    }
    setAbonoACorregir(null)
    await cargarAbonos()
  }

  async function guardarFechaInicioManual() {
    setErrorFechaInicio('')
    if (!nuevaFechaInicio) {
      setErrorFechaInicio('Selecciona una fecha.')
      return
    }
    if (!motivoFechaInicio.trim()) {
      setErrorFechaInicio('Debes indicar el motivo del cambio.')
      return
    }
    setGuardandoFechaInicio(true)
    const res = await activarFechaInicioAbonosManual(candidatoId, assignmentId, nuevaFechaInicio, motivoFechaInicio)
    setGuardandoFechaInicio(false)
    if (!res.success) {
      setErrorFechaInicio(res.error || 'No se pudo actualizar la fecha de inicio.')
      return
    }
    setFechaInicioManual(nuevaFechaInicio)
    setNuevaFechaInicio('')
    setMotivoFechaInicio('')
    await cargarHistorialFechaInicio()
  }

  async function revertirFechaInicioManual() {
    setErrorFechaInicio('')
    if (!motivoFechaInicio.trim()) {
      setErrorFechaInicio('Debes indicar el motivo de la reversión a automático.')
      return
    }
    setGuardandoFechaInicio(true)
    const res = await activarFechaInicioAbonosManual(candidatoId, assignmentId, null, motivoFechaInicio)
    setGuardandoFechaInicio(false)
    if (!res.success) {
      setErrorFechaInicio(res.error || 'No se pudo revertir a automático.')
      return
    }
    setFechaInicioManual(null)
    setNuevaFechaInicio('')
    setMotivoFechaInicio('')
    await cargarHistorialFechaInicio()
  }

  function validarArchivo(file: File): string | null {
    if (!TIPOS_PERMITIDOS.includes(file.type)) return 'Solo se permiten imágenes JPG, PNG o WEBP.'
    if (file.size > TAMANO_MAXIMO) return 'La imagen no puede superar los 5MB.'
    return null
  }

  async function subirEvidencia(pago: Pago, file: File) {
    setError('')
    const errorValidacion = validarArchivo(file)
    if (errorValidacion) {
      setError(errorValidacion)
      return
    }

    setSubiendoEvidencia(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${assignmentId}/${pago.id}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage.from('pagos-evidencia').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })

    if (uploadError) {
      console.error('Error subiendo evidencia a Storage:', uploadError)
      setError('No se pudo subir la evidencia. Intenta nuevamente.')
      setSubiendoEvidencia(false)
      return
    }

    const res = await registrarPagoEvidencia(candidatoId, pago.id, path, '')
    setSubiendoEvidencia(false)
    if (!res.success) {
      setError(res.error || 'No se pudo registrar la evidencia.')
      return
    }
    await cargarPagos()
  }

  async function confirmarEliminacionEvidencia() {
    if (!evidenciaAEliminar) return
    if (!motivoEliminacion.trim()) {
      setErrorEliminacion('Debes indicar el motivo de la eliminación.')
      return
    }
    setEliminando(true)
    setErrorEliminacion('')
    const res = await eliminarPagoEvidencia(candidatoId, evidenciaAEliminar.id, motivoEliminacion.trim())
    setEliminando(false)
    if (!res.success) {
      setErrorEliminacion(res.error || 'No se pudo eliminar la evidencia.')
      return
    }
    setEvidenciaAEliminar(null)
    setMotivoEliminacion('')
    await cargarPagos()
  }

  if (loading) {
    return <p className="text-sm text-humania-gray">Cargando pagos semanales...</p>
  }

  const elegibilidadAbono = calcularElegibilidadAbono(fechaAsignacion, pagos, fechaInicioManual)

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* TERMINOS DEL CONTRATO */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 space-y-3">
        <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Términos del contrato</h4>
        <p className="text-xs text-humania-gray/70">La cuota semanal y la de aplazatoria varían por contrato — se definen aquí, según el activo alquilado con opción de compra.</p>
        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-humania-gray">Cuota semanal acordada</label>
            <Input
              type="number"
              min="0"
              disabled={soloLectura}
              value={cuotaSemanal}
              onChange={(e) => setCuotaSemanal(e.target.value)}
              placeholder="Ej. 450000"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-humania-gray">Cuota aplazatoria acordada</label>
            <Input
              type="number"
              min="0"
              disabled={soloLectura}
              value={cuotaAplazatoria}
              onChange={(e) => setCuotaAplazatoria(e.target.value)}
              placeholder="Ej. 200000"
            />
          </div>
          {!soloLectura && (
            <div>
              <Button type="button" onClick={guardarTerminos} disabled={guardandoTerminos} className="rounded-none">
                {guardandoTerminos ? 'Guardando...' : 'Guardar términos'}
              </Button>
              {terminosGuardados && <span className="ml-3 text-xs text-green-700">Guardado</span>}
            </div>
          )}
        </div>
      </div>

      {/* REGISTRAR PAGO NUEVO */}
      {!soloLectura && (
        <div className="p-4 bg-white border border-neutral-200 rounded-lg space-y-4">
          <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Registrar pago de una semana</h4>
          <div className="grid sm:grid-cols-5 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Semana</label>
              <Input type="number" min="1" value={numeroSemana} onChange={(e) => setNumeroSemana(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Tipo de pago</label>
              <select
                value={tipoPago}
                onChange={(e) => setTipoPago(e.target.value as 'NORMAL' | 'APLAZATORIA' | 'NO_PAGO')}
                className="h-10 w-full rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
              >
                {TIPOS_PAGO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Monto pagado</label>
              <Input type="number" min="0" value={montoPagado} onChange={(e) => setMontoPagado(e.target.value)} placeholder="Ej. 450000" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Fecha de pago</label>
              <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-5">
              <label className="text-xs font-medium text-humania-gray">Observaciones (opcional)</label>
              <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} maxLength={300} />
            </div>
          </div>
          <Button type="button" onClick={registrarSemana} disabled={registrando} className="rounded-none">
            {registrando ? 'Registrando...' : 'Registrar pago'}
          </Button>
        </div>
      )}

      {/* TABLA DE SEMANAS */}
      {pagos.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay pagos registrados todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-humania-gray/60 uppercase tracking-wide">
                <th className="py-2 pr-3">Semana</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Monto</th>
                <th className="py-2 pr-3">Fecha de pago</th>
                <th className="py-2 pr-3">Evidencia</th>
                <th className="py-2 pr-3">Registrado por</th>
                {!soloLectura && <th className="py-2 pr-3"></th>}
              </tr>
            </thead>
            <tbody>
              {pagos.map(p => (
                <tr key={p.id} className="border-b border-neutral-100 align-top">
                  <td className="py-2 pr-3 font-semibold">{p.numero_semana}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${badgeTipoPago(p.tipo_pago)}`}>
                      {labelTipoPago(p.tipo_pago)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">${p.monto_pagado.toLocaleString('es-CO')}</td>
                  <td className="py-2 pr-3">{formatearFechaAdmin(p.fecha_pago) || '—'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      {p.evidencia.map(ev => (
                        <div key={ev.id} className="relative group w-14 h-14 border border-neutral-200 rounded overflow-hidden">
                          {ev.url ? (
                            <img src={ev.url} alt={ev.descripcion || 'Evidencia de pago'} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-neutral-100 flex items-center justify-center text-neutral-400">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                          {!soloLectura && (
                            <button
                              type="button"
                              onClick={() => { setEvidenciaAEliminar(ev); setMotivoEliminacion(''); setErrorEliminacion('') }}
                              className="absolute top-0.5 right-0.5 bg-white/90 hover:bg-red-50 rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              aria-label="Eliminar evidencia"
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </button>
                          )}
                        </div>
                      ))}
                      {!soloLectura && (
                        <>
                          <input
                            id={`input-evidencia-${p.id}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={subiendoEvidencia}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) subirEvidencia(p, file)
                              e.target.value = ''
                            }}
                            className="sr-only"
                          />
                          <label
                            htmlFor={`input-evidencia-${p.id}`}
                            className={`w-14 h-14 flex items-center justify-center border border-dashed border-neutral-300 rounded text-neutral-400 hover:border-humania-blue hover:text-humania-blue transition-colors ${subiendoEvidencia ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            aria-label="Subir evidencia"
                          >
                            <Upload className="w-4 h-4" />
                          </label>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-humania-gray/70">{p.registrado_por_email}</td>
                  {!soloLectura && (
                    <td className="py-2 pr-3">
                      <button type="button" onClick={() => abrirCorreccion(p)} className="inline-flex items-center gap-1 text-humania-blue hover:text-humania-blue/80 text-xs font-medium cursor-pointer">
                        <Pencil className="w-3.5 h-3.5" /> Corregir
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ABONOS EXTRAORDINARIOS */}
      <div className="p-4 bg-white border border-neutral-200 rounded-lg space-y-4">
        <div>
          <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Abonos extraordinarios</h4>
          <p className="text-xs text-humania-gray/70 mt-1">
            Pagos voluntarios del conductor, aparte de la cuota semanal, que se aplican 100% a la adquisición del vehículo. Requiere al menos 12 meses de contrato y ningún &quot;No pago&quot; registrado en el primer año.
          </p>
        </div>

        {!soloLectura && (
          elegibilidadAbono.elegible ? (
            <div className="grid sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Fecha del abono</label>
                <Input type="date" value={fechaAbono} onChange={(e) => setFechaAbono(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Valor del abono</label>
                <Input type="number" min="0" value={valorAbono} onChange={(e) => setValorAbono(e.target.value)} placeholder="Ej. 1050000" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-humania-gray">Observaciones (opcional)</label>
                <Textarea value={observacionesAbono} onChange={(e) => setObservacionesAbono(e.target.value)} rows={1} maxLength={300} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {elegibilidadAbono.motivo}
            </p>
          )
        )}

        {errorAbono && <p className="text-red-600 text-sm">{errorAbono}</p>}

        {!soloLectura && elegibilidadAbono.elegible && (
          <Button type="button" onClick={registrarAbono} disabled={registrandoAbono} className="rounded-none">
            {registrandoAbono ? 'Registrando...' : 'Registrar abono extraordinario'}
          </Button>
        )}

        {abonos.length === 0 ? (
          <p className="text-sm text-neutral-400">No hay abonos extraordinarios registrados todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-humania-gray/60 uppercase tracking-wide">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Valor</th>
                  <th className="py-2 pr-3">Observaciones</th>
                  <th className="py-2 pr-3">Registrado por</th>
                  {!soloLectura && <th className="py-2 pr-3"></th>}
                </tr>
              </thead>
              <tbody>
                {abonos.map(a => (
                  <tr key={a.id} className="border-b border-neutral-100 align-top">
                    <td className="py-2 pr-3">{formatearFechaAdmin(a.fecha_abono) || '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">${a.valor_abono.toLocaleString('es-CO')}</td>
                    <td className="py-2 pr-3 text-humania-gray/80">{a.observaciones || '—'}</td>
                    <td className="py-2 pr-3 text-xs text-humania-gray/70">{a.registrado_por_email}</td>
                    {!soloLectura && (
                      <td className="py-2 pr-3">
                        <button type="button" onClick={() => abrirCorreccionAbono(a)} className="inline-flex items-center gap-1 text-humania-blue hover:text-humania-blue/80 text-xs font-medium cursor-pointer">
                          <Pencil className="w-3.5 h-3.5" /> Corregir
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {esSuperAdmin && (
          <div className="mt-4 pt-4 border-t border-dashed border-neutral-200 space-y-3">
            <h5 className="text-xs font-bold text-humania-blue uppercase tracking-widest">Configuración avanzada — SUPER_ADMIN</h5>
            <p className="text-xs text-humania-gray/70">
              El plazo de espera para Abonos Extraordinarios es negociable por contrato. Por defecto son 12 meses desde la asignación del activo — aquí puedes fijar una fecha distinta para este contrato en particular.
            </p>
            <p className="text-sm text-humania-blue">
              <span className="font-medium">Fecha vigente:</span>{' '}
              {fechaInicioManual ? (
                <>Manual — {formatearSoloFecha(fechaInicioManual)}</>
              ) : (
                <>Automática — 12 meses desde la asignación</>
              )}
              {fechaInicioManual && historialFechaInicio[0] && (
                <span className="text-xs text-humania-gray/60"> (fijada por {historialFechaInicio[0].establecido_por_email} el {formatearFechaAdmin(historialFechaInicio[0].establecido_en)})</span>
              )}
            </p>

            <div className="grid sm:grid-cols-3 gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Nueva fecha de inicio</label>
                <Input type="date" value={nuevaFechaInicio} onChange={(e) => setNuevaFechaInicio(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-humania-gray">Motivo (obligatorio)</label>
                <Textarea value={motivoFechaInicio} onChange={(e) => setMotivoFechaInicio(e.target.value)} rows={1} maxLength={300} placeholder="Ej. Se negoció con el conductor un plazo distinto." />
              </div>
            </div>

            {errorFechaInicio && <p className="text-red-600 text-sm">{errorFechaInicio}</p>}

            <div className="flex gap-3">
              <Button type="button" onClick={guardarFechaInicioManual} disabled={guardandoFechaInicio} className="rounded-none">
                {guardandoFechaInicio ? 'Guardando...' : 'Fijar fecha manual'}
              </Button>
              {fechaInicioManual && (
                <Button type="button" variant="outline" onClick={revertirFechaInicioManual} disabled={guardandoFechaInicio} className="rounded-none">
                  Volver a automático
                </Button>
              )}
            </div>

            {historialFechaInicio.length > 0 && (
              <details className="text-xs text-humania-gray/70">
                <summary className="cursor-pointer font-medium text-humania-blue">Ver historial de cambios ({historialFechaInicio.length})</summary>
                <ul className="mt-2 space-y-2">
                  {historialFechaInicio.map(h => (
                    <li key={h.id} className="border-l-2 border-neutral-200 pl-3">
                      {formatearFechaAdmin(h.establecido_en)} — {h.establecido_por_email}: {h.fecha_anterior ? formatearSoloFecha(h.fecha_anterior) : 'Automático'} → {h.fecha_nueva ? formatearSoloFecha(h.fecha_nueva) : 'Automático'}
                      <br />Motivo: {h.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* DIALOGO: CORREGIR PAGO */}
      <Dialog open={!!pagoACorregir} onOpenChange={(open) => { if (!open) { setPagoACorregir(null); setErrorCorreccion('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir pago — Semana {pagoACorregir?.numero_semana}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              El valor anterior queda registrado de forma trazable. No se sobrescribe sin dejar rastro.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Tipo de pago</label>
                <select
                  value={corrTipoPago}
                  onChange={(e) => setCorrTipoPago(e.target.value as 'NORMAL' | 'APLAZATORIA' | 'NO_PAGO')}
                  className="h-10 w-full rounded-none border border-neutral-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
                >
                  {TIPOS_PAGO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Monto pagado</label>
                <Input type="number" min="0" value={corrMonto} onChange={(e) => setCorrMonto(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Fecha de pago</label>
                <Input type="date" value={corrFecha} onChange={(e) => setCorrFecha(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Observaciones</label>
              <Textarea value={corrObservaciones} onChange={(e) => setCorrObservaciones(e.target.value)} rows={2} maxLength={300} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-humania-gray">Motivo de la corrección (obligatorio)</label>
              <Textarea value={corrMotivo} onChange={(e) => setCorrMotivo(e.target.value)} placeholder="Ej. Se registró como No pago por error, el conductor sí pagó." rows={2} />
            </div>
            {errorCorreccion && <p className="text-red-600 text-sm">{errorCorreccion}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => { setPagoACorregir(null); setErrorCorreccion('') }} disabled={corrigiendo} className="flex-1 rounded-none">
                Cancelar
              </Button>
              <Button type="button" onClick={confirmarCorreccion} disabled={corrigiendo} className="flex-1 rounded-none">
                {corrigiendo ? 'Guardando...' : 'Guardar corrección'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOGO: CORREGIR ABONO EXTRAORDINARIO */}
      <Dialog open={!!abonoACorregir} onOpenChange={(open) => { if (!open) { setAbonoACorregir(null); setErrorCorreccionAbono('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir abono extraordinario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              El valor anterior queda registrado de forma trazable. No se sobrescribe sin dejar rastro.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Fecha del abono</label>
                <Input type="date" value={corrFechaAbono} onChange={(e) => setCorrFechaAbono(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Valor del abono</label>
                <Input type="number" min="0" value={corrValorAbono} onChange={(e) => setCorrValorAbono(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Observaciones</label>
              <Textarea value={corrObservacionesAbono} onChange={(e) => setCorrObservacionesAbono(e.target.value)} rows={2} maxLength={300} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-humania-gray">Motivo de la corrección (obligatorio)</label>
              <Textarea value={corrMotivoAbono} onChange={(e) => setCorrMotivoAbono(e.target.value)} placeholder="Ej. Se registró un valor equivocado." rows={2} />
            </div>
            {errorCorreccionAbono && <p className="text-red-600 text-sm">{errorCorreccionAbono}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => { setAbonoACorregir(null); setErrorCorreccionAbono('') }} disabled={corrigiendoAbono} className="flex-1 rounded-none">
                Cancelar
              </Button>
              <Button type="button" onClick={confirmarCorreccionAbono} disabled={corrigiendoAbono} className="flex-1 rounded-none">
                {corrigiendoAbono ? 'Guardando...' : 'Guardar corrección'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOGO: ELIMINAR EVIDENCIA */}
      <Dialog open={!!evidenciaAEliminar} onOpenChange={(open) => { if (!open) { setEvidenciaAEliminar(null); setErrorEliminacion('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar evidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {evidenciaAEliminar?.url && (
              <img src={evidenciaAEliminar.url} alt="Evidencia a eliminar" className="w-full h-40 object-cover rounded-md border border-neutral-200" />
            )}
            <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
              Esta acción no se puede deshacer desde el panel: el archivo se eliminará de forma permanente. Quedará un registro de quién y cuándo la eliminó.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-humania-gray">Motivo de la eliminación (obligatorio)</label>
              <Textarea value={motivoEliminacion} onChange={(e) => setMotivoEliminacion(e.target.value)} placeholder="Ej. Se subió por error, foto duplicada..." rows={3} />
            </div>
            {errorEliminacion && <p className="text-red-600 text-sm">{errorEliminacion}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => { setEvidenciaAEliminar(null); setErrorEliminacion('') }} disabled={eliminando} className="flex-1 rounded-none">
                Cancelar
              </Button>
              <Button type="button" onClick={confirmarEliminacionEvidencia} disabled={eliminando} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-none">
                {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
