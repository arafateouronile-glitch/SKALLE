import type { Metadata } from "next";
import { Inter, Instrument_Serif, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Skalle - Marketing OS Agentique",
  description: "Transformez n'importe quel site web en une machine de guerre marketing automatisée. SEO, Social, Ads, Prospection - propulsé par l'IA.",
  keywords: ["marketing", "SEO", "IA", "automation", "content", "prospection"],
  authors: [{ name: "Skalle" }],
  openGraph: {
    title: "Skalle - Marketing OS Agentique",
    description: "Automatisez votre marketing avec l'IA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${instrumentSerif.variable} ${spaceGrotesk.variable} font-sans antialiased min-h-screen text-gray-900`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
