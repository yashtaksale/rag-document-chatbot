import type { Metadata } from "next";
import { ThemeInitializer } from "../components/theme/ThemeInitializer";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocChat — AI Document Chatbot",
  description: "Hallucination-resistant RAG document chatbot with branching message tree, prompt queue, citations, and artifacts canvas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
