'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAsset } from '../../actions'
import { AlertCircle } from 'lucide-react'
import { capitalizarPalabras } from '@/lib/validation'
import { FotosActivo, type FotosActivoHandle } from '../[id]/editar/FotosActivo'

export default function FormNuevoActivo({ modelos }: { modelos: any[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fotosRef = useRef<FotosActivoHandle>(null)

  async function handleSubmit(formData: FormData) {
    const placa = (formData.get('placa') as string) || ''
    if (placa && placa.length !== 6) {
      setError('La placa debe tener exactamente 6 caracteres. En Colombia no existen placas con menos ni más caracteres.')
      return
    }

    setLoading(true)
    setError(null)

    const result = await createAsset(formData)

    if (!result.success || !result.id) {
      setError(result.error || 'Ocurrió un error inesperado')
      setLoading(false)
      return
    }

    if (fotosRef.current?.hayPendientes()) {
      const fotoResult = await fotosRef.current.confirmarPendientes(result.id)
      if (!fotoResult.success) {
        alert((fotoResult.error || 'No se pudieron subir las fotografías.') + '\n\nEl activo ya se creó correctamente. Te llevaremos a Editar para que puedas intentar subirlas de nuevo.')
        router.push(`/admin/activos/${result.id}/editar`)
        return
      }
    }

    router.push('/admin/activos')
  }

  return (
    <div className="space-y-8">
    <form id="form-nuevo-activo" action={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Modelo del Vehículo</Label>
        <select 
          name="modelo_id" 
          required
          className="flex h-12 w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="">Selecciona un modelo...</option>
          {modelos.map(m => (
            <option key={m.id} value={m.id}>
              {m.marcas_vehiculo?.nombre} {m.nombre} ({m.tipos_vehiculo?.nombre})
            </option>
          ))}
        </select>
        <p className="text-xs text-humania-gray/70">Para añadir más marcas o modelos, se habilitará posteriormente un módulo especial.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Placa (Opcional)</Label>
        <Input
          name="placa"
          placeholder="Ej. ABC123"
          maxLength={6}
          onChange={(e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
          }}
          className="rounded-none border-neutral-300 h-12 uppercase"
        />
        <p className="text-xs text-humania-gray/70">Ayuda al equipo humano de Humania a reconocer rápidamente el vehículo físico. Puede completarse después.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Color (Opcional)</Label>
        <Input
          name="color"
          placeholder="Ej. Rojo"
          onChange={(e) => {
            e.target.value = capitalizarPalabras(e.target.value)
          }}
          className="rounded-none border-neutral-300 h-12"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Vencimiento Tecnomecánica</Label>
          <Input type="date" name="vencimiento_tecnomecanica" className="rounded-none border-neutral-300 h-12" />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Vencimiento SOAT</Label>
          <Input type="date" name="vencimiento_soat" className="rounded-none border-neutral-300 h-12" />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Vencimiento Impuestos</Label>
          <Input type="date" name="vencimiento_impuestos" className="rounded-none border-neutral-300 h-12" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Estado Físico</Label>
        <textarea
          name="estado_fisico"
          required
          rows={3}
          placeholder="Ej. Rayón leve en el guardabarros derecho, llantas en buen estado"
          className="flex w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        />
        <p className="text-xs text-humania-gray/70">Información interna de condición del vehículo antes de ser entregado. No es visible para candidatos.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Código Interno</Label>
        <p className="h-12 flex items-center px-3 border border-neutral-200 bg-neutral-50 rounded-md text-humania-gray/70 text-sm">
          Se generará automáticamente al crear el activo (ej. ACT-000004)
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Estado Inicial</Label>
        <select
          name="estado"
          required
          defaultValue="DISPONIBLE"
          className="flex h-12 w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="DISPONIBLE">DISPONIBLE</option>
          <option value="RESERVADO">RESERVADO</option>
          <option value="EN_MANTENIMIENTO">EN_MANTENIMIENTO</option>
          <option value="NO_DISPONIBLE">NO_DISPONIBLE</option>
        </select>
      </div>
    </form>

      <div className="pt-4 border-t border-neutral-100">
        <FotosActivo activoId={null} diferir ref={fotosRef} />
        <p className="text-xs text-humania-gray/70 mt-3">Las fotografías seleccionadas aquí se suben automáticamente al confirmar la creación del activo.</p>
      </div>

      <div className="pt-4 flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/activos')}
          className="rounded-none px-6"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          form="form-nuevo-activo"
          disabled={loading}
          className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-8 shadow-sm"
        >
          {loading ? 'Creando...' : 'Crear Activo'}
        </Button>
      </div>
    </div>
  )
}
