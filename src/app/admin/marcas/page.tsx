import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default async function MarcasPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: marcas, error } = await supabase
    .from('marcas_vehiculo')
    .select('id, nombre, activo, modelos_vehiculo(count)')
    .order('nombre')

  if (error) console.error('Error fetching marcas:', error)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-humania-blue">Marcas</h1>
          <p className="text-humania-gray">Catálogo maestro de marcas de vehículos</p>
        </div>
        <Link href="/admin/marcas/nueva">
          <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-6">
            + Nueva Marca
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-neutral-50/50">
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Modelos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {marcas?.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium text-humania-blue">{m.nombre}</TableCell>
                <TableCell className="text-sm text-humania-gray">{m.modelos_vehiculo?.[0]?.count ?? 0}</TableCell>
                <TableCell>
                  {m.activo ? (
                    <Badge className="bg-green-500 hover:bg-green-600">Activa</Badge>
                  ) : (
                    <Badge variant="outline">Inactiva</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/marcas/${m.id}/editar`}>
                    <Button variant="outline" size="sm" className="rounded-sm">Editar</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}

            {(!marcas || marcas.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-32 text-neutral-500">
                  No hay marcas registradas.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
