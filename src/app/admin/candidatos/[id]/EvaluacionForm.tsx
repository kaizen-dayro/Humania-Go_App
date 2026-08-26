'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveCandidatoEvaluacion } from '@/app/admin/actions'
import { LETTERS_WITH_PUNCTUATION, capitalizarPalabras } from '@/lib/validation'

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
    descripcion_responsabilidades: existingData?.descripcion_responsabilidades || '',
    // Fase 19 (2026-08-25): visita domiciliaria.
    visita_domiciliaria_realizada: existingData?.visita_domiciliaria_realizada === true ? 'true' : existingData?.visita_domiciliaria_realizada === false ? 'false' : '',
    visita_domiciliaria_calificacion: existingData?.visita_domiciliaria_calificacion || '',
    visita_domiciliaria_observaciones: existingData?.visita_domiciliaria_observaciones || ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleObservacionesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!LETTERS_WITH_PUNCTUATION.test(e.target.value)) return
    const input = e.target
    const cursorPos = input.selectionStart
    setFormData(prev => ({ ...prev, visita_domiciliaria_observaciones: capitalizarPalabras(input.value) }))
    requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
  }

  const handleSelectChange = (name: string, value: string | null) => {
    setFormData(prev => ({ ...prev, [name]: value || '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    if (
      formData.visita_domiciliaria_realizada === 'true' &&
      formData.visita_domiciliaria_calificacion === 'APTO_CON_RESERVA' &&
      formData.visita_domiciliaria_observaciones.trim().length < 10
    ) {
      setMessage('Las observaciones de "Apto con reserva" deben tener al menos 10 caracteres.')
      return
    }
    setLoading(true)
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

      <div className="border-t pt-6 space-y-6">
        <div>
          <h4 className="text-sm font-bold text-humania-gray/50 tracking-widest uppercase mb-4">Visita Domiciliaria</h4>

          <div className="space-y-2">
            <Label className="text-humania-gray font-medium">¿Ya se realizó la visita domiciliaria?</Label>
            <RadioGroup
              value={formData.visita_domiciliaria_realizada}
              onValueChange={(v) => setFormData(prev => ({
                ...prev,
                visita_domiciliaria_realizada: v,
                // Si se marca que aún no se ha hecho, se limpia cualquier
                // calificación/observación previa -- no tiene sentido
                // conservar una calificación de una visita "no realizada".
                ...(v !== 'true' ? { visita_domiciliaria_calificacion: '', visita_domiciliaria_observaciones: '' } : {})
              }))}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2 bg-white border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                <RadioGroupItem value="true" id="visita-si" className="text-humania-blue w-5 h-5" />
                <Label htmlFor="visita-si" className="font-medium cursor-pointer">Sí</Label>
              </div>
              <div className="flex items-center space-x-2 bg-white border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                <RadioGroupItem value="false" id="visita-no" className="text-humania-blue w-5 h-5" />
                <Label htmlFor="visita-no" className="font-medium cursor-pointer">No</Label>
              </div>
            </RadioGroup>
          </div>

          {formData.visita_domiciliaria_realizada === 'true' && (
            <div className="space-y-2 mt-6 animate-in fade-in slide-in-from-top-2">
              <Label className="text-humania-gray font-medium">Calificación de la visita</Label>
              <RadioGroup
                value={formData.visita_domiciliaria_calificacion}
                onValueChange={(v) => setFormData(prev => ({ ...prev, visita_domiciliaria_calificacion: v, ...(v !== 'APTO_CON_RESERVA' ? { visita_domiciliaria_observaciones: '' } : {}) }))}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center space-x-2 bg-white border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                  <RadioGroupItem value="APTO" id="visita-apto" className="text-humania-blue w-5 h-5" />
                  <Label htmlFor="visita-apto" className="font-medium cursor-pointer">Apto</Label>
                </div>
                <div className="flex items-center space-x-2 bg-white border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                  <RadioGroupItem value="NO_APTO" id="visita-no-apto" className="text-humania-blue w-5 h-5" />
                  <Label htmlFor="visita-no-apto" className="font-medium cursor-pointer">No Apto</Label>
                </div>
                <div className="flex items-center space-x-2 bg-white border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                  <RadioGroupItem value="APTO_CON_RESERVA" id="visita-apto-reserva" className="text-humania-blue w-5 h-5" />
                  <Label htmlFor="visita-apto-reserva" className="font-medium cursor-pointer">Apto con reserva</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {formData.visita_domiciliaria_realizada === 'true' && formData.visita_domiciliaria_calificacion === 'APTO_CON_RESERVA' && (
            <div className="space-y-2 mt-6 animate-in fade-in slide-in-from-top-2">
              <Label className="text-humania-gray font-medium">Observaciones de la reserva (obligatorio)</Label>
              <Textarea
                value={formData.visita_domiciliaria_observaciones}
                onChange={handleObservacionesChange}
                placeholder="Describe la reserva encontrada durante la visita... (mínimo 10 caracteres)"
                maxLength={111}
                rows={3}
              />
              <p className="text-xs text-neutral-400 text-right">{formData.visita_domiciliaria_observaciones.length}/111</p>
            </div>
          )}
        </div>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          El candidato no puede pasar a &quot;Seleccionado&quot; sin que la visita domiciliaria esté realizada y calificada por completo. Sí puede pasar a Backup, Desiste o Descartado sin este requisito.
        </p>
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
