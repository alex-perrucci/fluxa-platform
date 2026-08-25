import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './minimal-cut.css';
import './floor-plan.css';
import './merchant-dashboard.css';
import './control-center-hardening.css';

export const metadata: Metadata = {
  title: {
    default: 'Fluxa — Scopri. Prenota. Vivi.',
    template: '%s · Fluxa',
  },
  description:
    'Scopri eventi e locali, verifica la disponibilità e prenota il tuo tavolo in pochi secondi.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicons/favicon.ico' },
      { url: '/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      {
        url: '/favicons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/favicons/safari-pinned-tab.svg',
        color: '#D6A84B',
      },
    ],
  },
  openGraph: {
    type: 'website',
    title: 'Fluxa',
    description: 'Scopri eventi e prenota il tuo tavolo.',
    images: ['/social/fluxa-og-image-1200x630.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fluxa',
    description: 'Scopri eventi e prenota il tuo tavolo.',
    images: ['/social/fluxa-og-image-1200x630.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
