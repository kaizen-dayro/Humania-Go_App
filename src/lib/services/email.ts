import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Requiere la Secret key: este cliente escribe en candidate_email_events, protegida por RLS solo-admin.
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

export type EmailEventType = 'APPLICATION_RECEIVED' | 'INTERVIEW_INVITATION' | 'APPLICATION_REJECTED' | 'FINAL_SELECTION' | 'BACKUP_WAITLIST';

interface SendEmailOptions {
  candidateId: string;
  to: string;
  subject: string;
  html: string;
  eventType: EmailEventType;
}

export async function sendCandidateEmail({ candidateId, to, subject, html, eventType }: SendEmailOptions) {
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

  let status: 'SENT' | 'FAILED' = 'FAILED';
  let errorMessage: string | null = null;
  let providerMessageId: string | null = null;

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

    status = 'SENT';
    providerMessageId = info.messageId;

  } catch (error: any) {
    console.error(`[EMAIL ERROR] Falló el envío de correo (${eventType}) a ${to}:`, error.message);
    errorMessage = error.message;
  }

  // 2. Actualizar el registro con el resultado real
  if (intentData?.id) {
    try {
      await supabaseAdmin
        .from('candidate_email_events')
        .update({
          status,
          provider_message_id: providerMessageId,
          error_message: errorMessage,
          sent_at: status === 'SENT' ? new Date().toISOString() : null
        })
        .eq('id', intentData.id);
    } catch (dbError: any) {
      console.error(`[EMAIL LOG ERROR] No se pudo actualizar el log de correo en DB:`, dbError.message);
    }
  }

  return status === 'SENT';
}

