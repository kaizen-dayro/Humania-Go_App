'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { bulkChangeCandidateState } from '@/app/admin/actions'

export function CandidateActions({
  candidatoId,
  currentState,
  evaluacionCompleta,
  referenciaLaboralCompleta,
  puedeDesistirDesdeSeleccionado = false,
}: {
  candidatoId: string
  currentState: string
  evaluacionCompleta: boolean
  referenciaLaboralCompleta: boolean
  puedeDesistirDesdeSeleccionado?: boolean
}) {
  const [loading, setLoading] = useState(false)

  const handleAction = async (newState: string, confirmMessage: string) => {
    if (newState === 'SELECCIONADO' && !evaluacionCompleta) {
      alert('No puedes seleccionar este candidato todavía.\n\nLa Información Avanzada (Entrevista) debe estar completamente diligenciada antes de avanzar a la etapa de selección.')
      return
    }
    if (newState === 'SELECCIONADO' && !referenciaLaboralCompleta) {
      alert('No puedes seleccionar este candidato todavía.\n\nLa Referencia Laboral debe estar completa antes de avanzar a la etapa de selección.')
      return
    }
    if (confirm(confirmMessage)) {
      const motivo = prompt('Por favor, ingresa el motivo del cambio de estado (Obligatorio):')
      if (!motivo || !motivo.trim()) {
        alert('El motivo es obligatorio para realizar el cambio de estado.')
        return
      }
      setLoading(true)
      const res = await bulkChangeCandidateState([candidatoId], newState, motivo.trim())
      setLoading(false)
      if (res.error) {
        alert(res.error)
      }
    }
  }

  if (currentState === 'DESISTE') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => handleAction('REVISION_PRELIMINAR', '¿Confirmas que deseas pasar este candidato nuevamente a revisión?')}
          disabled={loading}
          className="bg-amber-200 hover:bg-amber-300 text-humania-blue font-semibold"
        >
          Pasar a Revisión
        </Button>
      </div>
    )
  }

  return (
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
            ? '¿Confirmas que deseas marcar a este candidato como Desiste?\n\nEsta acción revierte su selección. Solo es posible porque todavía no se le ha asignado ningún activo de la empresa.'
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
  )
}
