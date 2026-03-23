import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { getDefaultObjectId, getTelegramFileUrl, verifyTelegramSecret } from '../../utils/telegram'

type TgUser = { id: number, first_name?: string, last_name?: string, username?: string }
type TgChat = { id: number, type: string, title?: string, first_name?: string, last_name?: string, username?: string }
type TgPhoto = { file_id: string }
type TgDocument = { file_id: string, file_name?: string }
type TgAnimation = { file_id: string, mime_type?: string }
type TgMessage = {
  message_id: number
  from?: TgUser
  chat: TgChat
  text?: string
  caption?: string
  photo?: TgPhoto[]
  document?: TgDocument
  animation?: TgAnimation
  date: number
}
type TgUpdate = { update_id: number, message?: TgMessage }

type TelegramBindingRow = {
  object_id: number
  is_active?: boolean | null
}

type ExistingChatRow = {
  id: number
  object_id?: number | null
  title: string
  tg_type?: string | null
}

type ExistingMessageRow = {
  id: number
}

export default eventHandler(async (event) => {
  if (!verifyTelegramSecret(event)) {
    throw createError({ statusCode: 401, statusMessage: 'Некорректный секрет webhook.' })
  }

  const update = await readBody<TgUpdate>(event)
  if (!update?.message?.chat) {
    return { ok: true }
  }

  const msg = update.message
  const chat = msg.chat
  const text = msg.text || msg.caption || null
  const photo = msg.photo
  const document = msg.document
  const animation = msg.animation

  let mediaUrl: string | null = null
  if (photo?.length) {
    const largest = photo[photo.length - 1]
    try {
      mediaUrl = await getTelegramFileUrl(largest.file_id)
    } catch {
      mediaUrl = null
    }
  } else if (animation?.file_id) {
    try {
      mediaUrl = await getTelegramFileUrl(animation.file_id)
    } catch {
      mediaUrl = null
    }
  } else if (document?.file_id) {
    try {
      mediaUrl = await getTelegramFileUrl(document.file_id)
    } catch {
      mediaUrl = null
    }
  }

  let content: string | null = null
  if (text && mediaUrl) {
    content = `${text}\n${mediaUrl}`
  } else if (text) {
    content = text
  } else if (mediaUrl) {
    content = mediaUrl
  } else {
    content = '[media]'
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  let objectId = getDefaultObjectId()

  const bindings = await $fetch<TelegramBindingRow[]>(`${url}/rest/v1/telegram_group_bindings`, {
    headers,
    query: {
      select: 'object_id,is_active',
      tg_chat_id: `eq.${chat.id}`,
      is_active: 'eq.true',
      limit: 1
    }
  }).catch(() => [] as TelegramBindingRow[])

  if (bindings[0]?.object_id) {
    objectId = bindings[0].object_id
  }

  const title = chat.title || chat.username || chat.first_name || 'Telegram chat'
  const existingChats = await $fetch<ExistingChatRow[]>(`${url}/rest/v1/chats`, {
    headers,
    query: {
      select: 'id,object_id,title,tg_type',
      tg_chat_id: `eq.${chat.id}`,
      limit: 1
    }
  })

  let chatId: number

  const existingChat = existingChats[0]

  if (existingChat) {
    chatId = existingChat.id

    if (existingChat.object_id !== objectId || existingChat.title !== title || existingChat.tg_type !== chat.type) {
      await $fetch(`${url}/rest/v1/chats`, {
        method: 'PATCH',
        headers,
        query: {
          id: `eq.${chatId}`
        },
        body: {
          object_id: objectId,
          title,
          tg_type: chat.type,
          updated_at: new Date().toISOString()
        }
      })
    }
  } else {
    const inserted = await $fetch<ExistingChatRow[]>(`${url}/rest/v1/chats`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      body: {
        title,
        is_group: chat.type !== 'private',
        tg_chat_id: chat.id,
        tg_type: chat.type,
        object_id: objectId
      }
    })

    const createdChat = inserted[0]
    if (!createdChat?.id) {
      throw createError({ statusCode: 500, statusMessage: 'Не удалось создать или обновить чат для Telegram.' })
    }

    chatId = createdChat.id
  }

  const existingMessages = await $fetch<ExistingMessageRow[]>(`${url}/rest/v1/chat_messages`, {
    headers,
    query: {
      select: 'id',
      chat_id: `eq.${chatId}`,
      external_id: `eq.${msg.message_id}`,
      limit: 1
    }
  }).catch(() => [] as ExistingMessageRow[])

  if (existingMessages.length) {
    return { ok: true, duplicate: true, chatId }
  }

  await $fetch(`${url}/rest/v1/chat_messages`, {
    method: 'POST',
    headers,
    body: {
      chat_id: chatId,
      author_id: String(msg.from?.id || 'unknown'),
      content,
      external_id: msg.message_id,
      direction: 'in',
      status: 'delivered',
      object_id: objectId
    }
  })

  await $fetch(`${url}/rest/v1/chats`, {
    method: 'PATCH',
    headers,
    query: {
      id: `eq.${chatId}`
    },
    body: {
      updated_at: new Date().toISOString()
    }
  })

  return { ok: true, chatId, objectId }
})
