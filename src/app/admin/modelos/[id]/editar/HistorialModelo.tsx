type RegistroHistorial = {
  id: string
  accion: 'ACTIVAR' | 'DESACTIVAR'
  descripcion: string
  usuario_email: string
  created_at: string
}

function formatearFecha(fecha: string) {
  return new Date(fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

export function HistorialModelo({ historial }: { historial: RegistroHistorial[] }) {
  if (!historial || historial.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm">
        <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest mb-3">Historial de Activación</h4>
        <p className="text-sm text-neutral-400">Sin historial registrado.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm space-y-4">
      <h4 className="text-sm font-bold text-humania-gray/50 uppercase tracking-widest">Historial de Activación</h4>

      <div className="divide-y divide-neutral-100">
        {historial.map(registro => (
          <div key={registro.id} className="py-4 first:pt-0 last:pb-0 relative pl-4">
            <span className={`absolute left-0 top-5 w-1.5 h-1.5 rounded-full ${registro.accion === 'ACTIVAR' ? 'bg-green-500' : 'bg-red-400'}`} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-humania-blue">
                  {registro.accion === 'ACTIVAR' ? 'Activado' : 'Desactivado'}
                  <span className="ml-2 text-xs text-humania-gray font-normal">por {registro.usuario_email}</span>
                </p>
                <p className="text-xs text-humania-gray mt-1">{formatearFecha(registro.created_at)}</p>
                <p className="text-xs text-humania-gray mt-1">{registro.descripcion}</p>
              </div>
              <span className={`text-xs font-medium px-3 py-1 rounded-md border w-fit ${registro.accion === 'ACTIVAR' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {registro.accion}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
