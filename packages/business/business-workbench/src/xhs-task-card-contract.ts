/** Strict compiler from one formal XHS TaskCard into its Host machine contract. */

import { z } from 'zod'
import { BusinessWorkbenchError } from './errors.ts'

/** Machine-contract schema emitted by the formal XHS TaskCard compiler. */
export const XHS_TASK_CARD_CONTRACT_SCHEMA_VERSION = 2 as const

const accountSchema = z.enum(['account1', 'account2', 'account3', 'account4'])
const noteTypeSchema = z.enum(['dry-search', 'recommendation', 'hot-traffic'])
const locationSchema = z.enum(['标题', '开头', '中段', '末尾'])
const rangeSchema = z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).strict()
const keywordRequirementSchema = z.object({
  keyword: z.string().min(1),
  requiredLocations: z.array(z.object({
    location: locationSchema,
    count: z.number().int().positive(),
  }).strict()).min(1),
}).strict()

/** Canonical machine fields compiled from one formal XHS TaskCard. */
export const xhsTaskCardMachineContractSchema = z.object({
  schemaVersion: z.literal(XHS_TASK_CARD_CONTRACT_SCHEMA_VERSION),
  compilerVersion: z.string().regex(/^XHS-PROD-\d+\.\d+$/u),
  project: z.literal('xhs'),
  account: accountSchema,
  production: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/u),
    week: z.string().regex(/^第\d{2}周$/u),
    note: z.string().regex(/^note\d{3}$/u),
  }).strict(),
  taskId: z.string().min(1),
  topicId: z.string().min(1),
  noteType: noteTypeSchema,
  status: z.enum(['待简哥确认', '已确认']),
  confirmed: z.boolean(),
  titleRange: rangeSchema,
  bodyRange: rangeSchema,
  requiredExactKeywords: z.array(keywordRequirementSchema),
  requiredBodyStructure: z.array(z.string().min(1)).min(1),
  comments: z.object({ pinned: z.number().int().nonnegative(), unpinned: z.number().int().nonnegative() }).strict(),
  topicCount: z.number().int().nonnegative(),
  allowedTopics: z.array(z.string().min(1)),
  productModule: z.string().min(1),
  explicitProhibitions: z.array(z.string().min(1)),
}).strict()

/** Canonical machine contract for one formal XHS TaskCard. */
export type XhsTaskCardMachineContract = z.infer<typeof xhsTaskCardMachineContractSchema>

type KeywordLocation = z.infer<typeof locationSchema>

function reject(message: string): never {
  throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`)
}

function linesOf(taskCard: string): readonly string[] {
  return Object.freeze(taskCard.split(/\r?\n/u).map(line => line.replace(/^> ?/u, '')))
}

function machineLines(lines: readonly string[]): readonly string[] {
  const start = lines.findIndex(line => line === '[!note]- 机器执行参数')
  if (start < 0) return reject('TaskCard lacks formal machine section')
  return Object.freeze(lines.slice(start + 1))
}

function requiredMatch(lines: readonly string[], pattern: RegExp, description: string): RegExpExecArray {
  for (const line of lines) {
    const match = pattern.exec(line)
    if (match !== null) return match
  }
  return reject(`TaskCard lacks ${description}`)
}

function scalar(lines: readonly string[], label: string): string {
  const value = requiredMatch(lines, new RegExp(`^- ${label}：(.+)$`, 'u'), label)[1]
  return value === undefined ? reject(`TaskCard contains an incomplete ${label}`) : value
}

function machineField(lines: readonly string[], label: string): string {
  const pattern = new RegExp(`^- ${label}：(.+)$`, 'u')
  const firstSection = lines.findIndex(line => /^\*\*/u.test(line))
  const fields = firstSection < 0 ? lines : lines.slice(0, firstSection)
  const matches = fields.flatMap((line) => {
    const match = pattern.exec(line)
    return match === null ? [] : [match]
  })
  if (matches.length === 0) return reject(`TaskCard lacks ${label}`)
  if (matches.length > 1) return reject(`TaskCard contains duplicate ${label}`)
  const value = matches[0]?.[1]
  return value === undefined ? reject(`TaskCard contains an incomplete ${label}`) : value
}

function range(lines: readonly string[], label: string): { readonly min: number; readonly max: number } {
  const match = requiredMatch(lines, new RegExp(`^\\*\\*${label}：\\*\\*.*?(\\d+)[—-](\\d+)全字符$`, 'u'), `${label} range`)
  const min = Number(match[1])
  const max = Number(match[2])
  if (min > max) reject(`TaskCard ${label} range is reversed`)
  return Object.freeze({ min, max })
}

function sectionItems(lines: readonly string[], heading: string): readonly string[] {
  const start = lines.findIndex(line => line === `**${heading}**`)
  if (start < 0) return reject(`TaskCard lacks ${heading}`)
  const items: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\*\*.+\*\*$/u.test(line)) break
    if (line.startsWith('- ')) items.push(line.slice(2))
  }
  if (items.length === 0) reject(`TaskCard ${heading} is empty`)
  return Object.freeze(items)
}

function noteType(value: string): XhsTaskCardMachineContract['noteType'] {
  const values = {
    '干货搜索型（dry_search）': 'dry-search',
    '干货推荐型（recommendation）': 'recommendation',
    '热点流量型（hot_traffic）': 'hot-traffic',
  } as const
  return (values as Readonly<Record<string, XhsTaskCardMachineContract['noteType'] | undefined>>)[value]
    ?? reject(`TaskCard note_type '${value}' is unsupported or legacy`)
}

function account(value: string): XhsTaskCardMachineContract['account'] {
  const values = { 账号1: 'account1', 账号2: 'account2', 账号3: 'account3', 账号4: 'account4' } as const
  return (values as Readonly<Record<string, XhsTaskCardMachineContract['account'] | undefined>>)[value]
    ?? reject(`TaskCard account '${value}' is unsupported`)
}

function keywordRequirements(machine: readonly string[]): z.infer<typeof keywordRequirementSchema>[] {
  const items = sectionItems(machine, '关键词执行')
  const requirements = items.flatMap((line) => {
    const match = /^(?:主搜索词|主词|语义词)：(.+?)（(.+)）$/u.exec(line)
    if (match === null) return []
    const keyword = match[1]
    const locations = match[2]
    if (keyword === undefined || locations === undefined) return reject('TaskCard contains an incomplete exact keyword requirement')
    const requiredLocations = [...locations.matchAll(/(标题|开头|中段|末尾)×(\d+)/gu)].map(item => ({
      location: item[1] as KeywordLocation,
      count: Number(item[2]),
    }))
    if (requiredLocations.length === 0) return reject(`keyword '${keyword}' lacks an exact location`)
    return [{ keyword, requiredLocations }]
  })
  if (new Set(requirements.map(item => item.keyword)).size !== requirements.length) {
    return reject('TaskCard contains duplicate exact keyword requirements')
  }
  const highlight = machineField(machine, 'SEO高亮词')
  if (requirements.length === 0) {
    if (highlight !== '无') reject('TaskCard lacks required exact keyword machine contract')
  } else if (highlight === '无' || !requirements.some(item => item.keyword === highlight)) {
    reject('TaskCard SEO highlight field conflicts with exact keyword requirements')
  }
  return requirements.map(item => ({
    keyword: item.keyword,
    requiredLocations: item.requiredLocations.map(location => ({ ...location })),
  }))
}

function allowedTopics(machine: readonly string[]): { readonly count: number; readonly topics: readonly string[] } {
  const headings = machine.flatMap((line, index) => {
    const match = /^\*\*(\d+)个关联话题\*\*$/u.exec(line)
    return match?.[1] === undefined ? [] : [{ index, count: Number(match[1]) }]
  })
  if (headings.length === 0) return reject('TaskCard lacks topic count')
  if (headings.length > 1) return reject('TaskCard contains duplicate topic sections')
  const heading = headings[0]
  if (heading === undefined) return reject('TaskCard lacks topic count')
  const topics: string[] = []
  for (const line of machine.slice(heading.index + 1)) {
    if (/^\*\*.+\*\*$/u.test(line)) break
    if (line.length === 0) continue
    const matches = [...line.matchAll(/(?:^|\s)#([^\s#]+)/gu)]
    if (matches.length === 0 || matches.map(match => `#${match[1]}`).join(' ') !== line.trim()) {
      return reject('TaskCard topic section must contain only space-separated hashtags')
    }
    topics.push(...matches.map((match) => {
      const topic = match[1]
      return topic === undefined ? reject('TaskCard contains an incomplete topic') : topic
    }))
  }
  if (topics.length !== heading.count) return reject('TaskCard topic count does not match its topic values')
  if (new Set(topics).size !== topics.length) return reject('TaskCard contains duplicate topics')
  return Object.freeze({ count: heading.count, topics: Object.freeze(topics) })
}

/**
 * Extract the exact ordered topic values from the formal machine section.
 * @param taskCard - Exact UTF-8 TaskCard text.
 * @returns immutable topic values without their Markdown hashtag prefix.
 */
export function extractXhsTaskCardAllowedTopics(taskCard: string): readonly string[] {
  return allowedTopics(machineLines(linesOf(taskCard))).topics
}

/**
 * Compile one formal TaskCard without modifying its bytes or inferring absent values.
 * @param taskCard - Exact UTF-8 TaskCard text.
 * @returns validated immutable machine contract.
 */
export function compileXhsTaskCardContract(taskCard: string): XhsTaskCardMachineContract {
  const lines = linesOf(taskCard)
  const machine = machineLines(lines)
  const topicContract = allowedTopics(machine)
  const comments = requiredMatch(lines, /^\*\*评论：\*\* 置顶(\d+)条 \+ 非置顶(\d+)条$/u, 'comment counts')
  const status = machineField(machine, 'status')
  const bodyStructure = sectionItems(machine, '正文结构')
  const prohibitions = [...new Set(machine
    .filter(line => line.startsWith('- ') && line.includes('禁止'))
    .map(line => line.slice(2)))]
  const contract = {
    schemaVersion: XHS_TASK_CARD_CONTRACT_SCHEMA_VERSION,
    compilerVersion: machineField(machine, 'compiler_version'),
    project: 'xhs' as const,
    account: account(machineField(machine, 'account')),
    production: {
      month: machineField(machine, 'production_month'),
      week: machineField(machine, 'production_week'),
      note: machineField(machine, 'note'),
    },
    taskId: machineField(machine, 'task_id'),
    topicId: machineField(machine, 'topic_id'),
    noteType: noteType(machineField(machine, 'note_type')),
    status,
    confirmed: status === '已确认',
    titleRange: range(lines, '标题'),
    bodyRange: range(lines, '正文'),
    requiredExactKeywords: keywordRequirements(machine),
    requiredBodyStructure: bodyStructure,
    comments: { pinned: Number(comments[1]), unpinned: Number(comments[2]) },
    topicCount: topicContract.count,
    allowedTopics: topicContract.topics,
    productModule: scalar(machine, '产品模块'),
    explicitProhibitions: prohibitions,
  }
  return Object.freeze(xhsTaskCardMachineContractSchema.parse(contract))
}
