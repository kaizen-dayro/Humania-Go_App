import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { CalculadoraPresupuesto } from './CalculadoraPresupuesto'
import { leerCotizacionSeguroVigente } from './cotizacionSeguro'

export default async function PresupuestoPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  // Mismo patrón de admin/administradores/page.tsx: RLS/Server Actions ya
  // protegen cada operación real (guardarPresupuesto/listarPresupuestos),
  // esta verificación en la propia página evita mostrarle la pantalla a
  // un ADMIN común.
  const { data: caller } = await supabase
    .from('admin_users')
    .select('role, activo')
    .eq('id', session.user.id)
    .single()

  if (!caller || !caller.activo || caller.role !== 'SUPER_ADMIN') {
    redirect('/admin')
  }

  // Datos de la financiación vigente del seguro (RLS: solo SUPER_ADMIN, ya verificado arriba). Son
  // INFORMATIVOS: no participan en ningún indicador financiero (spec.md 31).
  const lecturaCotizacion = await leerCotizacionSeguroVigente(supabase)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-humania-blue">Calculadora de Presupuesto</h1>
        <p className="text-humania-gray">Modelo financiero del ciclo vehículo-conductor — exclusivo SUPER_ADMIN</p>
      </div>

      <CalculadoraPresupuesto
        key={lecturaCotizacion.financiacionId ?? lecturaCotizacion.estado}
        cotizacionSeguro={lecturaCotizacion.cotizacion}
        estadoCotizacionSeguro={lecturaCotizacion.estado}
      />
    </div>
  )
}
