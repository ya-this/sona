import { useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';

interface CoverArtProps {
  src: string;
  alt: string;
  className?: string;
}

export function CoverArt({ src, alt, className = 'w-12 h-12' }: CoverArtProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-200 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500 border border-zinc-300/60 dark:border-zinc-800 shrink-0 ${className}`}
        style={{ borderRadius: 'var(--sona-radius-sm)' }}
        aria-label={alt}
      >
        <Disc3 className="w-5 h-5 opacity-70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover shrink-0 bg-zinc-200 dark:bg-zinc-900 ${className}`}
      style={{ borderRadius: 'var(--sona-radius-sm)' }}
    />
  );
}
