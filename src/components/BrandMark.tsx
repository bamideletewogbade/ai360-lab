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
  const light = kind === 'wordmark' ? '/logo-black.png' : '/icon-mark-black.png'
  const dark = kind === 'wordmark' ? '/logo-white.png' : '/icon-white.png'

  return (
    <>
      <Image
        src={light}
        width={width}
        height={height}
        alt={alt}
        priority={priority}
        className={`brand-mark brand-mark-light ${className}`.trim()}
      />
      <Image
        src={dark}
        width={width}
        height={height}
        alt=""
        aria-hidden="true"
        priority={priority}
        className={`brand-mark brand-mark-dark ${className}`.trim()}
      />
    </>
  )
}
