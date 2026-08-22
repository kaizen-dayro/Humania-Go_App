'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createMarca } from '../../actions'
import { AlertCircle } from 'lucide-react'

export default function FormNuevaMarca() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const result = await createMarca(formData)

    if (!result.success) {
      setError(result.error || 'Ocurrió un error inesperado')
      setLoading(false)
    } else {
      router.push('/admin/marcas')
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
        <Label className="text-humania-gray font-medium">Nombre de la Marca</Label>
        <Input
          name="nombre"
          required
          placeholder="Ej. Yamaha"
          onChange={(e) => { e.target.value = e.target.value.toUpperCase() }}
          className="rounded-none border-neutral-300 h-12 uppercase"
        />
        <p className="text-xs text-humania-gray/70">No pueden existir dos marcas con el mismo nombre, sin importar mayúsculas o minúsculas.</p>
      </div>

      <div className="pt-4 flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/marcas')}
          className="rounded-none px-6"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-8 shadow-sm"
        >
          {loading ? 'Creando...' : 'Crear Marca'}
        </Button>
      </div>
    </form>
  )
}
