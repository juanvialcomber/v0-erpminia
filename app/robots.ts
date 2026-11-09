import type { MetadataRoute } from 'next';

const disallow = ['/admin/', '/api/', '/auth/', '/dashboard/', '/demo/', '/login/', '/portal/'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow,
      },
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
    ],
    sitemap: 'https://www.motil.app/sitemap.xml',
    host: 'https://www.motil.app',
  };
}
