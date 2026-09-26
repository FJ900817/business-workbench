/** Exact XHS topic-list comparison shared by source preflight and Draft validation. */

/** Deterministic evidence for one expected and actual topic-list comparison. */
export interface XhsTopicComparison {
  readonly status: 'PASS' | 'FAIL'
  readonly expectedTopics: readonly string[]
  readonly actualTopics: readonly string[]
  readonly missingTopics: readonly string[]
  readonly unexpectedTopics: readonly string[]
  readonly duplicateTopics: readonly string[]
  readonly orderMatches: boolean
}

/**
 * Compare topic values without normalization, aliases, or semantic matching.
 * @param expectedTopics - TaskCard topic values in required order.
 * @param actualTopics - Compared topic values in observed order.
 * @returns immutable exact-match evidence.
 */
export function compareXhsTopics(
  expectedTopics: readonly string[],
  actualTopics: readonly string[],
): XhsTopicComparison {
  const expected = Object.freeze([...expectedTopics])
  const actual = Object.freeze([...actualTopics])
  const missingTopics = Object.freeze(expected.filter(topic => !actual.includes(topic)))
  const unexpectedTopics = Object.freeze(actual.filter(topic => !expected.includes(topic)))
  const duplicateTopics = Object.freeze([...new Set(actual.filter((topic, index) => actual.indexOf(topic) !== index))])
  const orderMatches = JSON.stringify(expected) === JSON.stringify(actual)
  return Object.freeze({
    status: missingTopics.length === 0 && unexpectedTopics.length === 0
      && duplicateTopics.length === 0 && orderMatches ? 'PASS' : 'FAIL',
    expectedTopics: expected,
    actualTopics: actual,
    missingTopics,
    unexpectedTopics,
    duplicateTopics,
    orderMatches,
  })
}
