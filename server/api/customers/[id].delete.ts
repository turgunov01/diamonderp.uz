export default eventHandler(() => {
  throw createError({
    statusCode: 405,
    message: 'Удаление пользователей отключено. Архивируйте сотрудника с обязательным комментарием.'
  })
})
