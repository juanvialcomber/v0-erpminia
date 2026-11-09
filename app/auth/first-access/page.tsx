import Image from 'next/image';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FirstAccessForm } from '@/components/auth/first-access-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function FirstAccessPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <Card className="w-full">
          <CardHeader className="space-y-4">
            <Image
              src="/brand/motil-wordmark.png"
              alt="MOTIL"
              width={2094}
              height={610}
              className="h-8 w-auto"
              priority
            />
            <div>
              <CardTitle>Primer acceso</CardTitle>
              <CardDescription>
                Define tu contraseña para activar tu acceso personal a MOTIL.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
              <FirstAccessForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
