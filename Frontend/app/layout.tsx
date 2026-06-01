import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import GoogleProvider from "@/components/common/GoogleProvider";

export const metadata: Metadata = {
  title: {
    default: "Teledent AI — Smart Dental Scanner & Live Diagnosis",
    template: "%s | Teledent AI",
  },
  description:
    "AI-powered dental screening and live video consultation platform. Get instant preliminary diagnoses or connect with certified dentists from the comfort of your home.",
  keywords: ["dental screening", "AI dentist", "teledentistry", "online dental consultation"],
  authors: [{ name: "Teledent AI" }],
  openGraph: {
    title: "Teledent AI — Smart Dental Scanner & Live Diagnosis",
    description: "AI-powered dental screening and live video consultation.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><GoogleProvider><AuthProvider>{children}</AuthProvider></GoogleProvider></body>
    </html>
  );
}
