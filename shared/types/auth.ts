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

export interface AuthLocationPayload {
  latitude: number
  longitude: number
  accuracy?: number | null
  altitude?: number | null
  altitudeAccuracy?: number | null
  heading?: number | null
  speed?: number | null
  capturedAt?: string | null
}

export interface LoginRequestBody {
  email?: string
  phone?: string
  login?: string
  password: string
  location?: AuthLocationPayload | null
}

export interface LoginResponse {
  user: AuthSession
  token: string
}
