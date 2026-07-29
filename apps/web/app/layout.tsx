// PHASE_8_TRUE_CONTROL_CENTER
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Fluxa — Venue Operating System',
    template: '%s · Fluxa',
  },
  description:
    'Il sistema operativo per eventi, prenotazioni, tavoli e operatività dei locali.',
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
