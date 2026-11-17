import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Shows an image Blob via an object URL that is revoked when it is no longer needed. */
export function BlobImage({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} draggable={false} className={className} /> : <div className={cn('bg-muted', className)} />;
}
