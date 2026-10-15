/** "+919876543210" → "+91 98765 43210"; other countries as stored. */
export const showPhone = (phone: string) => (/^\+91\d{10}$/.test(phone) ? `+91 ${phone.slice(3, 8)} ${phone.slice(8)}` : phone);

/** The same number however it's spaced, for matching a typed value to a stored one. */
export const phoneKey = (phone: string) => phone.replace(/\D/g, "");
