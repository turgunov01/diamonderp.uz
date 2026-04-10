import type { H3Event } from 'h3'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AuthSession } from '~~/shared/types/auth'
import { filterNavigationItemsByRole } from '~~/shared/utils/access'

type SidebarLinks = NavigationMenuItem[][]

const links: SidebarLinks = [
  [
    {
      label: 'Дашборд',
      icon: 'i-lucide-line-chart',
      to: '/'
    },
    {
      label: 'Заявки',
      icon: 'i-lucide-inbox',
      to: '/inbox',
      badge: '4'
    },
    {
      label: 'Кадры',
      icon: 'i-lucide-users',
      to: '/hr',
      defaultOpen: false,
      type: 'trigger',
      children: [
        {
          label: 'Сотрудники',
          to: '/hr',
          exact: true
        },
        {
          label: 'Активность сотрудников',
          icon: 'i-heroicons-clock',
          to: '/hr/employee-activity',
          exact: true
        },
        {
          label: 'Договоры',
          to: '/documents',
          exact: true
        }
      ]
    },
    {
      label: 'Объекты',
      icon: 'i-lucide-map',
      to: '/objects',
      type: 'trigger',
      children: [
        {
          label: 'Список объектов',
          to: '/objects',
          exact: true
        },
        {
          label: 'Задачи',
          to: '/objects/tasks',
          exact: false
        }
      ]
    },
    {
      label: 'Чаты',
      icon: 'i-lucide-message-circle',
      to: '/chats'
    },
    {
      label: 'Отчеты',
      icon: 'i-lucide-bar-chart-3',
      to: '/reports',
      type: 'trigger',
      children: [
        {
          label: 'Закупки',
          to: '/expenses'
        },
        {
          label: 'Отходы',
          to: '/waste'
        },
        {
          label: 'Кристаллизация',
          to: '/reports/marble'
        },
        {
          label: 'Дезинфекция',
          to: '/reports/sanitation'
        },
        {
          label: 'Арома-диффузоры',
          to: '/reports/aroma'
        }
      ]
    },
    {
      label: 'Настройки',
      to: '/settings',
      icon: 'i-lucide-settings',
      defaultOpen: false,
      type: 'trigger',
      children: [
        {
          label: 'Общее',
          to: '/settings',
          exact: true
        },
        {
          label: 'Пользователи',
          to: '/settings/members'
        },
        {
          label: 'Уведомления',
          to: '/settings/notifications'
        },
        {
          label: 'Безопасность',
          to: '/settings/security'
        }
      ]
    }
  ],
  []
]

function parseSession(event: H3Event) {
  const rawSession = getCookie(event, 'diamond-erp-session')

  if (!rawSession) {
    return null
  }

  try {
    return JSON.parse(decodeURIComponent(rawSession)) as AuthSession
  } catch {
    return null
  }
}

export default eventHandler<SidebarLinks>((event) => {
  const session = parseSession(event)

  return links.map(group => filterNavigationItemsByRole<NavigationMenuItem>(group, session?.role ?? null))
})
