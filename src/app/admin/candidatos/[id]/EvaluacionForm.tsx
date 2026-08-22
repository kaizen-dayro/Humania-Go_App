'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveCandidatoEvaluacion } from '@/app/admin/actions'

export function EvaluacionForm({ candidatoId, existingData }: { candidatoId: string, existingData?: any }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [hasSaved, setHasSaved] = useState(!!existingData?.id)
  const [formData, setFormData] = useState({
    edad: existingData?.edad?.toString() || '',
    estado_civil: existingData?.estado_civil || '',
    tiene_hijos: existingData?.tiene_hijos === true ? 'true' : existingData?.tiene_hijos === false ? 'false' : '',
    cantidad_hijos: existingData?.cantidad_hijos?.toString() || '',
    con_quien_vive: existingData?.con_quien_vive || '',
    tiene_conyuge: existingData?.tiene_conyuge === true ? 'true' : existingData?.tiene_conyuge === false ? 'false' : '',
    tiene_hermanos: existingData?.tiene_hermanos === true ? 'true' : existingData?.tiene_hermanos === false ? 'false' : '',
    cantidad_hermanos: existingData?.cantidad_hermanos?.toString() || '',
    personas_dependientes: existingData?.personas_dependientes?.toString() || '',
    descripcion_responsabilidades: existingData?.descripcion_responsabilidades || ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSelectChange = (name: string, value: string | null) => {
    setFormData(prev => ({ ...prev, [name]: value || '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const res = await saveCandidatoEvaluacion(candidatoId, formData)
    setLoading(false)
    if (res.error) {
      setMessage(`Error: ${res.error}`)
    } else {
      setMessage('Información guardada exitosamente.')
      setHasSaved(true)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Edad</Label>
          <Input name="edad" type="number" min="18" max="99" value={formData.edad} onChange={handleChange} />
        </div>

        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Estado Civil</Label>
          <Select value={formData.estado_civil} onValueChange={(v) => handleSelectChange('estado_civil', v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Soltero/a">Soltero/a</SelectItem>
              <SelectItem value="Casado/a">Casado/a</SelectItem>
              <SelectItem value="Unión Libre">Unión Libre</SelectItem>
              <SelectItem value="Separado/a o Divorciado/a">Separado/a o Divorciado/a</SelectItem>
              <SelectItem value="Viudo/a">Viudo/a</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">¿Tiene Hijos?</Label>
          <Select value={formData.tiene_hijos} onValueChange={(v) => handleSelectChange('tiene_hijos', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar...">
                {(value: string) => value === 'true' ? 'Sí' : value === 'false' ? 'No' : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Sí</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.tiene_hijos === 'true' && (
          <div className="space-y-2">
            <Label className="text-humania-gray font-medium">Cantidad de Hijos</Label>
            <Input name="cantidad_hijos" type="number" min="1" max="20" value={formData.cantidad_hijos} onChange={handleChange} />
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">¿Con quién vive actualmente?</Label>
          <Select value={formData.con_quien_vive} onValueChange={(v) => handleSelectChange('con_quien_vive', v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Solo">Solo</SelectItem>
              <SelectItem value="Con padres">Con padres</SelectItem>
              <SelectItem value="Con pareja/cónyuge">Con pareja/cónyuge</SelectItem>
              <SelectItem value="Con hijos">Con hijos</SelectItem>
              <SelectItem value="Con pareja e hijos">Con pareja e hijos</SelectItem>
              <SelectItem value="Con otros familiares">Con otros familiares</SelectItem>
              <SelectItem value="Otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">¿Personas que dependen económicamente?</Label>
          <Input name="personas_dependientes" type="number" min="0" max="20" value={formData.personas_dependientes} onChange={handleChange} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="text-humania-gray font-medium">Descripción breve de responsabilidades familiares / económicas</Label>
          <Textarea 
            name="descripcion_responsabilidades" 
            placeholder="Ej. Madre, hijos..."
            value={formData.descripcion_responsabilidades} 
            onChange={handleChange} 
            rows={3}
          />
        </div>

      </div>

      <div className="flex items-center gap-4 border-t pt-6">
        {hasSaved ? (
          <Button type="submit" disabled={loading} variant="outline" size="sm" className="text-humania-gray font-normal">
            Actualizar Evaluación
          </Button>
        ) : (
          <Button type="submit" disabled={loading} className="bg-humania-blue hover:bg-humania-blue/90">
            Guardar Evaluación
          </Button>
        )}
        {message && <p className="text-sm font-medium">{message}</p>}
      </div>
    </form>
  )
}
