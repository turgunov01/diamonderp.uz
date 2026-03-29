import { createObjectTaskList, requireTaskManagerSession } from '../../utils/object-tasks'

interface CreateObjectTaskBody {
  objectId?: number | string
  employeeId?: number | string
  title?: string
  note?: string | null
  dueDate?: string | null
  items?: string[]
}

export default eventHandler(async (event) => {
  const session = requireTaskManagerSession(event)
  const body = await readBody<CreateObjectTaskBody>(event)

  const createdTask = await createObjectTaskList({
    objectId: body?.objectId as number | string,
    employeeId: body?.employeeId as number | string,
    title: body?.title || '',
    note: body?.note,
    dueDate: body?.dueDate,
    items: Array.isArray(body?.items) ? body.items : [],
    creator: session
  })

  setResponseStatus(event, 201)
  return createdTask
})

