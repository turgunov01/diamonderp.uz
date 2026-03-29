import type { LoginRequestBody, LoginResponse } from '~~/shared/types/auth'
import { authenticateLogin } from '../../utils/auth'

export default eventHandler(async (event): Promise<LoginResponse> => {
  const result = await authenticateLogin(await readBody<Partial<LoginRequestBody>>(event))

  return {
    user: result.user,
    token: result.token
  }
})
