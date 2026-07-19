import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

interface Body {
  tgChatId?: number
  objectId?: number
  title?: string | null
  isActive?: boolean
}

type BindingRow = {
  id: number
  tg_chat_id: number
  object_id: number
  title?: string | null
  is_active?: boolean | null
  updated_at?: string | null
}

export default eventHandler(async (event) => {
  const body = await readBody<Body>(event)

  const tgChatId = Number(body?.tgChatId)
  const objectId = Number(body?.objectId)

  if (!Number.isInteger(tgChatId) || tgChatId === 0) {
    throw createError({ statusCode: 400, message: 'Поле tgChatId обязательно.' })
  }

  if (!Number.isInteger(objectId) || objectId <= 0) {
    throw createError({ statusCode: 400, message: 'Поле objectId обязательно.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = {
    ...getDataApiServerHeaders(serviceRoleKey),
    Prefer: 'return=representation,resolution=merge-duplicates'
  }

  const [saved] = await $fetch<BindingRow[]>(`${url}/rest/v1/telegram_group_bindings`, {
    method: 'POST',
    headers,
    query: {
      on_conflict: 'tg_chat_id'
    },
    body: {
      tg_chat_id: tgChatId,
      object_id: objectId,
      title: body?.title?.trim() || null,
      is_active: body?.isActive ?? true,
      updated_at: new Date().toISOString()
    }
  })

  if (!saved?.id) {
    throw createError({ statusCode: 500, message: 'Не удалось сохранить привязку Telegram.' })
  }

  return {
    id: saved.id,
    tgChatId: saved.tg_chat_id,
    objectId: saved.object_id,
    title: saved.title || null,
    isActive: Boolean(saved.is_active),
    updatedAt: saved.updated_at || null
  }
})
