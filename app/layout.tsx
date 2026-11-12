import type { Metadata } from 'next';
import { Inter, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-bengali',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BongoConsign — Multi-Vendor Consignment Store & ERP',
  description:
    'Bangladesh-first Multi-Vendor Consignment E-Commerce Storefront and Financial Escrow Admin ERP with 3-tier pricing, 4-way return ledger, and A4 3-part print engine.',
  openGraph: {
    title: 'BongoConsign — Multi-Vendor Consignment Store & ERP',
    description:
      'Bangladesh-first Multi-Vendor Consignment E-Commerce Storefront and Financial Escrow Admin ERP with 3-tier pricing, 4-way return ledger, and A4 3-part print engine.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BongoConsign — Multi-Vendor Consignment Store & ERP',
    description:
      'Bangladesh-first Multi-Vendor Consignment E-Commerce Storefront and Financial Escrow Admin ERP with 3-tier pricing, 4-way return ledger, and A4 3-part print engine.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" className={`${inter.variable} ${notoBengali.variable}`}>
      <body suppressHydrationWarning className="bg-bg text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
