import type { DropdownMenuItem } from '@nuxt/ui'

type UserMenuPayload = {
  user: {
    name: string
    avatar: {
      src: string
      alt: string
    }
  }
  groups: DropdownMenuItem[][]
}

const payload: UserMenuPayload = {
  user: {
    name: 'Нодир Усманов',
    avatar: {
      src: 'https://github.com/benjamincanac.png',
      alt: 'Усманов Нодир'
    }
  },
  groups: [
    [
      {
        label: 'Профиль',
        icon: 'i-lucide-user',
        to: '/settings'
      }
    ],
    [
      {
        label: 'Выйти',
        icon: 'i-lucide-log-out'
      }
    ]
  ]
}

export default eventHandler((): UserMenuPayload => {
  return payload
})
