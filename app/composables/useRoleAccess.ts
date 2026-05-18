import { canAccessPath, getRoleLabel } from '~~/shared/utils/access'

export function useRoleAccess() {
  const { session } = useAuth()

  const role = computed(() => session.value?.role ?? null)
  const isAdmin = computed(() => role.value === 'admin')
  const isHr = computed(() => role.value === 'hr')
  const isProcurement = computed(() => role.value === 'procurement')

  const canManageHr = computed(() => isAdmin.value || isHr.value)
  const canManageObjects = computed(() => isAdmin.value)
  const canManageObjectTasks = computed(() => isAdmin.value || isProcurement.value)
  const canManageExpenses = computed(() => isAdmin.value || isProcurement.value)
  const canDeleteExpenses = computed(() => isAdmin.value)
  const canManageWarehouse = computed(() => isAdmin.value)
  const canManageAroma = computed(() => isAdmin.value || isProcurement.value)
  const canManageWaste = computed(() => isAdmin.value)
  const canManageMarble = computed(() => isAdmin.value)
  const canManageSanitation = computed(() => isAdmin.value)

  return {
    role,
    roleLabel: computed(() => getRoleLabel(role.value)),
    isAdmin,
    isHr,
    isProcurement,
    canAccess: (path: string) => canAccessPath(role.value, path),
    canManageHr,
    canManageObjects,
    canManageObjectTasks,
    canManageExpenses,
    canDeleteExpenses,
    canManageWarehouse,
    canManageAroma,
    canManageWaste,
    canManageMarble,
    canManageSanitation
  }
}
