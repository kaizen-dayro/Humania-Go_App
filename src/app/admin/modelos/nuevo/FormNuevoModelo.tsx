'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createModelo } from '../../actions'
import { AlertCircle } from 'lucide-react'

export default function FormNuevoModelo({ marcas, tipos }: { marcas: any[], tipos: any[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const result = await createModelo(formData)

    if (!result.success) {
      setError(result.error || 'Ocurrió un error inesperado')
      setLoading(false)
    } else {
      router.push('/admin/modelos')
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Tipo de Vehículo</Label>
        <select
          name="tipo_id"
          required
          className="flex h-12 w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="">Selecciona un tipo...</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Marca</Label>
        <select
          name="marca_id"
          required
          className="flex h-12 w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand"
        >
          <option value="">Selecciona una marca...</option>
          {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}{!m.activo ? ' (inactiva)' : ''}</option>)}
        </select>
        <p className="text-xs text-humania-gray/70">Puedes crear un modelo para una marca inactiva; simplemente no estará disponible para activos nuevos hasta que la marca se reactive.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">Nombre del Modelo</Label>
        <Input name="nombre" required placeholder="Ej. XTZ 125" className="rounded-none border-neutral-300 h-12" />
        <p className="text-xs text-humania-gray/70">No pueden existir dos modelos con el mismo nombre para la misma marca, sin importar mayúsculas o minúsculas.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-humania-gray font-medium">URL de Imagen Predeterminada (Opcional)</Label>
        <Input name="image_url" placeholder="Ej. /assets/NuevoModelo.jpg" className="rounded-none border-neutral-300 h-12" />
        <p className="text-xs text-humania-gray/70">Se usará como imagen por defecto de los activos de este modelo que no tengan una fotografía propia.</p>
      </div>

      <div className="pt-4 flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/modelos')}
          className="rounded-none px-6"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-8 shadow-sm"
        >
          {loading ? 'Creando...' : 'Crear Modelo'}
        </Button>
      </div>
    </form>
  )
}
