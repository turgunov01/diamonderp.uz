export type AuthRole =
  | 'admin'
  | 'hr'
  | 'procurement'
  | 'manager'
  | 'supervisor'
  | 'customer'
  | 'cleaner'

export interface AuthSession {
  id: number
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
