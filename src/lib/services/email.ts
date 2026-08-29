import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Requiere la Secret key: este cliente escribe en candidate_email_events, protegida por RLS solo-admin.
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

export type EmailEventType = 'APPLICATION_RECEIVED' | 'INTERVIEW_INVITATION' | 'APPLICATION_REJECTED' | 'FINAL_SELECTION' | 'BACKUP_WAITLIST' | 'DESCARTE_EDAD_AGRADECIMIENTO' | 'DESCARTE_COMPARENDOS_AGRADECIMIENTO' | 'DESCARTE_EXPERIENCIA_AGRADECIMIENTO';

interface SendEmailOptions {
  // Opcional (Fase 17): un descarte por edad nunca llega a crear un
  // candidato real -- candidate_email_events.candidate_id tiene FK NOT
  // NULL a candidatos, así que ese caso omite por completo el registro de
  // idempotencia/auditoría de esta tabla y envía el correo directo.
  candidateId?: string | null;
  to: string;
  subject: string;
  html: string;
  eventType: EmailEventType;
}

/**
 * Envío real vía nodemailer, sin ninguna lógica de idempotencia ni de
 * candidato -- extraído aquí (Fase 21) para que sendCandidateEmail y
 * sendAdminEmail compartan exactamente la misma configuración de
 * transporte, sin duplicarla.
 */
async function enviarCorreoReal(to: string, subject: string, html: string): Promise<{ status: 'SENT' | 'FAILED', providerMessageId: string | null, errorMessage: string | null }> {
  try {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_APP_PASSWORD;
    const from = process.env.EMAIL_FROM || user;

    if (!user || !pass) {
      throw new Error("Credenciales de correo (EMAIL_USER o EMAIL_APP_PASSWORD) no están configuradas.");
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    return { status: 'SENT', providerMessageId: info.messageId, errorMessage: null };
  } catch (error: any) {
    console.error(`[EMAIL ERROR] Falló el envío de correo a ${to}:`, error.message);
    return { status: 'FAILED', providerMessageId: null, errorMessage: error.message };
  }
}

/**
 * Correo sin idempotencia propia (Fase 21, 2026-08-26; renombrado en la
 * Fase 22/KAI-5 al dejar de ser exclusivo de administradores): no pasa
 * por `candidate_email_events` -- quien llama a esta función es
 * responsable de su propia idempotencia si la necesita (ver el cron de
 * vencimiento de documentos, que la resuelve con
 * `activo_documento_notificaciones` tanto para el resumen de
 * administradores como para el aviso al candidato asignado).
 */
export async function sendPlainEmail(to: string, subject: string, html: string): Promise<boolean> {
  const { status } = await enviarCorreoReal(to, subject, html);
  return status === 'SENT';
}

export async function sendCandidateEmail({ candidateId, to, subject, html, eventType }: SendEmailOptions) {
  let intentId: string | null = null;

  if (candidateId) {
    // 1. Intentar registrar el evento como PENDING para bloquear ejecuciones concurrentes
    const { data: intentData, error: intentError } = await supabaseAdmin
      .from('candidate_email_events')
      .insert({
        candidate_id: candidateId,
        event_type: eventType,
        recipient_email: to,
        subject,
        status: 'PENDING'
      })
      .select('id')
      .single();

    // Si viola la restricción UNIQUE, el correo ya fue enviado o está en proceso
    if (intentError && intentError.code === '23505') {
      console.log(`[EMAIL IDEMPOTENCY] Evento ${eventType} para ${candidateId} ya existe. Ignorando.`);
      return true;
    }
    intentId = intentData?.id ?? null;
  }

  const { status, providerMessageId, errorMessage } = await enviarCorreoReal(to, subject, html);

  // 2. Actualizar el registro con el resultado real
  if (intentId) {
    try {
      await supabaseAdmin
        .from('candidate_email_events')
        .update({
          status,
          provider_message_id: providerMessageId,
          error_message: errorMessage,
          sent_at: status === 'SENT' ? new Date().toISOString() : null
        })
        .eq('id', intentId);
    } catch (dbError: any) {
      console.error(`[EMAIL LOG ERROR] No se pudo actualizar el log de correo en DB:`, dbError.message);
    }
  }

  return status === 'SENT';
}

