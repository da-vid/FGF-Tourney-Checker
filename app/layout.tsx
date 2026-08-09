import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://norcal-12u-field-watch.da-vidw.chatgpt.site"),
  title: "12U Field Watch | NorCal Tournament Monitor",
  description: "Daily 12U tournament entry lists and change history for Northern California softball coaches.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "12U Field Watch",
    description: "Who joined the field? Daily NorCal 12U tournament entry monitoring.",
    images: [{ url: "/og-v2.jpg", width: 1200, height: 630, alt: "12U Field Watch tournament and registration dashboard" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-v2.jpg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geistSans.variable}>{children}</body>
    </html>
  );
}
