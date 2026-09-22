// ============================================================
// Prezaro — Student Roster File Parsing Endpoint
// Extracts student details from uploaded Excel (.xlsx, .xls),
// Word (.docx), CSV, or plain text rosters.
// ============================================================

import { NextResponse } from 'next/server'
import { BadRequestError, requireUser } from '@/lib/auth'
import { handle } from '@/app/api/_lib/helpers'
import {
  parseDocxBuffer,
  parseExcelBuffer,
  parseTextRoster,
  type ParseResult,
} from '@/lib/student-parser'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(req)

    let formData: FormData
    try {
      formData = await req.formData()
    } catch (err: any) {
      throw new BadRequestError(`Failed to read uploaded file: ${err?.message || 'Invalid form data'}`)
    }

    const file = formData.get('file') as File | null
    const defaultLevel = Number(formData.get('defaultLevel')) || 100

    if (!file) {
      throw new BadRequestError('No file provided')
    }

    const fileName = file.name || 'uploaded_roster'
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()

    // 15 MB limit
    if (file.size > 15 * 1024 * 1024) {
      throw new BadRequestError('File size exceeds the 15 MB limit')
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let result: ParseResult

    if (ext === '.xlsx' || ext === '.xls') {
      try {
        result = parseExcelBuffer(buffer, defaultLevel)
      } catch (err: any) {
        throw new BadRequestError(`Failed to parse Excel file: ${err.message || 'Invalid format'}`)
      }
    } else if (ext === '.docx' || ext === '.doc') {
      try {
        result = await parseDocxBuffer(buffer, defaultLevel)
      } catch (err: any) {
        if (ext === '.doc') {
          throw new BadRequestError(
            'Older Word 97-2003 (.doc) binary files are not supported directly. Please save the document as modern Word (.docx) or Excel (.xlsx) before uploading.'
          )
        }
        throw new BadRequestError(`Failed to parse Word document: ${err.message || 'Invalid format'}`)
      }
    } else if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
      try {
        const text = buffer.toString('utf-8')
        result = parseTextRoster(text, defaultLevel, 'csv')
      } catch (err: any) {
        throw new BadRequestError(`Failed to parse text roster: ${err.message || 'Invalid format'}`)
      }
    } else {
      throw new BadRequestError(
        `Unsupported file type "${ext}". Please upload an Excel (.xlsx, .xls), Word (.docx), or CSV file.`
      )
    }

    return NextResponse.json({
      success: true,
      fileName,
      ...result,
    })
  })
}
