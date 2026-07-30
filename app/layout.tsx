import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "An AI thinking partner for exploring ideas, solving problems, and turning rough thoughts into clear next steps.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "brainstroming.ai";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Brainstroming.ai — Think wider. Move faster.",
    description,
    openGraph: {
      type: "website",
      title: "Brainstroming.ai",
      description: "Think wider. Move faster.",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Brainstroming.ai — Think wider. Move faster.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Brainstroming.ai",
      description: "Think wider. Move faster.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
