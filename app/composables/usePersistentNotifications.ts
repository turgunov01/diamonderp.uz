import { createSharedComposable, useLocalStorage } from '@vueuse/core'
import type { Notification, User } from '~/types'

const systemSender: User = {
  id: 0,
  name: 'Система',
  email: 'system@local',
  status: 'subscribed',
  location: 'Dashboard',
  avatar: {
    src: 'https://dummyimage.com/64x64/111827/ffffff&text=AL'
  }
}

const _usePersistentNotifications = () => {
  const localNotifications = useLocalStorage<Notification[]>('local-notifications', [], { listenToStorageChanges: false })

  function upsert(notification: Partial<Notification> & { id: number }) {
    const current = localNotifications.value || []
    const existingIndex = current.findIndex(n => n.id === notification.id)
    const next: Notification = {
      id: notification.id,
      unread: notification.unread ?? true,
      sender: notification.sender ?? systemSender,
      body: notification.body ?? '',
      date: notification.date ?? new Date().toISOString()
    }

    if (existingIndex >= 0) {
      current.splice(existingIndex, 1, next)
    } else {
      current.unshift(next)
    }
    localNotifications.value = [...current]
  }

  function removeById(id: number) {
    localNotifications.value = (localNotifications.value || []).filter(n => n.id !== id)
  }

  return {
    localNotifications,
    upsert,
    removeById
  }
}

export const usePersistentNotifications = createSharedComposable(_usePersistentNotifications)
