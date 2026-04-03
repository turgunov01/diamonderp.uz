export default defineEventHandler((event) => {
  setResponseStatus(event, 404)
  return {
    statusCode: 404,
    statusMessage: 'Mobile API route not found.'
  }
})

