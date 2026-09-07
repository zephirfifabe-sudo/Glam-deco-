import { Resend } from "resend";
import nodemailer from "nodemailer";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

// SECURITY NOTE: nodemailer is pinned to ^8.x here because next-auth@5
// beta only allows nodemailer ^7 || ^8 as an optional peer, while the
// fix for GHSA-p6gq-j5cr-w38f (raw MIME / attachment path-URL SSRF)
// ships in 10.x. That advisory only triggers via the `raw` send option
// or a user-controlled attachment `path`/`url` - this codebase never
// sets either (see sendViaSmtp below: only `to`/`subject`/`html`,
// always server-authored), so the vulnerable code path is unreachable
// here. Revisit this pin once next-auth relaxes the peer range.
const smtpTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    })
  : null;

const resend = process.env.EMAIL_API_KEY
  ? new Resend(process.env.EMAIL_API_KEY)
  : null;

async function sendViaSmtp(params: SendEmailParams): Promise<void> {
  if (!smtpTransport) {
    throw new Error("SMTP transport not configured.");
  }
  await smtpTransport.sendMail({
    from: process.env.EMAIL_FROM ?? "no-reply@glamdeco.example",
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

async function sendViaResend(params: SendEmailParams): Promise<void> {
  if (!resend) {
    throw new Error("Resend API key not configured.");
  }
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "no-reply@glamdeco.example",
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

/**
 * Transactional email adapter (brief §89: server-generated only, never
 * secrets in templates). Development points SMTP_HOST at the Mailhog
 * container (docker-compose.yml) so nothing is sent to a real inbox;
 * production uses Resend. Never a client-controlled recipient template
 * or raw MIME content - see the security note above.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (smtpTransport) {
    await sendViaSmtp(params);
    return;
  }
  await sendViaResend(params);
}
