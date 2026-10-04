'use client'

// KAI-122 — Depósito inicial del contrato (SDD `plazo-contrato-deposito`,
// spec.md R11-R16 y textos aprobados de la Sección 11). Un depósito por
// contrato; corrección con motivo; comprobante en el bucket pagos-evidencia
// (mismo flujo que la evidencia de los pagos semanales). La autoridad es la
// base de datos (migración 00081): aquí solo se anticipan validaciones.

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ImageIcon, Pencil, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { formatearFechaAdmin, formatearSoloFecha } from '@/lib/format'
import { fechaBogota } from '@/lib/domain/contrato/plazo'
import {
  registrarDeposito,
  corregirDeposito,
  registrarDepositoEvidencia,
  eliminarDepositoEvidencia,
  getDeposito,
  type DepositoContrato,
} from './actions'

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']
const TAMANO_MAXIMO = 5 * 1024 * 1024 // 5MB, igual que el bucket pagos-evidencia

type Comprobante = DepositoContrato['evidencia'][number]

// Fecha de hoy en Bogotá (YYYY-MM-DD). `toISOString()` daría la fecha UTC,
// que después de las 19:00 de Bogotá ya es el día siguiente.
function hoy() {
  return fechaBogota(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
}

export function DepositoInicialSection({
  candidatoId,
  assignmentId,
  soloLectura,
}: {
  candidatoId: string
  assignmentId: string
  soloLectura: boolean
}) {
  const [deposito, setDeposito] = useState<DepositoContrato | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [valor, setValor] = useState('')
  const [fechaPago, setFechaPago] = useState(hoy)
  const [finalidad, setFinalidad] = useState('')
  const [registrando, setRegistrando] = useState(false)

  const [corrigiendoAbierto, setCorrigiendoAbierto] = useState(false)
  const [corrValor, setCorrValor] = useState('')
  const [corrFecha, setCorrFecha] = useState('')
  const [corrFinalidad, setCorrFinalidad] = useState('')
  const [corrMotivo, setCorrMotivo] = useState('')
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [errorCorreccion, setErrorCorreccion] = useState('')

  const [subiendo, setSubiendo] = useState(false)
  const [comprobanteAEliminar, setComprobanteAEliminar] = useState<Comprobante | null>(null)
  const [motivoEliminacion, setMotivoEliminacion] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminacion, setErrorEliminacion] = useState('')

  const cargar = useCallback(async () => {
    const res = await getDeposito(assignmentId)
    if (res.success) {
      setDeposito(res.deposito)
    } else {
      setError(res.error || 'No se pudo cargar el depósito.')
    }
    setCargando(false)
  }, [assignmentId])

  // Carga inicial: el estado se actualiza en el .then (no de forma
  // síncrona dentro del efecto). `cargar` se usa para recargar tras cada acción.
  useEffect(() => {
    let vigente = true
    getDeposito(assignmentId).then(res => {
      if (!vigente) return
      if (res.success) setDeposito(res.deposito)
      else setError(res.error || 'No se pudo cargar el depósito.')
      setCargando(false)
    })
    return () => { vigente = false }
  }, [assignmentId])

  async function registrar() {
    setError('')
    if (valor === '' || Number(valor) <= 0) {
      setError('El valor del depósito debe ser mayor que cero.')
      return
    }
    if (!fechaPago) {
      setError('Debes indicar la fecha de pago del depósito.')
      return
    }
    if (!finalidad.trim()) {
      setError('Debes indicar la finalidad y condiciones del depósito.')
      return
    }
    setRegistrando(true)
    const res = await registrarDeposito(candidatoId, assignmentId, Number(valor), fechaPago, finalidad)
    setRegistrando(false)
    if (!res.success) {
      setError(res.error || 'No se pudo registrar el depósito.')
      return
    }
    setValor('')
    setFinalidad('')
    setFechaPago(hoy())
    await cargar()
  }

  function abrirCorreccion() {
    if (!deposito) return
    setCorrValor(String(deposito.valor))
    setCorrFecha(deposito.fecha_pago)
    setCorrFinalidad(deposito.finalidad_condiciones)
    setCorrMotivo('')
    setErrorCorreccion('')
    setCorrigiendoAbierto(true)
  }

  async function confirmarCorreccion() {
    if (!deposito) return
    if (!corrMotivo.trim()) {
      setErrorCorreccion('Debes indicar el motivo de la corrección.')
      return
    }
    if (corrValor === '' || Number(corrValor) <= 0) {
      setErrorCorreccion('El valor del depósito debe ser mayor que cero.')
      return
    }
    setCorrigiendo(true)
    setErrorCorreccion('')
    const res = await corregirDeposito(candidatoId, deposito.id, Number(corrValor), corrFecha, corrFinalidad, corrMotivo)
    setCorrigiendo(false)
    if (!res.success) {
      setErrorCorreccion(res.error || 'No se pudo corregir el depósito.')
      return
    }
    setCorrigiendoAbierto(false)
    await cargar()
  }

  async function subirComprobante(file: File) {
    if (!deposito) return
    setError('')
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP.')
      return
    }
    if (file.size > TAMANO_MAXIMO) {
      setError('La imagen no puede superar los 5MB.')
      return
    }
    setSubiendo(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${assignmentId}/deposito/${deposito.id}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('pagos-evidencia').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) {
      console.error('Error subiendo comprobante del depósito a Storage:', uploadError)
      setError(uploadError.message || 'No se pudo subir el comprobante.')
      setSubiendo(false)
      return
    }
    const res = await registrarDepositoEvidencia(candidatoId, deposito.id, path, '')
    setSubiendo(false)
    if (!res.success) {
      setError(res.error || 'No se pudo registrar el comprobante.')
      return
    }
    await cargar()
  }

  async function confirmarEliminacion() {
    if (!comprobanteAEliminar) return
    if (!motivoEliminacion.trim()) {
      setErrorEliminacion('Debes indicar el motivo de la eliminación.')
      return
    }
    setEliminando(true)
    setErrorEliminacion('')
    const res = await eliminarDepositoEvidencia(candidatoId, comprobanteAEliminar.id, motivoEliminacion.trim())
    setEliminando(false)
    if (!res.success) {
      setErrorEliminacion(res.error || 'No se pudo eliminar el comprobante.')
      return
    }
    setComprobanteAEliminar(null)
    setMotivoEliminacion('')
    await cargar()
  }

  return (
    <div className="p-4 bg-white border border-neutral-200 rounded-lg space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Depósito inicial</h4>
          <p className="text-xs text-humania-gray/70 mt-1">
            Depósito pactado al entregar el vehículo (Cláusula Décima Séptima del contrato). No sustituye el ahorro ni el bono contractual de compra.
          </p>
        </div>
        {!cargando && !deposito && (
          <span className="inline-block px-2 py-0.5 rounded border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
            Depósito pendiente
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {cargando ? null : deposito ? (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium text-humania-gray/60">Valor del depósito</p>
              <p className="tabular-nums font-semibold">${deposito.valor.toLocaleString('es-CO')}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-humania-gray/60">Fecha de pago</p>
              <p>{formatearSoloFecha(deposito.fecha_pago) || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-humania-gray/60">Registrado por</p>
              <p className="text-xs text-humania-gray/70">{deposito.registrado_por_email} — {formatearFechaAdmin(deposito.created_at)}</p>
            </div>
            <div className="sm:col-span-3">
              <p className="text-xs font-medium text-humania-gray/60">Finalidad y condiciones</p>
              <p className="whitespace-pre-line text-humania-gray/90">{deposito.finalidad_condiciones}</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-humania-gray/60">Comprobante</p>
            <div className="flex flex-wrap gap-2">
              {deposito.evidencia.map(ev => (
                <div key={ev.id} className="relative group w-14 h-14 border border-neutral-200 rounded overflow-hidden">
                  {ev.url ? (
                    // URL firmada de 300 s de un bucket privado: next/image la optimizaría y cachearía.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.url} alt={ev.descripcion || 'Comprobante'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-neutral-100 flex items-center justify-center text-neutral-400">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                  )}
                  {!soloLectura && (
                    <button
                      type="button"
                      onClick={() => { setComprobanteAEliminar(ev); setMotivoEliminacion(''); setErrorEliminacion('') }}
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
                    id="input-comprobante-deposito"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={subiendo}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) subirComprobante(file)
                      e.target.value = ''
                    }}
                    className="sr-only"
                  />
                  <label
                    htmlFor="input-comprobante-deposito"
                    className={`w-14 h-14 flex items-center justify-center border border-dashed border-neutral-300 rounded text-neutral-400 hover:border-humania-blue hover:text-humania-blue transition-colors ${subiendo ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    aria-label="Subir evidencia"
                  >
                    <Upload className="w-4 h-4" />
                  </label>
                </>
              )}
            </div>
          </div>

          {!soloLectura && (
            <button type="button" onClick={abrirCorreccion} className="inline-flex items-center gap-1 text-humania-blue hover:text-humania-blue/80 text-xs font-medium cursor-pointer">
              <Pencil className="w-3.5 h-3.5" /> Corregir depósito
            </button>
          )}

          {deposito.correcciones.length > 0 && (
            <details className="text-xs text-humania-gray/70">
              <summary className="cursor-pointer font-medium text-humania-blue">Ver historial de cambios ({deposito.correcciones.length})</summary>
              <ul className="mt-2 space-y-2">
                {deposito.correcciones.map(c => (
                  <li key={c.id} className="border-l-2 border-neutral-200 pl-3">
                    {formatearFechaAdmin(c.corregido_en)} — {c.corregido_por_email}: ${c.valor_anterior.toLocaleString('es-CO')}, {formatearSoloFecha(c.fecha_pago_anterior)}, {c.finalidad_condiciones_anterior}
                    <br />Motivo: {c.motivo_correccion}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : !soloLectura ? (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Valor del depósito</label>
              <Input type="number" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Fecha de pago</label>
              <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <label className="text-xs font-medium text-humania-gray">Finalidad y condiciones</label>
              <Textarea value={finalidad} onChange={(e) => setFinalidad(e.target.value)} rows={2} maxLength={1000} />
            </div>
          </div>
          <Button type="button" onClick={registrar} disabled={registrando} className="rounded-none">
            {registrando ? 'Registrando...' : 'Registrar depósito'}
          </Button>
        </div>
      ) : null}

      {/* DIALOGO: CORREGIR DEPOSITO */}
      <Dialog open={corrigiendoAbierto} onOpenChange={(open) => { if (!open) { setCorrigiendoAbierto(false); setErrorCorreccion('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corregir depósito</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              El valor anterior queda registrado de forma trazable. No se sobrescribe sin dejar rastro.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Valor del depósito</label>
                <Input type="number" min="0" value={corrValor} onChange={(e) => setCorrValor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-humania-gray">Fecha de pago</label>
                <Input type="date" value={corrFecha} onChange={(e) => setCorrFecha(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Finalidad y condiciones</label>
              <Textarea value={corrFinalidad} onChange={(e) => setCorrFinalidad(e.target.value)} rows={2} maxLength={1000} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-humania-gray">Motivo de la corrección</label>
              <Textarea value={corrMotivo} onChange={(e) => setCorrMotivo(e.target.value)} rows={2} />
            </div>
            {errorCorreccion && <p className="text-red-600 text-sm">{errorCorreccion}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => { setCorrigiendoAbierto(false); setErrorCorreccion('') }} disabled={corrigiendo} className="flex-1 rounded-none">
                Cancelar
              </Button>
              <Button type="button" onClick={confirmarCorreccion} disabled={corrigiendo} className="flex-1 rounded-none">
                {corrigiendo ? 'Guardando...' : 'Guardar corrección'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOGO: ELIMINAR COMPROBANTE (mismos textos aprobados que la evidencia de pagos) */}
      <Dialog open={!!comprobanteAEliminar} onOpenChange={(open) => { if (!open) { setComprobanteAEliminar(null); setErrorEliminacion('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar evidencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {comprobanteAEliminar?.url && (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración (bucket privado)
              <img src={comprobanteAEliminar.url} alt="Evidencia a eliminar" className="w-full h-40 object-cover rounded-md border border-neutral-200" />
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
              <Button type="button" variant="outline" onClick={() => { setComprobanteAEliminar(null); setErrorEliminacion('') }} disabled={eliminando} className="flex-1 rounded-none">
                Cancelar
              </Button>
              <Button type="button" onClick={confirmarEliminacion} disabled={eliminando} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-none">
                {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
