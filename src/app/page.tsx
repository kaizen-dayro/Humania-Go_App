import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 0;

async function getAvailableAssets() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  const { data, error } = await supabase
    .from('activos')
    .select(`
      id,
      codigo_interno,
      estado,
      image_url,
      modelos_vehiculo (
        nombre,
        image_url,
        marcas_vehiculo (nombre),
        tipos_vehiculo (nombre)
      ),
      activo_fotos ( storage_path )
    `)
    .eq('estado', 'DISPONIBLE')

  if (error) {
    console.error("Error fetching assets:", error)
    return []
  }

  // RLS en activo_fotos solo expone, a un cliente publico, la foto
  // PRINCIPAL vigente (categoria='PRINCIPAL' AND activo=true) de cada
  // activo -- por eso alcanza con tomar la primera fila, si existe. Si
  // no hay foto subida por Storage, se cae al campo de texto legado.
  return (data || []).map((activo: any) => {
    const fotoPrincipal = activo.activo_fotos?.[0]
    const imagenResuelta = fotoPrincipal
      ? supabase.storage.from('activo-fotos-publicas').getPublicUrl(fotoPrincipal.storage_path).data.publicUrl
      : (activo.image_url || activo.modelos_vehiculo?.image_url || null)
    return { ...activo, imagenResuelta }
  })
}

// Subcomponente interno para aislar la lógica de visualización del Asset
function VehicleOpportunityCard({ activo }: { activo: any }) {
  const modelo = activo.modelos_vehiculo
  const marca = modelo.marcas_vehiculo.nombre
  const tipo = modelo.tipos_vehiculo.nombre
  const img = activo.imagenResuelta

  // El diseño exige "Video-inspired vehicle cards", con overlays, transiciones y un Media Container proporcionado (16/9)
  return (
    <div className="group relative w-full rounded-2xl overflow-hidden bg-neutral-100 shadow-sm hover:shadow-2xl transition-all duration-500 flex flex-col cursor-pointer border border-neutral-200">
      
      {/* Contenedor Media 16:9 con fondo que aísla visualmente transparencias o fotos irregulares */}
      <div className="relative w-full aspect-[16/9] bg-gradient-to-t from-neutral-200 to-neutral-50 overflow-hidden flex items-center justify-center">
        {img ? (
          <img 
            src={img} 
            alt={`${marca} ${modelo.nombre}`}
            className="w-[90%] h-[90%] object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"
          />
        ) : (
          <span className="text-neutral-400 font-medium tracking-widest uppercase text-sm">Sin Imagen</span>
        )}
        
        {/* Etiqueta tipo en overlay arriba a la izquierda */}
        <div className="absolute top-4 left-4 z-10">
          <span className="bg-white/90 backdrop-blur-sm px-3 py-1 text-xs font-bold tracking-widest text-humania-blue uppercase rounded-full shadow-sm">
            {tipo}
          </span>
        </div>
      </div>

      {/* Panel Inferior de Información */}
      <div className="relative p-6 md:p-8 bg-white border-t border-white flex flex-col justify-between flex-1">
        {/* Contenido principal estático */}
        <div className="relative z-10">
          <p className="text-sm font-semibold tracking-wider text-humania-gray/60 uppercase mb-1">
            {marca}
          </p>
          <h3 className="text-3xl font-bold text-humania-blue tracking-tight leading-none mb-4">
            {modelo.nombre}
          </h3>
        </div>

        {/* CTA (Visible parcialmente, expande on hover) */}
        <div className="mt-8 relative z-10">
          <Link href={`/presentacion?activo_id=${activo.id}`} className="block">
            <div className="w-full bg-humania-blue text-white font-medium text-center py-4 rounded-xl shadow-md group-hover:bg-humania-blue/90 transform group-hover:-translate-y-1 transition-all duration-300 animate-pulse">
              Aplicar a esta oportunidad
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default async function Home() {
  const assets = await getAvailableAssets()

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans selection:bg-humania-sand/30">
      {/* Header Minimalista */}
      <header className="w-full fixed top-0 bg-white/80 backdrop-blur-xl z-50 border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 relative bg-humania-blue rounded-sm flex items-center justify-center shadow-inner">
              <span className="text-humania-sand font-bold text-lg leading-none">H</span>
            </div>
            <span className="text-xl font-semibold tracking-tight text-humania-blue">
              Humania <span className="font-normal text-humania-gray">Go</span>
            </span>
          </div>
          {/* <Link href="/admin">
            <Button variant="ghost" className="text-humania-gray hover:text-humania-blue hover:bg-neutral-50/80 rounded-full text-sm font-medium tracking-wide transition-colors">
              Acceso Equipo
            </Button>
          </Link> */}
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col mt-20">
        
        {/* Hero Section (Premium Layout) */}
        <section className="relative w-full py-24 md:py-32 bg-neutral-50 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-neutral-50 to-neutral-100 z-0 opacity-80"></div>
          
          <div className="relative z-10 max-w-5xl px-6 w-full flex flex-col items-center text-center space-y-10">
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tighter text-humania-blue leading-[1.05]">
              Movemos personas hacia<br className="hidden sm:inline" />{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-humania-gray to-humania-blue/80">nuevas oportunidades.</span>
            </h1>
            <p className="text-base sm:text-lg md:text-2xl text-humania-gray max-w-3xl font-medium leading-relaxed">
              Conectamos personas con oportunidades de movilidad para trabajar, generar ingresos y construir algo propio.
            </p>
          </div>
        </section>

        {/* Activos Disponibles (Feed) */}
        <section className="w-full pb-32 pt-16 bg-gradient-to-b from-neutral-50 to-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="mb-16 flex flex-col items-center text-center">
              <h2 className="text-4xl md:text-5xl font-bold text-humania-blue tracking-tight">Selección de Activos</h2>
              <p className="text-humania-gray mt-6 text-lg max-w-2xl">
                Activos verificados, listos para ponerse en movimiento.
              </p>
            </div>

            {assets.length === 0 ? (
              <div className="w-full p-16 text-center bg-white rounded-3xl border border-neutral-100 shadow-sm">
                <p className="text-humania-gray/60 font-medium text-lg tracking-wide">No hay oportunidades disponibles temporalmente.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-8 md:gap-12">
                {assets.map((activo: any) => (
                  <VehicleOpportunityCard key={activo.id} activo={activo} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Proceso y Requisitos simplificados visualmente */}
        <section className="w-full py-24 bg-humania-blue text-white rounded-t-[3rem] -mt-10 relative z-10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-20">
              {/* Proceso */}
              <div>
                <h2 className="text-3xl font-bold tracking-tight mb-12">Cómo funciona el ecosistema</h2>
                <div className="space-y-10">
                  {[
                    { step: '01', title: 'Aplica a la oportunidad', desc: 'Selecciona un activo e ingresa tus datos. Nuestro proceso evalúa objetivamente a cada candidato.' },
                    { step: '02', title: 'Verificación de Perfil', desc: 'Confirmamos tus referencias, capacidad de tu fiador solidario y antecedentes de tránsito.' },
                    { step: '03', title: 'Entrevista Personal', desc: 'Un espacio para alinear valores y garantizar el entendimiento del modelo Humania Go.' },
                    { step: '04', title: 'Firma y Asignación', desc: 'Al ser aprobado, firmas el acuerdo y recibes la llave de tu nueva herramienta de progreso.' }
                  ].map((item) => (
                    <div key={item.step} className="flex gap-6 group">
                      <span className="text-humania-sand font-bold text-xl opacity-80 group-hover:opacity-100 transition-opacity">{item.step}</span>
                      <div>
                        <h4 className="text-xl font-semibold mb-2">{item.title}</h4>
                        <p className="text-white/60 leading-relaxed text-sm md:text-base">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confianza / Privacidad */}
              <div className="bg-white/5 p-12 rounded-3xl border border-white/10 flex flex-col justify-center">
                <h3 className="text-2xl font-bold mb-6 text-humania-sand">Nuestro Compromiso</h3>
                <p className="text-white/80 leading-relaxed mb-8">
                  El proceso de evaluación de Humania Go está diseñado para ser justo, confidencial y transparente. Solicitar la oportunidad no garantiza la asignación, pero garantiza una evaluación seria y profesional de tu perfil.
                </p>
                <div className="space-y-4 text-sm text-white/60">
                  <p className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-humania-sand rounded-full"></span> Licencia vigente exigida</p>
                  <p className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-humania-sand rounded-full"></span> Máximo 3 comparendos</p>
                  <p className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-humania-sand rounded-full"></span> Fiador solidario requerido</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full bg-humania-blue text-white py-8 text-center border-t border-white/10 pb-12">
        <p className="text-sm text-white/40">
          &copy; {new Date().getFullYear()} Humania Go. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  )
}
