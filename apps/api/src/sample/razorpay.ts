/**
 * Razorpay, without its SDK: one REST call to create an order, and the two signature checks it
 * documents (the browser's payment result, and webhooks). Keys come from RAZORPAY_KEY_ID,
 * RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function razorpayAccount(env: NodeJS.ProcessEnv = process.env) {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || null } : null;
}

export async function createRazorpayOrder(
  account: { keyId: string; keySecret: string },
  input: { amountPaise: number; receipt: string; notes: Record<string, string> },
): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${account.keyId}:${account.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes }),
  });
  if (!res.ok) throw new Error(`Razorpay order failed: ${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as { id: string; amount: number; currency: string };
}

const hmacHex = (secret: string, payload: string | Buffer) => createHmac("sha256", secret).update(payload).digest("hex");

function sameHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(String(given ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The checkout's success callback: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function paymentSignatureValid(keySecret: string, orderId: string, paymentId: string, signature: string): boolean {
  return sameHex(hmacHex(keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhooks: X-Razorpay-Signature = HMAC_SHA256(raw request body, webhook secret). */
export function webhookSignatureValid(webhookSecret: string, rawBody: Buffer, signature: string): boolean {
  return sameHex(hmacHex(webhookSecret, rawBody), signature);
}
