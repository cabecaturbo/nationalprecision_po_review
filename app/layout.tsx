import type { Metadata } from "next";
import { Inter, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Type system (chosen to read as an aerospace/industrial supplier, not a
// generic startup app — see National Precision Bearing / NHBB / RBC branding):
//   Archivo        — corporate grotesque for the wordmark, headings, buttons
//   Inter          — neutral workhorse for body + table text
//   IBM Plex Mono  — technical data values (PO #, part #, prices, dates)
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NPB — PO Review Desk",
  description:
    "National Precision Bearing contract-review tool for inbound bearing purchase orders.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
