"use client"

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertCircle } from 'lucide-react'
import {
  GENEROS, ApplicationPayload,
  PLATAFORMA_OPTIONS, CATEGORIA_ACTIVIDAD_OPTIONS, PARENTESCO_FAMILIAR_OPTIONS, RELACION_PERSONAL_OPTIONS, TIEMPO_CONOCERSE_OPTIONS, INGRESOS_OPTIONS,
} from '@/lib/domain/eligibility'
import { capitalizarPalabras, PHONE_CO } from '@/lib/validation'

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
const CAMPOS_NOMBRE_HUMANO = ['nombres', 'apellidos', 'barrio', 'categoria_actividad', 'plataformas_otro_texto', 'fiador_nombre', 'ref1_nombre', 'ref1_relacion', 'ref1_ocupacion', 'ref2_nombre', 'ref2_relacion', 'ref2_ocupacion'];

// Definido fuera de ApplyForm (no en cada render) para evitar recrear
// el componente en cada renderizado.
function ErrorMsg({ name, errors }: { name: string; errors: Record<string, string> }) {
  if (!errors[name]) return null
  return (
    <p className="flex items-center gap-1.5 text-red-600 text-sm mt-1.5 font-medium animate-in slide-in-from-top-1">
      <AlertCircle className="w-4 h-4" />
      {errors[name]}
    </p>
  )
}

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

  const [policyVersion, setPolicyVersion] = useState('')
  const [policyTitle, setPolicyTitle] = useState('')
  const [policyContent, setPolicyContent] = useState('')
  const [loadingPolicy, setLoadingPolicy] = useState(true)
  const [policyModalOpen, setPolicyModalOpen] = useState(false)
  const [policyReadToEnd, setPolicyReadToEnd] = useState(false)
  const [dataAuthorization, setDataAuthorization] = useState(false)

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
    fiador_nombre: '', fiador_documento: '', fiador_telefono: '',
    fiador_ingresos: '', fiador_finca_raiz: false,
    ref1_nombre: '', ref1_relacion_seleccion: '', ref1_relacion: '', ref1_telefono: '', ref1_tiempo: '', ref1_ocupacion_seleccion: '', ref1_ocupacion: '',
    ref2_nombre: '', ref2_relacion_seleccion: '', ref2_relacion: '', ref2_telefono: '', ref2_tiempo: '', ref2_ocupacion_seleccion: '', ref2_ocupacion: ''
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

  useEffect(() => {
    fetch('/api/privacy-policy')
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          setPolicyVersion(res.data.version)
          setPolicyTitle(res.data.title)
          setPolicyContent(res.data.content)
        }
      })
      .catch(console.error)
      .finally(() => setLoadingPolicy(false))
  }, [])

  function handlePolicyScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
      setPolicyReadToEnd(true)
    }
  }

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
    } else {
      // Filtros estrictos de input
      if (['edad', 'numero_documento', 'telefono', 'fiador_documento', 'fiador_telefono', 'ref1_telefono', 'ref2_telefono', 'anos_experiencia_declarados', 'cantidad_comparendos_declarados'].includes(name)) {
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
      const exp = parseInt(formData.anos_experiencia_declarados)
      if (isNaN(exp) || exp < 0 || exp > 60) {
        newErrors.anos_experiencia_declarados = "Debe ser un número entre 0 y 60."
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
      }
    }

    if (currentStep === 5) {
      if (formData.fiador_nombre.trim().length < 3) newErrors.fiador_nombre = "Nombre obligatorio."
      if (formData.fiador_documento.length < 6 || formData.fiador_documento.length > 10) {
        newErrors.fiador_documento = "Debe tener entre 6 y 10 números."
      }
      if (!PHONE_CO.test(formData.fiador_telefono)) {
        newErrors.fiador_telefono = "Debe tener exactamente 10 números e iniciar en 3."
      }
      if (!formData.fiador_ingresos) newErrors.fiador_ingresos = "Selecciona una opción."
    }

    if (currentStep === 6) {
      // Familiar
      if (formData.ref1_nombre.trim().length < 3) newErrors.ref1_nombre = "Mínimo 3 letras."
      if (!formData.ref1_relacion_seleccion) newErrors.ref1_relacion = "Selecciona una opción."
      else if (formData.ref1_relacion_seleccion === 'Otro familiar' && formData.ref1_relacion.trim().length < 2) newErrors.ref1_relacion = "Mínimo 2 letras."
      if (!PHONE_CO.test(formData.ref1_telefono)) newErrors.ref1_telefono = "Debe tener exactamente 10 números e iniciar en 3."
      if (!formData.ref1_tiempo) newErrors.ref1_tiempo = "Selecciona una opción."
      if (!formData.ref1_ocupacion_seleccion) newErrors.ref1_ocupacion = "Selecciona una opción."
      else if (formData.ref1_ocupacion_seleccion === 'Otro' && formData.ref1_ocupacion.trim().length < 2) newErrors.ref1_ocupacion = "Mínimo 2 letras."

      // Personal
      if (formData.ref2_nombre.trim().length < 3) newErrors.ref2_nombre = "Mínimo 3 letras."
      if (!formData.ref2_relacion_seleccion) newErrors.ref2_relacion = "Selecciona una opción."
      else if (formData.ref2_relacion_seleccion === 'Otro' && formData.ref2_relacion.trim().length < 2) newErrors.ref2_relacion = "Mínimo 2 letras."
      if (!PHONE_CO.test(formData.ref2_telefono)) newErrors.ref2_telefono = "Debe tener exactamente 10 números e iniciar en 3."
      if (!formData.ref2_tiempo) newErrors.ref2_tiempo = "Selecciona una opción."
      if (!formData.ref2_ocupacion_seleccion) newErrors.ref2_ocupacion = "Selecciona una opción."
      else if (formData.ref2_ocupacion_seleccion === 'Otro' && formData.ref2_ocupacion.trim().length < 2) newErrors.ref2_ocupacion = "Mínimo 2 letras."
    }

    if (currentStep === 7) {
      if (!policyReadToEnd) newErrors.dataAuthorization = "Debes leer la Política de Tratamiento de Datos Personales completa."
      else if (!dataAuthorization) newErrors.dataAuthorization = "Debes autorizar el tratamiento de tus datos personales."
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
    if (!validateStep(7)) return

    setIsSubmitting(true)
    setSubmitError(null)
    
    try {
      const payload: ApplicationPayload = {
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
        anos_experiencia_declarados: parseInt(formData.anos_experiencia_declarados) || 0,
        licencia_declarada_vigente: formData.licencia_declarada_vigente,
        licencia_categorias: formData.licencia_categorias,
        cantidad_comparendos_declarados: parseInt(formData.cantidad_comparendos_declarados) || 0,
        fiador: {
          nombre_completo: formData.fiador_nombre,
          numero_documento: formData.fiador_documento,
          telefono: formData.fiador_telefono,
          ingresos_mensuales_aprox: formData.fiador_ingresos,
          tiene_finca_raiz: formData.fiador_finca_raiz
        },
        referencias: [
          {
            tipo_referencia: 'FAMILIAR',
            nombre_completo: formData.ref1_nombre,
            parentesco_o_relacion: formData.ref1_relacion,
            telefono: formData.ref1_telefono,
            tiempo_conocimiento: formData.ref1_tiempo,
            ocupacion: formData.ref1_ocupacion
          },
          {
            tipo_referencia: 'PERSONAL',
            nombre_completo: formData.ref2_nombre,
            parentesco_o_relacion: formData.ref2_relacion,
            telefono: formData.ref2_telefono,
            tiempo_conocimiento: formData.ref2_tiempo,
            ocupacion: formData.ref2_ocupacion
          }
        ],
        policyVersion,
        dataAuthorization: dataAuthorization as true
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

      setStep(8) // Éxito

    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || 'Ocurrió un error inesperado al enviar la solicitud.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = (name: string) => `rounded-none border-neutral-300 focus-visible:ring-humania-sand h-12 transition-colors ${errors[name] ? 'border-red-500 focus-visible:ring-red-500 bg-red-50/30' : ''}`

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
            {step < 8 ? `PASO 0${step} / 07` : ''}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex justify-center py-12 px-6">
        <div className="w-full max-w-xl">
          
          {step > 1 && step < 8 && selectedOportunidad && (
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
                    <Input name="nombres" maxLength={111} value={formData.nombres} onChange={handleChange} placeholder="Ej. Juan Carlos" className={inputClass('nombres')} />
                    <ErrorMsg name="nombres" errors={errors} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Apellidos</Label>
                    <Input name="apellidos" maxLength={111} value={formData.apellidos} onChange={handleChange} placeholder="Ej. Pérez Gómez" className={inputClass('apellidos')} />
                    <ErrorMsg name="apellidos" errors={errors} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Edad</Label>
                    <Input name="edad" value={formData.edad} onChange={handleChange} maxLength={2} placeholder="Ej. 30" className={inputClass('edad')} />
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
                  <Input name="numero_documento" value={formData.numero_documento} onChange={handleChange} maxLength={10} placeholder="Ej. 1020304050" className={inputClass('numero_documento')} />
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
                  <Input type="email" name="correo_electronico" value={formData.correo_electronico} onChange={handleChange} className={inputClass('correo_electronico')} placeholder="usuario@ejemplo.com" />
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
                    className={inputClass('confirmacion_correo')} 
                  />
                  <ErrorMsg name="confirmacion_correo" errors={errors} />
                </div>

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Teléfono Móvil</Label>
                  <Input name="telefono" maxLength={10} value={formData.telefono} onChange={handleChange} placeholder="Ej. 3001234567" className={inputClass('telefono')} />
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
                  <Input name="barrio" maxLength={15} value={formData.barrio} onChange={handleChange} placeholder="Ej. Cedritos" className={inputClass('barrio')} />
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
                        className={inputClass('plataformas')}
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
                        className={inputClass('categoria_actividad')}
                        placeholder="Especifica (máx. 15 caracteres)"
                      />
                    )}
                    <ErrorMsg name="categoria_actividad" errors={errors} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Años de experiencia (manejando o en tu ocupación)</Label>
                  <Input name="anos_experiencia_declarados" maxLength={2} value={formData.anos_experiencia_declarados} onChange={handleChange} placeholder="Ej. 3" className={inputClass('anos_experiencia_declarados')} />
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
                  <Input name="cantidad_comparendos_declarados" maxLength={2} value={formData.cantidad_comparendos_declarados} onChange={handleChange} placeholder="Ej. 2" className={inputClass('cantidad_comparendos_declarados')} />
                  <p className="text-xs text-humania-gray/70 font-medium mt-1">La cantidad de comparendos vigentes será tenida en cuenta durante el proceso de selección. Las postulaciones con más de 3 comparendos pueden no ser elegibles.</p>
                  <ErrorMsg name="cantidad_comparendos_declarados" errors={errors} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: FIADOR */}
          {step === 5 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Respaldo Solidario</h1>
                <p className="text-humania-gray/80 text-lg">Información requerida de tu fiador.</p>
              </div>

              <div className="grid gap-6">
                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Nombre Completo del Fiador</Label>
                  <Input name="fiador_nombre" maxLength={111} value={formData.fiador_nombre} onChange={handleChange} placeholder="Ej. Maria Fernández" className={inputClass('fiador_nombre')} />
                  <ErrorMsg name="fiador_nombre" errors={errors} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Documento (Solo números)</Label>
                    <Input name="fiador_documento" maxLength={10} value={formData.fiador_documento} onChange={handleChange} placeholder="Ej. 1020304050" className={inputClass('fiador_documento')} />
                    <ErrorMsg name="fiador_documento" errors={errors} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-humania-gray font-medium">Teléfono</Label>
                    <Input name="fiador_telefono" maxLength={10} value={formData.fiador_telefono} onChange={handleChange} placeholder="Ej. 3001234567" className={inputClass('fiador_telefono')} />
                    <ErrorMsg name="fiador_telefono" errors={errors} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-humania-gray font-medium">Ingresos Mensuales Demostrables (COP)</Label>
                  <select
                    name="fiador_ingresos"
                    value={formData.fiador_ingresos}
                    onChange={handleChange}
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
                    checked={formData.fiador_finca_raiz} 
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, fiador_finca_raiz: !!checked }))}
                    className="data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue"
                  />
                  <Label htmlFor="fincaraiz" className="font-medium text-humania-blue cursor-pointer">Mi fiador posee finca raíz a su nombre</Label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: REFERENCIAS */}
          {step === 6 && (
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
                    <Input name="ref1_nombre" maxLength={60} value={formData.ref1_nombre} onChange={handleChange} placeholder="Ej. Carlos Pérez" className={inputClass('ref1_nombre')} />
                    <ErrorMsg name="ref1_nombre" errors={errors} />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Parentesco</Label>
                      <select name="ref1_relacion_seleccion" value={formData.ref1_relacion_seleccion} onChange={handleChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref1_relacion ? 'border-red-500' : 'border-neutral-300'}`}>
                        <option value="" disabled>Selecciona una opción</option>
                        {PARENTESCO_FAMILIAR_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      {formData.ref1_relacion_seleccion === 'Otro familiar' && (
                        <Input name="ref1_relacion" maxLength={15} value={formData.ref1_relacion} onChange={handleChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref1_relacion')} />
                      )}
                      <ErrorMsg name="ref1_relacion" errors={errors} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Teléfono</Label>
                      <Input name="ref1_telefono" maxLength={10} value={formData.ref1_telefono} onChange={handleChange} placeholder="Ej. 3001234567" className={inputClass('ref1_telefono')} />
                      <ErrorMsg name="ref1_telefono" errors={errors} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Tiempo de conocerse</Label>
                      <select name="ref1_tiempo" value={formData.ref1_tiempo} onChange={handleChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref1_tiempo ? 'border-red-500' : 'border-neutral-300'}`}>
                        <option value="" disabled>Selecciona una opción</option>
                        {TIEMPO_CONOCERSE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ErrorMsg name="ref1_tiempo" errors={errors} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Ocupación / Trabajo</Label>
                      <select name="ref1_ocupacion_seleccion" value={formData.ref1_ocupacion_seleccion} onChange={handleChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref1_ocupacion ? 'border-red-500' : 'border-neutral-300'}`}>
                        <option value="" disabled>Selecciona una opción</option>
                        {CATEGORIA_ACTIVIDAD_OPTIONS.map(c => <option key={c.value} value={c.value}>{`${c.value} / Ej: ${c.ejemplo}`}</option>)}
                        <option value="Otro">Otro</option>
                      </select>
                      {formData.ref1_ocupacion_seleccion === 'Otro' && (
                        <Input name="ref1_ocupacion" maxLength={15} value={formData.ref1_ocupacion} onChange={handleChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref1_ocupacion')} />
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
                    <Input name="ref2_nombre" maxLength={60} value={formData.ref2_nombre} onChange={handleChange} placeholder="Ej. Andrés Gómez" className={inputClass('ref2_nombre')} />
                    <ErrorMsg name="ref2_nombre" errors={errors} />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Relación con el candidato</Label>
                      <select name="ref2_relacion_seleccion" value={formData.ref2_relacion_seleccion} onChange={handleChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref2_relacion ? 'border-red-500' : 'border-neutral-300'}`}>
                        <option value="" disabled>Selecciona una opción</option>
                        {RELACION_PERSONAL_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      {formData.ref2_relacion_seleccion === 'Otro' && (
                        <Input name="ref2_relacion" maxLength={15} value={formData.ref2_relacion} onChange={handleChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref2_relacion')} />
                      )}
                      <ErrorMsg name="ref2_relacion" errors={errors} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Teléfono</Label>
                      <Input name="ref2_telefono" maxLength={10} value={formData.ref2_telefono} onChange={handleChange} placeholder="Ej. 3001234567" className={inputClass('ref2_telefono')} />
                      <ErrorMsg name="ref2_telefono" errors={errors} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Tiempo de conocerse</Label>
                      <select name="ref2_tiempo" value={formData.ref2_tiempo} onChange={handleChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref2_tiempo ? 'border-red-500' : 'border-neutral-300'}`}>
                        <option value="" disabled>Selecciona una opción</option>
                        {TIEMPO_CONOCERSE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ErrorMsg name="ref2_tiempo" errors={errors} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-humania-gray font-medium">Ocupación / Trabajo</Label>
                      <select name="ref2_ocupacion_seleccion" value={formData.ref2_ocupacion_seleccion} onChange={handleChange} className={`flex h-12 w-full rounded-none border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-humania-sand ${errors.ref2_ocupacion ? 'border-red-500' : 'border-neutral-300'}`}>
                        <option value="" disabled>Selecciona una opción</option>
                        {CATEGORIA_ACTIVIDAD_OPTIONS.map(c => <option key={c.value} value={c.value}>{`${c.value} / Ej: ${c.ejemplo}`}</option>)}
                        <option value="Otro">Otro</option>
                      </select>
                      {formData.ref2_ocupacion_seleccion === 'Otro' && (
                        <Input name="ref2_ocupacion" maxLength={15} value={formData.ref2_ocupacion} onChange={handleChange} placeholder="Especifica (máx. 15 caracteres)" className={inputClass('ref2_ocupacion')} />
                      )}
                      <ErrorMsg name="ref2_ocupacion" errors={errors} />
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* STEP 7: AUTORIZACIÓN */}
          {step === 7 && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-bold text-humania-blue tracking-tight mb-2">Autorización</h1>
                <p className="text-humania-gray/80 text-lg">Antes de enviar tu postulación, necesitamos tu autorización.</p>
              </div>

              <div className="space-y-6 bg-white border border-neutral-200 p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-humania-blue"></div>

                <div>
                  <button
                    type="button"
                    onClick={() => setPolicyModalOpen(true)}
                    disabled={loadingPolicy}
                    className="text-humania-blue font-semibold underline underline-offset-2 hover:text-humania-blue/80 disabled:opacity-50 cursor-pointer"
                  >
                    Consulte nuestra Política de Tratamiento y Protección de Datos Personales.
                  </button>
                  {!policyReadToEnd && (
                    <p className="text-xs text-humania-gray/70 mt-2">Debes abrir y leer la política completa antes de continuar.</p>
                  )}
                </div>

                <div className="flex items-start space-x-3 pt-4 p-4 border border-neutral-200 bg-neutral-50 rounded-lg">
                  <Checkbox
                    id="dataAuthorization"
                    checked={dataAuthorization}
                    onCheckedChange={(checked) => setDataAuthorization(!!checked)}
                    className="mt-0.5 data-[state=checked]:bg-humania-blue data-[state=checked]:border-humania-blue"
                  />
                  <Label htmlFor="dataAuthorization" className="font-normal text-humania-gray leading-relaxed cursor-pointer">
                    He leído y comprendido la Política de Tratamiento y Protección de Datos Personales de Humania Go y autorizo el tratamiento de mis datos personales conforme a sus finalidades.
                  </Label>
                </div>
                {errors.dataAuthorization && (
                  <p className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" />{errors.dataAuthorization}</p>
                )}
              </div>

              <Dialog open={policyModalOpen} onOpenChange={setPolicyModalOpen}>
                <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl max-h-[85vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="text-humania-blue">{policyTitle || 'Política de Tratamiento y Protección de Datos Personales'}</DialogTitle>
                    <p className="text-xs text-humania-gray/70">Versión {policyVersion}</p>
                  </DialogHeader>
                  <div
                    onScroll={handlePolicyScroll}
                    className="overflow-y-auto flex-1 mt-2 pr-2 text-sm text-humania-gray whitespace-pre-wrap leading-relaxed"
                  >
                    {policyContent}
                  </div>
                  {policyReadToEnd && (
                    <p className="text-xs text-green-700 pt-2 border-t border-neutral-100">Has llegado al final del documento.</p>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* STEP 8: ÉXITO */}
          {step === 8 && (
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
          {step < 8 && (
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

              {step < 7 ? (
                <Button onClick={nextStep} className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-6 sm:px-10 py-6 text-sm sm:text-base font-semibold shadow-md transition-transform active:scale-95">
                  Continuar
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !policyReadToEnd || !dataAuthorization}
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
