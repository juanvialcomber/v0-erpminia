import Image from 'next/image';
import { ImageIcon } from 'lucide-react';

type Media = { image_url?: string | null; status?: string | null; source_type?: string | null } | null;

const PHOTO_SIZE = {
  sm: { classes: 'h-8 w-8', pixels: 32, sizes: '32px', quality: 74 },
  md: { classes: 'h-14 w-14', pixels: 56, sizes: '56px', quality: 78 },
  lg: { classes: 'h-32 w-32', pixels: 128, sizes: '128px', quality: 84 },
} as const;

export function ProductPhoto({
  media,
  name,
  size = 'md',
  showPending = false,
}: {
  media?: Media;
  name: string;
  size?: keyof typeof PHOTO_SIZE;
  showPending?: boolean;
}) {
  const config = PHOTO_SIZE[size];
  const isPending = media?.status === 'pending';
  const isWebSource = media?.source_type === 'web_source';
  const canShowImage = Boolean(
    media?.image_url &&
    (media?.status === 'approved' || (isPending && (showPending || isWebSource))),
  );

  if (canShowImage) {
    const pending = media?.status === 'pending';
    const sourceLabel = isWebSource ? 'web' : 'IA';

    return (
      <div className={`${config.classes} relative shrink-0 overflow-hidden rounded-md border bg-white dark:bg-muted/30`}>
        <Image
          src={media?.image_url || ''}
          alt={pending ? `Fotografía ${sourceLabel} pendiente de validación de ${name}` : `Fotografía validada de ${name}`}
          width={config.pixels}
          height={config.pixels}
          sizes={config.sizes}
          quality={config.quality}
          loading={size === 'lg' ? 'eager' : 'lazy'}
          className="h-full w-full object-contain p-1"
        />
        {pending ? (
          <span className="absolute bottom-1 left-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-[9px] leading-none text-muted-foreground shadow-sm">
            Pendiente
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`${config.classes} flex shrink-0 flex-col items-center justify-center rounded-md border border-dashed bg-muted/40 text-muted-foreground`}
      title="Foto pendiente"
    >
      <ImageIcon className="h-4 w-4" />
      {size === 'sm' ? null : <span className="mt-1 text-[9px] leading-none">Pendiente</span>}
    </div>
  );
}
