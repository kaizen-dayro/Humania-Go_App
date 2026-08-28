import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertCircle } from 'lucide-react'

// Extraído de apply/page.tsx (Paso 7, "Autorización") -- KAI-9/KAI-13.
// Mismo consentimiento de siempre (Documento 11), ahora reutilizado tanto
// al final de la Parte 1 como al final de la Parte 2 (KAI-9: "Términos y
// Condiciones" del pedido original resultó ser este mismo consentimiento,
// pedido dos veces -- no un documento nuevo). Autocontenido: maneja su
// propia consulta a /api/privacy-policy y el modal de lectura; expone el
// estado necesario hacia el wizard que lo use vía onChange.
export type TratamientoDatosState = {
  dataAuthorization: boolean
  policyVersion: string
  policyReadToEnd: boolean
}

export function TratamientoDatosStep({
  error,
  onChange,
}: {
  error?: string
  onChange: (state: TratamientoDatosState) => void
}) {
  const [policyVersion, setPolicyVersion] = useState('')
  const [policyTitle, setPolicyTitle] = useState('')
  const [policyContent, setPolicyContent] = useState('')
  const [loadingPolicy, setLoadingPolicy] = useState(true)
  const [policyModalOpen, setPolicyModalOpen] = useState(false)
  const [policyReadToEnd, setPolicyReadToEnd] = useState(false)
  const [dataAuthorization, setDataAuthorization] = useState(false)

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

  useEffect(() => {
    onChange({ dataAuthorization, policyVersion, policyReadToEnd })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAuthorization, policyVersion, policyReadToEnd])

  function handlePolicyScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
      setPolicyReadToEnd(true)
    }
  }

  return (
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
        {error && (
          <p className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</p>
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
  )
}
