import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

export default eventHandler(async (event) => {
    const id = getRouterParam(event, 'id')

    if (!id) {
        throw createError({
            statusCode: 400,
            message: 'ID зоны обязателен.'
        })
    }

    const { url, serviceRoleKey } = getDataApiServerConfig()

    try {
        await $fetch(
            `${url}/rest/v1/objects?id=eq.${id}`,
            {
                method: 'DELETE',
                headers: {
                    ...getDataApiServerHeaders(serviceRoleKey),
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
            message: 'Не удалось удалить зону.'
        })
    }
})
