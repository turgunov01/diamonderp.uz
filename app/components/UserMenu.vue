<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AuthSession } from '~~/shared/types/auth'
import { canAccessPath, getRoleLabel } from '~~/shared/utils/access'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const appConfig = useAppConfig()
// Persisted alongside app.config defaults so the picked colors survive a reload
// (re-applied on load by the ui-theme plugin).
const primaryCookie = useCookie<string | null>('ui-primary', { maxAge: 60 * 60 * 24 * 365 })
const neutralCookie = useCookie<string | null>('ui-neutral', { maxAge: 60 * 60 * 24 * 365 })
const { session, logout } = useAuth()
const { role } = useRoleAccess()

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']
const colorLabels: Record<string, string> = {
  red: 'Красный',
  orange: 'Оранжевый',
  amber: 'Янтарный',
  yellow: 'Желтый',
  lime: 'Лаймовый',
  green: 'Зеленый',
  emerald: 'Изумрудный',
  teal: 'Бирюзовый',
  cyan: 'Голубой',
  sky: 'Небесный',
  blue: 'Синий',
  indigo: 'Индиго',
  violet: 'Фиолетовый',
  purple: 'Пурпурный',
  fuchsia: 'Фуксия',
  pink: 'Розовый',
  rose: 'Розово-красный',
  slate: 'Сланцевый',
  gray: 'Серый',
  zinc: 'Цинковый',
  neutral: 'Нейтральный',
  stone: 'Каменный'
}

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

const defaultUserMenu: UserMenuPayload = {
  user: {
    name: 'Turgunov Sardor',
    avatar: {
      src: 'https://github.com/benjamincanac.png',
      alt: 'Sardor Turgunov'
    }
  },
  groups: [[], [], []]
}

const { data: userMenu } = await useFetch<UserMenuPayload>('/api/routes/user-menu', {
  default: () => defaultUserMenu
})

function getUserAvatar(sessionUser: AuthSession | null) {
  if (!sessionUser?.avatar) {
    return defaultUserMenu.user.avatar
  }

  return {
    src: sessionUser.avatar,
    alt: sessionUser.name
  }
}

function attachMenuActions(groups: DropdownMenuItem[][]) {
  return groups.map(group => group.map(item => {
    if (item.label !== 'Выйти') {
      return item
    }

    return {
      ...item,
      async onSelect(event: Event) {
        event.preventDefault()
        await logout()
      }
    } satisfies DropdownMenuItem
  }))
}

const user = computed(() => {
  if (session.value) {
    return {
      name: session.value.name,
      avatar: getUserAvatar(session.value)
    }
  }

  return userMenu.value?.user ?? defaultUserMenu.user
})

const roleItem = computed<DropdownMenuItem>(() => ({
  type: 'label',
  label: `Роль: ${getRoleLabel(role.value)}`
}))

const items = computed<DropdownMenuItem[][]>(() => {
  const fetchedGroups = userMenu.value?.groups ?? []
  const firstGroup = (fetchedGroups[0] ?? []).filter((item) => {
    if (!item.to || typeof item.to !== 'string') {
      return true
    }

    return canAccessPath(role.value, item.to)
  })
  const trailingGroups = attachMenuActions(fetchedGroups.slice(1))

  return [
    [{
      type: 'label',
      label: user.value.name,
      avatar: user.value.avatar
    }],
    [roleItem.value],
    firstGroup,
    [{
      label: 'Тема',
      icon: 'i-lucide-palette',
      children: [{
        label: 'Основной',
        slot: 'chip',
        chip: appConfig.ui.colors.primary,
        content: {
          align: 'center',
          collisionPadding: 16
        },
        children: colors.map(color => ({
          label: colorLabels[color] ?? color,
          chip: color,
          slot: 'chip',
          checked: appConfig.ui.colors.primary === color,
          type: 'checkbox',
          onSelect: (e) => {
            e.preventDefault()

            appConfig.ui.colors.primary = color
            primaryCookie.value = color
          }
        }))
      }, {
        label: 'Нейтральный',
        slot: 'chip',
        chip: appConfig.ui.colors.neutral === 'neutral' ? 'old-neutral' : appConfig.ui.colors.neutral,
        content: {
          align: 'end',
          collisionPadding: 16
        },
        children: neutrals.map(color => ({
          label: colorLabels[color] ?? color,
          chip: color === 'neutral' ? 'old-neutral' : color,
          slot: 'chip',
          type: 'checkbox',
          checked: appConfig.ui.colors.neutral === color,
          onSelect: (e) => {
            e.preventDefault()

            appConfig.ui.colors.neutral = color
            neutralCookie.value = color
          }
        }))
      }]
    }, {
      label: 'Оформление',
      icon: 'i-lucide-sun-moon',
      children: [{
        label: 'Светлая',
        icon: 'i-lucide-sun',
        type: 'checkbox',
        checked: colorMode.value === 'light',
        onSelect(e: Event) {
          e.preventDefault()

          colorMode.preference = 'light'
        }
      }, {
        label: 'Темная',
        icon: 'i-lucide-moon',
        type: 'checkbox',
        checked: colorMode.value === 'dark',
        onUpdateChecked(checked: boolean) {
          if (checked) {
            colorMode.preference = 'dark'
          }
        },
        onSelect(e: Event) {
          e.preventDefault()
        }
      }]
    }],
    ...trailingGroups
  ]
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        ...user,
        label: collapsed ? undefined : user?.name,
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />

    <template #chip-leading="{ item }">
      <div class="inline-flex items-center justify-center shrink-0 size-5">
        <span
          class="rounded-full ring ring-bg bg-(--chip-light) dark:bg-(--chip-dark) size-2"
          :style="{
            '--chip-light': `var(--color-${(item as any).chip}-500)`,
            '--chip-dark': `var(--color-${(item as any).chip}-400)`
          }"
        />
      </div>
    </template>
  </UDropdownMenu>
</template>
