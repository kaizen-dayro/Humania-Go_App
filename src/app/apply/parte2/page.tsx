"use client"

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { PHONE_CO, capitalizarPalabras } from '@/lib/validation'
import { FiadorFields, FiadorValues } from '../_shared/FiadorFields'
import { ReferenciasFields, ReferenciasValues } from '../_shared/ReferenciasFields'
import { ReferenciaLaboralFields, ReferenciaLaboralValues } from '../_shared/ReferenciaLaboralFields'
import { TratamientoDatosStep, TratamientoDatosState } from '../_shared/TratamientoDatosStep'

const LettersOnly = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]*$/;
const NumbersOnly = /^\d*$/;

// Campos de nombre humano (mismo criterio que apply/page.tsx): se
// capitalizan en vivo, se normalizan también en Postgres al guardar.
const CAMPOS_NOMBRE_HUMANO = ['fiador_nombre', 'ref1_nombre', 'ref1_relacion', 'ref1_ocupacion', 'ref2_nombre', 'ref2_relacion', 'ref2_ocupacion', 'contacto_nombre', 'contacto_empresa', 'contacto_cargo'];
const CAMPOS_SOLO_NUMEROS = ['fiador_documento', 'fiador_telefono', 'ref1_telefono', 'ref2_telefono', 'contacto_telefono'];

const TOTAL_PASOS = 4

type FormData = FiadorValues & ReferenciasValues & ReferenciaLaboralValues

const initialFormData: FormData = {
  fiador_nombre: '', fiador_documento: '', fiador_telefono: '', fiador_ingresos: '', fiador_finca_raiz: false,
  ref1_nombre: '', ref1_relacion_seleccion: '', ref1_relacion: '', ref1_telefono: '', ref1_tiempo: '', ref1_ocupacion_seleccion: '', ref1_ocupacion: '',
  ref2_nombre: '', ref2_relacion_seleccion: '', ref2_relacion: '', ref2_telefono: '', ref2_tiempo: '', ref2_ocupacion_seleccion: '', ref2_ocupacion: '',
  contacto_nombre: '', contacto_empresa: '', contacto_cargo: '', contacto_relacion: '', contacto_telefono: '',
}

function ApplyParte2Form() {
  const searchParams = useSearchParams()
  const candidatoId = searchParams.get('candidato_id')
  const token = searchParams.get('token')

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [tratamientoDatos, setTratamientoDatos] = useState<TratamientoDatosState>({ dataAuthorization: false, policyVersion: '', policyReadToEnd: false })
  const [tratamientoDatosError, setTratamientoDatosError] = useState<string | null>(null)

  // KAI-18: saluda por nombre antes de dejar llenar el formulario -- de
  // paso, detecta un enlace inválido/vencido/ya usado de inmediato, en
  // vez de dejar que la persona llene todo para fallar recién al enviar.
  const [nombreCandidato, setNombreCandidato] = useState<string | null>(null)
  // Solo arranca "cargando" si hay algo que cargar -- si faltan los
  // parámetros, el componente ya retorna "Enlace inválido" más abajo sin
  // depender de este estado.
  const [cargandoNombre, setCargandoNombre] = useState(!!candidatoId && !!token)

  useEffect(() => {
    if (!candidatoId || !token) return
    fetch(`/api/apply/parte2/candidato?candidato_id=${candidatoId}&token=${token}`)
      .then(res => res.json())
      .then(res => setNombreCandidato(res.success ? res.data.nombres : null))
      .catch(() => setNombreCandidato(null))
      .finally(() => setCargandoNombre(false))
  }, [candidatoId, token])

  if (!candidatoId || !token) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h1 className="text-2xl font-bold text-humania-blue">Enlace inválido</h1>
          <p className="text-humania-gray/80">Este enlace no está completo. Verifica que lo copiaste completo, o comunícate con nuestro equipo de Humania Go.</p>
        </div>
      </div>
    )
  }

  if (cargandoNombre) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-humania-blue">Cargando...</div>
    )
  }

  if (!nombreCandidato) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h1 className="text-2xl font-bold text-humania-blue">Enlace no disponible</h1>
          <p className="text-humania-gray/80">Este enlace ya no está activo -- puede haber vencido, ya haber sido usado, o el proceso ya no continúa. Si crees que esto es un error, comunícate con nuestro equipo de Humania Go.</p>
        </div>
      </div>
    )
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name.endsWith('_seleccion')) {
      const campoFinal = name.replace('_seleccion', '')
      setFormData(prev => ({ ...prev, [name]: value, [campoFinal]: value === 'Otro' || value === 'Otro familiar' ? '' : value }))
      if (errors[campoFinal]) setErrors(prev => ({ ...prev, [campoFinal]: '' }))
    } else if (CAMPOS_SOLO_NUMEROS.includes(name)) {
      if (!NumbersOnly.test(value)) return
      setFormData(prev => ({ ...prev, [name]: value }))
    } else if (CAMPOS_NOMBRE_HUMANO.includes(name)) {
      if (!LettersOnly.test(value)) return
      const inputEl = e.target instanceof HTMLInputElement ? e.target : null
      const cursorPos = inputEl ? inputEl.selectionStart : null
      setFormData(prev => ({ ...prev, [name]: capitalizarPalabras(value) }))
      if (cursorPos !== null && inputEl) {
        requestAnimationFrame(() => inputEl.setSelectionRange(cursorPos, cursorPos))
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (currentStep === 1) {
      if (formData.fiador_nombre.trim().length < 3) newErrors.fiador_nombre = "Nombre obligatorio."
      if (formData.fiador_documento.length < 6 || formData.fiador_documento.length > 10) {
        newErrors.fiador_documento = "Debe tener entre 6 y 10 números."
      }
      if (!PHONE_CO.test(formData.fiador_telefono)) {
        newErrors.fiador_telefono = "Debe tener exactamente 10 números e iniciar en 3."
      }
      if (!formData.fiador_ingresos) newErrors.fiador_ingresos = "Selecciona una opción."
    }

    if (currentStep === 2) {
      if (formData.ref1_nombre.trim().length < 3) newErrors.ref1_nombre = "Mínimo 3 letras."
      if (!formData.ref1_relacion_seleccion) newErrors.ref1_relacion = "Selecciona una opción."
      else if (formData.ref1_relacion_seleccion === 'Otro familiar' && formData.ref1_relacion.trim().length < 2) newErrors.ref1_relacion = "Mínimo 2 letras."
      if (!PHONE_CO.test(formData.ref1_telefono)) newErrors.ref1_telefono = "Debe tener exactamente 10 números e iniciar en 3."
      if (!formData.ref1_tiempo) newErrors.ref1_tiempo = "Selecciona una opción."
      if (!formData.ref1_ocupacion_seleccion) newErrors.ref1_ocupacion = "Selecciona una opción."
      else if (formData.ref1_ocupacion_seleccion === 'Otro' && formData.ref1_ocupacion.trim().length < 2) newErrors.ref1_ocupacion = "Mínimo 2 letras."

      if (formData.ref2_nombre.trim().length < 3) newErrors.ref2_nombre = "Mínimo 3 letras."
      if (!formData.ref2_relacion_seleccion) newErrors.ref2_relacion = "Selecciona una opción."
      else if (formData.ref2_relacion_seleccion === 'Otro' && formData.ref2_relacion.trim().length < 2) newErrors.ref2_relacion = "Mínimo 2 letras."
      if (!PHONE_CO.test(formData.ref2_telefono)) newErrors.ref2_telefono = "Debe tener exactamente 10 números e iniciar en 3."
      if (!formData.ref2_tiempo) newErrors.ref2_tiempo = "Selecciona una opción."
      if (!formData.ref2_ocupacion_seleccion) newErrors.ref2_ocupacion = "Selecciona una opción."
      else if (formData.ref2_ocupacion_seleccion === 'Otro' && formData.ref2_ocupacion.trim().length < 2) newErrors.ref2_ocupacion = "Mínimo 2 letras."
    }

    if (currentStep === 3) {
      if (formData.contacto_nombre.trim().length < 5) newErrors.contacto_nombre = "Obligatorio (mínimo 5 letras)."
      if (formData.contacto_empresa.trim().length < 5) newErrors.contacto_empresa = "Obligatorio (mínimo 5 letras)."
      if (formData.contacto_cargo.trim().length < 5) newErrors.contacto_cargo = "Obligatorio (mínimo 5 letras)."
      if (!formData.contacto_relacion) newErrors.contacto_relacion = "Selecciona una opción."
      if (!PHONE_CO.test(formData.contacto_telefono)) newErrors.contacto_telefono = "Debe tener exactamente 10 números e iniciar en 3."
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const nextStep = () => {
    if (validateStep(step)) {
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
      const payload = {
        candidato_id: candidatoId,
        token,
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
        referenciaLaboral: {
          contacto_nombre: formData.contacto_nombre,
          contacto_empresa: formData.contacto_empresa,
          contacto_cargo: formData.contacto_cargo,
          contacto_relacion: formData.contacto_relacion,
          contacto_telefono: formData.contacto_telefono
        },
        policyVersion: tratamientoDatos.policyVersion,
        dataAuthorization: tratamientoDatos.dataAuthorization
      }

      const res = await fetch('/api/apply/parte2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.message || 'Ocurrió un error en el servidor. Revisa los datos.')
      }

      setStep(TOTAL_PASOS + 1)
    } catch (err) {
      console.error(err)
      setSubmitError(err instanceof Error ? err.message : 'Ocurrió un error inesperado al enviar la información.')
    } finally {
      setIsSubmitting(false)
    }
  }

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

          {step <= TOTAL_PASOS && (
            <div className="mb-10 pb-4 border-b border-neutral-100 animate-in fade-in">
              <p className="text-xs text-humania-gray uppercase tracking-wider mb-1">Continuando tu postulación</p>
              <p className="text-humania-blue font-semibold text-lg">Hola, {nombreCandidato}.</p>
            </div>
          )}

          {submitError && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 rounded-md">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {submitError}
            </div>
          )}

          {step === 1 && (
            <FiadorFields
              values={formData}
              errors={errors}
              onChange={handleChange}
              onFincaRaizChange={(checked) => setFormData(prev => ({ ...prev, fiador_finca_raiz: checked }))}
            />
          )}

          {step === 2 && (
            <ReferenciasFields values={formData} errors={errors} onChange={handleChange} />
          )}

          {step === 3 && (
            <ReferenciaLaboralFields
              values={formData}
              errors={errors}
              onChange={handleChange}
              onRelacionChange={(value) => setFormData(prev => ({ ...prev, contacto_relacion: value }))}
            />
          )}

          {step === 4 && (
            <TratamientoDatosStep error={tratamientoDatosError ?? undefined} onChange={setTratamientoDatos} />
          )}

          {step === TOTAL_PASOS + 1 && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-humania-blue text-humania-sand rounded-full flex items-center justify-center mb-8 shadow-xl">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-4xl font-bold text-humania-blue tracking-tight mb-4">Información Recibida</h2>
              <p className="text-humania-gray/80 text-lg max-w-md mx-auto leading-relaxed mb-10">
                Recibimos los datos de tu fiador, tus referencias y tu referencia laboral. Confirmaremos tu información y te contactaremos pronto.
              </p>
              <Link href="/">
                <Button className="bg-transparent text-humania-blue border border-humania-blue hover:bg-humania-blue hover:text-white px-10 py-6 text-base rounded-none tracking-widest font-bold transition-all uppercase">
                  Finalizar
                </Button>
              </Link>
            </div>
          )}

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
                  {isSubmitting ? 'Enviando...' : 'Enviar Información'}
                </Button>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default function ApplyParte2Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-humania-blue">Cargando...</div>}>
      <ApplyParte2Form />
    </Suspense>
  )
}
