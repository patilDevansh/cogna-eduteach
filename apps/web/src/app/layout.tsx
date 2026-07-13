import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cogna — Practice",
  description: "Adaptive math practice for Grade 8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
