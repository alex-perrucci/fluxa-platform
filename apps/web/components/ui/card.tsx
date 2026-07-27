import type { ReactNode } from 'react';

export function Card({ children }: Readonly<{ children: ReactNode }>) {
  return <section className="panel p-6">{children}</section>;
}
