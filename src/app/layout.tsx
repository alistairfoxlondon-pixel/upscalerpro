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
  title: "PixelForge: Free AI Image Upscaler",
  description:
    "Enlarge photos up to 8x with sharper detail. Fast server side processing, batch ZIP export, JPEG PNG and WebP output. Files are processed in memory and never stored.",
  keywords: [
    "image upscaler",
    "AI upscaling",
    "enlarge image",
    "photo enhancer",
    "upscale image online",
    "batch upscale",
  ],
  authors: [{ name: "PixelForge" }],
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PixelForge",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "PixelForge: Free AI Image Upscaler",
    description:
      "Enlarge photos up to 8x with sharper detail. Files are processed in memory and never stored.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PixelForge: Free AI Image Upscaler",
    description:
      "Enlarge photos up to 8x with sharper detail. Files are processed in memory and never stored.",
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
