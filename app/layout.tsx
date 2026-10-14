import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trinika Labs — Workspace IoT",
  description: "Belajar merangkai IoT melalui workspace modular, katalog komponen, dan format proyek terbuka.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
