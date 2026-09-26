/** Strict XHS Markdown parsing and read-only recovery for historical First-Pass drafts. */

import { z } from 'zod'

/** Stable identifier for the model-visible XHS Markdown structure. */
export const XHS_DRAFT_FORMAT = 'xhs-draft-markdown-v1' as const
/** Version of the model-visible XHS Markdown structure. */
export const XHS_DRAFT_FORMAT_VERSION = 1 as const

/** Closed structural failures emitted before hard-rule validation. */
export const xhsDraftFormatIssueCodeSchema = z.enum([
  'TITLE_HEADING_MISSING',
  'TITLE_HEADING_AMBIGUOUS',
  'TITLE_HEADING_NOT_FIRST',
  'TITLE_METADATA_MISSING',
  'TITLE_METADATA_AMBIGUOUS',
  'TITLE_METADATA_POSITION',
  'REQUIRED_SECTION_MISSING',
  'REQUIRED_SECTION_AMBIGUOUS',
  'SECTION_ORDER_INVALID',
  'BODY_EMPTY',
  'UNPINNED_COMMENT_LABELS_AMBIGUOUS',
])

/** One exact structural reason why a Draft cannot enter hard-rule validation. */
export type XhsDraftFormatIssueCode = z.infer<typeof xhsDraftFormatIssueCodeSchema>

/** Unambiguous content ranges extracted without changing the Draft. */
export interface XhsDraftEvidence {
  readonly title: string
  readonly body: string
  readonly pinnedComments: number
  readonly unpinnedComments: number
  readonly topics: number
  readonly topicValues: readonly string[]
  readonly modelDeclaredTitleCharacters: number | null
  readonly modelDeclaredBodyCharacters: number | null
}

/** Fail-closed result of parsing the current production Markdown structure. */
export type XhsDraftFormatParseResult = Readonly<
  | { format: typeof XHS_DRAFT_FORMAT; status: 'PASS'; issues: readonly XhsDraftFormatIssueCode[]; evidence: XhsDraftEvidence }
  | { format: typeof XHS_DRAFT_FORMAT; status: 'FAIL'; issues: readonly XhsDraftFormatIssueCode[]; evidence: null }
>

/** Result of a read-only attempt to recover deterministic ranges from a pre-contract Draft. */
export type XhsHistoricalDraftRecovery = Readonly<
  | { status: 'RECOVERED'; evidence: XhsDraftEvidence }
  | { status: 'AMBIGUOUS'; evidence: null }
>

const combinedMetadataPattern = /^标题字符数：[ \t]*(\d+|XX|XXX)[ \t]*\+[ \t]*正文字符数：[ \t]*(\d+|XX|XXX)$/u
const titleSectionPattern = /^## 标题（(?:\d+|XX|XXX)全字符）$/u
const bodySectionPattern = /^## 正文（(?:\d+|XX|XXX)全字符）$/u
const unpinnedLabelPattern = /^(?:\*\*)?(?:非置顶)?评论[ \t]*(\d+)[：:](?:\*\*)?/u

function indexes(lines: readonly string[], predicate: (line: string) => boolean): number[] {
  const found: number[] = []
  for (const [index, line] of lines.entries()) if (predicate(line)) found.push(index)
  return found
}

function nextNonempty(lines: readonly string[], after: number): number {
  return lines.findIndex((line, index) => index > after && line.length > 0)
}

function contentBetween(lines: readonly string[], start: number, end: number): string {
  let first = start
  let last = end
  while (first < last && lines[first] === '') first += 1
  while (last > first && lines[last - 1] === '') last -= 1
  return lines.slice(first, last).join('\n')
}

function topicValues(lines: readonly string[]): readonly string[] {
  return Object.freeze([...lines.join('\n').matchAll(/(?:^|\s)#([^\s#]+)/gu)].flatMap(match => match[1] === undefined ? [] : [match[1]]))
}

function countUnpinnedLabels(lines: readonly string[]): { count: number; unambiguous: boolean } {
  const labels = lines.flatMap((line) => {
    const match = unpinnedLabelPattern.exec(line)
    return match?.[1] === undefined ? [] : [Number(match[1])]
  })
  return { count: labels.length, unambiguous: labels.length > 0 && new Set(labels).size === labels.length }
}

function declaredCountsFromCombined(line: string): { title: number | null; body: number | null } {
  const match = combinedMetadataPattern.exec(line)
  const value = (field: string | undefined) => field === undefined || !/^\d+$/u.test(field) ? null : Number(field)
  return { title: value(match?.[1]), body: value(match?.[2]) }
}

function historicalDeclaredCounts(draft: string): { title: number | null; body: number | null } {
  const combined = combinedMetadataPattern.exec(draft.split(/\r?\n/u).find(line => combinedMetadataPattern.test(line)) ?? '')
  const title = combined?.[1] ?? /^标题字符数：[ \t]*(\d+)/mu.exec(draft)?.[1]
  const body = combined?.[2] ?? /^## 正文（(\d+)全字符）$/mu.exec(draft)?.[1]
  return { title: title === undefined || !/^\d+$/u.test(title) ? null : Number(title),
    body: body === undefined || !/^\d+$/u.test(body) ? null : Number(body) }
}

function fail(issues: readonly XhsDraftFormatIssueCode[]): XhsDraftFormatParseResult {
  return Object.freeze({ format: XHS_DRAFT_FORMAT, status: 'FAIL', issues: Object.freeze([...new Set(issues)]), evidence: null })
}

/**
 * Parse the production Markdown structure before computing any hard-rule facts.
 * @param draft - Exact authoritative Markdown decoded as UTF-8.
 * @returns evidence only when every required range is unambiguous.
 */
export function parseXhsDraftFormat(draft: string): XhsDraftFormatParseResult {
  const lines = draft.split(/\r?\n/u)
  const issues: XhsDraftFormatIssueCode[] = []
  const headings = indexes(lines, line => /^# /u.test(line))
  if (headings.length === 0) issues.push('TITLE_HEADING_MISSING')
  if (headings.length > 1) issues.push('TITLE_HEADING_AMBIGUOUS')
  const headingIndex = headings.length === 1 ? headings[0] : undefined
  const firstNonempty = lines.findIndex(line => line.length > 0)
  if (headingIndex !== undefined && headingIndex !== firstNonempty) issues.push('TITLE_HEADING_NOT_FIRST')

  const metadata = indexes(lines, line => combinedMetadataPattern.test(line))
  if (metadata.length === 0) issues.push('TITLE_METADATA_MISSING')
  if (metadata.length > 1) issues.push('TITLE_METADATA_AMBIGUOUS')
  const metadataIndex = metadata.length === 1 ? metadata[0] : undefined
  if (headingIndex !== undefined && metadataIndex !== undefined && nextNonempty(lines, headingIndex) !== metadataIndex) {
    issues.push('TITLE_METADATA_POSITION')
  }

  const pinnedIndexes = indexes(lines, line => line === '## 置顶评论')
  const unpinnedIndexes = indexes(lines, line => line === '## 非置顶评论')
  const topicIndexes = indexes(lines, line => line === '## 关联话题')
  const sectionIndexes = [pinnedIndexes, unpinnedIndexes, topicIndexes]
  if (sectionIndexes.some(found => found.length === 0)) issues.push('REQUIRED_SECTION_MISSING')
  if (sectionIndexes.some(found => found.length > 1)) issues.push('REQUIRED_SECTION_AMBIGUOUS')
  const pinnedIndex = pinnedIndexes.length === 1 ? pinnedIndexes[0] : undefined
  const unpinnedIndex = unpinnedIndexes.length === 1 ? unpinnedIndexes[0] : undefined
  const topicIndex = topicIndexes.length === 1 ? topicIndexes[0] : undefined
  if (metadataIndex !== undefined && pinnedIndex !== undefined && unpinnedIndex !== undefined && topicIndex !== undefined
    && !(metadataIndex < pinnedIndex && pinnedIndex < unpinnedIndex && unpinnedIndex < topicIndex)) {
    issues.push('SECTION_ORDER_INVALID')
  }
  if (issues.length > 0) return fail(issues)
  if (headingIndex === undefined || metadataIndex === undefined || pinnedIndex === undefined
    || unpinnedIndex === undefined || topicIndex === undefined) return fail(['REQUIRED_SECTION_MISSING'])
  const headingLine = lines[headingIndex]
  const metadataLine = lines[metadataIndex]
  if (headingLine === undefined || metadataLine === undefined) return fail(['TITLE_HEADING_MISSING'])
  const body = contentBetween(lines, metadataIndex + 1, pinnedIndex)
  if (body.length === 0) issues.push('BODY_EMPTY')
  const pinned = contentBetween(lines, pinnedIndex + 1, unpinnedIndex).length === 0 ? 0 : 1
  const unpinned = countUnpinnedLabels(lines.slice(unpinnedIndex + 1, topicIndex))
  if (!unpinned.unambiguous && unpinned.count > 0) issues.push('UNPINNED_COMMENT_LABELS_AMBIGUOUS')
  const topics = topicValues(lines.slice(topicIndex + 1))
  if (issues.length > 0) return fail(issues)

  const declaration = declaredCountsFromCombined(metadataLine)
  return Object.freeze({
    format: XHS_DRAFT_FORMAT,
    status: 'PASS',
    issues: Object.freeze([]),
    evidence: Object.freeze({
      title: headingLine.slice(2),
      body,
      pinnedComments: pinned,
      unpinnedComments: unpinned.count,
      topics: topics.length,
      topicValues: topics,
      modelDeclaredTitleCharacters: declaration.title,
      modelDeclaredBodyCharacters: declaration.body,
    }),
  })
}

function historicalMarkers(lines: readonly string[]): {
  pinned: number
  unpinned: number
  topics: number
  topicValues: readonly string[]
} | null {
  const pinned = lines.filter(line => /^(?:## 置顶评论|\*\*置顶评论[：:]\*\*)$/u.test(line)).length
  const unpinned = lines.filter(line => unpinnedLabelPattern.test(line)).length
  const topicLines = lines.filter(line => /^(?:#[^\s#]+(?:[ \t]+|$))+$/u.test(line))
  const topics = topicValues(topicLines)
  return pinned === 1 && unpinned > 0 && topics.length > 0
    ? { pinned, unpinned, topics: topics.length, topicValues: topics }
    : null
}

function recoverHeadingDraft(lines: readonly string[], draft: string): XhsDraftEvidence | null {
  if (lines.some(line => titleSectionPattern.test(line))) return null
  const headings = indexes(lines, line => /^# /u.test(line))
  const metadata = indexes(lines, line => combinedMetadataPattern.test(line))
  if (headings.length !== 1 || metadata.length !== 1) return null
  const titleIndex = headings[0]
  const metadataIndex = metadata[0]
  if (titleIndex === undefined || metadataIndex === undefined) return null
  const metadataFollowsTitle = nextNonempty(lines, titleIndex) === metadataIndex
  const bodyStart = metadataFollowsTitle ? metadataIndex + 1 : titleIndex + 1
  const bodyEnd = metadataFollowsTitle
    ? lines.findIndex((line, index) => index >= bodyStart
      && (line === '---' || line === '## 置顶评论' || line === '## 关联话题' || /^\*\*置顶评论[：:]\*\*$/u.test(line)))
    : metadataIndex
  if (bodyEnd < 0) return null
  const body = contentBetween(lines, bodyStart, bodyEnd)
  const markers = historicalMarkers(lines)
  if (body.length === 0 || markers === null) return null
  const declared = historicalDeclaredCounts(draft)
  const titleLine = lines[titleIndex]
  if (titleLine === undefined) return null
  return Object.freeze({ title: titleLine.slice(2), body, pinnedComments: markers.pinned,
    unpinnedComments: markers.unpinned, topics: markers.topics, topicValues: markers.topicValues,
    modelDeclaredTitleCharacters: declared.title, modelDeclaredBodyCharacters: declared.body })
}

function recoverSectionedDraft(lines: readonly string[], draft: string): XhsDraftEvidence | null {
  const titleSections = indexes(lines, line => titleSectionPattern.test(line))
  const bodySections = indexes(lines, line => bodySectionPattern.test(line))
  const commentSections = indexes(lines, line => line === '## 评论区')
  if (titleSections.length !== 1 || bodySections.length !== 1 || commentSections.length !== 1) return null
  const titleSection = titleSections[0]
  const bodySection = bodySections[0]
  const commentSection = commentSections[0]
  if (titleSection === undefined || bodySection === undefined || commentSection === undefined) return null
  const titleIndex = nextNonempty(lines, titleSection)
  if (titleIndex < 0 || titleIndex >= bodySection) return null
  const body = contentBetween(lines, bodySection + 1, commentSection)
  const markers = historicalMarkers(lines.slice(commentSection + 1))
  if (body.length === 0 || markers === null) return null
  const declared = historicalDeclaredCounts(draft)
  const title = lines[titleIndex]
  if (title === undefined) return null
  return Object.freeze({ title, body, pinnedComments: markers.pinned,
    unpinnedComments: markers.unpinned, topics: markers.topics, topicValues: markers.topicValues,
    modelDeclaredTitleCharacters: declared.title, modelDeclaredBodyCharacters: declared.body })
}

/**
 * Recover ranges from known pre-contract layouts without making them valid production output.
 * @param draft - Exact historical Markdown decoded as UTF-8.
 * @returns recovered evidence only when one known layout identifies every range uniquely.
 */
export function recoverXhsHistoricalDraft(draft: string): XhsHistoricalDraftRecovery {
  const strict = parseXhsDraftFormat(draft)
  if (strict.status === 'PASS') return Object.freeze({ status: 'RECOVERED', evidence: strict.evidence })
  const lines = draft.split(/\r?\n/u)
  const candidates = [recoverHeadingDraft(lines, draft), recoverSectionedDraft(lines, draft)].filter(
    (candidate): candidate is XhsDraftEvidence => candidate !== null,
  )
  if (candidates.length !== 1) return Object.freeze({ status: 'AMBIGUOUS', evidence: null })
  const evidence = candidates[0]
  return evidence === undefined
    ? Object.freeze({ status: 'AMBIGUOUS', evidence: null })
    : Object.freeze({ status: 'RECOVERED', evidence })
}

/**
 * Render the only model-visible Markdown structure accepted by the production parser.
 * @returns fixed output-format instructions with no business writing rules.
 */
export function renderXhsDraftFormat(): string {
  return [
    '【输出格式】',
    '只返回以下结构的正式 Markdown，不要输出完整方案、解释文字、外层报告标题或代码围栏：',
    '# {title}',
    '',
    '标题字符数：XX + 正文字符数：XXX',
    '',
    '{body}',
    '',
    '{Leo signature if required}',
    '',
    '## 置顶评论',
    '',
    '{pinned comment}',
    '',
    '## 非置顶评论',
    '',
    '评论1：',
    '{comment 1}',
    '',
    '评论2：',
    '{comment 2}',
    '',
    '## 关联话题',
    '',
    '{hashtags}',
  ].join('\n')
}
