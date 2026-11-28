import { config } from "../config.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email. Production uses Resend; development logs only the envelope
 * (never the token) and lets the API return a dev-only token for local testing.
 */
export async function sendMail(mail: Mail): Promise<{ ok: boolean; dev: boolean }> {
  if (config.email.provider === "resend" && config.email.resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: config.email.from, to: mail.to, subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) throw new Error(`email provider rejected the message (${res.status})`);
    return { ok: true, dev: false };
  }
  console.info(`[email] queued to=${mail.to} subject=${JSON.stringify(mail.subject)} (console driver)`);
  return { ok: true, dev: true };
}

export const verificationMail = (link: string) => ({
  subject: "Verify your Secrets email",
  text: [
    "Welcome to Secrets.",
    "",
    "Confirm your email to unlock messaging:",
    link,
    "",
    "This link expires in 24 hours. If you didn't sign up, ignore this email.",
  ].join("\n"),
});

export const resetMail = (link: string) => ({
  subject: "Reset your Secrets password",
  text: [
    "Someone asked to reset the password for this account.",
    "",
    "Choose a new password:",
    link,
    "",
    "This link expires in 30 minutes and works once. If this wasn't you, ignore this email.",
  ].join("\n"),
});
