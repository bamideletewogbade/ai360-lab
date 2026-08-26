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
  tone = 'auto',
  width,
  height,
  priority = false,
  className = '',
  alt = 'AI360',
}: {
  kind?: 'wordmark' | 'icon'
  /**
   * `auto` follows the page theme, which is what almost every surface wants.
   * `onDark` is for a container that is dark in *both* themes — the admin
   * sidebar is painted `#181a19` outright — where the theme-scoped inversion
   * never fires and the black mark would sit invisible on its own background.
   */
  tone?: 'auto' | 'onDark'
  width: number
  height: number
  priority?: boolean
  className?: string
  alt?: string
}) {
  // A real white wordmark ships, so prefer it over inverting the black one:
  // `filter: invert(1)` also flips any anti-aliased edge, and the supplied
  // asset is what the brand actually looks like on a dark ground. No white
  // icon-mark exists, so that combination still falls back to inversion.
  const white = kind === 'wordmark' ? '/logo-white.png' : null
  const onDark = tone === 'onDark'
  const src = onDark && white
    ? white
    : kind === 'wordmark' ? '/logo-black.png' : '/icon-mark-black.png'

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
      className={[
        'brand-mark',
        `brand-mark-${kind}`,
        onDark && !white ? 'brand-mark-on-dark' : '',
        className,
      ].filter(Boolean).join(' ')}
    />
  )
}
