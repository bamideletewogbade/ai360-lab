type ArrowUpRightIconProps = {
  className?: string
}

/**
 * A font-independent direction mark.
 *
 * Unicode arrows can be promoted to coloured emoji on mobile browsers. This
 * SVG inherits the surrounding text colour and therefore renders consistently
 * on Android, iOS and desktop.
 */
export function ArrowUpRightIcon({ className }: ArrowUpRightIconProps) {
  return (
    <span
      className={['ui-arrow-up-right', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M4 12 12 4M6 4h6v6" />
      </svg>
    </span>
  )
}
