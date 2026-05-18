import { recordEmployeeActivity } from '../../utils/employee-activity'

interface CreateEmployeeActivityBody {
  employeeId?: number
  customerId?: number
  recordedAt?: string
  location?: unknown
}

function parseEmployeeId(body: CreateEmployeeActivityBody) {
  const rawEmployeeId = body.employeeId ?? body.customerId
  const employeeId = typeof rawEmployeeId === 'number' ? rawEmployeeId : Number(rawEmployeeId)

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'employeeId must be a positive integer.'
    })
  }

  return employeeId
}

export default eventHandler(async (event) => {
  const body = await readBody<CreateEmployeeActivityBody>(event)

  return await recordEmployeeActivity({
    employeeId: parseEmployeeId(body || {}),
    recordedAt: body?.recordedAt,
    location: body?.location
  })
})
