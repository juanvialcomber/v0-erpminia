import type { Metadata, Viewport } from 'next';

import { Geist, Geist_Mono, Manrope, Montserrat } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { getLocale } from '@/lib/i18n/server';
import { PwaServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import './globals.css';
import './motil-system.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const PWA_COMPAT_METADATA = { manifest: '/manifest.webmanifest' } as const;

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#252525' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const es = locale !== 'en';
  return {
    ...PWA_COMPAT_METADATA,
    metadataBase: new URL('https://www.motil.app'),
    title: {
      default: es ? 'MOTIL | Sistema Operativo para Minería en Chile' : 'MOTIL | Mining Operating System in Chile',
      template: '%s | MOTIL Mining OS',
    },
    description: es
      ? 'MOTIL es un Sistema Operativo para Minería en Chile. Conecta producción, mantenimiento, inventario, compras, finanzas, RRHH, sostenibilidad HSE y legal con trazabilidad operacional y evidencia auditable.'
      : 'MOTIL is a Mining Operating System built in Chile. It connects production, maintenance, inventory, procurement, finance, HR, HSE and legal with operational traceability and auditable evidence.',
    applicationName: 'MOTIL Mining OS',
    manifest: '/motil-v2.webmanifest',
    appleWebApp: {
      capable: true,
      title: 'MOTIL',
      statusBarStyle: 'black-translucent',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
    authors: [{ name: 'Neuralia' }],
    creator: 'Neuralia',
    publisher: 'Neuralia',
    category: es ? 'Sistema Operativo para Minería' : 'Mining Operating System',
    keywords: [
      'sistema operativo para minería',
      'sistemas operativos para minería',
      'software minero Chile',
      'software de gestión minera',
      'Mining Operating System',
      'sistema de gestión minera',
      'ERP minero Chile',
      'software mantenimiento minero',
      'software producción minera',
      'gestión HSE minería',
      'RRHH minería',
      'trazabilidad minera',
      'operaciones mineras Chile',
      'software faena minera',
      'MOTIL Mining OS',
    ],
    alternates: {
      canonical: '/',
      languages: { 'es-CL': '/', en: '/en', 'x-default': '/' },
    },
    openGraph: {
      type: 'website',
      locale: es ? 'es_CL' : 'en_US',
      url: 'https://www.motil.app',
      siteName: 'MOTIL Mining OS',
      title: es ? 'MOTIL | Sistema Operativo para Minería' : 'MOTIL | Mining Operating System',
      description: es
        ? 'Una plataforma operacional para conectar la faena completa con trazabilidad, evidencia y control por área.'
        : 'An operational platform to connect the entire mine site with traceability, evidence and per-area control.',
    },
    twitter: {
      card: 'summary_large_image',
      title: es ? 'MOTIL | Sistema Operativo para Minería' : 'MOTIL | Mining Operating System',
      description: es
        ? 'Sistema Operativo para Minería desarrollado en Chile.'
        : 'Mining Operating System built in Chile.',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    },
    icons: {
      icon: [
        { url: '/icon-light-32x32.png?brand=motil-canonical-1', media: '(prefers-color-scheme: light)' },
        { url: '/icon-dark-32x32.png?brand=motil-canonical-1', media: '(prefers-color-scheme: dark)' },
        { url: '/icon-512.png?brand=motil-canonical-1', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-icon.png?brand=motil-canonical-1',
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale === 'en' ? 'en' : 'es-CL'} className={`${geist.variable} ${geistMono.variable} ${montserrat.variable} ${manrope.variable} scroll-smooth`} suppressHydrationWarning>
      <head><meta charSet="utf-8" /></head>
      <body className="bg-background font-sans text-foreground antialiased selection:bg-primary/20 selection:text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="motil-theme" disableTransitionOnChange>
          <PwaServiceWorkerRegistrar />
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
