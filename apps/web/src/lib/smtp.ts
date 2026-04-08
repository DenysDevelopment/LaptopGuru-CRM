import nodemailer from "nodemailer";

const DEFAULT_DISPLAY_NAME = "laptopguru.pl";

export function formatSmtpFrom(displayName: string | undefined, address: string): string {
  return `"${displayName || DEFAULT_DISPLAY_NAME}" <${address}>`;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: formatSmtpFrom(undefined, from!),
    to,
    subject,
    html,
  });
}
