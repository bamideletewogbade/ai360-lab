import Image from 'next/image'

/**
 * The AI360 mark, rendered for the active theme.
 *
 * The brand ships as two monochrome files rather than one tintable asset, so
 * both are rendered and CSS reveals the right one. That keeps the swap free of
 * JavaScript and of any flash: the theme is already stamped on <html> before
 * first paint, so the correct mark is visible from the very first frame.
 */
export function BrandMark({
  kind = 'wordmark',
  width,
  height,
  priority = false,
  className = '',
  alt = 'AI360',
}: {
  kind?: 'wordmark' | 'icon'
  width: number
  height: number
  priority?: boolean
  className?: string
  alt?: string
}) {
  const src = kind === 'wordmark' ? '/logo-black.png' : '/icon-mark-black.png'

  // Both marks are monochrome. Using one tightly cropped source and inverting
  // it in dark themed containers keeps its geometry identical in both themes
  // and avoids loading a hidden duplicate above the fold.
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt={alt}
      loading={priority ? 'eager' : undefined}
      className={`brand-mark brand-mark-${kind} ${className}`.trim()}
    />
  )
}
