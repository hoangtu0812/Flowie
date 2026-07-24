import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowie",
  description: "Enterprise project management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
