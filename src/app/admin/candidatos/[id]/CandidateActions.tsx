'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { bulkChangeCandidateState, continuarProcesoComparendos, descartarPorComparendos } from '@/app/admin/actions'
import { MotivoModal } from './MotivoModal'

const NOTA_SUGERIDA_DESCARTE_COMPARENDOS = 'Descartado tras revisión manual de comparendos.'

export function CandidateActions({
  candidatoId,
  currentState,
  evaluacionCompleta,
  referenciaLaboralCompleta,
  visitaDomiciliariaCompleta,
  visitaDomiciliariaNoApta,
  puedeDesistirDesdeSeleccionado = false,
  comparendosPendiente = false,
}: {
  candidatoId: string
  currentState: string
  evaluacionCompleta: boolean
  referenciaLaboralCompleta: boolean
  visitaDomiciliariaCompleta: boolean
  visitaDomiciliariaNoApta: boolean
  puedeDesistirDesdeSeleccionado?: boolean
  comparendosPendiente?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ newState: string; description: string } | null>(null)
  const [continuarOpen, setContinuarOpen] = useState(false)
  const [descartarComparendosOpen, setDescartarComparendosOpen] = useState(false)

  const handleAction = (newState: string, description: string) => {
    if (newState === 'SELECCIONADO' && !evaluacionCompleta) {
      alert('No puedes seleccionar este candidato todavía.\n\nLa Información Avanzada (Entrevista) debe estar completamente diligenciada antes de avanzar a la etapa de selección.')
      return
    }
    if (newState === 'SELECCIONADO' && !referenciaLaboralCompleta) {
      alert('No puedes seleccionar este candidato todavía.\n\nLa Referencia Laboral debe estar completa antes de avanzar a la etapa de selección.')
      return
    }
    if (newState === 'SELECCIONADO' && visitaDomiciliariaNoApta) {
      alert('No puedes seleccionar a este candidato: la visita domiciliaria lo calificó como No Apto.')
      return
    }
    if (newState === 'SELECCIONADO' && !visitaDomiciliariaCompleta) {
      alert('No puedes seleccionar este candidato todavía.\n\nLa visita domiciliaria debe estar realizada y calificada antes de avanzar a la etapa de selección.')
      return
    }
    setPendingAction({ newState, description })
  }

  const handleConfirmMotivo = async (motivo: string) => {
    if (!pendingAction) return
    setLoading(true)
    const res = await bulkChangeCandidateState([candidatoId], pendingAction.newState, motivo)
    setLoading(false)
    if (res.error) {
      alert(res.error)
      return
    }
    setPendingAction(null)
  }

  const handleConfirmContinuar = async (nota: string) => {
    setLoading(true)
    const res = await continuarProcesoComparendos(candidatoId, nota || null)
    setLoading(false)
    if (res.error) {
      alert(res.error)
      return
    }
    setContinuarOpen(false)
  }

  const handleConfirmDescartarComparendos = async (motivo: string) => {
    setLoading(true)
    const res = await descartarPorComparendos(candidatoId, motivo)
    setLoading(false)
    if (res.error) {
      alert(res.error)
      return
    }
    setDescartarComparendosOpen(false)
  }

  return (
    <>
      <MotivoModal
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) setPendingAction(null) }}
        title="Confirmar cambio de estado"
        description={pendingAction?.description || ''}
        confirmLabel="Confirmar cambio"
        loading={loading}
        onConfirm={handleConfirmMotivo}
      />

      {/* KAI-38: "Continuar proceso" -- nota opcional, permite dígitos, sin
          mínimo de caracteres (solo si se escribe algo, ver MotivoModal). */}
      <MotivoModal
        open={continuarOpen}
        onOpenChange={setContinuarOpen}
        title="Continuar proceso"
        description='Humania Go revisó el caso de comparendos de este candidato y decidió permitir que continúe en el proceso. Esto no elimina los comparendos ni lo hace automáticamente elegible para todas las etapas — solo libera el bloqueo de esta revisión.'
        confirmLabel="Confirmar: continuar proceso"
        loading={loading}
        onConfirm={handleConfirmContinuar}
        required={false}
        minLength={1}
        maxLength={500}
        allowDigits
        label="Nota de revisión (opcional)"
        placeholder="Escribe una nota si quieres dejar contexto adicional..."
      />

      {/* KAI-38: "Descartar por comparendos" -- motivo obligatorio,
          pre-cargado con el texto sugerido, editable. Registra causal
          COMPARENDOS en KAI-36, nunca MANUAL. */}
      <MotivoModal
        open={descartarComparendosOpen}
        onOpenChange={setDescartarComparendosOpen}
        title="Descartar por comparendos"
        description="Confirma que deseas descartar a este candidato tras la revisión manual de comparendos. Esta acción es definitiva."
        confirmLabel="Confirmar descarte"
        loading={loading}
        onConfirm={handleConfirmDescartarComparendos}
        initialValue={NOTA_SUGERIDA_DESCARTE_COMPARENDOS}
      />

      {comparendosPendiente ? (
        // KAI-38: mientras la revisión de comparendos está pendiente, no
        // se muestra el botón genérico "Descartar candidato" ni "Pasar a
        // entrevista" (ambos rechazados de todas formas por
        // bulk_change_candidate_status, ver migración 00073). "Desiste" SÍ
        // se mantiene -- decisión explícita en plan.md: el candidato puede
        // desistir por su cuenta sin relación con la revisión interna, y
        // la RPC ya lo permite; ocultarlo aquí lo habría dejado
        // inalcanzable desde la interfaz.
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setContinuarOpen(true)}
            disabled={loading}
            className="bg-humania-blue hover:bg-humania-blue/90"
          >
            Continuar proceso
          </Button>
          <Button
            onClick={() => setDescartarComparendosOpen(true)}
            disabled={loading}
            variant="destructive"
          >
            Descartar por comparendos
          </Button>
          {(currentState === 'REVISION_PRELIMINAR' || currentState === 'BACKUP' || currentState === 'ENTREVISTA' ||
            (currentState === 'SELECCIONADO' && puedeDesistirDesdeSeleccionado)) && (
            <Button
              onClick={() => handleAction('DESISTE', '¿Confirmas que deseas marcar a este candidato como Desiste?')}
              disabled={loading}
              variant="outline"
            >
              Desiste
            </Button>
          )}
        </div>
      ) : currentState === 'DESISTE' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => handleAction('REVISION_PRELIMINAR', '¿Confirmas que deseas pasar este candidato nuevamente a revisión?')}
            disabled={loading}
            className="bg-amber-200 hover:bg-amber-300 text-humania-blue font-semibold"
          >
            Pasar a Revisión
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {currentState !== 'ENTREVISTA' && currentState !== 'SELECCIONADO' && currentState !== 'DESCARTADO' && (
            <Button
              onClick={() => handleAction('ENTREVISTA', '¿Confirmas que deseas pasar este candidato a la fase de entrevista?')}
              disabled={loading}
              className="bg-humania-blue hover:bg-humania-blue/90"
            >
              Pasar a entrevista
            </Button>
          )}

          {currentState === 'ENTREVISTA' && (
            <Button
              onClick={() => handleAction('SELECCIONADO', '¿Confirmas que deseas seleccionar a este candidato?')}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Seleccionar candidato
            </Button>
          )}

          {(currentState === 'REVISION_PRELIMINAR' || currentState === 'BACKUP' || currentState === 'ENTREVISTA' ||
            (currentState === 'SELECCIONADO' && puedeDesistirDesdeSeleccionado)) && (
            <Button
              onClick={() => handleAction('DESISTE', currentState === 'SELECCIONADO'
                ? '¿Confirmas que deseas marcar a este candidato como Desiste? Esta acción revierte su selección. Solo es posible porque todavía no se le ha asignado ningún activo de la empresa.'
                : '¿Confirmas que deseas marcar a este candidato como Desiste?')}
              disabled={loading}
              variant="outline"
            >
              Desiste
            </Button>
          )}

          {currentState !== 'DESCARTADO' && currentState !== 'SELECCIONADO' && (
            <Button
              onClick={() => handleAction('DESCARTADO', '¿Confirmas que deseas marcar esta postulación como descartada?')}
              disabled={loading}
              variant="destructive"
            >
              Descartar candidato
            </Button>
          )}

          {currentState === 'ENTREVISTA' && (
            <Button
              onClick={() => handleAction('BACKUP', '¿Confirmas que deseas pasar este candidato a Backup?')}
              disabled={loading}
              variant="outline"
            >
              Pasar a Backup
            </Button>
          )}
        </div>
      )}
    </>
  )
}
