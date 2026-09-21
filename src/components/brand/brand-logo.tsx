'use client'

import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
  priority?: boolean
  alt?: string
}

/**
 * Prezaro Full Brand Logo (Icon + Typography).
 * Automatically toggles between light and dark mode:
 * - Light mode: uses logo with white background & army-green typography
 * - Dark mode: uses logo with army-green background & crisp white typography
 */
export function BrandLogo({ className, alt = 'Prezaro' }: BrandLogoProps) {
  return (
    <div className={cn('relative inline-flex items-center justify-center select-none', className)}>
      {/* Light mode logo */}
      <img
        src="/logo-white.svg"
        alt={alt}
        className="h-full w-full object-contain block dark:hidden"
        draggable={false}
      />
      {/* Dark mode logo */}
      <img
        src="/logo-armygreen.svg"
        alt={alt}
        className="h-full w-full object-contain hidden dark:block"
        draggable={false}
      />
    </div>
  )
}

/**
 * Prezaro Square Brand Icon (Emblem with face scan, graduation cap, and checkmark).
 * Designed for app tiles, sidebars, navigation bars, and avatar headers.
 */
export function BrandIcon({ className, alt = 'Prezaro Icon' }: BrandLogoProps) {
  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-xl select-none',
        className
      )}
    >
      {/* Light mode emblem */}
      <img
        src="/emblem-white.png"
        alt={alt}
        className="h-full w-full object-cover block dark:hidden"
        draggable={false}
      />
      {/* Dark mode emblem */}
      <img
        src="/emblem-armygreen.png"
        alt={alt}
        className="h-full w-full object-cover hidden dark:block"
        draggable={false}
      />
    </div>
  )
}
