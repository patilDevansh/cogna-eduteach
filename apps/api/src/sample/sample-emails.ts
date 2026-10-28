/**
 * The two emails a parent gets about a sample test. Pure: the service decides when. Only the
 * child's first name goes in, never what they found hard: an inbox is often shared.
 */
import type { MailMessage } from "../mail/mail.service";

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrap(heading: string, lines: string[], button: { label: string; link: string }, footnote: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f7f3;font-family:Helvetica,Arial,sans-serif;color:#16241d">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="font-size:22px;font-weight:700;margin:0 0 24px">Cogna<span style="color:#0e6b54">.</span></p>
<div style="background:#ffffff;border-radius:20px;padding:28px">
<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${escapeHtml(heading)}</h1>
${lines.map((l) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${escapeHtml(l)}</p>`).join("\n")}
<p style="margin:12px 0 24px"><a href="${escapeHtml(button.link)}" style="display:inline-block;background:#0e6b54;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:999px">${escapeHtml(button.label)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#51635a;margin:0">${escapeHtml(footnote)}</p>
</div></div></body></html>`;
}

export function resultsReadyEmail(input: { to: string; childName: string; link: string; price: number }): MailMessage {
  const child = first(input.childName);
  const lines = [
    `${child} finished Cogna's factorisation check. You can see how many questions ${child} got right and how many skills need work, free.`,
    `The full report shows exactly which skills are secure, where ${child} gets stuck and why, and comes with a short lesson made from ${child}'s own answers. It costs ₹${input.price}, once.`,
  ];
  const footnote = "Keep this email: the link opens the result on any device. If you didn't ask for this test, you can ignore it.";
  return {
    to: input.to,
    subject: `${child}'s maths check is ready`,
    text: ["Hello,", "", ...lines, "", `See the result: ${input.link}`, "", footnote, "", "Cogna"].join("\n"),
    html: wrap(`${child}'s maths check is ready`, lines, { label: "See the result", link: input.link }, footnote),
  };
}

export function reportUnlockedEmail(input: { to: string; childName: string; link: string }): MailMessage {
  const child = first(input.childName);
  const lines = [`Thank you. ${child}'s full report is unlocked: which skills are secure, where ${child} gets stuck and why, and a short lesson made from ${child}'s own answers.`];
  const footnote = "This link opens the report on any device. Keep it to come back to the lesson later.";
  return {
    to: input.to,
    subject: `${child}'s full report is unlocked`,
    text: ["Hello,", "", ...lines, "", `Open the report: ${input.link}`, "", footnote, "", "Cogna"].join("\n"),
    html: wrap(`${child}'s full report is unlocked`, lines, { label: "Open the report", link: input.link }, footnote),
  };
}

/** Sent when the test starts, so the parent has the link even if the child closes the tab. */
export function sampleStartedEmail(input: { to: string; childName: string; link: string }): MailMessage {
  const child = first(input.childName);
  const lines = [`${child} has started Cogna's free factorisation check. It takes about 15 minutes.`, `When ${child} finishes, the result appears at this link. ${child} can also carry on from it if the check was interrupted.`];
  const footnote = "Keep this email: the link opens the result on any device. If you didn't start this check, you can ignore it.";
  return {
    to: input.to,
    subject: `${child}'s maths check: your link`,
    text: ["Hello,", "", ...lines, "", `Open the check: ${input.link}`, "", footnote, "", "Cogna"].join("\n"),
    html: wrap(`${child}'s maths check has started`, lines, { label: "Open the check", link: input.link }, footnote),
  };
}
