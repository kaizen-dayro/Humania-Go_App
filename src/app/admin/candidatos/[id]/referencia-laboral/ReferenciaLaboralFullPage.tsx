'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Bookmark, Clock, Info, Lock, AlertCircle,
  Shield, ClipboardCheck, User, Package, Send, CloudRain, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveReferenciaLaboral, type ReferenciaLaboralFormValues } from '../../../actions'
import {
  EVALUACION_FILAS, CONFIANZA_OPCIONES, RECONTRATACION_OPCIONES, RELACION_OPCIONES,
  type ReferenciaLaboralRow, type EvaluacionKey,
} from '../ReferenciaLaboralSection'
import { LETTERS_ONLY, NUMBERS_ONLY, DESCRIPTIVE_TEXT, capitalizarPalabras } from '@/lib/validation'

const CAMPOS_SOLO_LETRAS: (keyof ReferenciaLaboralFormValues)[] = ['contacto_nombre', 'contacto_empresa', 'contacto_cargo']
const CAMPOS_SOLO_NUMEROS: (keyof ReferenciaLaboralFormValues)[] = ['contacto_telefono']
const CAMPOS_TEXTO_DESCRIPTIVO: (keyof ReferenciaLaboralFormValues)[] = ['destacaria_trabajador', 'observaciones_previas']

const ICONOS: Record<string, typeof Shield> = { shield: Shield, clipboard: ClipboardCheck, user: User, package: Package, send: Send, cloud: CloudRain, users: Users }

function filaToFormValues(row: ReferenciaLaboralRow | null): ReferenciaLaboralFormValues {
  return {
    contacto_nombre: row?.contacto_nombre || '',
    contacto_empresa: row?.contacto_empresa || '',
    contacto_cargo: row?.contacto_cargo || '',
    contacto_relacion: row?.contacto_relacion || '',
    contacto_telefono: row?.contacto_telefono || '',
    responsabilidad: row?.responsabilidad?.toString() || '',
    cumplimiento: row?.cumplimiento?.toString() || '',
    honestidad_transparencia: row?.honestidad_transparencia?.toString() || '',
    cuidado_recursos: row?.cuidado_recursos?.toString() || '',
    autonomia: row?.autonomia?.toString() || '',
    manejo_dificultades: row?.manejo_dificultades?.toString() || '',
    relaciones: row?.relaciones?.toString() || '',
    pregunta_confianza: row?.pregunta_confianza?.toString() || '',
    recontratacion: row?.recontratacion?.toString() || '',
    destacaria_trabajador: row?.destacaria_trabajador || '',
    observaciones_previas: row?.observaciones_previas || '',
  }
}

function OpcionColumna({ numero, texto, seleccionado, onSelect }: { numero: number; texto: string; seleccionado: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="flex flex-col items-center text-center gap-2 px-1 py-1 group cursor-pointer">
      <span className={`text-sm font-bold ${seleccionado ? 'text-humania-blue' : 'text-neutral-700'}`}>{numero}</span>
      <span className="text-xs text-humania-gray leading-snug">{texto}</span>
      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${seleccionado ? 'border-humania-blue' : 'border-neutral-300 group-hover:border-neutral-400'}`}>
        {seleccionado && <span className="w-2.5 h-2.5 rounded-full bg-humania-blue" />}
      </span>
    </button>
  )
}

function OpcionRadioHorizontal({ texto, seleccionado, onSelect }: { texto: string; seleccionado: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="flex items-center gap-3 text-left w-full py-1.5 group cursor-pointer">
      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${seleccionado ? 'border-humania-blue' : 'border-neutral-300 group-hover:border-neutral-400'}`}>
        {seleccionado && <span className="w-2 h-2 rounded-full bg-humania-blue" />}
      </span>
      <span className="text-sm text-humania-gray">{texto}</span>
    </button>
  )
}

export function ReferenciaLaboralFullPage({
  candidato,
  initialData,
}: {
  candidato: { id: string; nombres: string; apellidos: string; estado: string }
  initialData: ReferenciaLaboralRow | null
}) {
  const router = useRouter()
  const [savedId, setSavedId] = useState<string | null>(initialData?.id || null)
  const [savedEstado] = useState<'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | null>(initialData?.estado || null)
  const [form, setForm] = useState<ReferenciaLaboralFormValues>(() => filaToFormValues(initialData))
  const [loading, setLoading] = useState<'draft' | 'finalize' | null>(null)
  const [generalError, setGeneralError] = useState('')
  const [missingFields, setMissingFields] = useState<string[]>([])

  const esCorreccion = savedEstado === 'COMPLETADA'

  function handleFieldChange(key: keyof ReferenciaLaboralFormValues, value: string) {
    if (CAMPOS_SOLO_LETRAS.includes(key) && !LETTERS_ONLY.test(value)) return
    if (CAMPOS_SOLO_NUMEROS.includes(key) && !NUMBERS_ONLY.test(value)) return
    if (CAMPOS_TEXTO_DESCRIPTIVO.includes(key) && !DESCRIPTIVE_TEXT.test(value)) return
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Version de handleFieldChange para <Input> de nombre/empresa/cargo:
  // capitaliza en vivo (misma logica que el trigger de Postgres) y
  // conserva la posicion del cursor.
  function handleCampoNombreChange(key: keyof ReferenciaLaboralFormValues, e: React.ChangeEvent<HTMLInputElement>) {
    if (!LETTERS_ONLY.test(e.target.value)) return
    const input = e.target
    const cursorPos = input.selectionStart
    handleFieldChange(key, capitalizarPalabras(input.value))
    requestAnimationFrame(() => input.setSelectionRange(cursorPos, cursorPos))
  }

  async function handleGuardar(finalize: boolean) {
    setLoading(finalize ? 'finalize' : 'draft')
    setGeneralError('')
    setMissingFields([])

    const res = await saveReferenciaLaboral(candidato.id, savedId, savedEstado, form, finalize)
    setLoading(null)

    if (!res.success) {
      setGeneralError(res.error || 'Ocurrió un error al guardar.')
      if (res.missingFields) setMissingFields(res.missingFields)
      if (res.id) setSavedId(res.id)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    router.push(`/admin/candidatos/${candidato.id}`)
    router.refresh()
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <Link href={`/admin/candidatos/${candidato.id}`}>
            <Button variant="ghost" className="text-humania-gray hover:text-humania-blue px-0">
              &larr; Volver
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => handleGuardar(false)}
            disabled={loading !== null}
            className="flex items-center gap-2 text-sm font-semibold text-humania-blue hover:underline disabled:opacity-50 cursor-pointer"
          >
            <Bookmark className="w-4 h-4" />
            {loading === 'draft' ? 'Guardando...' : 'Guardar y continuar después'}
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-humania-blue">Verificación de referencia laboral</h1>
            <p className="text-humania-gray mt-1">Tu referencia nos ayuda a conocerte mejor y a tomar la mejor decisión juntos.</p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-lg shadow-sm px-5 py-3 flex items-center gap-3 shrink-0">
            <Clock className="w-5 h-5 text-humania-blue" />
            <div>
              <p className="text-xs text-humania-gray/70">Tiempo estimado</p>
              <p className="text-sm font-bold text-humania-blue">2 - 3 minutos</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {esCorreccion && (
          <div className="p-3 bg-humania-blue/5 border border-humania-blue/30 text-humania-blue text-xs rounded-md">
            Estás corrigiendo una referencia ya completada. El cambio quedará registrado con fecha y usuario administrativo.
          </div>
        )}

        {generalError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {generalError}
          </div>
        )}

        {missingFields.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md">
            <p className="font-semibold mb-1">Falta completar para poder finalizar:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {missingFields.map(f => <li key={f}>{f}</li>)}
            </ul>
          </div>
        )}

        {/* Seccion 1 */}
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-6">
          <h2 className="text-base font-bold text-humania-blue mb-5">1. Datos de la referencia</h2>
          <div className="grid md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Nombre de la persona que dará la referencia</Label>
              <Input value={form.contacto_nombre} onChange={e => handleCampoNombreChange('contacto_nombre', e)} placeholder="Escribe el nombre completo" maxLength={60} className="rounded-md border-neutral-300 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Empresa donde trabajaron juntos</Label>
              <Input value={form.contacto_empresa} onChange={e => handleCampoNombreChange('contacto_empresa', e)} placeholder="Nombre de la empresa" maxLength={111} className="rounded-md border-neutral-300 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Cargo de la persona que dará la referencia</Label>
              <Input value={form.contacto_cargo} onChange={e => handleCampoNombreChange('contacto_cargo', e)} placeholder="Ej: Jefe de operaciones" maxLength={33} className="rounded-md border-neutral-300 h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Relación con esta persona</Label>
              <Select value={form.contacto_relacion} onValueChange={(v) => handleFieldChange('contacto_relacion', v || '')}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
                <SelectContent>
                  {RELACION_OPCIONES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">Celular de contacto</Label>
              <Input value={form.contacto_telefono} onChange={e => handleFieldChange('contacto_telefono', e.target.value)} placeholder="Ej: 300 123 4567" maxLength={10} inputMode="numeric" className="rounded-md border-neutral-300 h-11" />
            </div>
            <div className="bg-humania-blue/5 border border-humania-blue/20 rounded-md p-3 flex gap-2 items-start">
              <Info className="w-4 h-4 text-humania-blue shrink-0 mt-0.5" />
              <p className="text-xs text-humania-blue">Nos comunicaremos con esta persona cuando avancemos en el proceso.</p>
            </div>
          </div>
        </div>

        {/* Seccion 2 */}
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-6">
          <h2 className="text-base font-bold text-humania-blue">2. ¿Cómo fue trabajar con esta persona?</h2>
          <p className="text-xs text-humania-gray/70 mt-1 mb-2">Selecciona la opción que mejor describa tu experiencia.</p>

          <div className="divide-y divide-neutral-100">
            {EVALUACION_FILAS.map((fila, idx) => {
              const Icono = ICONOS[fila.icono]
              return (
                <div key={fila.key} className="py-5 grid grid-cols-1 lg:grid-cols-[minmax(240px,1.6fr)_repeat(3,minmax(110px,1fr))] gap-4 lg:items-center">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-humania-blue/10 text-humania-blue flex items-center justify-center shrink-0">
                      <Icono className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-humania-blue">{idx + 1}. {fila.titulo}</p>
                      <p className="text-xs text-humania-gray mt-0.5">{fila.pregunta}</p>
                    </div>
                  </div>
                  {fila.opciones.map((texto, i) => (
                    <OpcionColumna
                      key={i}
                      numero={i + 1}
                      texto={texto}
                      seleccionado={form[fila.key as EvaluacionKey] === String(i + 1)}
                      onSelect={() => handleFieldChange(fila.key, String(i + 1))}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Seccion 3, 4 y 5 */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-6">
              <h2 className="text-base font-bold text-humania-blue mb-1">3. Pregunta de confianza</h2>
              <p className="text-sm text-humania-gray mb-4">
                Si tuviera que confiarle nuevamente un recurso de valor para que lo administrara de manera autónoma, ¿lo haría?
              </p>
              <div className="space-y-1">
                {CONFIANZA_OPCIONES.map((texto, i) => (
                  <OpcionRadioHorizontal key={i} texto={texto} seleccionado={form.pregunta_confianza === String(i + 1)} onSelect={() => handleFieldChange('pregunta_confianza', String(i + 1))} />
                ))}
              </div>
            </div>

            <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-6">
              <h2 className="text-base font-bold text-humania-blue mb-1">4. Recontratación</h2>
              <p className="text-sm text-humania-gray mb-4">¿Volverías a trabajar con esta persona?</p>
              <div className="space-y-1">
                {RECONTRATACION_OPCIONES.map((texto, i) => (
                  <OpcionRadioHorizontal key={i} texto={texto} seleccionado={form.recontratacion === String(i + 1)} onSelect={() => handleFieldChange('recontratacion', String(i + 1))} />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-6 space-y-5 h-fit">
            <h2 className="text-base font-bold text-humania-blue">5. Queremos escucharte</h2>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">¿Qué destacarías de esta persona como trabajador?</Label>
              <Textarea
                value={form.destacaria_trabajador}
                onChange={e => handleFieldChange('destacaria_trabajador', e.target.value)}
                placeholder="Escribe tu respuesta..."
                maxLength={500}
                rows={4}
              />
              <p className="text-xs text-humania-gray/50 text-right">{form.destacaria_trabajador.length}/500</p>
            </div>
            <div className="space-y-2">
              <Label className="text-humania-gray font-medium">
                ¿Hay algo que consideres importante que debamos saber antes de confiarle un activo para trabajar de manera autónoma?
              </Label>
              <Textarea
                value={form.observaciones_previas}
                onChange={e => handleFieldChange('observaciones_previas', e.target.value)}
                placeholder="Escribe tu respuesta..."
                maxLength={500}
                rows={4}
              />
              <p className="text-xs text-humania-gray/50 text-right">{form.observaciones_previas.length}/500</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push(`/admin/candidatos/${candidato.id}`)}
            className="flex items-center gap-2 text-sm font-semibold text-humania-gray hover:text-humania-blue transition-colors cursor-pointer order-1"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <p className="flex items-center gap-2 text-xs text-humania-gray/70 order-3 sm:order-2">
            <Lock className="w-3.5 h-3.5" /> Tu información está protegida y será utilizada solo para fines de selección.
          </p>
          <button
            type="button"
            onClick={() => handleGuardar(true)}
            disabled={loading !== null}
            className="flex items-center gap-2 bg-humania-blue hover:bg-humania-blue/90 text-white text-sm font-semibold px-6 py-3 rounded-md transition-colors disabled:opacity-50 cursor-pointer order-2 sm:order-3"
          >
            {loading === 'finalize' ? 'Guardando...' : 'Guardar y continuar'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
