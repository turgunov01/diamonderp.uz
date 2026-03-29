export function encodeIn(values: Array<number | string>) {
  return `(${values.join(',')})`
}

export function buildEqOrInFilter(values: number[]) {
  if (!values.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one value is required.'
    })
  }

  return values.length === 1
    ? `eq.${values[0]}`
    : `in.${encodeIn(values)}`
}
