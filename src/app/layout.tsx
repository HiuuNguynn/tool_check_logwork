import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Backlog Logwork Report",
  description:
    "Thống kê ticket Backlog theo ngày và kiểm tra rule logwork của team.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
