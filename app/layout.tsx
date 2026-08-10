import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://norcal-12u-field-watch.da-vidw.chatgpt.site"),
  title: "FGF Tourney Tracker | NorCal Softball Tournament Monitor",
  description: "Daily 12U tournament entry lists and change history for Northern California softball coaches.",
  applicationName: "FGF Tourney Tracker",
  themeColor: "#071822",
  appleWebApp: {
    capable: true,
    title: "FGF Tourney Tracker",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "FGF Tourney Tracker",
    description: "Daily NorCal 12U tournament fields and registration monitoring.",
    siteName: "FGF Tourney Tracker",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "FGF Tourney Tracker tournament and registration dashboard" }],
  },
  twitter: { card: "summary_large_image", title: "FGF Tourney Tracker", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geistSans.variable}>{children}</body>
    </html>
  );
}
