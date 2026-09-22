// ============================================================
// Prezaro — Student Roster Parser
// Robust extraction for Excel (.xlsx, .xls), Word (.docx), CSV,
// and plain text student rosters with heuristic column detection.
// ============================================================

import * as XLSX from 'xlsx'
import * as mammoth from 'mammoth'
import { STUDENT_ID_PATTERN } from '@/lib/types'
import { sortStudentsByYearId } from '@/lib/student-sort'

export interface ParsedStudentRow {
  studentId: string
  firstName: string
  lastName: string
  level: number
  email?: string | null
  phone?: string | null
  isValid: boolean
  validationError?: string
  isDuplicate?: boolean
}

export interface ColumnMapping {
  studentIdCol: number
  firstNameCol?: number
  lastNameCol?: number
  fullNameCol?: number
  levelCol?: number
  emailCol?: number
  phoneCol?: number
}

export interface ParseResult {
  format: 'excel' | 'docx' | 'csv' | 'text'
  headers: string[]
  rawRowsSample: string[][]
  rawGrid?: string[][]
  detectedMapping: ColumnMapping
  students: ParsedStudentRow[]
  totalDetected: number
  validCount: number
  duplicateCount: number
  invalidCount: number
}

// ---- Name Splitter Heuristic ---------------------------------

/**
 * Splits a full name string into firstName and lastName.
 * Handles "Mensah, Ama" (comma-separated surname first)
 * or "Ama Kwesi Mensah" (last word is surname).
 */
export function splitFullName(rawName: string): { firstName: string; lastName: string } {
  const cleaned = rawName
    .replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return { firstName: '', lastName: '' }

  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((p) => p.trim())
    const surname = parts[0] || ''
    const given = parts.slice(1).join(' ').trim() || surname
    return { firstName: given, lastName: surname }
  }

  const parts = cleaned.split(' ')
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] }
  }

  const lastName = parts[parts.length - 1]
  const firstName = parts.slice(0, -1).join(' ')
  return { firstName, lastName }
}

// ---- Level Normalization Heuristic ---------------------------

/**
 * Normalizes strings like "Level 300", "L300", "300 Level", "300", or "3" into integer levels (100–900).
 */
export function normalizeLevel(raw: any, defaultLevel = 100): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 100 && raw <= 900) return Math.floor(raw)
    if (raw >= 1 && raw <= 9) return raw * 100
  }

  const str = String(raw ?? '').trim()
  if (!str) return defaultLevel

  // Match 3-digit level: 100..900 (e.g. "400", "L400", "400L", "Level 400", "400 Level")
  const match3 = str.match(/(?:^|[^\d])([1-9]00)(?:[^\d]|$)/i)
  if (match3) return Number.parseInt(match3[1], 10)

  // Match single digit with prefix: "L4", "Level 4", "Year 4", "Stage 4"
  const matchPrefix = str.match(/(?:level|year|stage|lvl|l)\s*([1-9])(?!\d)/i)
  if (matchPrefix) return Number.parseInt(matchPrefix[1], 10) * 100

  // Match lone single digit 1..9
  const matchLone = str.match(/^\s*([1-9])\s*$/)
  if (matchLone) return Number.parseInt(matchLone[1], 10) * 100

  return defaultLevel
}

// ---- Clean Student ID -----------------------------------------

export function cleanStudentId(raw: any): string {
  if (!raw) return ''
  return String(raw)
    .trim()
    .replace(/[\s\uFEFF\xA0]+/g, '') // remove invisible and normal spaces
    .toUpperCase()
}

// ---- Heuristic Column Header Matching ------------------------

const ID_HEADER_KEYWORDS = [
  'studentid',
  'student_id',
  'student id',
  'index',
  'indexno',
  'index no',
  'index number',
  'matric',
  'matricno',
  'matric no',
  'regno',
  'reg no',
  'registration',
  'id number',
  'id no',
  'roll',
  'roll no',
]

const FULL_NAME_KEYWORDS = [
  'student name',
  'fullname',
  'full name',
  'name',
  'candidate name',
  'student',
  'names',
]

const FIRST_NAME_KEYWORDS = [
  'firstname',
  'first name',
  'given name',
  'forename',
  'other names',
  'othernames',
]

const LAST_NAME_KEYWORDS = [
  'lastname',
  'last name',
  'surname',
  'family name',
]

const LEVEL_KEYWORDS = [
  'level',
  'lvl',
  'year',
  'stage',
  'class',
]

const EMAIL_KEYWORDS = [
  'email',
  'e-mail',
  'mail',
  'email address',
  'institutional email',
]

const PHONE_KEYWORDS = [
  'phone',
  'mobile',
  'contact',
  'telephone',
  'tel',
  'cell',
  'phone number',
]

function matchesKeywords(header: string, keywords: string[]): boolean {
  const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '')
  return keywords.some((k) => {
    const kNorm = k.replace(/[^a-z0-9]/g, '')
    return norm === kNorm || norm.includes(kNorm)
  })
}

/**
 * Finds the index of the table header row.
 * In university spreadsheets, rows 0-3 might be title banners like:
 * "DEPARTMENT OF COMPUTER SCIENCE", "CLASS LIST 2025/2026", etc.
 */
export function findHeaderRow(grid: string[][]): number {
  let bestRow = 0
  let maxScore = -1

  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const row = grid[r]
    if (!row || row.length === 0) continue

    let score = 0
    for (const cell of row) {
      const c = String(cell || '').trim().toLowerCase()
      if (!c) continue
      if (ID_HEADER_KEYWORDS.some((k) => c.includes(k))) score += 5
      if (FULL_NAME_KEYWORDS.some((k) => c.includes(k))) score += 4
      if (FIRST_NAME_KEYWORDS.some((k) => c.includes(k))) score += 4
      if (LAST_NAME_KEYWORDS.some((k) => c.includes(k))) score += 4
      if (LEVEL_KEYWORDS.some((k) => c.includes(k))) score += 3
      if (EMAIL_KEYWORDS.some((k) => c.includes(k))) score += 3
      if (PHONE_KEYWORDS.some((k) => c.includes(k))) score += 2
    }

    if (score > maxScore) {
      maxScore = score
      bestRow = r
    }
  }

  // If no clear header found with keywords (score < 4), assume row 0 is header unless it looks like pure data
  return maxScore >= 4 ? bestRow : 0
}

/**
 * Detect column mapping by examining headers and data sample values.
 */
export function detectColumnMapping(headers: string[], sampleRows: string[][]): ColumnMapping {
  const mapping: ColumnMapping = {
    studentIdCol: -1,
  }

  // 1. Check header labels
  headers.forEach((h, colIndex) => {
    const headerStr = String(h || '').trim()

    if (mapping.studentIdCol === -1 && matchesKeywords(headerStr, ID_HEADER_KEYWORDS)) {
      mapping.studentIdCol = colIndex
    } else if (mapping.firstNameCol === undefined && matchesKeywords(headerStr, FIRST_NAME_KEYWORDS)) {
      mapping.firstNameCol = colIndex
    } else if (mapping.lastNameCol === undefined && matchesKeywords(headerStr, LAST_NAME_KEYWORDS)) {
      mapping.lastNameCol = colIndex
    } else if (mapping.fullNameCol === undefined && matchesKeywords(headerStr, FULL_NAME_KEYWORDS)) {
      mapping.fullNameCol = colIndex
    } else if (mapping.levelCol === undefined && matchesKeywords(headerStr, LEVEL_KEYWORDS)) {
      mapping.levelCol = colIndex
    } else if (mapping.emailCol === undefined && matchesKeywords(headerStr, EMAIL_KEYWORDS)) {
      mapping.emailCol = colIndex
    } else if (mapping.phoneCol === undefined && matchesKeywords(headerStr, PHONE_KEYWORDS)) {
      mapping.phoneCol = colIndex
    }
  })

  // 2. If studentId column was not found from headers, inspect sample cell values
  if (mapping.studentIdCol === -1) {
    const colIdMatches = headers.map(() => 0)
    for (const row of sampleRows.slice(0, 15)) {
      row.forEach((cell, idx) => {
        const cleaned = cleanStudentId(cell)
        if (STUDENT_ID_PATTERN.test(cleaned)) {
          colIdMatches[idx]++
        }
      })
    }
    let maxIdx = -1
    let maxCount = 0
    colIdMatches.forEach((cnt, idx) => {
      if (cnt > maxCount) {
        maxCount = cnt
        maxIdx = idx
      }
    })
    if (maxCount >= 1) {
      mapping.studentIdCol = maxIdx
    }
  }

  // 3. Fallback: if studentIdCol still -1, default to column 0
  if (mapping.studentIdCol === -1) {
    mapping.studentIdCol = 0
  }

  // 4. If neither fullName nor firstName/lastName is mapped, look for a likely name column
  if (mapping.fullNameCol === undefined && (mapping.firstNameCol === undefined || mapping.lastNameCol === undefined)) {
    // Pick the first column that isn't mapped to id, email, level, or phone
    const candidateCol = headers.findIndex(
      (_, idx) =>
        idx !== mapping.studentIdCol &&
        idx !== mapping.levelCol &&
        idx !== mapping.emailCol &&
        idx !== mapping.phoneCol
    )
    if (candidateCol !== -1) {
      mapping.fullNameCol = candidateCol
    }
  }

  return mapping
}

/**
 * Extracts student rows from a 2D grid of strings given the column mapping.
 */
export function extractStudentsFromGrid(
  grid: string[][],
  mapping: ColumnMapping,
  dataStartRow: number,
  defaultLevel = 100
): ParsedStudentRow[] {
  const students: ParsedStudentRow[] = []
  const seenIds = new Set<string>()

  for (let r = dataStartRow; r < grid.length; r++) {
    const row = grid[r]
    if (!row || row.length === 0) continue

    // Check if whole row is empty
    if (row.every((cell) => !cell || !String(cell).trim())) continue

    const rawId = mapping.studentIdCol >= 0 ? row[mapping.studentIdCol] : ''
    const studentId = cleanStudentId(rawId)

    // Skip row if it repeats header text or doesn't have an ID
    if (!studentId || matchesKeywords(studentId, ID_HEADER_KEYWORDS)) continue

    let firstName = ''
    let lastName = ''

    if (mapping.firstNameCol !== undefined && mapping.lastNameCol !== undefined) {
      firstName = String(row[mapping.firstNameCol] || '').trim()
      lastName = String(row[mapping.lastNameCol] || '').trim()
    } else if (mapping.fullNameCol !== undefined) {
      const full = String(row[mapping.fullNameCol] || '').trim()
      const split = splitFullName(full)
      firstName = split.firstName
      lastName = split.lastName
    } else if (mapping.firstNameCol !== undefined) {
      firstName = String(row[mapping.firstNameCol] || '').trim()
      lastName = firstName
    } else if (mapping.lastNameCol !== undefined) {
      lastName = String(row[mapping.lastNameCol] || '').trim()
      firstName = lastName
    }

    const rawLevel = mapping.levelCol !== undefined ? row[mapping.levelCol] : undefined
    const level = normalizeLevel(rawLevel, defaultLevel)

    const rawEmail = mapping.emailCol !== undefined ? String(row[mapping.emailCol] || '').trim() : ''
    const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null

    const rawPhone = mapping.phoneCol !== undefined ? String(row[mapping.phoneCol] || '').trim() : ''
    const phone = rawPhone.length >= 5 ? rawPhone : null

    // Validation
    const idValid = STUDENT_ID_PATTERN.test(studentId)
    const nameValid = Boolean(firstName && lastName)
    const levelValid = Number.isInteger(level) && level >= 100 && level <= 900

    let validationError: string | undefined
    if (!idValid) {
      validationError = 'Invalid Student ID format'
    } else if (!nameValid) {
      validationError = 'Name is missing'
    } else if (!levelValid) {
      validationError = 'Invalid level (must be 100–900)'
    }

    const isDuplicate = seenIds.has(studentId)
    if (idValid) seenIds.add(studentId)

    students.push({
      studentId,
      firstName: firstName || 'Student',
      lastName: lastName || studentId,
      level,
      email,
      phone,
      isValid: idValid && nameValid && levelValid && !isDuplicate,
      validationError,
      isDuplicate,
    })
  }

  return students
}

// ---- Excel Parser (.xlsx, .xls) ------------------------------

export function parseExcelBuffer(buffer: Buffer, defaultLevel = 100): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel workbook contains no sheets')
  }

  const sheet = workbook.Sheets[sheetName]
  const rawGrid: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  if (!rawGrid || rawGrid.length === 0) {
    throw new Error('Excel sheet appears to be empty')
  }

  // Filter out completely empty leading/trailing rows
  const grid = rawGrid.map((row) => (row || []).map((c) => String(c ?? '').trim()))

  const headerRowIdx = findHeaderRow(grid)
  const headers = (grid[headerRowIdx] || []).map((h, i) => (h ? String(h) : `Column ${i + 1}`))
  const dataStartRow = headerRowIdx + 1
  const rawRowsSample = grid.slice(dataStartRow, dataStartRow + 5)

  const detectedMapping = detectColumnMapping(headers, grid.slice(dataStartRow))
  const students = extractStudentsFromGrid(grid, detectedMapping, dataStartRow, defaultLevel)

  return buildParseResult('excel', headers, rawRowsSample, detectedMapping, students, grid.slice(dataStartRow))
}

// ---- Word Parser (.docx) -------------------------------------

export async function parseDocxBuffer(buffer: Buffer, defaultLevel = 100): Promise<ParseResult> {
  // 1. Try converting to HTML to preserve tables
  const { value: html } = await mammoth.convertToHtml({ buffer })

  const tables: string[][][] = []
  const tableMatches = html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)
  for (const tm of tableMatches) {
    const rows: string[][] = []
    const rowMatches = tm[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
    for (const rm of rowMatches) {
      const cells: string[] = []
      const cellMatches = rm[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)
      for (const cm of cellMatches) {
        // Strip inner tags & decode basic entities
        const text = cm[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim()
        cells.push(text)
      }
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 0) tables.push(rows)
  }

  // If a table is found, use the largest table
  if (tables.length > 0) {
    // Pick table with most rows
    const bestTable = tables.reduce((prev, curr) => (curr.length > prev.length ? curr : prev))
    const headerRowIdx = findHeaderRow(bestTable)
    const headers = (bestTable[headerRowIdx] || []).map((h, i) => (h ? String(h) : `Column ${i + 1}`))
    const dataStartRow = headerRowIdx + 1
    const rawRowsSample = bestTable.slice(dataStartRow, dataStartRow + 5)
    const detectedMapping = detectColumnMapping(headers, bestTable.slice(dataStartRow))
    const students = extractStudentsFromGrid(bestTable, detectedMapping, dataStartRow, defaultLevel)

    return buildParseResult('docx', headers, rawRowsSample, detectedMapping, students, bestTable.slice(dataStartRow))
  }

  // 2. If no table in docx, extract raw text lines
  const { value: rawText } = await mammoth.extractRawText({ buffer })
  return parseTextRoster(rawText, defaultLevel, 'docx')
}

// ---- Plain Text / CSV Parser ---------------------------------

export function parseTextRoster(
  text: string,
  defaultLevel = 100,
  formatType: 'csv' | 'text' | 'docx' = 'csv'
): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    throw new Error('No text or rows found')
  }

  // Detect delimiter: comma, tab, semicolon
  const firstFew = lines.slice(0, 5)
  const commaCount = firstFew.reduce((acc, l) => acc + (l.match(/,/g) || []).length, 0)
  const tabCount = firstFew.reduce((acc, l) => acc + (l.match(/\t/g) || []).length, 0)
  const semiCount = firstFew.reduce((acc, l) => acc + (l.match(/;/g) || []).length, 0)

  let delimiter = ','
  if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t'
  else if (semiCount > commaCount && semiCount > tabCount) delimiter = ';'

  const grid: string[][] = lines.map((l) =>
    l.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''))
  )

  const headerRowIdx = findHeaderRow(grid)
  const headers = (grid[headerRowIdx] || []).map((h, i) => (h ? String(h) : `Column ${i + 1}`))
  const dataStartRow = headerRowIdx + 1
  const rawRowsSample = grid.slice(dataStartRow, dataStartRow + 5)
  const detectedMapping = detectColumnMapping(headers, grid.slice(dataStartRow))
  const students = extractStudentsFromGrid(grid, detectedMapping, dataStartRow, defaultLevel)

  return buildParseResult(formatType === 'docx' ? 'docx' : 'csv', headers, rawRowsSample, detectedMapping, students, grid.slice(dataStartRow))
}

// ---- Helper to structure ParseResult --------------------------

function buildParseResult(
  format: 'excel' | 'docx' | 'csv' | 'text',
  headers: string[],
  rawRowsSample: string[][],
  detectedMapping: ColumnMapping,
  students: ParsedStudentRow[],
  rawGrid?: string[][]
): ParseResult {
  const sorted = sortStudentsByYearId(students)
  const validCount = sorted.filter((s) => s.isValid).length
  const duplicateCount = sorted.filter((s) => s.isDuplicate).length
  const invalidCount = sorted.filter((s) => !s.isValid && !s.isDuplicate).length

  return {
    format,
    headers,
    rawRowsSample,
    rawGrid,
    detectedMapping,
    students: sorted,
    totalDetected: sorted.length,
    validCount,
    duplicateCount,
    invalidCount,
  }
}
