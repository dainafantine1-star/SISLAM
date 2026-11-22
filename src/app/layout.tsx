import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'SISLAM · Gestão Ambiental', template: '%s · SISLAM' },
  description:
    'Plataforma municipal de licenciamento e gestão ambiental. Ambiente local demonstrativo.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
