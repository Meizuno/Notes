export const toJson = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }]
})
