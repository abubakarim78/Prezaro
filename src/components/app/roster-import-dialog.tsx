'use client'

// ============================================================
// Prezaro — Student Roster Import Dialog
// Supports Excel (.xlsx, .xls), Word (.docx), CSV, and text files.
// Features smart heuristic column detection, interactive mapping,
// preview table, validation indicators, and course auto-enrollment.
// ============================================================

import React, { useState, useId, useMemo, useRef } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FileUp,
  GraduationCap,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
import type { Course, StudentsResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type ColumnMapping,
  type ParsedStudentRow,
  type ParseResult,
  extractStudentsFromGrid,
  parseTextRoster,
} from '@/lib/student-parser'

const LEVELS = [100, 200, 300, 400, 500, 600] as const

interface ImportRosterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courses: Course[]
  defaultCourseId?: string
  onImported: () => void
}

export function ImportRosterDialog({
  open,
  onOpenChange,
  courses,
  defaultCourseId,
  onImported,
}: ImportRosterDialogProps) {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Wizard state
  const [tab, setTab] = useState<'upload' | 'paste'>('upload')
  const [step, setStep] = useState<'select' | 'parsing' | 'preview'>('select')

  // Import options
  const [defaultLevel, setDefaultLevel] = useState<number>(300)
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    defaultCourseId || 'none'
  )

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')

  // Parsing & mapping state
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [gridData, setGridData] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ studentIdCol: 0 })
  const [students, setStudents] = useState<ParsedStudentRow[]>([])

  // Preview filtering & search
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'issues'>('all')
  const [previewSearch, setPreviewSearch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showMappingConfig, setShowMappingConfig] = useState(false)

  // Reset when closing
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setTimeout(() => {
        setStep('select')
        setSelectedFile(null)
        setPastedText('')
        setParseResult(null)
        setGridData([])
        setStudents([])
        setShowMappingConfig(false)
        setPreviewSearch('')
      }, 200)
    }
    onOpenChange(v)
  }

  // Handle file upload to backend parser
  const processFile = async (file: File) => {
    setSelectedFile(file)
    setStep('parsing')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('defaultLevel', String(defaultLevel))

      const data = await api<ParseResult & { success: boolean; fileName: string }>(
        '/api/students/parse-file',
        {
          method: 'POST',
          body: formData,
        }
      )

      setParseResult(data)
      setColumnMapping(data.detectedMapping)
      setStudents(data.students)
      if (data.rawGrid) setGridData(data.rawGrid)
      setStep('preview')
      toast.success(`Extracted ${data.totalDetected} students from ${file.name}`)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setStep('select')
    }
  }

  // Handle pasted text parse
  const processPastedText = () => {
    if (!pastedText.trim()) return
    setStep('parsing')

    try {
      const res = parseTextRoster(pastedText, defaultLevel, 'text')
      setParseResult(res)
      setColumnMapping(res.detectedMapping)
      setStudents(res.students)
      if (res.rawGrid) setGridData(res.rawGrid)
      setStep('preview')
      toast.success(`Extracted ${res.totalDetected} student rows`)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setStep('select')
    }
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      void processFile(files[0])
    }
  }

  // Re-run extraction if column mapping or default level changes
  const updateMappingField = (
    field: keyof ColumnMapping,
    colIndex: number | undefined
  ) => {
    const nextMapping = { ...columnMapping, [field]: colIndex }
    setColumnMapping(nextMapping)

    if (parseResult && gridData.length > 0) {
      const reExtracted = extractStudentsFromGrid(
        gridData,
        nextMapping,
        1,
        defaultLevel
      )
      setStudents(reExtracted)
    }
  }

  // Remove a row from preview
  const removeRow = (indexToRemove: number) => {
    setStudents((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  // Filtered rows for preview
  const filteredStudents = useMemo(() => {
    let list = students

    if (previewFilter === 'valid') {
      list = list.filter((s) => s.isValid)
    } else if (previewFilter === 'issues') {
      list = list.filter((s) => !s.isValid || s.isDuplicate)
    }

    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase().trim()
      list = list.filter(
        (s) =>
          s.studentId.toLowerCase().includes(q) ||
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q) ||
          (s.email && s.email.toLowerCase().includes(q))
      )
    }

    return list
  }, [students, previewFilter, previewSearch])

  // Ready to import rows (only valid rows)
  const validStudents = useMemo(() => students.filter((s) => s.isValid), [students])
  const duplicateCount = useMemo(() => students.filter((s) => s.isDuplicate).length, [students])
  const invalidCount = useMemo(
    () => students.filter((s) => !s.isValid && !s.isDuplicate).length,
    [students]
  )

  // Submit to create students
  const handleImportSubmit = async () => {
    if (validStudents.length === 0) {
      toast.error('No valid students to import')
      return
    }

    setIsSubmitting(true)
    try {
      const payload: {
        students: {
          studentId: string
          firstName: string
          lastName: string
          level: number
          email?: string | null
          phone?: string | null
        }[]
        courseId?: string
      } = {
        students: validStudents.map((s) => ({
          studentId: s.studentId,
          firstName: s.firstName,
          lastName: s.lastName,
          level: s.level,
          email: s.email,
          phone: s.phone,
        })),
      }

      if (selectedCourseId && selectedCourseId !== 'none') {
        payload.courseId = selectedCourseId
      }

      const resp = await api<
        StudentsResponse & {
          created: number
          skipped: number
          enrolled?: number
          courseCode?: string
        }
      >('/api/students', {
        method: 'POST',
        body: payload,
      })

      let msg = `Created ${resp.created} new students`
      if (resp.skipped > 0) msg += `, skipped ${resp.skipped} existing`
      if (resp.enrolled && resp.enrolled > 0 && resp.courseCode) {
        msg += ` and enrolled ${resp.enrolled} into ${resp.courseCode}`
      }
      toast.success(msg)

      handleOpenChange(false)
      onImported()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] sm:max-w-3xl flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Import Student Roster</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Upload an Excel file (.xlsx, .xls), Word document (.docx), or CSV list to extract and create students.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <h3 className="mt-4 text-base font-semibold">Extracting student roster…</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Parsing document structure, reading tables, and detecting student ID and name columns.
              </p>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-5">
              {/* Configuration bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border bg-muted/30">
                <div className="space-y-1.5">
                  <Label htmlFor="default-level" className="text-xs font-medium flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                    Default Student Level
                  </Label>
                  <Select
                    value={String(defaultLevel)}
                    onValueChange={(val) => setDefaultLevel(Number(val))}
                  >
                    <SelectTrigger id="default-level" className="h-9 text-xs">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((lvl) => (
                        <SelectItem key={lvl} value={String(lvl)} className="text-xs">
                          Level {lvl}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Applied if document has no level column
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="course-enroll" className="text-xs font-medium flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    Auto-enroll in Course (Optional)
                  </Label>
                  <Select
                    value={selectedCourseId}
                    onValueChange={(val) => setSelectedCourseId(val)}
                  >
                    <SelectTrigger id="course-enroll" className="h-9 text-xs">
                      <SelectValue placeholder="Do not enroll" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">
                        Do not enroll in a course
                      </SelectItem>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.code} · {c.title} (L{c.level})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Instantly enrolls all imported students
                  </p>
                </div>
              </div>

              {/* Tabs: File Upload vs Direct Paste */}
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'upload' | 'paste')} className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-9 p-1">
                  <TabsTrigger value="upload" className="text-xs gap-1.5">
                    <FileUp className="h-3.5 w-3.5" /> Upload File (Excel / Word / CSV)
                  </TabsTrigger>
                  <TabsTrigger value="paste" className="text-xs gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Paste Text or CSV
                  </TabsTrigger>
                </TabsList>

                {/* Upload Tab */}
                <TabsContent value="upload" className="mt-4">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center ${
                      isDragging
                        ? 'border-primary bg-primary/5 scale-[0.99]'
                        : 'border-border hover:border-primary/50 hover:bg-muted/40'
                    }`}
                  >
                    <input
                      id={fileInputId}
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.docx,.csv,.tsv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void processFile(file)
                      }}
                    />

                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                      <UploadCloud className="h-7 w-7" />
                    </div>

                    <h4 className="text-sm font-semibold">
                      Click to choose or drag & drop roster file
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                      Supports Excel spreadsheets (<span className="font-mono text-foreground">.xlsx</span>, <span className="font-mono text-foreground">.xls</span>),
                      Word documents (<span className="font-mono text-foreground">.docx</span>), and CSV files.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <FileSpreadsheet className="h-3 w-3" /> Excel (.xlsx, .xls)
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                        <FileText className="h-3 w-3" /> Word (.docx)
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <FileUp className="h-3 w-3" /> CSV / TSV
                      </span>
                    </div>
                  </div>
                </TabsContent>

                {/* Paste Tab */}
                <TabsContent value="paste" className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="paste-area" className="text-xs text-muted-foreground">
                      Paste rows below (comma, tab, or space separated):
                    </Label>
                    <Textarea
                      id="paste-area"
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder={
                        'PHA/0001/26,Ama Mensah,300,ama@st.ug.edu.gh\nPHA/0002/26,Kofi Boateng,300,kofi@st.ug.edu.gh\nPHA/0003/26,Sarah Akoto,300'
                      }
                      className="min-h-48 font-mono text-xs"
                    />
                  </div>
                  <Button
                    onClick={processPastedText}
                    disabled={!pastedText.trim()}
                    className="w-full min-h-10 text-xs font-semibold"
                  >
                    Extract Students from Text
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* File / extraction summary banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold leading-none truncate max-w-xs sm:max-w-md">
                      {selectedFile ? selectedFile.name : 'Pasted text roster'}
                    </h4>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{students.length} total rows detected</span>
                      <span>•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {validStudents.length} ready
                      </span>
                      {duplicateCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-600 dark:text-amber-400">
                            {duplicateCount} duplicates
                          </span>
                        </>
                      )}
                      {invalidCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-destructive font-medium">
                            {invalidCount} invalid
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => setShowMappingConfig(!showMappingConfig)}
                  >
                    {showMappingConfig ? 'Hide Column Mapping' : 'Adjust Mapping'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setStep('select')
                      setSelectedFile(null)
                    }}
                  >
                    <ArrowLeft className="h-3 w-3" /> Change File
                  </Button>
                </div>
              </div>

              {/* Column Mapping Adjuster (Collapsible) */}
              {showMappingConfig && parseResult && (
                <div className="p-4 rounded-xl border bg-muted/20 space-y-3 animate-in fade-in-50 duration-200">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-semibold text-foreground">
                      Column Mapping Configuration
                    </h5>
                    <span className="text-[11px] text-muted-foreground">
                      Auto-detected from document headers
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {/* Student ID */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        Student ID / Index No *
                      </Label>
                      <Select
                        value={String(columnMapping.studentIdCol)}
                        onValueChange={(v) => updateMappingField('studentIdCol', Number(v))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {parseResult.headers.map((h, idx) => (
                            <SelectItem key={idx} value={String(idx)} className="text-xs">
                              {h || `Column ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Name column */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        Full Name / Student Name *
                      </Label>
                      <Select
                        value={
                          columnMapping.fullNameCol !== undefined
                            ? String(columnMapping.fullNameCol)
                            : 'none'
                        }
                        onValueChange={(v) =>
                          updateMappingField('fullNameCol', v === 'none' ? undefined : Number(v))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select name column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">
                            (Separate First/Last name)
                          </SelectItem>
                          {parseResult.headers.map((h, idx) => (
                            <SelectItem key={idx} value={String(idx)} className="text-xs">
                              {h || `Column ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Level */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        Level
                      </Label>
                      <Select
                        value={
                          columnMapping.levelCol !== undefined
                            ? String(columnMapping.levelCol)
                            : 'none'
                        }
                        onValueChange={(v) =>
                          updateMappingField('levelCol', v === 'none' ? undefined : Number(v))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Use default level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">
                            None (Use default: L{defaultLevel})
                          </SelectItem>
                          {parseResult.headers.map((h, idx) => (
                            <SelectItem key={idx} value={String(idx)} className="text-xs">
                              {h || `Column ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        Email Address
                      </Label>
                      <Select
                        value={
                          columnMapping.emailCol !== undefined
                            ? String(columnMapping.emailCol)
                            : 'none'
                        }
                        onValueChange={(v) =>
                          updateMappingField('emailCol', v === 'none' ? undefined : Number(v))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">
                            None (No email)
                          </SelectItem>
                          {parseResult.headers.map((h, idx) => (
                            <SelectItem key={idx} value={String(idx)} className="text-xs">
                              {h || `Column ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        Phone / Contact
                      </Label>
                      <Select
                        value={
                          columnMapping.phoneCol !== undefined
                            ? String(columnMapping.phoneCol)
                            : 'none'
                        }
                        onValueChange={(v) =>
                          updateMappingField('phoneCol', v === 'none' ? undefined : Number(v))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">
                            None (No phone)
                          </SelectItem>
                          {parseResult.headers.map((h, idx) => (
                            <SelectItem key={idx} value={String(idx)} className="text-xs">
                              {h || `Column ${idx + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search preview rows…"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <Button
                    variant={previewFilter === 'all' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-[11px] px-2.5"
                    onClick={() => setPreviewFilter('all')}
                  >
                    All ({students.length})
                  </Button>
                  <Button
                    variant={previewFilter === 'valid' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-[11px] px-2.5 text-emerald-600 dark:text-emerald-400"
                    onClick={() => setPreviewFilter('valid')}
                  >
                    Ready ({validStudents.length})
                  </Button>
                  {(duplicateCount > 0 || invalidCount > 0) && (
                    <Button
                      variant={previewFilter === 'issues' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 text-[11px] px-2.5 text-amber-600 dark:text-amber-400"
                      onClick={() => setPreviewFilter('issues')}
                    >
                      Issues ({duplicateCount + invalidCount})
                    </Button>
                  )}
                </div>
              </div>

              {/* Table Preview */}
              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-72 overflow-y-auto scrollbar-thin">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b text-muted-foreground text-[11px]">
                      <tr>
                        <th className="py-2 px-3 font-medium w-16">Status</th>
                        <th className="py-2 px-3 font-medium">Student ID</th>
                        <th className="py-2 px-3 font-medium">Name</th>
                        <th className="py-2 px-3 font-medium w-16">Level</th>
                        <th className="py-2 px-3 font-medium">Email</th>
                        <th className="py-2 px-3 font-medium">Phone</th>
                        <th className="py-2 px-2 text-right w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-muted-foreground">
                            No students match your filter or search query.
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((st, idx) => (
                          <tr
                            key={idx}
                            className={`transition-colors hover:bg-muted/40 ${
                              !st.isValid
                                ? 'bg-destructive/5'
                                : st.isDuplicate
                                ? 'bg-amber-500/5'
                                : ''
                            }`}
                          >
                            <td className="py-2 px-3">
                              {st.isValid ? (
                                <span
                                  title="Valid"
                                  className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </span>
                              ) : st.isDuplicate ? (
                                <span
                                  title="Duplicate in file (will be skipped)"
                                  className="inline-flex items-center text-amber-500"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </span>
                              ) : (
                                <span
                                  title={st.validationError || 'Invalid format'}
                                  className="inline-flex items-center text-destructive"
                                >
                                  <AlertCircle className="h-4 w-4" />
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono font-medium">
                              {st.studentId}
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-medium text-foreground">
                                {st.firstName} {st.lastName}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground font-mono">
                              L{st.level}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground truncate max-w-44">
                              {st.email || '—'}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground font-mono">
                              {st.phone || '—'}
                            </td>
                            <td className="py-2 px-2 text-right">
                              <button
                                type="button"
                                title="Remove row"
                                onClick={() => removeRow(idx)}
                                className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            {step === 'preview' ? (
              <span>
                <strong className="text-foreground">{validStudents.length}</strong> students ready to import.
                {selectedCourseId && selectedCourseId !== 'none' && (
                  <span className="ml-1 text-primary font-medium">
                    (Will enroll in course)
                  </span>
                )}
              </span>
            ) : (
              <span>Existing student IDs are automatically skipped to avoid duplicates.</span>
            )}
          </div>

          <DialogFooter className="gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="min-h-9 flex-1 sm:flex-none text-xs"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting || step === 'parsing'}
            >
              Cancel
            </Button>

            {step === 'preview' && (
              <Button
                size="sm"
                className="min-h-9 flex-1 sm:flex-none text-xs font-semibold"
                onClick={handleImportSubmit}
                disabled={isSubmitting || validStudents.length === 0}
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Import {validStudents.length} Students
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
