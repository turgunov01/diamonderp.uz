import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'

export default eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')

    if (!id) {
        throw createError({
            statusCode: 400,
            statusMessage: 'ID зоны обязателен.'
        })
    }

    const { url, serviceRoleKey } = getSupabaseServerConfig()

    try {
        await $fetch(
            `${url}/rest/v1/objects?id=eq.${id}`,
            {
                method: 'DELETE',
                headers: {
                    ...getSupabaseServerHeaders(serviceRoleKey),
                    Prefer: 'return=minimal'
                }
            }
        )

        return {
            success: true
        }
    } catch (error) {
        console.error('Error deleting zone:', error)

        throw createError({
            statusCode: 500,
            statusMessage: 'Не удалось удалить зону.'
        })
    }
})
