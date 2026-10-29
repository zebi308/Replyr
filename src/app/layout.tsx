import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Replyr — AI support chat for your website', description: 'Build an AI support assistant from your Shopify store, documents or instructions, and put it on your site in minutes.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
