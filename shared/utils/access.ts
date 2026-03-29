import type { AuthRole } from '../types/auth'

type AccessMatcher = (path: string) => boolean

type NavigationItemLike<T> = {
  to?: string
  children?: T[]
}

const ALL_ROLES: AuthRole[] = ['admin', 'hr', 'procurement']

function normalizePath(path: string) {
  if (!path) {
    return '/'
  }

  const normalized = path.split('?')[0]?.split('#')[0] || '/'
  if (normalized !== '/' && normalized.endsWith('/')) {
    return normalized.slice(0, -1)
  }

  return normalized || '/'
}

function exact(targetPath: string): AccessMatcher {
  const normalizedTarget = normalizePath(targetPath)
  return path => normalizePath(path) === normalizedTarget
}

function prefix(targetPath: string): AccessMatcher {
  const normalizedTarget = normalizePath(targetPath)
  return (path) => {
    const normalizedPath = normalizePath(path)
    return normalizedPath === normalizedTarget || normalizedPath.startsWith(`${normalizedTarget}/`)
  }
}

const roleAccessMatchers: Partial<Record<AuthRole, AccessMatcher[]>> = {
  admin: [() => true],
  hr: [
    exact('/'),
    exact('/inbox'),
    exact('/chats'),
    prefix('/hr'),
    prefix('/documents'),
    exact('/expenses'),
    exact('/waste'),
    prefix('/reports')
  ],
  procurement: [
    exact('/'),
    exact('/inbox'),
    exact('/chats'),
    exact('/objects'),
    exact('/objects/tasks'),
    exact('/expenses'),
    exact('/reports/aroma')
  ]
}

export function getDefaultRouteForRole(role?: AuthRole | null) {
  if (!role || !ALL_ROLES.includes(role)) {
    return '/'
  }

  return '/'
}

export function canAccessPath(role: AuthRole | null | undefined, path: string) {
  if (!role || !ALL_ROLES.includes(role)) {
    return false
  }

  return (roleAccessMatchers[role] || []).some(match => match(path))
}

export function filterNavigationItemsByRole<T extends { to?: string, children?: T[] }>(
  items: T[],
  role: AuthRole | null | undefined
): T[] {
  return items.flatMap((item) => {
    const nextChildren = item.children?.length
      ? filterNavigationItemsByRole(item.children, role)
      : undefined

    const canAccessItem = item.to ? canAccessPath(role, item.to) : false
    const hasVisibleChildren = Boolean(nextChildren?.length)

    if (!canAccessItem && !hasVisibleChildren) {
      return []
    }

    return [{
      ...item,
      children: nextChildren
    }]
  })
}

export function getRoleLabel(role: AuthRole | null | undefined) {
  if (role === 'admin') return 'Администратор'
  if (role === 'hr') return 'HR'
  if (role === 'procurement') return 'Закупщик'
  return 'Пользователь'
}
