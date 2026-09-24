import type { Metadata, Viewport } from "next";
import { Anton, Space_Grotesk } from "next/font/google";
import "./globals.css";

const anton = Anton({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-anton" });

const grotesk = Space_Grotesk({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-grotesk",
});

// Neutralne metadane: layout obejmuje też 404, /admin/login i /dev/preview (bez dostępu gracza).
// Spersonalizowany tytuł ustawia tylko strona główna dla gracza (generateMetadata w page.tsx).
export const metadata: Metadata = {
  title: "Urodzinowe wyzwania",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${anton.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
