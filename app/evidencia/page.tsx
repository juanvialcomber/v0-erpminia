import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Evidencia y alcance',
  description: 'Qué afirma públicamente MOTIL, qué capacidades expone y cuáles son sus límites de alcance como Sistema Operativo para Minería.',
  alternates: { canonical: '/evidencia' },
  openGraph: {
    title: 'MOTIL | Evidencia y alcance',
    description: 'Superficie pública para verificar capacidades, alcance y límites de MOTIL Mining OS.',
    url: 'https://www.motil.app/evidencia',
  },
};

const capabilities = [
  ['Producción', 'Registro y conexión de datos operacionales de producción, planta, metalurgia, geología, topografía, química y transporte de mineral.'],
  ['Mantenimiento', 'Órdenes de trabajo, activos, planificación, evidencia de ejecución, historial y coordinación de mantenimiento.'],
  ['Inventario', 'Stock, movimientos, reservas, repuestos, reposición y trazabilidad de bodega.'],
  ['Compras', 'Solicitudes, cotizaciones, comparación de proveedores, órdenes de compra y trazabilidad de abastecimiento.'],
  ['Finanzas', 'Centros de costo, compromisos, costos operacionales y trazabilidad financiera conectada a la operación.'],
  ['RRHH', 'Personas, asignaciones, competencias, desempeño y evidencia operacional asociada a roles y trabajo.'],
  ['Sostenibilidad y HSE', 'Prevención de riesgos, inspecciones, EPP, ambiente, comunidades y seguimiento de cumplimiento.'],
  ['Legal', 'Contratos, documentos, permisos, vencimientos y evidencia de control contractual.'],
];

const boundaries = [
  'MOTIL no reemplaza por sí solo las fuentes oficiales, ERP, sistemas regulatorios o sistemas de terceros que una operación decida mantener como fuente de origen.',
  'Una integración o módulo se considera disponible sólo cuando está implementado y habilitado en el entorno correspondiente.',
  'Las decisiones operacionales, aprobaciones, pagos, presentaciones regulatorias y otras acciones de autoridad permanecen bajo responsabilidad humana.',
  'Las métricas y resultados dependen de la cobertura, calidad y vigencia de los datos conectados; no se publican cifras de impacto sin alcance, período y evidencia verificables.',
];

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://www.motil.app/#software',
      name: 'MOTIL Mining OS',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Mining Operating System',
      operatingSystem: 'Web',
      url: 'https://www.motil.app/',
      provider: { '@id': 'https://www.n3uralia.com/#organization' },
      areaServed: { '@type': 'Country', name: 'Chile' },
    },
    {
      '@type': 'WebPage',
      '@id': 'https://www.motil.app/evidencia#page',
      url: 'https://www.motil.app/evidencia',
      name: 'MOTIL — Evidencia y alcance',
      description: 'Superficie pública para verificar capacidades, alcance y límites de MOTIL Mining OS.',
      about: { '@id': 'https://www.motil.app/#software' },
      isPartOf: { '@id': 'https://www.motil.app/#website' },
      inLanguage: 'es-CL',
      dateModified: '2026-11-09',
    },
  ],
};

export default function EvidencePage() {
  return (
    <main className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← MOTIL Mining OS</Link>

        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.14em] text-primary">EVIDENCIA PÚBLICA · ACTUALIZADO 09 NOV 2026</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl">Qué es MOTIL, qué expone y cuáles son sus límites.</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Esta página resume únicamente capacidades y límites que pueden sostenerse desde la superficie pública de MOTIL. No sustituye contratos, documentación privada ni evidencia operacional de una faena.
        </p>

        <section className="mt-12 border-y py-10">
          <h2 className="text-2xl font-semibold">Entidad canónica</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <article><h3 className="font-semibold">Producto</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">MOTIL Mining OS, un Sistema Operativo para Minería.</p></article>
            <article><h3 className="font-semibold">Proveedor</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">N3URALIA / Neuralia SpA.</p></article>
            <article><h3 className="font-semibold">Ámbito</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Operaciones mineras, con foco público inicial en Chile.</p></article>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Capacidades públicas verificables</h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">Estas capacidades corresponden a los dominios funcionales que MOTIL publica como parte de su arquitectura modular.</p>
          <div className="mt-6 divide-y rounded-lg border bg-card">
            {capabilities.map(([name, text]) => (
              <article key={name} className="grid gap-2 p-5 md:grid-cols-[180px_1fr]">
                <h3 className="font-semibold">{name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t pt-10">
          <h2 className="text-2xl font-semibold">Límites y condiciones</h2>
          <div className="mt-5 space-y-4">
            {boundaries.map((item) => <p key={item} className="max-w-4xl leading-relaxed text-muted-foreground">{item}</p>)}
          </div>
        </section>

        <section className="mt-14 border-t pt-10">
          <h2 className="text-2xl font-semibold">Cómo verificar MOTIL</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
            Para entender la categoría y el enfoque operativo, revisa la página de minería en Chile. Para una capacidad específica, usa las páginas públicas de módulos. Las funcionalidades internas, integraciones activas y datos de clientes no se consideran evidencia pública por defecto.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/mineria-chile" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Sistema Operativo para Minería <ArrowRight className="h-4 w-4"/></Link>
            <a href="https://www.n3uralia.com" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">N3URALIA <ArrowRight className="h-4 w-4"/></a>
          </div>
        </section>
      </div>
    </main>
  );
}
