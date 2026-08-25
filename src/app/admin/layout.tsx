import { createClient } from '@/utils/supabase/server'
import { RecuperacionNotificacion } from './RecuperacionNotificacion'
import { AdminSidebar } from './AdminSidebar'
import { EditarNombreButton } from './EditarNombreButton'
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
      <AdminSidebar esSuperAdmin={esSuperAdmin} />

      {/* Contenido Principal -- pt-16 en celular deja espacio para la barra
          superior fija de AdminSidebar; md:pt-0 porque en escritorio esa
          barra no existe (el sidebar siempre está visible aparte) */}
      <main className="flex-1 md:ml-64 pt-16 md:pt-0 flex flex-col min-h-screen">
        <header className="min-h-16 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-end gap-3 px-4 py-2 md:px-8 md:py-0">
          {esSuperAdmin && <RecuperacionNotificacion solicitudesIniciales={solicitudesRecuperacion as any} />}
          <EditarNombreButton nombreActual={caller?.nombre ?? null} correo={session.user.email!} />
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full text-white ${esSuperAdmin ? 'bg-humania-blue' : 'bg-neutral-500'}`}>
            {esSuperAdmin ? 'SUPER ADMIN' : 'ADMIN'}
          </span>
        </header>
        <div className="flex-1 p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
