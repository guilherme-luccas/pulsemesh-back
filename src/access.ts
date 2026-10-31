export function canJoinTopic(input: {
  role: 'citizen' | 'admin'
  personId: string | null
  reporterId: string
}): boolean {
  if (input.role === 'admin') {
    return true
  }

  return input.personId !== null && input.personId === input.reporterId
}

function assertCheck(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

if (process.env.CHECK === '1') {
  assertCheck(
    canJoinTopic({ role: 'citizen', personId: 'a', reporterId: 'a' }),
    'author can write',
  )
  assertCheck(
    !canJoinTopic({ role: 'citizen', personId: 'b', reporterId: 'a' }),
    'other person cannot write',
  )
  assertCheck(
    canJoinTopic({ role: 'admin', personId: null, reporterId: 'a' }),
    'admin can write',
  )
  console.log('access ok')
}
