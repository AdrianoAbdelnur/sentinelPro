import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinel Pro",
  description: "Consola operativa de Sentinel Pro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-slate-900 text-slate-100">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-8">
            <p className="text-sm font-semibold tracking-[0.16em]">SENTINEL PRO</p>
            <nav className="flex items-center gap-2">
              <Link
                href="/"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Tablero
              </Link>
              <Link
                href="/prevention"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
              >
                Prevencion
              </Link>
              <Link
                href="/live"
                className="rounded-lg border border-cyan-500 bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-500"
              >
                En vivo
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
