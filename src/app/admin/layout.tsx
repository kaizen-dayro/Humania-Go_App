import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { LayoutDashboard, Users, Car, Tag, Layers, ShieldCheck, LogOut, PlayCircle } from 'lucide-react'
import { RecuperacionNotificacion } from './RecuperacionNotificacion'
import { listarSolicitudesRecuperacionPendientes } from './actions'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  // Si no hay sesión (ej. en la página de login), renderizar sin Sidebar
  if (!session) {
    return <>{children}</>
  }

  // Solo para mostrar/ocultar el enlace del modulo y el nombre en la
  // cabecera -- la autorizacion real vive en la propia pagina
  // (server-side) y en RLS/RPC.
  const { data: caller } = await supabase
    .from('admin_users')
    .select('nombre, role')
    .eq('id', session.user.id)
    .single()
  const esSuperAdmin = caller?.role === 'SUPER_ADMIN'

  // Fase 13 (Documento 17 sección 9.3): solicitudes de recuperación de
  // contraseña pendientes, solo relevantes para SUPER_ADMIN. RLS ya
  // restringe el SELECT a is_super_admin(), pero se evita la consulta por
  // completo para un ADMIN normal.
  const solicitudesRecuperacion = esSuperAdmin
    ? (await listarSolicitudesRecuperacionPendientes()).solicitudes
    : []

  return (
    <div className="min-h-screen bg-neutral-50 flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-humania-blue text-white flex flex-col fixed inset-y-0 left-0 z-50">
        <div className="h-20 flex items-center px-6 border-b border-white/10">
          <Link href="/admin" className="text-xl font-bold tracking-tight">
            Humania <span className="font-normal text-humania-sand">Go</span>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <Link href="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <LayoutDashboard className="w-5 h-5 text-humania-sand" />
            Dashboard
          </Link>
          <Link href="/admin/candidatos" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Users className="w-5 h-5 text-humania-sand" />
            Candidatos
          </Link>
          <Link href="/admin/activos" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Car className="w-5 h-5 text-humania-sand" />
            Activos
          </Link>
          <Link href="/admin/marcas" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Tag className="w-5 h-5 text-humania-sand" />
            Marcas
          </Link>
          <Link href="/admin/modelos" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
            <Layers className="w-5 h-5 text-humania-sand" />
            Modelos
          </Link>
          {esSuperAdmin && (
            <Link href="/admin/administradores" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
              <ShieldCheck className="w-5 h-5 text-humania-sand" />
              Administradores
            </Link>
          )}
          {esSuperAdmin && (
            <Link href="/admin/presentacion" className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium">
              <PlayCircle className="w-5 h-5 text-humania-sand" />
              Video de presentación
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-white/10">
          <form action="/auth/signout" method="post">
            <button className="flex w-full items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-sm font-medium text-white/80 hover:text-white">
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 ml-64 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-end px-8 gap-3">
          {esSuperAdmin && <RecuperacionNotificacion solicitudesIniciales={solicitudesRecuperacion as any} />}
          <div className="text-right">
            <p className="text-sm font-semibold text-humania-blue leading-tight">{caller?.nombre || session.user.email}</p>
            <p className="text-xs text-humania-gray leading-tight">{session.user.email}</p>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full text-white ${esSuperAdmin ? 'bg-humania-blue' : 'bg-neutral-500'}`}>
            {esSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}
          </span>
        </header>
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
