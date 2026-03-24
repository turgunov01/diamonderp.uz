export type AuthRole = 'admin' | 'hr' | 'procurement' | 'customer'

export interface AuthSession {
  email?: string
  phone?: string
  name: string
  role: AuthRole
  avatar?: string | null
}

export interface LoginRequestBody {
  email?: string
  phone?: string
  login?: string
  password: string
}

export interface LoginResponse {
  user: AuthSession
  token: string
}
