export default eventHandler(() => {
  throw createError({
    statusCode: 405,
    statusMessage: 'Удаление пользователей отключено. Архивируйте сотрудника с обязательным комментарием.'
  })
})
