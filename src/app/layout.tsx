import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equinox | Investment overview",
  description: "A clear view of investment values, cash flows, and performance.",
  applicationName: "Equinox",
  appleWebApp: {
    capable: true,
    title: "Equinox",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#315d49",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
