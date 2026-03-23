import type { AuthSession, LoginRequestBody, LoginResponse } from '~/shared/types/auth'

const demoUsers: Array<AuthSession & { password: string }> = [
  {
    email: 'admin@diamond.local',
    password: 'password123',
    name: 'Нодир Усманов',
    role: 'admin',
    avatar: 'https://github.com/benjamincanac.png'
  },
  {
    email: 'hr@diamond.local',
    password: 'password123',
    name: 'HR менеджер',
    role: 'hr',
    avatar: 'https://github.com/benjamincanac.png'
  }
]

export default eventHandler(async (event): Promise<LoginResponse> => {
  const body = await readBody<Partial<LoginRequestBody>>(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Укажите email и пароль.'
    })
  }

  const matchedUser = demoUsers.find(user => user.email === email && user.password === password)

  if (!matchedUser) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный email или пароль.'
    })
  }

  return {
    user: {
      email: matchedUser.email,
      name: matchedUser.name,
      role: matchedUser.role,
      avatar: matchedUser.avatar
    }
  }
})
