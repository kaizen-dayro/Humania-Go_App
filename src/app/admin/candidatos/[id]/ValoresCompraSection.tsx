'use client'

// KAI-128 — Valor de venta y aporte semanal del contrato (SDD
// `valores-compra-contrato`). Registro libre la primera vez; después cada
// cambio exige motivo y queda en el historial (D5). El acumulado y el saldo
// se calculan al leer con `calcularCompra` (D3, D4). La autoridad es la base
// de datos (migración 00083): aquí solo se anticipan validaciones.

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatearFechaAdmin } from '@/lib/format'
import { calcularCompra } from '@/lib/domain/contrato/compra'
import { getValoresCompra, guardarValoresCompra, type ValoresCompraHistorial } from './actions'

type Valores = { valor_venta: number | null; aporte_ahorro_semanal: number | null; aporte_bono_semanal: number | null }

const pesos = (v: number | null) => (v === null ? '—' : `$${v.toLocaleString('es-CO')}`)

export function ValoresCompraSection({
  candidatoId,
  assignmentId,
  soloLectura,
  ordinariasPagadas,
  totalAbonos,
}: {
  candidatoId: string
  assignmentId: string
  soloLectura: boolean
  ordinariasPagadas: number
  totalAbonos: number
}) {
  const [valores, setValores] = useState<Valores | null>(null)
  const [historial, setHistorial] = useState<ValoresCompraHistorial[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [editando, setEditando] = useState(false)
  const [valorVenta, setValorVenta] = useState('')
  const [ahorro, setAhorro] = useState('')
  const [bono, setBono] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const aplicar = useCallback((res: Awaited<ReturnType<typeof getValoresCompra>>) => {
    if (res.success) {
      setValores(res.valores)
      setHistorial(res.historial)
    } else {
      setError(res.error || 'No se pudieron cargar los valores de compra.')
    }
    setCargando(false)
  }, [])

  // Carga inicial: el estado se actualiza en el .then (no de forma síncrona en el efecto).
  useEffect(() => {
    let vigente = true
    getValoresCompra(assignmentId).then(res => { if (vigente) aplicar(res) })
    return () => { vigente = false }
  }, [assignmentId, aplicar])

  const registrados = valores?.valor_venta != null
  const compra = valores
    ? calcularCompra({
        valorVenta: valores.valor_venta,
        aporteAhorroSemanal: valores.aporte_ahorro_semanal,
        aporteBonoSemanal: valores.aporte_bono_semanal,
        ordinariasPagadas,
        totalAbonos,
      })
    : null

  function abrirEdicion() {
    setValorVenta(valores?.valor_venta != null ? String(valores.valor_venta) : '')
    setAhorro(valores?.aporte_ahorro_semanal != null ? String(valores.aporte_ahorro_semanal) : '')
    setBono(valores?.aporte_bono_semanal != null ? String(valores.aporte_bono_semanal) : '')
    setMotivo('')
    setError('')
    setEditando(true)
  }

  async function guardar() {
    setError('')
    if (valorVenta === '' || Number(valorVenta) <= 0) {
      setError('El valor de venta debe ser mayor que cero.')
      return
    }
    if (ahorro === '' || bono === '' || Number(ahorro) < 0 || Number(bono) < 0) {
      setError('El ahorro semanal y el bono semanal deben ser cero o mayores.')
      return
    }
    if (Number(ahorro) + Number(bono) <= 0) {
      setError('El aporte semanal (ahorro + bono) debe ser mayor que cero.')
      return
    }
    if (registrados && !motivo.trim()) {
      setError('Debes indicar el motivo del cambio.')
      return
    }
    setGuardando(true)
    const res = await guardarValoresCompra(candidatoId, assignmentId, Number(valorVenta), Number(ahorro), Number(bono), motivo)
    setGuardando(false)
    if (!res.success) {
      setError(res.error || 'No se pudieron guardar los valores de compra.')
      return
    }
    setEditando(false)
    aplicar(await getValoresCompra(assignmentId))
  }

  const mostrarFormulario = !soloLectura && (editando || (!cargando && !registrados))
  const aporteFormulario = (Number(ahorro) || 0) + (Number(bono) || 0)

  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Compra del vehículo</h4>
          <p className="text-xs text-humania-gray/70 mt-1">
            Valor de venta y aporte semanal pactados en el contrato. El acumulado suma las semanas ordinarias pagadas y los abonos extraordinarios; las aplazatorias, las semanas sin pago y el depósito inicial no suman.
          </p>
        </div>
        {!cargando && !registrados && (
          <span className="inline-block px-2 py-0.5 rounded border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
            Valores pendientes
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {compra && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
          {[
            ['Valor de venta', pesos(compra.valorVenta)],
            ['Aporte semanal', pesos(compra.aporteSemanal)],
            ['Ahorro semanal', pesos(valores!.aporte_ahorro_semanal)],
            ['Bono semanal', pesos(valores!.aporte_bono_semanal)],
            ['Ahorro acumulado', pesos(compra.acumuladoAhorro)],
            ['Bono acumulado', pesos(compra.acumuladoBono)],
            ['Abonos extraordinarios', pesos(compra.abonos)],
            ['Acumulado para la compra', pesos(compra.acumulado)],
            ['Saldo del valor de venta', pesos(compra.saldo)],
            ['Avance de la compra', `${Math.floor(compra.avance * 100)} %`],
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-xs font-medium text-humania-gray/60">{etiqueta}</dt>
              <dd className="font-semibold tabular-nums text-humania-blue">{valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {!soloLectura && registrados && !editando && (
        <button type="button" onClick={abrirEdicion} className="inline-flex items-center gap-1 text-humania-blue hover:text-humania-blue/80 text-xs font-medium cursor-pointer">
          <Pencil className="w-3.5 h-3.5" /> Cambiar valores
        </button>
      )}

      {mostrarFormulario && (
        <div className="space-y-4 bg-white border border-neutral-200 rounded-md p-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Valor de venta</label>
              <Input type="number" min="1" value={valorVenta} onChange={(e) => setValorVenta(e.target.value)} placeholder="Ej. 32000000" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Ahorro semanal</label>
              <Input type="number" min="0" value={ahorro} onChange={(e) => setAhorro(e.target.value)} placeholder="Ej. 90000" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Bono semanal</label>
              <Input type="number" min="0" value={bono} onChange={(e) => setBono(e.target.value)} placeholder="Ej. 120000" />
            </div>
          </div>
          <p className="text-xs text-humania-gray/70">Aporte semanal (ahorro + bono): {pesos(aporteFormulario)}</p>
          {registrados && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-humania-gray">Motivo del cambio (obligatorio)</label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
            </div>
          )}
          <div className="flex gap-3">
            <Button type="button" onClick={guardar} disabled={guardando} className="rounded-none">
              {guardando ? 'Guardando...' : 'Guardar valores de compra'}
            </Button>
            {editando && (
              <Button type="button" variant="outline" onClick={() => { setEditando(false); setError('') }} disabled={guardando} className="rounded-none">
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      {soloLectura && !cargando && !registrados && (
        <p className="text-sm text-humania-gray/70">No se registraron valores de compra para este contrato.</p>
      )}

      {historial.length > 0 && (
        <details className="text-xs text-humania-gray/70">
          <summary className="cursor-pointer font-medium text-humania-blue">Ver historial de cambios ({historial.length})</summary>
          <ul className="mt-2 space-y-2">
            {historial.map(h => (
              <li key={h.id} className="border-l-2 border-neutral-200 pl-3">
                {formatearFechaAdmin(h.registrado_en)} — {h.registrado_por_email}:{' '}
                {h.valor_venta_anterior === null
                  ? 'registro inicial'
                  : `antes ${pesos(h.valor_venta_anterior)} / ahorro ${pesos(h.aporte_ahorro_semanal_anterior)} / bono ${pesos(h.aporte_bono_semanal_anterior)}`}
                {' → '}
                {pesos(h.valor_venta_nuevo)} / ahorro {pesos(h.aporte_ahorro_semanal_nuevo)} / bono {pesos(h.aporte_bono_semanal_nuevo)}
                {h.motivo && <><br />Motivo: {h.motivo}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
