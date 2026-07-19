import type { H3Event } from 'h3'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
  ? process.env.TELEGRAM_WEBHOOK_SECRET.split(',').map(s => s.trim()).filter(Boolean)
  : []
const DEFAULT_OBJECT_ID = Number(process.env.TELEGRAM_DEFAULT_OBJECT_ID || NaN)

function assertBotToken() {
  if (!BOT_TOKEN) {
    throw createError({ statusCode: 500, message: 'Missing TELEGRAM_BOT_TOKEN env' })
  }
}

export async function sendTelegramMessage(tgChatId: number, text: string) {
  assertBotToken()
  return await $fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    body: {
      chat_id: tgChatId,
      text
    }
  })
}

export function verifyTelegramSecret(event: H3Event) {
  if (!WEBHOOK_SECRET.length) return true
  const header = getHeader(event, 'x-telegram-bot-api-secret-token')
  return !!header && WEBHOOK_SECRET.includes(header)
}

export async function getTelegramFileUrl(fileId: string) {
  assertBotToken()
  const fileResp = await $fetch<{ ok: boolean, result?: { file_path?: string } }>(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
    {
      method: 'POST',
      body: { file_id: fileId }
    }
  )

  const path = fileResp?.result?.file_path
  if (!fileResp?.ok || !path) {
    throw createError({ statusCode: 502, message: 'Failed to resolve Telegram file' })
  }

  // Publicly accessible file URL
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`
}

export function getDefaultObjectId(): number {
  if (!Number.isInteger(DEFAULT_OBJECT_ID) || DEFAULT_OBJECT_ID <= 0) {
    throw createError({ statusCode: 500, message: 'Set TELEGRAM_DEFAULT_OBJECT_ID env to valid object id' })
  }
  return DEFAULT_OBJECT_ID
}
