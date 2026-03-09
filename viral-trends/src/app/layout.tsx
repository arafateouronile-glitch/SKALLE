import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
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
    <html lang="fr" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased bg-slate-950 text-white`}
      >
        {children}
      </body>
    </html>
  );
}
