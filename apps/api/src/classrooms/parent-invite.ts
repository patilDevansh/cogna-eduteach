/**
 * The email a parent gets when their child types the parent's address while
 * joining a class. Pure: the service decides when, this decides the words.
 * Only the child's first name, the class and the teacher go in: what the
 * child struggles with stays in the app.
 */
import type { MailMessage } from "../mail/mail.service";

/** A student can't send another invite until this long after the last one (typo fixes still work quickly). */
export const INVITE_COOLDOWN_MINUTES = 2;
/** At most this many invites a day per student, so no one can use Cogna to flood an inbox. */
export const INVITE_DAILY_LIMIT = 3;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lower-case and trimmed, or null when it can't be an email address. */
export function normalizeEmail(input: unknown): string | null {
  const email = String(input ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** "priya.sharma@gmail.com" → "pr•••@gmail.com": enough to spot a typo, not enough to read the address. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "•••";
  return `${name.slice(0, Math.min(2, Math.max(1, name.length - 1)))}•••@${domain}`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function parentInviteEmail(input: { to: string; studentName: string; className: string; teacherName: string; webUrl: string }): MailMessage {
  const child = input.studentName.trim().split(/\s+/)[0] || input.studentName;
  // No code rides in the link: linking happens on Cogna, through the phone on the school's record.
  const link = `${input.webUrl.replace(/\/+$/, "")}/parent/dashboard`;
  const subject = `${child} added you on Cogna`;
  const text = [
    `Hello,`,
    ``,
    `${child} joined ${input.className} with ${input.teacherName} on Cogna, and asked us to send you this so you can follow their maths.`,
    ``,
    `You'll see whether ${child} has done their class work, what's due next, and exactly where they're stuck.`,
    ``,
    `Sign in to Cogna: ${link}`,
    ``,
    `Then confirm your mobile number. If it's the number ${child}'s school has for you, ${child} appears straight away. If it isn't, you can ask ${input.teacherName} to add you from the same page.`,
    ``,
    `Linking means you agree to ${child} practising with Cogna in class. If you're not ${child}'s parent or guardian, please ignore this email.`,
    ``,
    `Cogna`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f3;font-family:Helvetica,Arial,sans-serif;color:#16241d">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:22px;font-weight:700;margin:0 0 24px">Cogna<span style="color:#0e6b54">.</span></p>
<div style="background:#ffffff;border-radius:20px;padding:28px">
<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${escapeHtml(child)} added you on Cogna</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${escapeHtml(child)} joined <strong>${escapeHtml(input.className)}</strong> with ${escapeHtml(input.teacherName)}, and asked us to send you this so you can follow their maths.</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px">You'll see whether ${escapeHtml(child)} has done their class work, what's due next, and exactly where they're stuck.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0e6b54;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:999px">Sign in to Cogna</a></p>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">Then confirm your mobile number. If it's the number ${escapeHtml(child)}'s school has for you, ${escapeHtml(child)} appears straight away. If it isn't, you can ask ${escapeHtml(input.teacherName)} to add you from the same page.</p>
<p style="font-size:13px;line-height:1.5;color:#51635a;margin:0">Linking means you agree to ${escapeHtml(child)} practising with Cogna in class. If you're not ${escapeHtml(child)}'s parent or guardian, please ignore this email.</p>
</div></div></body></html>`;
  return { to: input.to, subject, text, html };
}
