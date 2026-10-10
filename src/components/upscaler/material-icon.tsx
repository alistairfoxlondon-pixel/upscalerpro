import { cn } from '@/lib/utils';

/**
 * Google Material Symbols (Rounded) icon rendered as a ligature from the
 * official Google Fonts icon stylesheet loaded in the app layout.
 *
 * The stylesheet blocks rendering until the font is ready so raw ligature
 * text never flashes. Fonts are preconnected in the document head.
 */
export function MaterialIcon({
  name,
  className,
  filled = false,
  size,
  weight = 400,
  label,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  /** accessible label; omit for decorative icons */
  label?: string;
}) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      className={cn('ms-icon select-none', className)}
      style={{
        fontSize: size ? `${size}px` : undefined,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
        ...(!label ? {} : {}),
      }}
      translate="no"
    >
      {name}
    </span>
  );
}
