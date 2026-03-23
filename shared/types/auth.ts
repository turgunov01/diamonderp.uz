export type AuthRole = 'admin' | 'hr' | 'procurement'

export interface AuthSession {
  email: string
  name: string
  role: AuthRole
  avatar?: string | null
}

export interface LoginRequestBody {
  email: string
  password: string
}

export interface LoginResponse {
  user: AuthSession
}
