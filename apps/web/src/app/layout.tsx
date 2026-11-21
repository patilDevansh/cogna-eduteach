import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fraunces, IBM_Plex_Mono, Instrument_Sans, STIX_Two_Text } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

// Self-hosted by Next at build time: no layout shift while a school network fetches Google Fonts.
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--nf-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], style: ["normal", "italic"], variable: "--nf-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nf-mono", display: "swap" });
// The grown-up voice: headlines on the public, parent and teacher pages.
const serif = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz", "SOFT"], variable: "--nf-serif", display: "swap" });
// Equations set the way a textbook sets them, not as code.
const maths = STIX_Two_Text({ subsets: ["latin"], style: ["normal", "italic"], variable: "--nf-maths", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Cogna · A personal tutor at every desk",
    template: "%s — Cogna",
  },
  description:
    "Adaptive maths practice for Grade 8. Short, calm sessions that adjust to how your child actually learns.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f7f3",
};

const RANDOM_UUID_FALLBACK = `if (window.crypto && !crypto.randomUUID && crypto.getRandomValues) crypto.randomUUID = function () {
  var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
};`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${serif.variable} ${maths.variable}`}>
      <head>
        {/* crypto.randomUUID needs Chrome 92+ and HTTPS; old school tablets and a plain-http school network have
            neither, and every answer is stamped with one. getRandomValues works in both, so fill it in first. */}
        <script dangerouslySetInnerHTML={{ __html: RANDOM_UUID_FALLBACK }} />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
