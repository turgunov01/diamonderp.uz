import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

type BindingRow = {
  id: number
  tg_chat_id: number
  object_id: number
  title?: string | null
  is_active?: boolean | null
  updated_at?: string | null
}

export default eventHandler(async (event) => {
  const objectIdRaw = getQuery(event).objectId
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN

  if (!Number.isInteger(objectId) || objectId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ objectId РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ РїСЂРёРІСЏР·РѕРє.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()

  const rows = await $fetch<BindingRow[]>(`${url}/rest/v1/telegram_group_bindings`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,tg_chat_id,object_id,title,is_active,updated_at',
      object_id: `eq.${objectId}`,
      order: 'updated_at.desc'
    }
  }).catch(() => [] as BindingRow[])

  return rows.map(row => ({
    id: row.id,
    tgChatId: row.tg_chat_id,
    objectId: row.object_id,
    title: row.title || null,
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at || null
  }))
})
