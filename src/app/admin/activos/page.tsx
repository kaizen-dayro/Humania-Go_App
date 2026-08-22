import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Button } from "@/components/ui/button"
import { ActivosTable } from './ActivosTable'

export default async function ActivosPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: activosRaw, error } = await supabase
    .from('activos')
    .select(`
      *,
      modelos_vehiculo (
        nombre,
        image_url,
        marcas_vehiculo (nombre),
        tipos_vehiculo (nombre)
      ),
      activo_fotos ( storage_path, categoria, activo )
    `)
    .order('created_at', { ascending: false })

  if (error) console.error("Error fetching activos:", error)

  // Resuelve la foto principal vigente subida por Storage (si existe),
  // igual que en la página pública -- misma prioridad: Storage > campo
  // de texto legado del activo > campo de texto legado del modelo.
  const activos = (activosRaw || []).map((activo: any) => {
    const fotoPrincipal = activo.activo_fotos?.find((f: any) => f.categoria === 'PRINCIPAL' && f.activo)
    const imagenResuelta = fotoPrincipal
      ? supabase.storage.from('activo-fotos-publicas').getPublicUrl(fotoPrincipal.storage_path).data.publicUrl
      : (activo.image_url || activo.modelos_vehiculo?.image_url || null)
    return { ...activo, imagenResuelta }
  })

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-humania-blue">Gestión de Activos</h1>
          <p className="text-humania-gray">Inventario de vehículos y oportunidades</p>
        </div>
        <Link href="/admin/activos/nuevo">
          <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-6">
            + Nuevo Activo
          </Button>
        </Link>
      </div>

      <Suspense fallback={<div className="text-humania-gray">Cargando activos...</div>}>
        <ActivosTable activos={activos || []} />
      </Suspense>
    </div>
  )
}
