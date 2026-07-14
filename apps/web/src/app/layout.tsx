import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  title: {
    default: "Cogna",
    template: "%s — Cogna",
  },
  description: "Adaptive math practice for Grade 8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <header className="site-header">
            <a href="/" className="logo">
              Cogna
            </a>
            <nav>
              <a href="/parent/login">Parent</a>
              <a href="/student/login">Student</a>
            </nav>
          </header>
          <main className="site-main">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
