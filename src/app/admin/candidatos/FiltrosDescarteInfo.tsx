import { Zap, UserCheck } from 'lucide-react'
import { CollapsibleCard } from './[id]/CollapsibleCard'

/**
 * Referencia rapida de "por que se descarta un candidato" -- pedido
 * explicito del usuario (2026-09-17): un lugar donde ADMIN y SUPER_ADMIN
 * puedan repasar las condiciones reales del sistema cuando no las
 * recuerden, sin tener que ir a buscarlas en el codigo. Contenido 100%
 * estatico (sin datos de candidatos, sin RPC) -- las condiciones reales
 * viven en eligibility.ts / submit_application / bulk_change_candidate_status;
 * este componente solo las explica en lenguaje humano. Si una condicion
 * real cambia, este texto se debe actualizar a mano -- no se deriva del
 * codigo automaticamente.
 */
type Filtro = { label: string; descripcion: string }

const FILTROS_AUTOMATICOS: Filtro[] = [
  {
    label: 'Edad',
    descripcion: 'Debe tener entre 24 y 55 años. Fuera de ese rango, se descarta automáticamente.',
  },
  {
    label: 'Experiencia',
    descripcion: 'Debe tener al menos 1 año de experiencia declarada. Con "Menos de 1 año", se descarta automáticamente.',
  },
  {
    label: 'Licencia de conducción',
    descripcion: 'Debe declarar licencia vigente. El propio formulario público ya bloquea el envío si no lo declara — no llega a nuestro sistema.',
  },
  {
    label: 'Comparendos',
    descripcion: '0 comparendos aprueba directo. De 1 a 4, aprueba solo con paz y salvo o acuerdo de pago. Fuera de eso, ya no se descarta automáticamente — queda pendiente de que nosotros lo revisemos y decidamos ("Continuar proceso" / "Descartar por comparendos").',
  },
]

const FILTROS_MANUALES: Filtro[] = [
  {
    label: 'Fiador (ingresos o finca raíz)',
    descripcion: 'Si el fiador no declara ingresos desde $3.000.000 ni finca raíz, queda como alerta informativa — nosotros decidimos si se descarta.',
  },
  {
    label: 'Antecedentes (Policía / Procuraduría / Contraloría)',
    descripcion: 'Si algún antecedente queda "No Apto", es motivo para que nosotros decidamos descartar manualmente.',
  },
  {
    label: 'Visita domiciliaria',
    descripcion: '"No Apto" bloquea el paso a Seleccionado, pero no descarta solo — nosotros decidimos qué hacer con ese candidato.',
  },
  {
    label: 'Descarte manual (otro motivo)',
    descripcion: 'Cualquier otro motivo que el equipo decida, con explicación obligatoria.',
  },
]

function FiltroRow({ filtro, Icon }: { filtro: Filtro; Icon: typeof Zap }) {
  return (
    <div className="flex gap-3">
      <Icon className="w-4 h-4 text-humania-gray/40 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-humania-blue font-semibold">{filtro.label}</p>
        <p className="text-xs text-humania-gray mt-0.5">{filtro.descripcion}</p>
      </div>
    </div>
  )
}

export function FiltrosDescarteInfo() {
  return (
    <CollapsibleCard title="¿POR QUÉ SE DESCARTA UN CANDIDATO?">
      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <p className="text-[11px] text-humania-gray/50 font-bold tracking-widest mb-4 uppercase">Se descarta solo</p>
          <div className="space-y-4">
            {FILTROS_AUTOMATICOS.map(f => <FiltroRow key={f.label} filtro={f} Icon={Zap} />)}
          </div>
        </div>
        <div>
          <p className="text-[11px] text-humania-gray/50 font-bold tracking-widest mb-4 uppercase">Nosotros decidimos</p>
          <div className="space-y-4">
            {FILTROS_MANUALES.map(f => <FiltroRow key={f.label} filtro={f} Icon={UserCheck} />)}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  )
}
