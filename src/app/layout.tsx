import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/domain/constants";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: APP_NAME,
    description: APP_TAGLINE,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${APP_NAME} — painel de projetos, prazos e recorrências` }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_TAGLINE,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
