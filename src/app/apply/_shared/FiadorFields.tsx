import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { INGRESOS_OPTIONS } from '@/lib/domain/eligibility'
import { ErrorMsg, inputClass } from './ErrorMsg'

// Extraído de apply/page.tsx (Paso 5, "Respaldo Solidario") -- KAI-9/KAI-13.
// Se reutiliza tal cual en /apply (Parte 1, hasta antes del ajuste) y en
// /apply/parte2, sin cambios de campos, validaciones ni textos.
export type FiadorValues = {
  fiador_nombre: string
  fiador_documento: string
  fiador_telefono: string
  fiador_ingresos: string
  fiador_finca_raiz: boolean
}

export function FiadorFields({
  values,
  errors,
  onChange,
  onFincaRaizChange,
}: {
  values: FiadorValues
  errors: Record<string, string>
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onFincaRaizChange: (checked: boolean) => void
}) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Respaldo Solidario</h1>
        <p className="text-humania-gray/80 text-lg">Información requerida de tu fiador.</p>
      </div>

      <div className="grid gap-6">
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Nombre Completo del Fiador</Label>
          <Input name="fiador_nombre" maxLength={111} value={values.fiador_nombre} onChange={onChange} placeholder="Ej. Maria Fernández" className={inputClass('fiador_nombre', errors)} />
          <ErrorMsg name="fiador_nombre" errors={errors} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-humania-gray font-medium">Documento (Solo números)</Label>
            <Input name="fiador_documento" maxLength={10} value={values.fiador_documento} onChange={onChange} placeholder="Ej. 1020304050" className={inputClass('fiador_documento', errors)} />
            <ErrorMsg name="fiador_documento" errors={errors} />
          </div>
          <div className="space-y-2">
            <Label className="text-humania-gray font-medium">Teléfono</Label>
            <Input name="fiador_telefono" maxLength={10} value={values.fiador_telefono} onChange={onChange} placeholder="Ej. 3001234567" className={inputClass('fiador_telefono', errors)} />
            <ErrorMsg name="fiador_telefono" errors={errors} />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-humania-gray font-medium">Ingresos Mensuales Demostrables (COP)</Label>
          <select
            name="fiador_ingresos"
            value={values.fiador_ingresos}
            onChange={onChange}
            className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.fiador_ingresos ? 'border-red-500' : 'border-neutral-300'}`}
          >
            <option value="" disabled>Selecciona una opción</option>
            {INGRESOS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ErrorMsg name="fiador_ingresos" errors={errors} />
        </div>
        <div className="flex items-center space-x-3 pt-4 p-4 border border-neutral-200 bg-neutral-50 rounded-lg">
          <Checkbox
            id="fincaraiz"
            checked={values.fiador_finca_raiz}
            onCheckedChange={(checked) => onFincaRaizChange(!!checked)}
            className="data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue"
          />
          <Label htmlFor="fincaraiz" className="font-medium text-humania-blue cursor-pointer">Mi fiador posee finca raíz a su nombre</Label>
        </div>
      </div>
    </div>
  )
}
