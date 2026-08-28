"use client"

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertCircle } from 'lucide-react'
import {
  GENEROS, ApplicationPayload,
  PLATAFORMA_OPTIONS, CATEGORIA_ACTIVIDAD_OPTIONS, TIEMPO_EXPERIENCIA_OPTIONS,
  SIMIT_MAX_FINES_REQUIRING_VALIDATION,
} from '@/lib/domain/eligibility'
import { capitalizarPalabras, PHONE_CO } from '@/lib/validation'
import { ErrorMsg, inputClass } from './_shared/ErrorMsg'
import { TratamientoDatosStep, TratamientoDatosState } from './_shared/TratamientoDatosStep'

type Oportunidad = {
  id: string; codigo_interno: string; tipo: string; marca: string; modelo: string; imagen: string;
}

type Ciudad = { id: string; nombre_oficial: string; orden: number }
type Municipio = { id: string; ciudad_operacion_id: string; nombre_oficial: string; orden: number }

const LettersOnly = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]*$/;
const NumbersOnly = /^\d*$/;

const LICENCIA_CATEGORIAS = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

// Mismos campos filtrados con LettersOnly: nombres/textos humanos que
// tambien se normalizan en Postgres (Fase 10) al guardar. Se capitalizan
// en vivo aqui para que la persona vea el mismo resultado mientras escribe.
const CAMPOS_NOMBRE_HUMANO = ['nombres', 'apellidos', 'barrio', 'categoria_actividad', 'plataformas_otro_texto'];

const TOTAL_PASOS = 5

function ApplyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialActivoId = searchParams.get('activo_id')
  const initialVideoToken = searchParams.get('video_token')
  const initialPerfil = searchParams.get('perfil')

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([])
  const [loadingOportunidades, setLoadingOportunidades] = useState(true)

  const [ciudades, setCiudades] = useState<Ciudad[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [loadingUbicaciones, setLoadingUbicaciones] = useState(true)

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Paso 5 (Tratamiento de Datos) -- autocontenido, ver _shared/TratamientoDatosStep.
  const [tratamientoDatos, setTratamientoDatos] = useState<TratamientoDatosState>({ dataAuthorization: false, policyVersion: '', policyReadToEnd: false })
  const [tratamientoDatosError, setTratamientoDatosError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    activo_id: initialActivoId || '',
    video_token: initialVideoToken || '',
    perfil_publicitario: initialPerfil || 'GENERAL',
    nombres: '', apellidos: '', edad: '', tipo_documento: 'CC', numero_documento: '',
    correo_electronico: '', confirmacion_correo: '', telefono: '',
    ciudad_operacion_id: '', municipio_operacion_id: '', genero: '', barrio: '',
    tipo_perfil: 'CONDUCTOR_PLATAFORMA',
    plataformas: [] as string[], plataformas_otro: false, plataformas_otro_texto: '',
    categoria_actividad_seleccion: '', categoria_actividad: '', anos_experiencia_declarados: '',
    licencia_declarada_vigente: false, licencia_categorias: [] as string[], cantidad_comparendos_declarados: '',
    paz_y_salvo_declarado: '' as '' | 'SI' | 'NO', acuerdo_pago_declarado: '' as '' | 'SI' | 'NO',
  })

  useEffect(() => {
    fetch('/api/oportunidades')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setOportunidades(res.data)
          // Si solo hay una oportunidad, autoseleccionar.
          // Si el query param existe y es valido, seleccionar, y si no, dejar q el user seleccione.
          if (res.data.length === 1 && !initialActivoId) {
            setFormData(prev => ({ ...prev, activo_id: res.data[0].id }))
          } else if (initialActivoId && res.data.some((o: any) => o.id === initialActivoId)) {
            setFormData(prev => ({ ...prev, activo_id: initialActivoId }))
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoadingOportunidades(false))
  }, [initialActivoId])

  useEffect(() => {
    fetch('/api/ubicaciones')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setCiudades(res.data.ciudades)
          setMunicipios(res.data.municipios)
        }
      })
      .catch(console.error)
      .finally(() => setLoadingUbicaciones(false))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else if (name.endsWith('_seleccion')) {
      // Dropdown con opcion "Otro": si no es Otro, el valor final se
      // sincroniza directo desde el dropdown; si es Otro, el valor final
      // se limpia para que la persona lo escriba en el campo protegido
      // que aparece a continuacion.
      const campoFinal = name.replace('_seleccion', '')
      setFormData(prev => ({ ...prev, [name]: value, [campoFinal]: value === 'Otro' ? '' : value }))
      if (errors[campoFinal]) setErrors(prev => ({ ...prev, [campoFinal]: '' }))
    } else if (name === 'ciudad_operacion_id') {
      // Cambiar de ciudad limpia el municipio seleccionado (no puede
      // quedar un municipio de la ciudad anterior).
      setFormData(prev => ({ ...prev, ciudad_operacion_id: value, municipio_operacion_id: '' }))
    } else if (name === 'cantidad_comparendos_declarados') {
      // Si el nuevo valor sale del rango que requiere paz y salvo/acuerdo de
      // pago (1 a SIMIT_MAX_FINES_REQUIRING_VALIDATION), se limpian las
      // respuestas ya dadas -- evita enviar una respuesta "vieja" que ya no
      // corresponde a la cantidad actual.
      if (!NumbersOnly.test(value)) return;
      const n = parseInt(value)
      const enRango = !isNaN(n) && n >= 1 && n <= SIMIT_MAX_FINES_REQUIRING_VALIDATION
      setFormData(prev => ({
        ...prev,
        cantidad_comparendos_declarados: value,
        ...(enRango ? {} : { paz_y_salvo_declarado: '', acuerdo_pago_declarado: '' })
      }))
    } else {
      // Filtros estrictos de input
      if (['edad', 'numero_documento', 'telefono'].includes(name)) {
        if (!NumbersOnly.test(value)) return;
      }
      let finalValue = value
      const esCampoNombreHumano = CAMPOS_NOMBRE_HUMANO.includes(name)
      if (esCampoNombreHumano) {
        if (!LettersOnly.test(value)) return;
        finalValue = capitalizarPalabras(value)
      }

      const inputEl = e.target instanceof HTMLInputElement ? e.target : null
      const cursorPos = esCampoNombreHumano && inputEl ? inputEl.selectionStart : null

      setFormData(prev => ({ ...prev, [name]: finalValue }))

      if (cursorPos !== null && inputEl) {
        requestAnimationFrame(() => inputEl.setSelectionRange(cursorPos, cursorPos))
      }
    }
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (currentStep === 1) {
      if (!formData.activo_id) newErrors.activo_id = "Debes seleccionar una oportunidad para continuar."
    }

    if (currentStep === 2) {
      if (formData.nombres.trim().length < 2) newErrors.nombres = "Obligatorio (mínimo 2 letras)."
      if (formData.apellidos.trim().length < 2) newErrors.apellidos = "Obligatorio (mínimo 2 letras)."

      {
        const edadNum = parseInt(formData.edad)
        if (!formData.edad || isNaN(edadNum) || edadNum < 18 || edadNum > 60) {
          newErrors.edad = "Ingresa una edad válida (entre 18 y 60 años)."
        }
      }

      if (formData.numero_documento.length < 7 || formData.numero_documento.length > 10) {
        newErrors.numero_documento = "Debe tener entre 7 y 10 números."
      }
      if (!PHONE_CO.test(formData.telefono)) {
        newErrors.telefono = "Debe tener exactamente 10 números e iniciar en 3."
      }

      if (!formData.ciudad_operacion_id) newErrors.ciudad_operacion_id = "Selecciona una ciudad."
      if (!formData.municipio_operacion_id) newErrors.municipio_operacion_id = "Selecciona un municipio."

      if (formData.barrio.trim().length < 4 || formData.barrio.trim().length > 15) {
        newErrors.barrio = "Obligatorio (entre 4 y 15 letras)."
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.correo_electronico)) newErrors.correo_electronico = "Ingresa un correo electrónico válido."
      if (formData.correo_electronico !== formData.confirmacion_correo) newErrors.confirmacion_correo = "Los correos electrónicos no coinciden."

      if (!formData.genero) newErrors.genero = "Selecciona una opción."
    }

    if (currentStep === 3) {
      if (formData.tipo_perfil === 'CONDUCTOR_PLATAFORMA') {
        const hayFijas = formData.plataformas.length > 0
        const hayOtro = formData.plataformas_otro && formData.plataformas_otro_texto.trim().length >= 2
        if (!hayFijas && !hayOtro) newErrors.plataformas = "Selecciona al menos una plataforma."
        else if (formData.plataformas_otro && formData.plataformas_otro_texto.trim().length < 2) newErrors.plataformas = "Por favor, brinda más detalles en \"Otro\"."
      } else {
        if (!formData.categoria_actividad_seleccion) {
          newErrors.categoria_actividad = "Selecciona una opción."
        } else if (formData.categoria_actividad_seleccion === 'Otro' && formData.categoria_actividad.trim().length < 2) {
          newErrors.categoria_actividad = "Por favor, brinda más detalles."
        }
      }
      if (!formData.anos_experiencia_declarados) {
        newErrors.anos_experiencia_declarados = "Selecciona una opción."
      }
    }

    if (currentStep === 4) {
      if (!formData.licencia_declarada_vigente) {
        newErrors.licencia_declarada_vigente = "Es indispensable contar con licencia de conducción vigente para aplicar."
      } else if (formData.licencia_categorias.length === 0) {
        newErrors.licencia_categorias = "Debes seleccionar al menos una categoría de licencia."
      }
      const comp = parseInt(formData.cantidad_comparendos_declarados)
      if (isNaN(comp) || comp < 0 || comp > 10) {
        newErrors.cantidad_comparendos_declarados = "Debe ser un número entre 0 y 10."
      } else if (comp >= 1 && comp <= SIMIT_MAX_FINES_REQUIRING_VALIDATION) {
        if (formData.paz_y_salvo_declarado !== 'SI' && formData.paz_y_salvo_declarado !== 'NO') {
          newErrors.paz_y_salvo_declarado = "Selecciona una opción."
        } else if (formData.paz_y_salvo_declarado === 'NO' && formData.acuerdo_pago_declarado !== 'SI' && formData.acuerdo_pago_declarado !== 'NO') {
          newErrors.acuerdo_pago_declarado = "Selecciona una opción."
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const nextStep = () => {
    if (validateStep(step)) {
      // Nadie avanza mas alla de la seleccion de oportunidad sin haber
      // visto la presentacion de esa oportunidad primero -- si llego aqui
      // sin el token (URL editada a mano, o eligio la oportunidad dentro
      // de este mismo paso 1 en vez de venir del clic en la portada),
      // se lo manda a verla. La garantia real no depende de esto: vive en
      // submit_application, que rechaza el envio sin un token valido.
      if (step === 1 && !formData.video_token) {
        router.push(`/presentacion?activo_id=${formData.activo_id}`)
        return
      }
      setSubmitError(null)
      setStep(prev => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const prevStep = () => {
    setErrors({})
    setSubmitError(null)
    setStep(prev => prev - 1)
  }

  const handleSubmit = async () => {
    if (!tratamientoDatos.policyReadToEnd || !tratamientoDatos.dataAuthorization) {
      setTratamientoDatosError(!tratamientoDatos.policyReadToEnd
        ? "Debes leer la Política de Tratamiento de Datos Personales completa."
        : "Debes autorizar el tratamiento de tus datos personales.")
      return
    }
    setTratamientoDatosError(null)

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const payload: Omit<ApplicationPayload, 'fiador' | 'referencias'> = {
        activo_id: formData.activo_id,
        video_token: formData.video_token,
        perfil_publicitario: formData.perfil_publicitario as any,
        nombres: formData.nombres, apellidos: formData.apellidos, edad: parseInt(formData.edad),
        tipo_documento: formData.tipo_documento as any,
        numero_documento: formData.numero_documento,
        correo_electronico: formData.correo_electronico,
        confirmacion_correo: formData.confirmacion_correo,
        telefono: formData.telefono,
        ciudad_operacion_id: formData.ciudad_operacion_id, municipio_operacion_id: formData.municipio_operacion_id,
        genero: formData.genero as any, barrio: formData.barrio,
        tipo_perfil: formData.tipo_perfil as any,
        plataformas: formData.tipo_perfil === 'CONDUCTOR_PLATAFORMA'
          ? [...formData.plataformas, ...(formData.plataformas_otro && formData.plataformas_otro_texto.trim() ? [formData.plataformas_otro_texto.trim()] : [])]
          : undefined,
        categoria_actividad: formData.tipo_perfil === 'EMPLEADO' ? formData.categoria_actividad : undefined,
        anos_experiencia_declarados: formData.anos_experiencia_declarados,
        licencia_declarada_vigente: formData.licencia_declarada_vigente,
        licencia_categorias: formData.licencia_categorias,
        cantidad_comparendos_declarados: parseInt(formData.cantidad_comparendos_declarados) || 0,
        paz_y_salvo_declarado: formData.paz_y_salvo_declarado === '' ? null : formData.paz_y_salvo_declarado === 'SI',
        acuerdo_pago_declarado: formData.acuerdo_pago_declarado === '' ? null : formData.acuerdo_pago_declarado === 'SI',
        policyVersion: tratamientoDatos.policyVersion,
        dataAuthorization: tratamientoDatos.dataAuthorization as true
      }

      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.message || 'Ocurrió un error en el servidor. Revisa los datos.')
      }

      setStep(TOTAL_PASOS + 1) // Éxito

    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || 'Ocurrió un error inesperado al enviar la solicitud.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedOportunidad = oportunidades.find(o => o.id === formData.activo_id)

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <header className="w-full border-b border-neutral-100 bg-white sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-20 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight text-humania-blue">
              Humania <span className="font-normal text-humania-gray">Go</span>
            </span>
          </Link>
          <div className="text-sm font-medium text-humania-gray/50 tracking-widest">
            {step <= TOTAL_PASOS ? `PASO 0${step} / 0${TOTAL_PASOS}` : ''}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex justify-center py-12 px-6">
        <div className="w-full max-w-xl">

          {step > 1 && step <= TOTAL_PASOS && selectedOportunidad && (
            <div className="mb-10 pb-4 border-b border-neutral-100 flex justify-between items-end animate-in fade-in">
              <div>
                <p className="text-xs text-humania-gray uppercase tracking-wider mb-1">Aplicando a:</p>
                <p className="text-humania-blue font-semibold">{selectedOportunidad.marca} {selectedOportunidad.modelo}</p>
              </div>
              <span className="text-xs px-2 py-1 bg-humania-blue/5 text-humania-blue font-medium rounded-sm uppercase tracking-widest">
                {selectedOportunidad.tipo}
              </span>
            </div>
          )}

          {submitError && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {submitError}
            </div>
          )}

          {/* STEP 1: OPORTUNIDAD */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Selecciona tu oportunidad</h1>
                <p className="text-humania-gray/80 text-lg">¿A cuál oportunidad de movilidad quieres aplicar?</p>
              </div>

              {loadingOportunidades ? (
                <div className="py-12 text-center text-humania-gray animate-pulse">Cargando oportunidades...</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    {oportunidades.map(opt => (
                      <div
                        key={opt.id}
                        onClick={() => { setFormData(prev => ({ ...prev, activo_id: opt.id })); setErrors({}) }}
                        className={`cursor-pointer rounded-2xl border transition-all duration-300 p-6 flex flex-col ${
                          formData.activo_id === opt.id
                            ? 'border-humania-blue bg-humania-blue/5 shadow-md ring-1 ring-humania-blue'
                            : 'border-neutral-200 hover:border-humania-sand hover:shadow-md bg-white'
                        }`}
                      >
                        <div className="w-full aspect-[16/9] bg-neutral-100 mb-6 flex items-center justify-center overflow-hidden rounded-lg">
                          {opt.imagen ? (
                            <img src={opt.imagen} alt={opt.modelo} className="object-contain w-[90%] h-[90%] mix-blend-multiply" />
                          ) : (
                            <span className="text-xs text-neutral-400">SIN IMAGEN</span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-humania-gray mb-1">{opt.tipo}</p>
                        <h4 className="text-xl font-bold text-humania-blue leading-tight">{opt.marca} {opt.modelo}</h4>
                        {formData.activo_id === opt.id && <div className="mt-4 text-xs font-bold text-humania-blue">✓ SELECCIONADA</div>}
                      </div>
                    ))}
                  </div>
                  <ErrorMsg name="activo_id" errors={errors} />
                  <p className="text-sm text-humania-gray/60 flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    Las imágenes de nuestros activos son referenciales y pueden no reflejar el estado físico actual del vehículo (rayones, desgaste u otros detalles menores). El estado real se confirma durante el proceso de evaluación.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PERSONAL */}
          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Información Personal</h1>
                <p className="text-humania-gray/80 text-lg">Conozcámonos un poco mejor.</p>
              </div>

              <div className="grid gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Nombres</Label>
                    <Input name="nombres" maxLength={111} value={formData.nombres} onChange={handleChange} placeholder="Ej. Juan Carlos" className={inputClass('nombres', errors)} />
                    <ErrorMsg name="nombres" errors={errors} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Apellidos</Label>
                    <Input name="apellidos" maxLength={111} value={formData.apellidos} onChange={handleChange} placeholder="Ej. Pérez Gómez" className={inputClass('apellidos', errors)} />
                    <ErrorMsg name="apellidos" errors={errors} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Edad</Label>
                    <Input name="edad" value={formData.edad} onChange={handleChange} maxLength={2} placeholder="Ej. 30" className={inputClass('edad', errors)} />
                    <ErrorMsg name="edad" errors={errors} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Tipo Documento</Label>
                    <select name="tipo_documento" value={formData.tipo_documento} onChange={handleChange} className="flex h-12 w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand">
                      <option value="CC">CC - Cédula</option>
                      <option value="CE">CE - Cédula de Ext.</option>
                      <option value="PEP">PEP / PPT</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Número (Solo dígitos)</Label>
                  <Input name="numero_documento" value={formData.numero_documento} onChange={handleChange} maxLength={10} placeholder="Ej. 1020304050" className={inputClass('numero_documento', errors)} />
                  <ErrorMsg name="numero_documento" errors={errors} />
                </div>

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Género</Label>
                  <select name="genero" value={formData.genero} onChange={handleChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.genero ? 'border-red-500' : 'border-neutral-300'}`}>
                    <option value="" disabled>Selecciona una opción</option>
                    <option value="MASCULINO">Masculino</option>
                    <option value="FEMENINO">Femenino</option>
                    <option value="OTRO">Otro</option>
                    <option value="PREFIERO_NO_DECIR">Prefiero no decir</option>
                  </select>
                  <ErrorMsg name="genero" errors={errors} />
                </div>

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Correo Electrónico</Label>
                  <Input type="email" name="correo_electronico" value={formData.correo_electronico} onChange={handleChange} className={inputClass('correo_electronico', errors)} placeholder="usuario@ejemplo.com" />
                  <ErrorMsg name="correo_electronico" errors={errors} />
                </div>
                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Confirmar Correo Electrónico</Label>
                  <Input
                    type="email"
                    name="confirmacion_correo"
                    value={formData.confirmacion_correo}
                    onChange={handleChange}
                    onPaste={(e) => e.preventDefault()}
                    placeholder="usuario@ejemplo.com"
                    className={inputClass('confirmacion_correo', errors)}
                  />
                  <ErrorMsg name="confirmacion_correo" errors={errors} />
                </div>

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Teléfono Móvil</Label>
                  <Input name="telefono" maxLength={10} value={formData.telefono} onChange={handleChange} placeholder="Ej. 3001234567" className={inputClass('telefono', errors)} />
                  <ErrorMsg name="telefono" errors={errors} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Ciudad / Núcleo de operación</Label>
                    <select
                      name="ciudad_operacion_id"
                      value={formData.ciudad_operacion_id}
                      onChange={handleChange}
                      disabled={loadingUbicaciones}
                      className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ciudad_operacion_id ? 'border-red-500' : 'border-neutral-300'}`}
                    >
                      <option value="" disabled>Selecciona una ciudad</option>
                      {ciudades.map(c => <option key={c.id} value={c.id}>{c.nombre_oficial}</option>)}
                    </select>
                    <ErrorMsg name="ciudad_operacion_id" errors={errors} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Municipio</Label>
                    <select
                      name="municipio_operacion_id"
                      value={formData.municipio_operacion_id}
                      onChange={handleChange}
                      disabled={!formData.ciudad_operacion_id}
                      className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand disabled:bg-neutral-50 disabled:text-neutral-400 ${errors.municipio_operacion_id ? 'border-red-500' : 'border-neutral-300'}`}
                    >
                      <option value="" disabled>{formData.ciudad_operacion_id ? 'Selecciona un municipio' : 'Primero selecciona una ciudad'}</option>
                      {municipios.filter(m => m.ciudad_operacion_id === formData.ciudad_operacion_id).map(m => (
                        <option key={m.id} value={m.id}>{m.nombre_oficial}</option>
                      ))}
                    </select>
                    <ErrorMsg name="municipio_operacion_id" errors={errors} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Barrio</Label>
                  <Input name="barrio" maxLength={15} value={formData.barrio} onChange={handleChange} placeholder="Ej. Cedritos" className={inputClass('barrio', errors)} />
                  <ErrorMsg name="barrio" errors={errors} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PERFIL */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Tu Perfil</h1>
                <p className="text-humania-gray/80 text-lg">¿A qué te dedicas actualmente?</p>
              </div>

              <div className="space-y-8">
                <div className="space-y-4 bg-neutral-50 p-6 border border-neutral-200">
                  <Label className="text-humania-blue font-semibold text-base block mb-4">¿Cuál es tu perfil principal?</Label>
                  <RadioGroup
                    value={formData.tipo_perfil}
                    onValueChange={(val) => setFormData(prev => ({
                      ...prev, tipo_perfil: val,
                      plataformas: [], plataformas_otro: false, plataformas_otro_texto: '',
                      categoria_actividad_seleccion: '', categoria_actividad: '',
                    }))}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex items-center space-x-3 bg-white border border-neutral-200 p-4 hover:border-humania-blue transition-colors cursor-pointer rounded-lg shadow-sm">
                      <RadioGroupItem value="CONDUCTOR_PLATAFORMA" id="r1" className="text-humania-blue w-5 h-5" />
                      <Label htmlFor="r1" className="font-medium cursor-pointer text-base">Conductor de plataformas</Label>
                    </div>
                    <div className="flex items-center space-x-3 bg-white border border-neutral-200 p-4 hover:border-humania-blue transition-colors cursor-pointer rounded-lg shadow-sm">
                      <RadioGroupItem value="EMPLEADO" id="r2" className="text-humania-blue w-5 h-5" />
                      <Label htmlFor="r2" className="font-medium cursor-pointer text-base">Empleado Formal o Independiente</Label>
                    </div>
                  </RadioGroup>
                </div>

                {formData.tipo_perfil === 'CONDUCTOR_PLATAFORMA' ? (
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">¿En cuáles plataformas trabajas?</Label>
                    <p className="text-sm text-humania-gray/70">Selecciona todas las que apliquen.</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {PLATAFORMA_OPTIONS.map(p => (
                        <div
                          key={p}
                          className={`border rounded-md p-3 flex items-center space-x-3 cursor-pointer transition-colors ${formData.plataformas.includes(p) ? 'bg-humania-blue/5 border-humania-blue' : 'hover:border-humania-sand'}`}
                          onClick={() => {
                            setFormData(prev => {
                              const list = prev.plataformas
                              return { ...prev, plataformas: list.includes(p) ? list.filter(x => x !== p) : [...list, p] }
                            })
                            if (errors.plataformas) setErrors(prev => ({ ...prev, plataformas: '' }))
                          }}
                        >
                          <Checkbox checked={formData.plataformas.includes(p)} className="data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue" />
                          <Label className="font-medium text-humania-blue cursor-pointer pointer-events-none">{p}</Label>
                        </div>
                      ))}
                      <div
                        className={`border rounded-md p-3 flex items-center space-x-3 cursor-pointer transition-colors ${formData.plataformas_otro ? 'bg-humania-blue/5 border-humania-blue' : 'hover:border-humania-sand'}`}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, plataformas_otro: !prev.plataformas_otro, plataformas_otro_texto: prev.plataformas_otro ? '' : prev.plataformas_otro_texto }))
                          if (errors.plataformas) setErrors(prev => ({ ...prev, plataformas: '' }))
                        }}
                      >
                        <Checkbox checked={formData.plataformas_otro} className="data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue" />
                        <Label className="font-medium text-humania-blue cursor-pointer pointer-events-none">Otro</Label>
                      </div>
                    </div>
                    {formData.plataformas_otro && (
                      <Input
                        name="plataformas_otro_texto"
                        maxLength={15}
                        value={formData.plataformas_otro_texto}
                        onChange={handleChange}
                        className={inputClass('plataformas', errors)}
                        placeholder="Especifica (máx. 15 caracteres)"
                      />
                    )}
                    <ErrorMsg name="plataformas" errors={errors} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Área de tu actividad</Label>
                    <select
                      name="categoria_actividad_seleccion"
                      value={formData.categoria_actividad_seleccion}
                      onChange={handleChange}
                      className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.categoria_actividad ? 'border-red-500' : 'border-neutral-300'}`}
                    >
                      <option value="" disabled>Selecciona una opción</option>
                      {CATEGORIA_ACTIVIDAD_OPTIONS.map(c => <option key={c.value} value={c.value}>{`${c.value} / Ej: ${c.ejemplo}`}</option>)}
                      <option value="Otro">Otro</option>
                    </select>
                    {formData.categoria_actividad_seleccion === 'Otro' && (
                      <Input
                        name="categoria_actividad"
                        maxLength={15}
                        value={formData.categoria_actividad}
                        onChange={handleChange}
                        className={inputClass('categoria_actividad', errors)}
                        placeholder="Especifica (máx. 15 caracteres)"
                      />
                    )}
                    <ErrorMsg name="categoria_actividad" errors={errors} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Tiempo de experiencia (conduciendo o en tu ocupación)</Label>
                  <select
                    name="anos_experiencia_declarados"
                    value={formData.anos_experiencia_declarados}
                    onChange={handleChange}
                    className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.anos_experiencia_declarados ? 'border-red-500' : 'border-neutral-300'}`}
                  >
                    <option value="" disabled>Selecciona una opción</option>
                    {TIEMPO_EXPERIENCIA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ErrorMsg name="anos_experiencia_declarados" errors={errors} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: LICENCIA */}
          {step === 4 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Tránsito</h1>
                <p className="text-humania-gray/80 text-lg">Declaración de legalidad.</p>
              </div>

              <div className="space-y-8">
                <div className="flex items-start space-x-4 p-6 border-l-4 border-humania-blue bg-humania-blue/5 shadow-sm">
                  <Checkbox
                    id="licencia"
                    checked={formData.licencia_declarada_vigente}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, licencia_declarada_vigente: !!checked }))}
                    className="mt-1 w-5 h-5 data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue"
                  />
                  <div className="space-y-2 leading-none">
                    <Label htmlFor="licencia" className="font-bold text-humania-blue cursor-pointer text-base">Declaro que tengo licencia de conducción VIGENTE</Label>
                    <p className="text-sm text-humania-gray/80 leading-relaxed">Comprendo que Humania verificará esta información objetivamente ante el RUNT.</p>
                    <ErrorMsg name="licencia_declarada_vigente" errors={errors} />
                  </div>
                </div>

                {formData.licencia_declarada_vigente && (
                  <div className="p-6 bg-white border border-neutral-200 animate-in fade-in slide-in-from-top-2 rounded-lg shadow-sm">
                    <Label className="text-humania-gray font-bold text-base block mb-4">¿Cuáles son las categorías de tu licencia?</Label>
                    <p className="text-sm text-humania-gray/70 mb-6">Selecciona todas las que apliquen a tu documento actual.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {LICENCIA_CATEGORIAS.map(cat => (
                        <div key={cat} className={`border rounded-md p-3 flex items-center space-x-3 cursor-pointer transition-colors ${formData.licencia_categorias.includes(cat) ? 'bg-humania-blue/5 border-humania-blue' : 'hover:border-humania-sand'}`} onClick={() => {
                          setFormData(prev => {
                            const cats = prev.licencia_categorias
                            return { ...prev, licencia_categorias: cats.includes(cat) ? cats.filter(c => c !== cat) : [...cats, cat] }
                          })
                        }}>
                          <Checkbox id={`cat-${cat}`} checked={formData.licencia_categorias.includes(cat)} className="data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue" />
                          <Label className="font-bold text-humania-blue cursor-pointer pointer-events-none">{cat}</Label>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2"><ErrorMsg name="licencia_categorias" errors={errors} /></div>
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-humania-gray font-medium">¿Cuántos comparendos estimas tener pendientes?</Label>
                  <Input name="cantidad_comparendos_declarados" maxLength={2} value={formData.cantidad_comparendos_declarados} onChange={handleChange} placeholder="Ej. 2" className={inputClass('cantidad_comparendos_declarados', errors)} />
                  <p className="text-xs text-humania-gray/70 font-medium mt-1">La cantidad de comparendos vigentes será tenida en cuenta durante el proceso de selección. Si tienes comparendos pendientes, es posible que debas responder preguntas adicionales para validar tu situación.</p>
                  <ErrorMsg name="cantidad_comparendos_declarados" errors={errors} />
                </div>

                {(() => {
                  const comp = parseInt(formData.cantidad_comparendos_declarados)
                  const requierePazYSalvo = !isNaN(comp) && comp >= 1 && comp <= SIMIT_MAX_FINES_REQUIRING_VALIDATION
                  if (!requierePazYSalvo) return null
                  return (
                    <div className="p-6 bg-white border border-neutral-200 animate-in fade-in slide-in-from-top-2 rounded-lg shadow-sm space-y-6">
                      <div className="space-y-3">
                        <Label className="text-humania-blue font-semibold text-base block">¿Tienes paz y salvo?</Label>
                        <RadioGroup
                          value={formData.paz_y_salvo_declarado}
                          onValueChange={(val) => setFormData(prev => ({ ...prev, paz_y_salvo_declarado: val as 'SI' | 'NO', acuerdo_pago_declarado: val === 'SI' ? '' : prev.acuerdo_pago_declarado }))}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                            <RadioGroupItem value="SI" id="pys-si" className="text-humania-blue w-5 h-5" />
                            <Label htmlFor="pys-si" className="font-medium cursor-pointer">Sí</Label>
                          </div>
                          <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                            <RadioGroupItem value="NO" id="pys-no" className="text-humania-blue w-5 h-5" />
                            <Label htmlFor="pys-no" className="font-medium cursor-pointer">No</Label>
                          </div>
                        </RadioGroup>
                        <ErrorMsg name="paz_y_salvo_declarado" errors={errors} />
                      </div>

                      {formData.paz_y_salvo_declarado === 'NO' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                          <Label className="text-humania-blue font-semibold text-base block">¿Tienes acuerdo de pago?</Label>
                          <RadioGroup
                            value={formData.acuerdo_pago_declarado}
                            onValueChange={(val) => setFormData(prev => ({ ...prev, acuerdo_pago_declarado: val as 'SI' | 'NO' }))}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                              <RadioGroupItem value="SI" id="ap-si" className="text-humania-blue w-5 h-5" />
                              <Label htmlFor="ap-si" className="font-medium cursor-pointer">Sí</Label>
                            </div>
                            <div className="flex items-center space-x-2 bg-neutral-50 border border-neutral-200 px-5 py-3 hover:border-humania-blue transition-colors cursor-pointer rounded-lg">
                              <RadioGroupItem value="NO" id="ap-no" className="text-humania-blue w-5 h-5" />
                              <Label htmlFor="ap-no" className="font-medium cursor-pointer">No</Label>
                            </div>
                          </RadioGroup>
                          <ErrorMsg name="acuerdo_pago_declarado" errors={errors} />
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* STEP 5: TRATAMIENTO DE DATOS (mismo consentimiento de siempre, ver _shared/TratamientoDatosStep) */}
          {step === 5 && (
            <TratamientoDatosStep error={tratamientoDatosError ?? undefined} onChange={setTratamientoDatos} />
          )}

          {/* STEP 6: ÉXITO */}
          {step === TOTAL_PASOS + 1 && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-humania-blue text-humania-sand rounded-full flex items-center justify-center mb-8 shadow-xl">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-4xl font-bold text-humania-blue tracking-tight mb-4">Solicitud Recibida</h2>
              <p className="text-humania-gray/80 text-lg max-w-md mx-auto leading-relaxed mb-10">
                Hemos registrado tu información exitosamente. Nuestro equipo evaluará tu perfil y nos pondremos en contacto contigo pronto.
              </p>
              <Link href="/">
                <Button className="bg-transparent text-humania-blue border border-humania-blue hover:bg-humania-blue hover:text-white px-10 py-6 text-base rounded-none tracking-widest font-bold transition-all uppercase">
                  Finalizar
                </Button>
              </Link>
            </div>
          )}

          {/* Navegación del Wizard */}
          {step <= TOTAL_PASOS && (
            <div className="mt-12 flex justify-between pt-6 border-t border-neutral-100 sticky bottom-0 bg-white py-4">
              {step > 1 ? (
                <Button
                  variant="ghost"
                  onClick={prevStep}
                  disabled={isSubmitting}
                  className="text-humania-gray hover:text-humania-blue hover:bg-neutral-50 px-3 sm:px-6 py-6 rounded-none font-medium text-sm sm:text-base"
                >
                  &larr; Volver
                </Button>
              ) : <div></div>}

              {step < TOTAL_PASOS ? (
                <Button onClick={nextStep} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-6 sm:px-10 py-6 text-sm sm:text-base font-semibold shadow-md transition-transform active:scale-95">
                  Continuar
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !tratamientoDatos.policyReadToEnd || !tratamientoDatos.dataAuthorization}
                  className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-4 sm:px-10 py-6 text-sm sm:text-base font-semibold shadow-md transition-transform active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Verificando...' : 'Enviar Solicitud'}
                </Button>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-humania-blue">Cargando...</div>}>
      <ApplyForm />
    </Suspense>
  )
}
