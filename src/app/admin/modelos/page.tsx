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

export default async function ModelosPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin/login')

  const { data: modelos, error } = await supabase
    .from('modelos_vehiculo')
    .select('id, nombre, activo, marcas_vehiculo(nombre, activo), tipos_vehiculo(nombre)')
    .order('nombre')

  if (error) console.error('Error fetching modelos:', error)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-humania-blue">Modelos</h1>
          <p className="text-humania-gray">Catálogo maestro de modelos de vehículos</p>
        </div>
        <Link href="/admin/modelos/nuevo">
          <Button className="bg-humania-blue hover:bg-humania-blue/90 text-white rounded-none px-6">
            + Nuevo Modelo
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-neutral-50/50">
            <TableRow>
              <TableHead>Modelo</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelos?.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium text-humania-blue">{m.nombre}</TableCell>
                <TableCell className="text-sm text-humania-gray">
                  {m.marcas_vehiculo?.nombre}
                  {!m.marcas_vehiculo?.activo && (
                    <span className="ml-2 text-[10px] text-amber-600 font-bold uppercase">Marca inactiva</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-humania-gray">{m.tipos_vehiculo?.nombre}</TableCell>
                <TableCell>
                  {m.activo ? (
                    <Badge className="bg-green-500 hover:bg-green-600">Activo</Badge>
                  ) : (
                    <Badge variant="outline">Inactivo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/modelos/${m.id}/editar`}>
                    <Button variant="outline" size="sm" className="rounded-sm">Editar</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}

            {(!modelos || modelos.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-neutral-500">
                  No hay modelos registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
