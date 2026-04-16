import ExcelJS from 'exceljs'

type TemplateFormat = 'csv' | 'xlsx'
type TemplateMode = 'draft' | 'minimal' | 'full'

function parseFormat(value: unknown): TemplateFormat {
  if (value === 'csv' || value === 'xlsx') {
    return value
  }

  return 'xlsx'
}

function parseMode(value: unknown): TemplateMode {
  if (value === 'full') {
    return 'full'
  }

  if (value === 'draft') {
    return 'draft'
  }

  return 'minimal'
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return 'empty\n'
  }

  const firstRow = rows[0] || {}
  const headers = Object.keys(firstRow)
  const lines = [headers.join(',')]

  for (const row of rows) {
    lines.push(headers.map((header) => {
      const value = row[header]
      if (value === null || value === undefined) {
        return ''
      }

      const raw = String(value)
      if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
        return `"${raw.replace(/"/g, '""')}"`
      }

      return raw
    }).join(','))
  }

  return lines.join('\n')
}

const minimalTemplateRows = [
  {
    fullName: 'John Smith',
    phoneNumber: '+998901112233',
    age: 28,
    workShift: 'day',
    baseSalary: 1000000,
    positionBonus: 100000
  }
]

const draftTemplateRows = [
  {
    fullName: 'John Smith',
    phoneNumber: '+998901112233'
  }
]

const fullTemplateRows = [
  {
    fullName: 'John Smith',
    username: 'john.smith',
    password: 'StrongPass123',
    phoneNumber: '+998901112233',
    age: 28,
    workShift: 'day',
    objectPinned: '',
    objectPositions: 'Пост 1,Пост 2',
    baseSalary: 1000000,
    positionBonus: 100000,
    avatarUrl: 'https://i.pravatar.cc/128?u=john.smith',
    passportFile: 'bulk-import/john-smith.pdf'
  }
]

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const format = parseFormat(query.format)
  const mode = parseMode(query.mode)
  const templateRows = mode === 'full'
    ? fullTemplateRows
    : (mode === 'draft' ? draftTemplateRows : minimalTemplateRows)

  if (format === 'csv') {
    const csv = toCsv(templateRows)

    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', 'attachment; filename="customers-import-template.csv"')

    return csv
  }

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('template')
  const headers = Object.keys(templateRows[0] || {})

  worksheet.columns = headers.map(header => ({
    header,
    key: header
  }))
  templateRows.forEach(row => worksheet.addRow(row))

  const buffer = await workbook.xlsx.writeBuffer()
  const payload = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)

  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', 'attachment; filename="customers-import-template.xlsx"')

  return payload
})
