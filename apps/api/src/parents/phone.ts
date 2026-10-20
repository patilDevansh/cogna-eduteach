/**
 * Parents' phone numbers: the one shape they are stored in, the one-time codes that prove a parent
 * holds a number, and sending those codes by SMS.
 */
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import { isProductionLike } from "../access/cogna-access";

/** Numbers without a country code are taken as Indian. */
const DEFAULT_COUNTRY = "+91";

/**
 * "98765 43210", "098765-43210", "+91 98765 43210" and "0091 9876543210" all become "+919876543210".
 * Returns null for anything that isn't a plausible mobile number.
 */
export function normalizePhone(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/[\s().-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) {
    digits = digits.replace(/^0+/, "");
    if (digits.length !== 10) return null;
    digits = `${DEFAULT_COUNTRY}${digits}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null;
  // Indian mobiles are ten digits starting 6–9.
  if (digits.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

/** "+919876543210" → "+91 ••••• •3210": enough for a parent to recognise their own number. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, phone.length - 10)} ••••• •${phone.slice(-4)}`;
}

export const PHONE_CODE_MINUTES = 10;
export const PHONE_CODE_MAX_ATTEMPTS = 5;
/** At most this many codes per parent, and per number, in PHONE_CODE_WINDOW_MINUTES. */
export const PHONE_CODE_MAX_SENDS = 3;
export const PHONE_CODE_WINDOW_MINUTES = 15;

export function newPhoneCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Bound to the parent and the number, so a code can't be replayed for another account or phone. */
export function hashPhoneCode(parentId: string, phone: string, code: string): string {
  return createHash("sha256").update(`${parentId}:${phone}:${code.trim()}`).digest("hex");
}

const logger = new Logger("Texts");

export type SmsResult = "SENT" | "NOT_CONFIGURED" | "FAILED";

function twilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  return sid && token && from ? { sid, token, from } : null;
}

/**
 * Sends one text through Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM). Never throws.
 * Unconfigured, nothing is sent; outside production the text is logged so the flow can be tried.
 * ponytail: Twilio only. In India every text must match a DLT-registered template word for word.
 */
export async function sendSms(phone: string, text: string): Promise<SmsResult> {
  const account = twilio();
  if (!account) {
    if (!isProductionLike()) logger.log(`Texts not configured. Would text ${maskPhone(phone)}: ${text}`);
    return "NOT_CONFIGURED";
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${account.sid}:${account.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: account.from, Body: text }),
    });
    if (res.ok) return "SENT";
    logger.warn(`Text to ${maskPhone(phone)} failed: ${res.status}`);
  } catch (error) {
    logger.warn(`Text to ${maskPhone(phone)} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return "FAILED";
}

/** DLT template 1: "{#var#} is your Cogna code. It works for 10 minutes. Don't share it." */
export const phoneCodeText = (code: string) => `${code} is your Cogna code. It works for ${PHONE_CODE_MINUTES} minutes. Don't share it.`;

/**
 * DLT template 2: "Cogna: {#var#} - {#var#}. See details in the Cogna app." Only the child's first
 * name and what happened go in, never what they found hard: a family phone is often shared.
 */
export const updateText = (childName: string, what: string) =>
  `Cogna: ${(childName.trim().split(/\s+/)[0] || childName).slice(0, 30)} - ${what.slice(0, 30)}. See details in the Cogna app.`;

/**
 * Texts a phone code. Outside production with no Twilio account the code is handed back for testing;
 * in production phone sign-in is refused rather than pretending to send.
 */
export async function sendPhoneCode(phone: string, code: string): Promise<{ devCode?: string }> {
  if (!twilio()) {
    if (isProductionLike()) throw new ServiceUnavailableException("Phone sign-in isn't set up yet. Ask the school to link your child for you.");
    logger.log(`Dev phone code for ${maskPhone(phone)}: ${code}`);
    return { devCode: code };
  }
  if ((await sendSms(phone, phoneCodeText(code))) !== "SENT") throw new ServiceUnavailableException("We couldn't send the text just now. Try again in a minute.");
  return {};
}
