import type { H3Event } from 'h3'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AuthSession } from '~~/shared/types/auth'
import { filterNavigationItemsByRole } from '~~/shared/utils/access'

type SidebarLinks = NavigationMenuItem[][]

const links: SidebarLinks = [
  [
    {
      label: 'Р”Р°С€Р±РѕСЂРґ',
      icon: 'i-lucide-line-chart',
      to: '/'
    },
    {
      label: 'Р—Р°СЏРІРєРё',
      icon: 'i-lucide-inbox',
      to: '/inbox',
      badge: '4'
    },
    {
      label: 'РљР°РґСЂС‹',
      icon: 'i-lucide-users',
      to: '/hr',
      defaultOpen: false,
      type: 'trigger',
      children: [
        {
          label: 'РЎРѕС‚СЂСѓРґРЅРёРєРё',
          to: '/hr',
          exact: true
        },
        {
          label: 'РђРєС‚РёРІРЅРѕСЃС‚СЊ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ',
          icon: 'i-heroicons-clock',
          to: '/hr/employee-activity',
          exact: true
        },
        {
          label: 'Р”РѕРіРѕРІРѕСЂС‹',
          to: '/documents',
          exact: true
        }
      ]
    },
    {
      label: 'РћР±СЉРµРєС‚С‹',
      icon: 'i-lucide-map',
      to: '/objects',
      type: 'trigger',
      children: [
        {
          label: 'РЎРїРёСЃРѕРє РѕР±СЉРµРєС‚РѕРІ',
          to: '/objects',
          exact: true
        },
        {
          label: 'Р—Р°РґР°С‡Рё',
          to: '/objects/tasks',
          exact: true
        }
      ]
    },
    {
      label: 'Р§Р°С‚С‹',
      icon: 'i-lucide-message-circle',
      to: '/chats'
    },
    {
      label: 'РћС‚С‡РµС‚С‹',
      icon: 'i-lucide-bar-chart-3',
      to: '/reports',
      type: 'trigger',
      children: [
        {
          label: 'Р—Р°РєСѓРїРєРё',
          to: '/expenses'
        },
        {
          label: 'РћС‚С…РѕРґС‹',
          to: '/waste'
        },
        {
          label: 'РљСЂРёСЃС‚Р°Р»Р»РёР·Р°С†РёСЏ',
          to: '/reports/marble'
        },
        {
          label: 'Р”РµР·РёРЅС„РµРєС†РёСЏ',
          to: '/reports/sanitation'
        },
        {
          label: 'РђСЂРѕРјР°-РґРёС„С„СѓР·РѕСЂС‹',
          to: '/reports/aroma'
        }
      ]
    },
    {
      label: 'РќР°СЃС‚СЂРѕР№РєРё',
      to: '/settings',
      icon: 'i-lucide-settings',
      defaultOpen: false,
      type: 'trigger',
      children: [
        {
          label: 'РћР±С‰РµРµ',
          to: '/settings',
          exact: true
        },
        {
          label: 'РџРѕР»СЊР·РѕРІР°С‚РµР»Рё',
          to: '/settings/members'
        },
        {
          label: 'РЈРІРµРґРѕРјР»РµРЅРёСЏ',
          to: '/settings/notifications'
        },
        {
          label: 'Р‘РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ',
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

  return links.map(group => filterNavigationItemsByRole(group as any, session?.role ?? null) as NavigationMenuItem[])
})



