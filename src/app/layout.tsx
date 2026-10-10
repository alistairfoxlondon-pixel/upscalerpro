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
  title: "Upscaler Pro: Free AI Image Upscaler",
  description:
    "Enlarge images up to 8x with real AI detail. Server side processing, batch ZIP export, live before and after compare. Files are never stored.",
  keywords: [
    "image upscaler",
    "AI upscaling",
    "enlarge image",
    "photo enhancer",
    "upscale image online",
    "Real-ESRGAN",
  ],
  authors: [{ name: "Upscaler Pro" }],
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Upscaler Pro",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Upscaler Pro: Free AI Image Upscaler",
    description:
      "Enlarge images up to 8x with real AI detail. Files are never stored.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Upscaler Pro: Free AI Image Upscaler",
    description:
      "Enlarge images up to 8x with real AI detail. Files are never stored.",
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
