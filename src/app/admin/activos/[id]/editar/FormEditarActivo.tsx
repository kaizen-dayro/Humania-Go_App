'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAsset } from '../../../actions'
import { AlertCircle } from 'lucide-react'
import { FotosActivo, type FotosActivoHandle } from './FotosActivo'
import { ALPHANUMERIC_NO_SPACES, capitalizarPalabras } from '@/lib/validation'
import { evaluarVencimiento, diasHastaVencimiento, type EstadoVencimiento } from '@/lib/domain/vencimientosActivos'

// Fase 21 (2026-08-26): alerta sutil de vencimiento -- mismo criterio de
// colores (OK/PROXIMO/URGENTE/VENCIDO) que la tarjeta del Dashboard, ver
// web/src/lib/domain/vencimientosActivos.ts.
const ESTILO_VENCIMIENTO: Record<EstadoVencimiento, { texto: string; clase: string }> = {
  OK: { texto: 'Vigente', clase: 'text-humania-gray/50' },
  PROXIMO: { texto: 'Vence pronto', clase: 'text-amber-600' },
  URGENTE: { texto: 'Vence pronto', clase: 'text-orange-600 font-semibold' },
  VENCIDO: { texto: 'Vencido', clase: 'text-red-600 font-semibold' },
  SIN_REGISTRAR: { texto: '', clase: '' },
}

function VencimientoBadge({ fecha }: { fecha: string | null | undefined }) {
  const estado = evaluarVencimiento(fecha)
  if (estado === 'OK' || estado === 'SIN_REGISTRAR') return null
  const dias = diasHastaVencimiento(fecha as string)
  const { texto, clase } = ESTILO_VENCIMIENTO[estado]
  const detalle = dias < 0 ? `hace ${Math.abs(dias)} día(s)` : dias === 0 ? 'hoy' : `en ${dias} día(s)`
  return (
    <p className={`text-xs mt-1 ${clase}`}>
      {texto} — {detalle}
    </p>
  )
}

const CAMPOS_CONFIRMABLES: { key: string; label: string }[] = [
  { key: 'placa', label: 'Placa' },
  { key: 'color', label: 'Color' },
  { key: 'vencimiento_tecnomecanica', label: 'Vencimiento Tecnomecánica' },
  { key: 'vencimiento_soat', label: 'Vencimiento SOAT' },
  { key: 'vencimiento_impuestos', label: 'Vencimiento Impuestos' },
]

// KAI-28: en modo bloqueado (ASIGNADO/TRANSFERIDO) solo placa/color NO se
// envían -- lista separada para no mostrar un falso "cambio a vacío" de
// esos dos campos en la pantalla de confirmación.
const CAMPOS_CONFIRMABLES_BLOQUEADO: { key: string; label: string }[] = [
  { key: 'vencimiento_tecnomecanica', label: 'Vencimiento Tecnomecánica' },
  { key: 'vencimiento_soat', label: 'Vencimiento SOAT' },
  { key: 'vencimiento_impuestos', label: 'Vencimiento Impuestos' },
]

export default function FormEditarActivo({ activo, candidatoAsignado }: { activo: any, candidatoAsignado?: { id: string, nombres: string, apellidos: string, telefono?: string } | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const original = {
    placa: activo.placa || '',
    color: activo.color || '',
    vencimiento_tecnomecanica: activo.vencimiento_tecnomecanica || '',
    vencimiento_soat: activo.vencimiento_soat || '',
    vencimiento_impuestos: activo.vencimiento_impuestos || '',
  }

  const [formValues, setFormValues] = useState({
    ...original,
    codigo_interno: activo.codigo_interno,
    estado: activo.estado,
    estado_fisico: activo.estado_fisico || '',
  })

  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)
  const [changes, setChanges] = useState<{ label: string; before: string; after: string }[]>([])
  const fotosRef = useRef<FotosActivoHandle>(null)

  // KAI-28: ya no es "solo lectura" total -- en este modo, Vencimiento
  // Tecnomecánica/SOAT/Impuestos y Estado Físico siguen editables; el
  // resto (placa, color, estado) permanece bloqueado.
  const bloqueado = activo.estado === 'ASIGNADO' || activo.estado === 'TRANSFERIDO'

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    if (name === 'placa') {
      const soloPlaca = value.toUpperCase().slice(0, 6)
      if (!ALPHANUMERIC_NO_SPACES.test(soloPlaca)) return
      setFormValues(prev => ({ ...prev, placa: soloPlaca }))
      return
    }
    if (name === 'color') {
      const input = e.target as HTMLInputElement
      const cursorPos = input.selectionStart
      setFormValues(prev => ({ ...prev, color: capitalizarPalabras(value) }))
      requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
      return
    }
    if (name === 'estado_fisico') {
      // Fase 13 (Documento 17/18): letras, espacios y puntuacion basica
      // (ampliado 2026-08-24 a pedido de QA), capitalizado palabra por
      // palabra, mismo mecanismo que el trigger de Postgres (supabase/00030,00035).
      const input = e.target as HTMLTextAreaElement
      const cursorPos = input.selectionStart
      const stripped = value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s.,;:¿?¡!'"-]/g, '')
      setFormValues(prev => ({ ...prev, estado_fisico: capitalizarPalabras(stripped) }))
      requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
      return
    }
    setFormValues(prev => ({ ...prev, [name]: value }))
  }

  function handleInitialSubmit(formData: FormData) {
    if (!bloqueado && formValues.placa && formValues.placa.length !== 6) {
      setError('La placa debe tener exactamente 6 caracteres. En Colombia no existen placas con menos ni más caracteres.')
      return
    }
    if (formValues.estado_fisico.trim().length < 10) {
      setError('El Estado Físico debe tener al menos 10 caracteres.')
      return
    }

    const camposConfirmables = bloqueado ? CAMPOS_CONFIRMABLES_BLOQUEADO : CAMPOS_CONFIRMABLES
    const cambios = camposConfirmables
      .map(({ key, label }) => {
        const before = (original as any)[key] || '(vacío)'
        const after = (formData.get(key) as string) || '(vacío)'
        return before !== after ? { label, before, after } : null
      })
      .filter(Boolean) as { label: string; before: string; after: string }[]

    if (cambios.length > 0) {
      setChanges(cambios)
      setPendingFormData(formData)
      return
    }

    executeUpdate(formData)
  }

  async function executeUpdate(formData: FormData) {
    setLoading(true)
    setError(null)

    const result = await updateAsset(activo.id, formData)

    if (!result.success) {
      setError(result.error || 'Ocurrió un error inesperado al guardar')
      setLoading(false)
      setPendingFormData(null)
      return
    }

    if (fotosRef.current?.hayPendientes()) {
      const fotoResult = await fotosRef.current.confirmarPendientes()
      if (!fotoResult.success) {
        setError(fotoResult.error || 'Los datos se guardaron, pero no se pudieron subir todas las fotografías. Intenta guardar de nuevo.')
        setLoading(false)
        setPendingFormData(null)
        return
      }
    }

    router.push('/admin/activos')
  }

  // ================= MODO CONFIRMACIÓN =================
  // (se evalúa primero: sirve tanto al modo bloqueado como al de edición
  // completa, sin cambios estructurales -- KAI-28)
  if (pendingFormData) {
    return (
      <div className="space-y-6">
        <h3 className="text-xl font-bold text-humania-blue">Confirmar cambios del activo</h3>
        <p className="text-sm text-humania-gray">Verifica que la información sea correcta antes de continuar.</p>

        <div className="border border-amber-200 bg-amber-50 rounded-md divide-y divide-amber-100">
          {changes.map(c => (
            <div key={c.label} className="p-4 flex justify-between items-center text-sm">
              <span className="font-semibold text-humania-blue">{c.label}</span>
              <span className="text-humania-gray">{c.before} <span className="mx-2 text-amber-600 font-bold">&rarr;</span> {c.after}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <Button type="button" variant="outline" onClick={() => setPendingFormData(null)} disabled={loading} className="rounded-none px-6">
            Cancelar
          </Button>
          <Button type="button" onClick={() => executeUpdate(pendingFormData)} disabled={loading} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-8">
            {loading ? 'Guardando...' : 'Confirmar cambios'}
          </Button>
        </div>
      </div>
    )
  }

  // ================= MODO EDICIÓN PARCIAL (ASIGNADO / TRANSFERIDO) =================
  // KAI-28: solo Vencimiento Tecnomecánica/SOAT/Impuestos y Estado Físico
  // son editables aquí -- placa, color y estado de operación se muestran
  // como solo lectura, igual que antes de esta funcionalidad.
  if (bloqueado) {
    const Row = ({ label, value, vencimiento }: { label: string; value: string | null | undefined; vencimiento?: boolean }) => (
      <div className="space-y-1">
        <p className="text-xs font-bold text-humania-gray/50 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-medium text-humania-blue">{value || '—'}</p>
        {vencimiento && <VencimientoBadge fecha={value} />}
      </div>
    )

    return (
      <div className="space-y-8">
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-md flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-humania-gray shrink-0" />
          <p className="text-sm text-humania-gray">
            Este activo está <span className="font-bold">{activo.estado}</span>. La placa, el color y el estado de operación
            se gestionan automáticamente desde el flujo contractual del candidato y no se pueden editar aquí — pero sí puedes
            actualizar sus fechas de vencimiento y el estado físico, ya que estos datos cambian durante la vida del contrato.
          </p>
        </div>

        {activo.estado === 'ASIGNADO' && (
          <div className="p-4 border border-humania-blue/30 bg-humania-blue/5 rounded-md">
            <p className="text-xs font-bold text-humania-blue/70 uppercase tracking-widest mb-1">Candidato Asignado</p>
            {candidatoAsignado ? (
              <Link href={`/admin/candidatos/${candidatoAsignado.id}`} className="text-sm font-semibold text-humania-blue hover:underline">
                {candidatoAsignado.nombres} {candidatoAsignado.apellidos}
                {candidatoAsignado.telefono ? ` — ${candidatoAsignado.telefono}` : ''}
              </Link>
            ) : (
              <p className="text-sm text-humania-gray">No se encontró un candidato relacionado. Revisa la consistencia de esta asignación.</p>
            )}
          </div>
        )}

        <form id="form-editar-activo-bloqueado" action={handleInitialSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <Row label="Código Interno" value={activo.codigo_interno} />
            <Row label="Estado de Operación" value={activo.estado} />
            <Row label="Placa" value={activo.placa} />
            <Row label="Color" value={activo.color} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Vencimiento Tecnomecánica</Label>
              <Input type="date" name="vencimiento_tecnomecanica" value={formValues.vencimiento_tecnomecanica} onChange={handleChange} className="rounded-none border-neutral-300 h-12" />
              <VencimientoBadge fecha={formValues.vencimiento_tecnomecanica} />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Vencimiento SOAT</Label>
              <Input type="date" name="vencimiento_soat" value={formValues.vencimiento_soat} onChange={handleChange} className="rounded-none border-neutral-300 h-12" />
              <VencimientoBadge fecha={formValues.vencimiento_soat} />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Vencimiento Impuestos</Label>
              <Input type="date" name="vencimiento_impuestos" value={formValues.vencimiento_impuestos} onChange={handleChange} className="rounded-none border-neutral-300 h-12" />
              <VencimientoBadge fecha={formValues.vencimiento_impuestos} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-humania-gray font-medium">Estado Físico</Label>
            <textarea
              name="estado_fisico"
              required
              rows={3}
              maxLength={111}
              value={formValues.estado_fisico}
              onChange={handleChange}
              placeholder="Ej. Rayón leve en el guardabarros, llantas en buen estado (mínimo 10 caracteres)"
              className="flex w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
            />
            <p className="text-xs text-humania-gray/70">Cada cambio queda registrado en el historial del activo (fecha, hora y usuario).</p>
          </div>
        </form>

        <div className="pt-8 border-t border-neutral-100">
          <FotosActivo activoId={activo.id} />
        </div>

        <div className="pt-8 border-t border-neutral-100 flex gap-4">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/activos')} className="rounded-none px-6">
            Cancelar
          </Button>
          <Button type="submit" form="form-editar-activo-bloqueado" disabled={loading} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-8 shadow-sm">
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>
    )
  }

  // ================= MODO EDICIÓN NORMAL =================
  return (
    <div className="space-y-8">
    <form id="form-editar-activo" action={handleInitialSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Código Interno</Label>
        <p className="h-12 flex items-center px-3 border border-neutral-200 bg-neutral-50 rounded-md text-humania-blue font-medium">
          {activo.codigo_interno}
        </p>
        <p className="text-xs text-humania-gray/70">El código interno es permanente y no puede modificarse.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Placa (Opcional)</Label>
        <Input name="placa" value={formValues.placa} onChange={handleChange} placeholder="Ej. ABC123" maxLength={6} className="rounded-none border-neutral-300 h-12 uppercase" />
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Color (Opcional)</Label>
        <Input name="color" value={formValues.color} onChange={handleChange} placeholder="Ej. Rojo" className="rounded-none border-neutral-300 h-12" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Vencimiento Tecnomecánica</Label>
          <Input type="date" name="vencimiento_tecnomecanica" value={formValues.vencimiento_tecnomecanica} onChange={handleChange} className="rounded-none border-neutral-300 h-12" />
          <VencimientoBadge fecha={formValues.vencimiento_tecnomecanica} />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Vencimiento SOAT</Label>
          <Input type="date" name="vencimiento_soat" value={formValues.vencimiento_soat} onChange={handleChange} className="rounded-none border-neutral-300 h-12" />
          <VencimientoBadge fecha={formValues.vencimiento_soat} />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Vencimiento Impuestos</Label>
          <Input type="date" name="vencimiento_impuestos" value={formValues.vencimiento_impuestos} onChange={handleChange} className="rounded-none border-neutral-300 h-12" />
          <VencimientoBadge fecha={formValues.vencimiento_impuestos} />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Estado Físico</Label>
        <textarea
          name="estado_fisico"
          required
          rows={3}
          maxLength={111}
          value={formValues.estado_fisico}
          onChange={handleChange}
          placeholder="Ej. Rayón leve en el guardabarros, llantas en buen estado (mínimo 10 caracteres)"
          className="flex w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        />
        <p className="text-xs text-humania-gray/70">Cada cambio queda registrado en el historial del activo (fecha, hora y usuario).</p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Estado de Operación</Label>
        <select
          name="estado"
          required
          value={formValues.estado}
          onChange={handleChange}
          className="flex h-12 w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="DISPONIBLE">DISPONIBLE</option>
          <option value="RESERVADO">RESERVADO</option>
          <option value="EN_MANTENIMIENTO">EN_MANTENIMIENTO</option>
          <option value="NO_DISPONIBLE">NO_DISPONIBLE</option>
        </select>
        <p className="text-xs text-humania-gray/70">Solo los activos en estado DISPONIBLE pueden recibir nuevas aplicaciones. Los estados ASIGNADO y TRANSFERIDO se gestionan automáticamente desde el flujo contractual del candidato, no se pueden establecer manualmente aquí.</p>
      </div>

    </form>

      <div className="pt-8 border-t border-neutral-100">
        <FotosActivo activoId={activo.id} diferir ref={fotosRef} />
      </div>

      <div className="pt-8 border-t border-neutral-100 flex gap-4">
        <Button type="button" variant="outline" onClick={() => router.push('/admin/activos')} className="rounded-none px-6">
          Cancelar
        </Button>
        <Button type="submit" form="form-editar-activo" disabled={loading} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-8 shadow-sm">
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </div>
  )
}
