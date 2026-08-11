import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DW AdSign",
  description: "DW AdSign CRM — lead to closeout pipeline for signage and print jobs"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
