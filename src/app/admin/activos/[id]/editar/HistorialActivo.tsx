type RegistroHistorial = {
  id: string
  fecha_asignacion: string
  fecha_liberacion: string | null
  estatus_contractual_resultante: string | null
  candidatos: { nombres: string; apellidos: string } | null
}

const RESULTADO_ESTILO: Record<string, string> = {
  'INCUMPLIÓ CONTRATO': 'bg-red-50 text-red-700 border-red-200',
  'TERMINACIÓN POR MUTUO ACUERDO': 'bg-neutral-100 text-humania-gray border-neutral-200',
  'FINALIZÓ CONTRATO EXITOSAMENTE': 'bg-green-50 text-green-700 border-green-200',
}

function formatearFecha(fecha: string | null) {
  if (!fecha) return null
  return new Date(fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

export function HistorialActivo({ historial }: { historial: RegistroHistorial[] }) {
  if (!historial || historial.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm">
        <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest mb-3">Historial de Asignación</h4>
        <p className="text-sm text-neutral-400">Sin historial registrado.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm space-y-4">
      <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Historial de Asignación</h4>

      <div className="divide-y divide-neutral-100">
        {historial.map(registro => {
          const vigente = !registro.fecha_liberacion
          const nombreConductor = registro.candidatos
            ? `${registro.candidatos.nombres} ${registro.candidatos.apellidos}`
            : 'Candidato no disponible'

          return (
            <div key={registro.id} className="py-4 first:pt-0 last:pb-0 relative pl-4">
              <span className={`absolute left-0 top-5 w-1.5 h-1.5 rounded-full ${vigente ? 'bg-humania-blue' : 'bg-neutral-300'}`} />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-humania-blue">
                    {nombreConductor}
                    {vigente && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-widest bg-humania-blue/10 text-humania-blue px-2 py-0.5 rounded">
                        Conductor actual
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-humania-gray mt-1">
                    Asignado: {formatearFecha(registro.fecha_asignacion)}
                  </p>
                  <p className="text-xs text-humania-gray">
                    Entregado: {vigente ? '—' : (formatearFecha(registro.fecha_liberacion) || 'No registrada')}
                  </p>
                </div>

                {!vigente && registro.estatus_contractual_resultante && (
                  <span className={`text-xs font-medium px-3 py-1 rounded-md border w-fit ${RESULTADO_ESTILO[registro.estatus_contractual_resultante] || 'bg-neutral-100 text-humania-gray border-neutral-200'}`}>
                    {registro.estatus_contractual_resultante}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
