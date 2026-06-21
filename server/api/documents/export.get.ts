import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import {
  mapDispatchDbRowToRecord,
  mapSignedDbRowToRecord,
  mapTemplateDbRowToRecord,
  parseObjectIdInput,
  type DocumentDispatchDbRow,
  type DocumentTemplateDbRow,
  type SignedDocumentDbRow
} from './documents'

type ExportFormat = 'csv' | 'xlsx' | 'pdf'
type ExportScope = 'signed' | 'sent' | 'templates'

function parseExportFormat(value: unknown): ExportFormat {
  if (value === 'csv' || value === 'xlsx' || value === 'pdf') {
    return value
  }

  return 'xlsx'
}

function parseExportScope(value: unknown): ExportScope {
  if (value === 'signed' || value === 'sent' || value === 'templates') {
    return value
  }

  return 'signed'
}

const headersByScope: Record<ExportScope, string[]> = {
  templates: ['id', 'name', 'contractType', 'createdAt', 'updatedAt'],
  sent: ['id', 'templateName', 'title', 'recipients', 'signedCount', 'status', 'sentAt'],
  signed: ['id', 'templateName', 'employeeName', 'phoneNumber', 'signedVia', 'signedAt']
}

async function toXlsxBuffer(scope: ExportScope, rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(scope)
  const headers = headersByScope[scope] || (rows[0] ? Object.keys(rows[0]) : [])

  if (headers.length) {
    worksheet.columns = headers.map(header => ({
      header,
      key: header
    }))
  }

  rows.forEach(row => worksheet.addRow(row))

  return workbook.xlsx.writeBuffer()
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

function toWorksheetRows(scope: ExportScope, payload: {
  templates: ReturnType<typeof mapTemplateDbRowToRecord>[]
  sent: ReturnType<typeof mapDispatchDbRowToRecord>[]
  signed: ReturnType<typeof mapSignedDbRowToRecord>[]
  templateNameById: Map<number, string>
}) {
  if (scope === 'templates') {
    return payload.templates.map(template => ({
      id: template.id,
      name: template.name,
      contractType: template.contractType,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    }))
  }

  if (scope === 'sent') {
    return payload.sent.map(dispatch => ({
      id: dispatch.id,
      templateName: dispatch.templateId ? payload.templateNameById.get(dispatch.templateId) || `#${dispatch.templateId}` : 'n/a',
      title: dispatch.title,
      recipients: dispatch.recipientCount,
      signedCount: dispatch.signedCount,
      status: dispatch.status,
      sentAt: dispatch.sentAt
    }))
  }

  return payload.signed.map(item => ({
    id: item.id,
    templateName: item.templateId ? payload.templateNameById.get(item.templateId) || `#${item.templateId}` : 'n/a',
    employeeName: item.employeeName,
    phoneNumber: item.phoneNumber,
    signedVia: item.signedVia,
    signedAt: item.signedAt
  }))
}

async function toPdfBuffer(title: string, rows: Record<string, unknown>[]) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([842, 595])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const baseX = 40
  let y = 560

  page.drawText(title, {
    x: baseX,
    y,
    size: 16,
    font
  })

  y -= 24
  const previewRows = rows.slice(0, 40)

  for (const row of previewRows) {
    const line = Object.entries(row)
      .map(([key, value]) => `${key}: ${String(value ?? '')}`)
      .join(' | ')
      .slice(0, 180)

    page.drawText(line, {
      x: baseX,
      y,
      size: 10,
      font
    })

    y -= 14
    if (y < 40) {
      break
    }
  }

  return await pdf.save()
}

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const objectId = parseObjectIdInput(query.objectId, 'objectId query param is required.')
  const format = parseExportFormat(query.format)
  const scope = parseExportScope(query.scope)

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const [templateRows, dispatchRows, signedRows] = await Promise.all([
    $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
      headers,
      query: {
        select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
        object_id: `eq.${objectId}`,
        order: 'id.desc'
      }
    }),
    $fetch<DocumentDispatchDbRow[]>(`${url}/rest/v1/document_dispatches`, {
      headers,
      query: {
        select: 'id,object_id,template_id,title,recipient_ids,recipient_phones,recipient_count,signed_count,status,sent_at',
        object_id: `eq.${objectId}`,
        order: 'id.desc'
      }
    }),
    $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
      headers,
      query: {
        select: 'id,object_id,dispatch_id,template_id,employee_name,phone_number,signed_at,signed_via,file_url',
        object_id: `eq.${objectId}`,
        order: 'signed_at.desc'
      }
    })
  ])

  const templates = templateRows.map(mapTemplateDbRowToRecord)
  const sent = dispatchRows.map(mapDispatchDbRowToRecord)
  const signed = signedRows.map(mapSignedDbRowToRecord)
  const templateNameById = new Map(templates.map(template => [template.id, template.name]))

  const exportRows = toWorksheetRows(scope, {
    templates,
    sent,
    signed,
    templateNameById
  })

  const dateStamp = new Date().toISOString().slice(0, 10)
  const fileStem = `documents-${scope}-${dateStamp}`

  if (format === 'csv') {
    const csv = toCsv(exportRows)

    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${fileStem}.csv"`)

    return csv
  }

  if (format === 'xlsx') {
    const xlsxBuffer = await toXlsxBuffer(scope, exportRows)
    const payload = xlsxBuffer instanceof Uint8Array ? xlsxBuffer : new Uint8Array(xlsxBuffer as ArrayBuffer)

    setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setHeader(event, 'Content-Disposition', `attachment; filename="${fileStem}.xlsx"`)

    return payload
  }

  const pdfBuffer = await toPdfBuffer(`Documents Export: ${scope}`, exportRows)
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `attachment; filename="${fileStem}.pdf"`)

  return pdfBuffer
})
