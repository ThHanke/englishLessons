import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's standard class-name combinator: clsx for conditional classes, tailwind-merge to
 * resolve conflicting Tailwind utility classes (e.g. a later `bg-red-500` winning over an
 * earlier `bg-blue-500`) rather than leaving both in the string. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
