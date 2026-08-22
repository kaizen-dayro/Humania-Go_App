import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ApplicationPayloadSchema, evaluateInitialEligibility } from '@/lib/domain/eligibility'
import { sendCandidateEmail } from '@/lib/services/email'
import { checkSimitFines } from '@/lib/services/simit'

// Usamos supabase-js genérico con la clave de servicio
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: NextRequest) {
  // Correlacionador tecnico de esta peticion concreta, generado en el
  // servidor (nunca se confia en un valor que venga del cliente). No
  // identifica al candidato -- eso ya lo hace candidate_id -- sirve para
  // cruzar esta autorizacion con logs si algun caso puntual requiere
  // investigarse.
  const requestId = randomUUID()

  try {
    const body = await req.json()

    // 1. Validación Estricta con Zod
    const parsed = ApplicationPayloadSchema.safeParse(body)
    
    if (!parsed.success) {
      const primerError = parsed.error.issues[0]
      return NextResponse.json({
        success: false,
        error: "VALIDATION_ERROR",
        message: primerError ? `${primerError.path.join('.')}: ${primerError.message}` : "Revisa los datos ingresados.",
        details: parsed.error.format()
      }, { status: 400 })
    }

    const data = parsed.data

    // 2. Reglas de Negocio / Eligibility
    const eligibilityResult = evaluateInitialEligibility(data)

    // 2b. Validación de multas SIMIT (fail-open: un fallo/timeout/límite de
    // consultas de la API externa no bloquea ni descarta al candidato).
    const simitResult = await checkSimitFines(data.numero_documento)
    const razones = [...eligibilityResult.razones]
    let estadoFinal = eligibilityResult.estado
    if (simitResult.simit_estado === 'DESCARTADO') {
      estadoFinal = 'DESCARTADO'
      razones.push('SIMIT_MULTAS_EXCEDEN_LIMITE')
    }

    const candidatoData = {
      activo_id: data.activo_id,
      nombres: data.nombres,
      apellidos: data.apellidos,
      tipo_documento: data.tipo_documento,
      numero_documento: data.numero_documento,
      correo_electronico: data.correo_electronico,
      telefono: data.telefono,
      ciudad_operacion_id: data.ciudad_operacion_id,
      municipio_operacion_id: data.municipio_operacion_id,
      genero: data.genero,
      barrio: data.barrio,
      tipo_perfil: data.tipo_perfil,
      plataformas: data.plataformas ?? null,
      categoria_actividad: data.categoria_actividad ?? null,
      anos_experiencia_declarados: data.anos_experiencia_declarados,
      licencia_declarada_vigente: data.licencia_declarada_vigente,
      licencia_categorias: data.licencia_categorias,
      cantidad_comparendos_declarados: data.cantidad_comparendos_declarados,
      estado: estadoFinal,
      simit_estado: simitResult.simit_estado,
      simit_number_fines: simitResult.simit_number_fines,
      simit_total_fines: simitResult.simit_total_fines,
      simit_consultado_at: simitResult.simit_consultado_at,
      simit_respuesta_raw: simitResult.simit_respuesta_raw
    }

    // 3. Operación Transaccional en PostgreSQL
    const { data: candidateId, error: rpcError } = await supabaseAdmin.rpc('submit_application', {
      p_candidato: candidatoData,
      p_fiador: data.fiador,
      p_referencias: data.referencias,
      p_autorizacion: {
        policy_version: data.policyVersion,
        authorized: data.dataAuthorization,
        authorization_channel: 'WEB_APPLY',
        request_id: requestId
      }
    })

    if (rpcError) {
      console.error(`RPC Error [request_id=${requestId}]:`, rpcError)

      if (rpcError.message.includes('AUTORIZACION_REQUERIDA') || rpcError.message.includes('VERSION_POLITICA_INVALIDA')) {
        return NextResponse.json({
          success: false,
          error: "AUTHORIZATION_REQUIRED",
          message: "Para enviar tu postulación debes leer la Política de Tratamiento de Datos Personales y autorizar expresamente el tratamiento de tus datos."
        }, { status: 400 })
      }
      if (rpcError.message.includes('unique constraint') || rpcError.code === '23505') {
         return NextResponse.json({
           success: false,
           error: "DUPLICATE_ENTRY",
           message: "Ya existe una aplicación registrada con ese documento o correo electrónico."
         }, { status: 409 })
      }
      return NextResponse.json({
        success: false,
        error: "DATABASE_ERROR",
        message: "Ocurrió un error al guardar tu solicitud. Intenta más tarde."
      }, { status: 500 })
    }

    // 4. Enviar Correo de Confirmación
    // El envío del correo no debe bloquear ni revertir la transacción si falla.
    // Esto se maneja asincrónicamente o simplemente no lanzamos error si sendCandidateEmail falla.
    if (candidateId) {
      await sendCandidateEmail({
        candidateId,
        to: data.correo_electronico,
        subject: "Humania Go — Recibimos tu postulación",
        eventType: "APPLICATION_RECEIVED",
        html: `
          <div style="font-family: Arial, sans-serif; color: #2F3437; line-height: 1.6;">
            <h2>Hola, ${data.nombres}.</h2>
            <p>Nuestro equipo humano recibió con éxito tu postulación a la oportunidad de movilidad seleccionada.</p>
            <p>Ahora procederemos a revisar la información que registraste y validar los requisitos correspondientes.</p>
            <p>Te informaremos cualquier avance por este medio o podremos contactarte al número de teléfono que registraste.</p>
            <br>
            <p>Gracias por confiar en Humania Go.</p>
            <br>
            <p><strong>Equipo Humano</strong><br>Humania Go</p>
          </div>
        `
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: candidateId,
        estado_preliminar: estadoFinal,
        razones
      }
    }, { status: 201 })

  } catch (err: any) {
    console.error("Unhandled API Error:", err)
    return NextResponse.json({
      success: false,
      error: "SERVER_ERROR",
      message: "Ocurrió un error inesperado."
    }, { status: 500 })
  }
}
