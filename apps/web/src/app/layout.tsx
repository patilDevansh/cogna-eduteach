import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  title: {
    default: "Cogna — practice that pays attention",
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
    <html lang="en">
      <head>
        {/* crypto.randomUUID needs Chrome 92+ and HTTPS; old school tablets and a plain-http school network have
            neither, and every answer is stamped with one. getRandomValues works in both, so fill it in first. */}
        <script dangerouslySetInnerHTML={{ __html: RANDOM_UUID_FALLBACK }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
