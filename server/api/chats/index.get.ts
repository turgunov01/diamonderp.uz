import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

type ChatRow = {
  id: number
  title: string
  is_group: boolean
  updated_at: string
  object_id?: number | null
  tg_chat_id?: number | null
  tg_type?: string | null
}

type ChatMessageRow = {
  chat_id: number
  content: string
  created_at: string
}

type ObjectRow = {
  id: number
  name: string
}

type ChatItem = {
  id: number
  title: string
  isGroup: boolean
  updatedAt: string
  objectId: number | null
  objectName?: string
  tgChatId?: number
  tgType?: string
  lastMessage?: string
  lastTime?: string
  unread?: number
}

function encodePostgrestIn(values: number[]) {
  return `(${values.join(',')})`
}

export default eventHandler(async (event): Promise<ChatItem[]> => {
  const { url, serviceRoleKey } = getDataApiServerConfig()

  const headers = getDataApiServerHeaders(serviceRoleKey)
  const { objectId: objectIdRaw, buildingId: buildingIdRaw } = getQuery(event)
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN
  const buildingId = buildingIdRaw ? Number(buildingIdRaw) : NaN

  let objectIds: number[] = []
  const objectsById = new Map<number, ObjectRow>()

  if (Number.isInteger(objectId) && objectId > 0) {
    objectIds = [objectId]

    const [objectRow] = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      headers,
      query: {
        select: 'id,name',
        id: `eq.${objectId}`,
        limit: 1
      }
    }).catch(() => [] as ObjectRow[])

    if (objectRow) {
      objectsById.set(objectRow.id, objectRow)
    }
  } else if (Number.isInteger(buildingId) && buildingId > 0) {
    const objectRows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      headers,
      query: {
        select: 'id,name',
        building_id: `eq.${buildingId}`,
        order: 'id.asc'
      }
    }).catch(() => [] as ObjectRow[])

    objectIds = objectRows.map(row => row.id)
    for (const row of objectRows) {
      objectsById.set(row.id, row)
    }
  }

  const rows = await $fetch<ChatRow[]>(`${url}/rest/v1/chats`, {
    headers,
    query: {
      select: 'id,title,is_group,tg_chat_id,tg_type,updated_at,object_id',
      ...(objectIds.length ? { object_id: `in.${encodePostgrestIn(objectIds)}` } : {}),
      order: 'updated_at.desc',
      limit: 200
    }
  })

  if (!rows.length) {
    return []
  }

  // Collect missing object names if not prefetched
  const missingObjectIds = rows
    .map(r => r.object_id)
    .filter((id): id is number => !!id && !objectsById.has(id))

  if (missingObjectIds.length) {
    const objectRows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      headers,
      query: {
        select: 'id,name',
        id: `in.${encodePostgrestIn([...new Set(missingObjectIds)])}`
      }
    }).catch(() => [] as ObjectRow[])

    for (const row of objectRows) {
      objectsById.set(row.id, row)
    }
  }

  const messageRows = await $fetch<ChatMessageRow[]>(`${url}/rest/v1/chat_messages`, {
    headers,
    query: {
      select: 'chat_id,content,created_at',
      chat_id: `in.${encodePostgrestIn(rows.map(row => row.id))}`,
      order: 'created_at.desc',
      limit: 400
    }
  }).catch(() => [] as ChatMessageRow[])

  const latestMessageByChatId = new Map<number, ChatMessageRow>()
  for (const row of messageRows) {
    if (!latestMessageByChatId.has(row.chat_id)) {
      latestMessageByChatId.set(row.chat_id, row)
    }
  }

  return rows.map((row) => {
    const latestMessage = latestMessageByChatId.get(row.id)
    const objectId = row.object_id ?? null
    const object = objectId ? objectsById.get(objectId) : undefined

    return {
      id: row.id,
      title: row.title,
      isGroup: row.is_group,
      updatedAt: row.updated_at,
      objectId,
      objectName: object?.name,
      tgChatId: row.tg_chat_id || undefined,
      tgType: row.tg_type || undefined,
      lastMessage: latestMessage?.content || undefined,
      lastTime: latestMessage?.created_at || undefined,
      unread: undefined
    }
  })
})
