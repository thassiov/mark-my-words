// Trivial helper exists so unit tests have something to assert against
// in MARK-1. Real lib functions land in later tasks.

export function isSemver(input: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(input);
}
