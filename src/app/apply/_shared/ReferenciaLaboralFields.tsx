import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { REFERENCIA_LABORAL_RELACION_OPTIONS } from '@/lib/domain/eligibility'
import { ErrorMsg, inputClass } from './ErrorMsg'

// Nuevo paso de /apply/parte2 (KAI-20, 2026-08-28): solo la Sección 1
// ("Datos de la referencia") de lo que ya existe en
// /admin/candidatos/[id]/referencia-laboral -- mismos 5 campos, mismas
// reglas de validación que ya usa ReferenciaLaboralFullPage.tsx. El
// candidato solo aporta a quién contactar; las secciones 2-5 (evaluación
// telefónica) las llena RRHH después, sobre un tercero.
export type ReferenciaLaboralValues = {
  contacto_nombre: string
  contacto_empresa: string
  contacto_cargo: string
  contacto_relacion: string
  contacto_telefono: string
}

export function ReferenciaLaboralFields({
  values,
  errors,
  onChange,
  onRelacionChange,
}: {
  values: ReferenciaLaboralValues
  errors: Record<string, string>
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRelacionChange: (value: string) => void
}) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Referencia Laboral</h1>
        <p className="text-humania-gray/80 text-lg">Cuéntanos a quién podemos contactar para verificar tu experiencia laboral.</p>
      </div>

      <div className="grid gap-6">
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Nombre de la persona que dará la referencia</Label>
          <Input name="contacto_nombre" maxLength={33} value={values.contacto_nombre} onChange={onChange} placeholder="Nombre completo" className={inputClass('contacto_nombre', errors)} />
          <ErrorMsg name="contacto_nombre" errors={errors} />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Empresa donde trabajaron juntos</Label>
          <Input name="contacto_empresa" maxLength={33} value={values.contacto_empresa} onChange={onChange} placeholder="Nombre de la empresa" className={inputClass('contacto_empresa', errors)} />
          <ErrorMsg name="contacto_empresa" errors={errors} />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Cargo de la persona que dará la referencia</Label>
          <Input name="contacto_cargo" maxLength={33} value={values.contacto_cargo} onChange={onChange} placeholder="Ej. Jefe de operaciones" className={inputClass('contacto_cargo', errors)} />
          <ErrorMsg name="contacto_cargo" errors={errors} />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Relación con esta persona</Label>
          <select
            name="contacto_relacion"
            value={values.contacto_relacion}
            onChange={(e) => onRelacionChange(e.target.value)}
            className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.contacto_relacion ? 'border-red-500' : 'border-neutral-300'}`}
          >
            <option value="" disabled>Selecciona una opción</option>
            {REFERENCIA_LABORAL_RELACION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ErrorMsg name="contacto_relacion" errors={errors} />
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Celular de contacto</Label>
          <Input name="contacto_telefono" maxLength={10} value={values.contacto_telefono} onChange={onChange} placeholder="Ej. 3001234567" className={inputClass('contacto_telefono', errors)} />
          <ErrorMsg name="contacto_telefono" errors={errors} />
        </div>
        <p className="text-sm text-humania-gray/60">Nos comunicaremos con esta persona cuando avancemos en el proceso.</p>
      </div>
    </div>
  )
}
