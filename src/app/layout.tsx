import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/upscaler/theme-provider";
import { PwaRegister } from "@/components/upscaler/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockPrep: Adobe Stock Prep with AI Upscaling and Metadata",
  description:
    "Upscale images with AI, generate Adobe Stock titles, keywords and categories, check submission readiness and export a ready to upload ZIP with metadata CSV. Files are never stored.",
  keywords: [
    "Adobe Stock",
    "stock photo metadata",
    "AI upscaler",
    "image keyword generator",
    "stock photo prep",
    "Real-ESRGAN",
  ],
  authors: [{ name: "StockPrep" }],
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "StockPrep",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "StockPrep: Adobe Stock Prep with AI",
    description:
      "AI upscaling, titles, keywords and a submission ready download in one pass. Files are never stored.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StockPrep: Adobe Stock Prep with AI",
    description:
      "AI upscaling, titles, keywords and a submission ready download in one pass.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131313" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
