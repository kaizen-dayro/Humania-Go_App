import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PARENTESCO_FAMILIAR_OPTIONS, RELACION_PERSONAL_OPTIONS, TIEMPO_CONOCERSE_OPTIONS, CATEGORIA_ACTIVIDAD_OPTIONS } from '@/lib/domain/eligibility'
import { ErrorMsg, inputClass } from './ErrorMsg'

// Extraído de apply/page.tsx (Paso 6, "Referencias") -- KAI-9/KAI-13. Se
// reutiliza tal cual en /apply/parte2, sin cambios de campos, validaciones
// ni textos.
export type ReferenciasValues = {
  ref1_nombre: string; ref1_relacion_seleccion: string; ref1_relacion: string; ref1_telefono: string; ref1_tiempo: string; ref1_ocupacion_seleccion: string; ref1_ocupacion: string
  ref2_nombre: string; ref2_relacion_seleccion: string; ref2_relacion: string; ref2_telefono: string; ref2_tiempo: string; ref2_ocupacion_seleccion: string; ref2_ocupacion: string
}

export function ReferenciasFields({
  values,
  errors,
  onChange,
}: {
  values: ReferenciasValues
  errors: Record<string, string>
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
}) {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Referencias</h1>
        <p className="text-humania-gray/80 text-lg">Requerimos dos tipos diferentes de respaldo.</p>
      </div>

      {/* Referencia Familiar */}
      <div className="space-y-6 bg-white border border-neutral-200 p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-humania-blue"></div>

        <div className="border-b border-neutral-100 pb-4 mb-6">
          <h3 className="text-xl font-bold text-humania-blue">Referencia Familiar</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-humania-gray font-medium">Nombre Completo</Label>
            <Input name="ref1_nombre" maxLength={60} value={values.ref1_nombre} onChange={onChange} placeholder="Ej. Carlos Pérez" className={inputClass('ref1_nombre', errors)} />
            <ErrorMsg name="ref1_nombre" errors={errors} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Parentesco</Label>
              <select name="ref1_relacion_seleccion" value={values.ref1_relacion_seleccion} onChange={onChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref1_relacion ? 'border-red-500' : 'border-neutral-300'}`}>
                <option value="" disabled>Selecciona una opción</option>
                {PARENTESCO_FAMILIAR_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {values.ref1_relacion_seleccion === 'Otro familiar' && (
                <Input name="ref1_relacion" maxLength={15} value={values.ref1_relacion} onChange={onChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref1_relacion', errors)} />
              )}
              <ErrorMsg name="ref1_relacion" errors={errors} />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Teléfono</Label>
              <Input name="ref1_telefono" maxLength={10} value={values.ref1_telefono} onChange={onChange} placeholder="Ej. 3001234567" className={inputClass('ref1_telefono', errors)} />
              <ErrorMsg name="ref1_telefono" errors={errors} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Tiempo de conocerse</Label>
              <select name="ref1_tiempo" value={values.ref1_tiempo} onChange={onChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref1_tiempo ? 'border-red-500' : 'border-neutral-300'}`}>
                <option value="" disabled>Selecciona una opción</option>
                {TIEMPO_CONOCERSE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ErrorMsg name="ref1_tiempo" errors={errors} />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Ocupación / Trabajo</Label>
              <select name="ref1_ocupacion_seleccion" value={values.ref1_ocupacion_seleccion} onChange={onChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref1_ocupacion ? 'border-red-500' : 'border-neutral-300'}`}>
                <option value="" disabled>Selecciona una opción</option>
                {CATEGORIA_ACTIVIDAD_OPTIONS.map(c => <option key={c.value} value={c.value}>{`${c.value} / Ej: ${c.ejemplo}`}</option>)}
                <option value="Otro">Otro</option>
              </select>
              {values.ref1_ocupacion_seleccion === 'Otro' && (
                <Input name="ref1_ocupacion" maxLength={15} value={values.ref1_ocupacion} onChange={onChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref1_ocupacion', errors)} />
              )}
              <ErrorMsg name="ref1_ocupacion" errors={errors} />
            </div>
          </div>
        </div>
      </div>

      {/* Referencia Personal */}
      <div className="space-y-6 bg-white border border-neutral-200 p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-humania-sand"></div>

        <div className="border-b border-neutral-100 pb-4 mb-6">
          <h3 className="text-xl font-bold text-humania-blue">Referencia Personal</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-humania-gray font-medium">Nombre Completo</Label>
            <Input name="ref2_nombre" maxLength={60} value={values.ref2_nombre} onChange={onChange} placeholder="Ej. Andrés Gómez" className={inputClass('ref2_nombre', errors)} />
            <ErrorMsg name="ref2_nombre" errors={errors} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Relación con el candidato</Label>
              <select name="ref2_relacion_seleccion" value={values.ref2_relacion_seleccion} onChange={onChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref2_relacion ? 'border-red-500' : 'border-neutral-300'}`}>
                <option value="" disabled>Selecciona una opción</option>
                {RELACION_PERSONAL_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {values.ref2_relacion_seleccion === 'Otro' && (
                <Input name="ref2_relacion" maxLength={15} value={values.ref2_relacion} onChange={onChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref2_relacion', errors)} />
              )}
              <ErrorMsg name="ref2_relacion" errors={errors} />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Teléfono</Label>
              <Input name="ref2_telefono" maxLength={10} value={values.ref2_telefono} onChange={onChange} placeholder="Ej. 3001234567" className={inputClass('ref2_telefono', errors)} />
              <ErrorMsg name="ref2_telefono" errors={errors} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Tiempo de conocerse</Label>
              <select name="ref2_tiempo" value={values.ref2_tiempo} onChange={onChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref2_tiempo ? 'border-red-500' : 'border-neutral-300'}`}>
                <option value="" disabled>Selecciona una opción</option>
                {TIEMPO_CONOCERSE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ErrorMsg name="ref2_tiempo" errors={errors} />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Ocupación / Trabajo</Label>
              <select name="ref2_ocupacion_seleccion" value={values.ref2_ocupacion_seleccion} onChange={onChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref2_ocupacion ? 'border-red-500' : 'border-neutral-300'}`}>
                <option value="" disabled>Selecciona una opción</option>
                {CATEGORIA_ACTIVIDAD_OPTIONS.map(c => <option key={c.value} value={c.value}>{`${c.value} / Ej: ${c.ejemplo}`}</option>)}
                <option value="Otro">Otro</option>
              </select>
              {values.ref2_ocupacion_seleccion === 'Otro' && (
                <Input name="ref2_ocupacion" maxLength={15} value={values.ref2_ocupacion} onChange={onChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref2_ocupacion', errors)} />
              )}
              <ErrorMsg name="ref2_ocupacion" errors={errors} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
