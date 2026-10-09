import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/upscaler/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PixelForge — Free Open-Source AI Image Upscaler (100% Local)",
  description:
    "Upscale and enhance images up to 4× with AI super-resolution — ESRGAN models running entirely in your browser. No uploads, no accounts, no limits. Batch processing, JPEG/PNG/WebP output, HEIC/TIFF support.",
  keywords: [
    "image upscaler",
    "AI upscaling",
    "ESRGAN",
    "free image upscaler",
    "browser AI",
    "super resolution",
    "enhance photo quality",
    "open source",
    "batch upscale",
  ],
  authors: [{ name: "PixelForge" }],
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "PixelForge — Free Open-Source AI Image Upscaler",
    description:
      "Fix blurry and pixelated images with on-device AI. 100% private: images never leave your browser.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PixelForge — Free Open-Source AI Image Upscaler",
    description:
      "Fix blurry and pixelated images with on-device AI. 100% private: images never leave your browser.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
        </ThemeProvider>
      </body>
    </html>
  );
}
