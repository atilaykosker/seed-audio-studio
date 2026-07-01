import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const uid = (): string => crypto.randomUUID()

/** Derive a session title from a brief idea: whitespace-collapsed, ≤40 chars, "Untitled" if empty. */
export function sessionTitle(idea: string): string {
  const t = idea.trim().replace(/\s+/g, ' ')
  if (!t) return 'Untitled'
  return t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t
}
