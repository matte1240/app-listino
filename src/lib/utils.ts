import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseLocalizedNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  const text = String(value ?? "").trim()
  if (!text) return 0

  const compact = text.replace(/\s+/g, "")
  const cleaned = compact.replace(/[^0-9,.-]/g, "")
  if (!cleaned) return 0

  let normalized = cleaned
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "")
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".")
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
