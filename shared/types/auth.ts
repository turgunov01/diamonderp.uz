export type KnownAuthRole
  = 'admin'
    | 'hr'
    | 'procurement'
    | 'manager'
    | 'supervisor'
    | 'customer'
    | 'cleaner'

// Allow custom employee roles stored in DB (e.g. "electrician", "security", etc.)
// Keep `KnownAuthRole` for places that need strict checks.
export type AuthRole
  = KnownAuthRole | (string & { __auth_role?: never })

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
