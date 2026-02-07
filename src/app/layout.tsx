import type { Metadata } from "next";
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
  title: "TRAIDgov Analyst | Presupuesto Nacional Argentina",
  description:
    "Analista presupuestario con IA. Preguntá sobre el gasto público argentino y recibí respuestas con datos reales y visualizaciones interactivas.",
  openGraph: {
    title: "TRAIDgov Analyst",
    description: "Inteligencia financiera pública con IA conversacional",
    siteName: "TRAID GOV",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-white`}
      >
        {children}
      </body>
    </html>
  );
}
