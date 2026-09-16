import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pilot Season",
  description: "A turn-based story game you play with friends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
