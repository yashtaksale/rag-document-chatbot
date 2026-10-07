import type { Metadata } from "next";
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const storedTheme = localStorage.getItem('chat_theme');
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  const theme = storedTheme === 'dark' || (!storedTheme && prefersDark) || (storedTheme === 'system' && prefersDark) ? 'dark' : 'light';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
