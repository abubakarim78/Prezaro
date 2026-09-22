// ============================================================
// Prezaro — Student ID & Year-Aware Sorting Utilities
// Handles academic index-number formats like PHA/0001/26, CS-101/23,
// and numeric IDs like 10928326 where the last two digits represent the year.
// ============================================================

export interface ParsedStudentId {
  year: number // e.g. 2026, 2025, 2024
  prefix: string // e.g. "PHA", "CS"
  serial: number // e.g. 1, 2, 10
  raw: string
}

/**
 * Extracts the graduation/admission year (last 2 or 4 digits),
 * program/department prefix, and sequential number from a student ID.
 */
export function parseStudentIdForSort(id: string): ParsedStudentId {
  const clean = (id || '').trim()

  // 1. Check for separator before year: e.g. "PHA/0001/26" or "CS-101/23" or "0123/2026"
  const slashMatch = clean.match(/[/_-](\d{2,4})$/)
  let year = -1
  let prefix = clean
  let serial = -1

  if (slashMatch) {
    const yStr = slashMatch[1]
    const yNum = Number.parseInt(yStr, 10)
    // If 2 digits, convert to 4-digit year (e.g. 26 -> 2026, 99 -> 1999)
    year = yStr.length === 4 ? yNum : (yNum < 70 ? 2000 + yNum : 1900 + yNum)

    const rest = clean.slice(0, slashMatch.index)
    // Extract trailing serial number from rest (e.g. "PHA/0001" -> 1)
    const numMatch = rest.match(/(\d+)$/)
    if (numMatch) {
      serial = Number.parseInt(numMatch[1], 10)
      prefix = rest.slice(0, numMatch.index).replace(/[/_-]+$/, '')
    } else {
      prefix = rest
    }
    return { year, prefix, serial, raw: clean }
  }

  // 2. Check for last 2 digits of alphanumeric/numeric ID: e.g. "10928326" -> year 2026
  const endDigitsMatch = clean.match(/(\d{2})$/)
  if (endDigitsMatch) {
    const yNum = Number.parseInt(endDigitsMatch[1], 10)
    year = yNum < 70 ? 2000 + yNum : 1900 + yNum
    const rest = clean.slice(0, -2)
    const numMatch = rest.match(/(\d+)$/)
    if (numMatch) {
      serial = Number.parseInt(numMatch[1], 10)
      prefix = rest.slice(0, numMatch.index)
    } else {
      prefix = rest
    }
    return { year, prefix, serial, raw: clean }
  }

  return { year: -1, prefix: clean, serial: -1, raw: clean }
}

/**
 * Compares two student IDs:
 * 1. Program Prefix (e.g. "PHA", "CS")
 * 2. Serial / ID number (e.g. 0001 before 0004, regardless of year)
 * 3. Year (last two digits, e.g. 21 before 22 for identical numbers like PHA/0004/21 vs PHA/0004/22)
 * 4. Raw string fallback
 */
export function compareStudentIds(
  idA: string,
  idB: string,
  order: 'asc' | 'desc' = 'asc'
): number {
  const a = parseStudentIdForSort(idA)
  const b = parseStudentIdForSort(idB)

  // 1. Compare Prefix (e.g. "CS" before "PHA")
  if (a.prefix.toLowerCase() !== b.prefix.toLowerCase()) {
    const cmp = a.prefix.localeCompare(b.prefix, undefined, { sensitivity: 'base' })
    return order === 'asc' ? cmp : -cmp
  }

  // 2. Compare Serial / ID Number (e.g. 0001 comes before 0004 even if 0001 is year 25 and 0004 is year 22)
  if (a.serial !== b.serial) {
    if (a.serial === -1) return 1
    if (b.serial === -1) return -1
    return order === 'asc' ? a.serial - b.serial : b.serial - a.serial
  }

  // 3. When ID numbers are identical/similar, compare Year (e.g. 21 before 22)
  if (a.year !== b.year) {
    if (a.year === -1) return 1
    if (b.year === -1) return -1
    return order === 'asc' ? a.year - b.year : b.year - a.year
  }

  // 4. Natural string fallback
  const cmp = a.raw.localeCompare(b.raw, undefined, { numeric: true, sensitivity: 'base' })
  return order === 'asc' ? cmp : -cmp
}

/**
 * Sorts any list of objects that have a studentId field.
 */
export function sortStudentsByYearId<T extends { studentId: string }>(
  items: T[],
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...items].sort((a, b) => compareStudentIds(a.studentId, b.studentId, order))
}
