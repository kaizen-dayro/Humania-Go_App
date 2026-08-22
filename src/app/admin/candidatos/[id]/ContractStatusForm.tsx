'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateContractStatus } from '../../actions'

const ESTATUS_TERMINALES: Record<string, string> = {
  'INCUMPLIÓ CONTRATO': 'El activo quedará nuevamente DISPONIBLE para nuevas oportunidades.',
  'TERMINACIÓN POR MUTUO ACUERDO': 'El activo quedará nuevamente DISPONIBLE para nuevas oportunidades.',
  'FINALIZÓ CONTRATO EXITOSAMENTE': 'El activo pasará a TRANSFERIDO de forma permanente y dejará el inventario de Humania Go. Esta acción no se puede deshacer desde este panel.',
}

type ActivoInfo = {
  codigo_interno: string
  placa?: string | null
  color?: string | null
  modelos_vehiculo?: { nombre?: string; marcas_vehiculo?: { nombre?: string } }
} | null

export function ContractStatusForm({
  candidatoId,
  estatus,
  activoAsignado,
  activosDisponibles
}: {
  candidatoId: string,
  estatus: string | null,
  activoAsignado: ActivoInfo,
  activosDisponibles: any[]
}) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  // Modo asignación (sin contrato activo todavía)
  // modeloSeleccionado agrupa por modelo (Marca — Modelo, sin repetir una
  // fila por cada unidad); activoSeleccionado es la unidad especifica
  // (determinada al elegir la placa, dentro de ese modelo).
  const [modeloSeleccionado, setModeloSeleccionado] = useState('')
  const [activoSeleccionado, setActivoSeleccionado] = useState('')
  const [motivoAsignacion, setMotivoAsignacion] = useState('')
  const [confirmandoAsignacion, setConfirmandoAsignacion] = useState(false)

  // Modo liberación/transferencia (contrato ACTIVO)
  const [nuevoEstatus, setNuevoEstatus] = useState('')
  const [motivoLiberacion, setMotivoLiberacion] = useState('')
  const [confirmandoLiberacion, setConfirmandoLiberacion] = useState(false)

  type GrupoModelo = { modeloId: string; label: string }
  const gruposModelo: GrupoModelo[] = Array.from(
    new Map<string, GrupoModelo>(
      activosDisponibles.map(a => [
        a.modelo_id,
        { modeloId: a.modelo_id, label: `${a.modelos_vehiculo?.marcas_vehiculo?.nombre} — ${a.modelos_vehiculo?.nombre}` },
      ])
    ).values()
  )
  const unidadesDelModelo = activosDisponibles.filter(a => a.modelo_id === modeloSeleccionado)

  const handleAsignar = async () => {
    setError('')
    if (!modeloSeleccionado) { setError('Selecciona un modelo.'); return }
    if (!activoSeleccionado) { setError('Confirma la placa del activo.'); return }
    if (!motivoAsignacion.trim()) { setError('El motivo es obligatorio.'); return }
    setLoading(true)
    const res = await updateContractStatus(candidatoId, 'ACTIVO', activoSeleccionado, motivoAsignacion)
    setLoading(false)
    setConfirmandoAsignacion(false)
    if (res.success) {
      setMsg('Activo asignado y contrato activado correctamente.')
    } else {
      setError(res.error || 'No fue posible asignar el activo.')
    }
  }

  const handleLiberar = async () => {
    setError('')
    if (!nuevoEstatus) { setError('Selecciona el nuevo estatus contractual.'); return }
    if (!motivoLiberacion.trim()) { setError('El motivo es obligatorio.'); return }
    setLoading(true)
    const res = await updateContractStatus(candidatoId, nuevoEstatus, null, motivoLiberacion)
    setLoading(false)
    setConfirmandoLiberacion(false)
    if (res.success) {
      setMsg('Estatus contractual actualizado correctamente.')
    } else {
      setError(res.error || 'No fue posible actualizar el estatus contractual.')
    }
  }

  const modeloTexto = (a: ActivoInfo) => a
    ? `${a.codigo_interno} — ${a.modelos_vehiculo?.marcas_vehiculo?.nombre ?? ''} ${a.modelos_vehiculo?.nombre ?? ''}`.trim()
      + (a.placa ? ` — Placa: ${a.placa}` : '')
    : ''

  // Texto informativo del activo al que el candidato aplico originalmente.
  // Solo tiene sentido mientras no exista un contrato activo todavia: una
  // vez se asigna un activo, candidatos.activo_id pasa a reflejar el
  // activo realmente asignado (que puede ser distinto al de la aplicacion
  // inicial), asi que este bloque no se usa fuera del modo de asignacion.
  const ofertaAplicadaTexto = (a: ActivoInfo) => {
    if (!a) return ''
    const marcaModelo = `${a.modelos_vehiculo?.marcas_vehiculo?.nombre ?? ''} ${a.modelos_vehiculo?.nombre ?? ''}`.trim()
    return [marcaModelo, a.color].filter(Boolean).join(' ')
      + (a.placa ? ` — Placa: ${a.placa}` : '')
  }

  const esTerminal = estatus && estatus !== 'ACTIVO'

  return (
    <div className="bg-white border border-humania-blue p-8 mt-6 rounded-lg shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-humania-blue"></div>
      <h3 className="text-sm font-bold text-humania-gray/50 border-b border-neutral-100 pb-3 mb-6 tracking-widest">ASIGNACIÓN Y CONTRATO</h3>

      {msg && <p className="text-sm font-medium text-green-700 mb-4">{msg}</p>}
      {error && <p className="text-sm font-medium text-red-600 mb-4">{error}</p>}

      {/* MODO: contrato terminado — todo solo lectura */}
      {esTerminal && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-humania-gray">Activo asignado (histórico)</label>
            <p className="h-12 flex items-center px-3 border border-neutral-200 bg-neutral-50 rounded-md text-humania-blue font-medium">
              {modeloTexto(activoAsignado) || 'No especificado'}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-humania-gray">Estatus Contractual</label>
            <p className="h-12 flex items-center px-3 border border-neutral-200 bg-neutral-50 rounded-md text-humania-blue font-medium">
              {estatus}
            </p>
          </div>
          <p className="md:col-span-2 text-xs text-humania-gray/70">
            Este contrato ya llegó a un estatus final y no puede modificarse desde el panel. Si existe un error administrativo, contacta al equipo técnico.
          </p>
        </div>
      )}

      {/* MODO: contrato ACTIVO — activo solo lectura, solo se puede liberar/transferir */}
      {estatus === 'ACTIVO' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-humania-gray">Activo Asignado</label>
            <p className="h-12 flex items-center px-3 border border-humania-sand bg-humania-sand/10 rounded-md text-humania-blue font-semibold">
              {modeloTexto(activoAsignado)}
            </p>
            <p className="text-xs text-humania-gray/70">
              El activo no puede cambiarse manualmente mientras el contrato esté activo. Para liberarlo, registra el resultado contractual abajo.
            </p>
          </div>

          {!confirmandoLiberacion ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-humania-gray">Nuevo Estatus Contractual</label>
                <Select value={nuevoEstatus} onValueChange={(v) => setNuevoEstatus(v || '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un resultado..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCUMPLIÓ CONTRATO">INCUMPLIÓ CONTRATO</SelectItem>
                    <SelectItem value="TERMINACIÓN POR MUTUO ACUERDO">TERMINACIÓN POR MUTUO ACUERDO</SelectItem>
                    <SelectItem value="FINALIZÓ CONTRATO EXITOSAMENTE">FINALIZÓ CONTRATO EXITOSAMENTE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-humania-gray">Motivo (Obligatorio)</label>
                <Textarea value={motivoLiberacion} onChange={(e) => setMotivoLiberacion(e.target.value)} placeholder="Describe el motivo de este cambio contractual" />
              </div>
              <div>
                <Button
                  disabled={!nuevoEstatus || !motivoLiberacion.trim() || loading}
                  onClick={() => setConfirmandoLiberacion(true)}
                  className="bg-humania-blue hover:bg-humania-blue/90"
                >
                  Guardar Cambios Contractuales
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-md space-y-4">
              <p className="text-sm text-amber-900 font-medium">
                ¿Confirmas cambiar el estatus contractual a <span className="font-bold">{nuevoEstatus}</span>?
              </p>
              <p className="text-sm text-amber-800">{ESTATUS_TERMINALES[nuevoEstatus]}</p>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setConfirmandoLiberacion(false)} disabled={loading}>Cancelar</Button>
                <Button onClick={handleLiberar} disabled={loading} className="bg-humania-blue hover:bg-humania-blue/90">
                  {loading ? 'Guardando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODO: sin contrato activo todavia — asignar activo */}
      {!estatus && (
        <div className="space-y-6">
          {activoAsignado && (
            <div className="flex items-start gap-3 p-4 bg-humania-blue/5 border border-humania-blue/20 rounded-md">
              <Info className="w-4 h-4 text-humania-blue shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-humania-blue/70 uppercase tracking-widest mb-1">Oferta Aplicada</p>
                <p className="text-sm text-humania-blue font-medium">{ofertaAplicadaTexto(activoAsignado)}</p>
                <p className="text-xs text-humania-gray/70 mt-1">Solo informativo: la oportunidad a la que aplicó este candidato desde el formulario inicial.</p>
              </div>
            </div>
          )}

          <p className="text-sm text-humania-gray">
            Selecciona el activo que se asignará formalmente a este candidato para activar el contrato.
          </p>

          {!confirmandoAsignacion ? (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-[1fr_auto] gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-humania-gray">Activo a Asignar</label>
                  <Select
                    value={modeloSeleccionado}
                    onValueChange={(v) => { setModeloSeleccionado(v || ''); setActivoSeleccionado('') }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un modelo disponible...">
                        {(value: string) => gruposModelo.find(g => g.modeloId === value)?.label || null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {gruposModelo.map(g => (
                        <SelectItem key={g.modeloId} value={g.modeloId}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {gruposModelo.length === 0 && (
                    <p className="text-xs text-amber-700">No hay activos DISPONIBLE en este momento.</p>
                  )}
                </div>

                <div className="space-y-2 sm:w-40">
                  <label className="text-sm font-medium text-humania-gray">Placa</label>
                  <Select
                    value={activoSeleccionado}
                    onValueChange={(v) => setActivoSeleccionado(v || '')}
                    disabled={!modeloSeleccionado}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={modeloSeleccionado ? 'Selecciona la placa...' : 'Selecciona un modelo primero'}>
                        {(value: string) => {
                          const u = unidadesDelModelo.find(a => a.id === value)
                          return u ? (u.placa || 'Sin placa registrada') : null
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesDelModelo.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.placa || 'Sin placa registrada'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-humania-gray">Motivo (Obligatorio)</label>
                <Textarea value={motivoAsignacion} onChange={(e) => setMotivoAsignacion(e.target.value)} placeholder="Ej. Candidato aprobado en entrevista final, cumple todos los requisitos" />
              </div>
              <div>
                <Button
                  disabled={!modeloSeleccionado || !activoSeleccionado || !motivoAsignacion.trim() || loading}
                  onClick={() => setConfirmandoAsignacion(true)}
                  className="bg-humania-blue hover:bg-humania-blue/90"
                >
                  Asignar Activo y Activar Contrato
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-md space-y-4">
              <p className="text-sm text-amber-900 font-medium">
                ¿Confirmas asignar este activo y activar el contrato de este candidato?
              </p>
              <p className="text-sm text-amber-800">El activo dejará de aparecer como oportunidad disponible para otros candidatos.</p>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setConfirmandoAsignacion(false)} disabled={loading}>Cancelar</Button>
                <Button onClick={handleAsignar} disabled={loading} className="bg-humania-blue hover:bg-humania-blue/90">
                  {loading ? 'Guardando...' : 'Confirmar Asignación'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
