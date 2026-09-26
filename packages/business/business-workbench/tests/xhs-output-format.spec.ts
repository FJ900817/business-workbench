import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseXhsAgentDraft, wrapXhsAgentText, XHS_DRAFT_MAX_BYTES } from '../src/xhs-output-bundle.ts'

function captureError(run: () => unknown): unknown {
  try { run() } catch (error: unknown) { return error }
  throw new Error('expected operation to throw')
}

describe('XHS text transport and strict Host envelope', () => {
  it.each([
    ['plain text', 'Synthetic draft.'],
    ['quotes and newlines', '# "标题"\n\n换行与“引号”\\不需要模型转义。\n'],
    ['Unicode', '中文🙂𠮷 e\u0301'],
    ['500 Chinese characters', '这是完全合成测试正文'.repeat(50)],
    ['surrounding whitespace', '  # 正文\n\n内容。\n\n'],
  ])('round trips %s without editing content', (_name, draft) => {
    expect(parseXhsAgentDraft(wrapXhsAgentText(draft, 'stop'))).toBe(draft)
    expect(parseXhsAgentDraft(JSON.stringify({ draft }))).toBe(draft)
  })

  it('removes exactly one initial BOM and preserves all other whitespace', () => {
    const draft = ' \n# 标题\n\n正文\n '
    expect(parseXhsAgentDraft(wrapXhsAgentText(`\uFEFF${draft}`))).toBe(draft)
    expect(captureError(() => wrapXhsAgentText(`\uFEFF\uFEFF${draft}`))).toMatchObject({
      detail: { xhsOutputDiagnostics: { kind: 'invalid-character' } },
    })
  })

  it.each([
    ['strict JSON is not text transport', '{"draft":"正文"}', 'stop', 'unsupported-format'],
    ['fenced JSON', '```json\n{"draft":"正文"}\n```', 'stop', 'unsupported-format'],
    ['fenced Markdown', '~~~markdown\n正文\n~~~', 'stop', 'unsupported-format'],
    ['malformed JSON', '{"draft": "unescaped "quote""}', 'stop', 'invalid-json'],
    ['unclosed JSON without truncation evidence', '{"draft":"partial', 'stop', 'invalid-json'],
    ['provider-reported truncated JSON', '{"draft":"partial', 'max-tokens', 'truncated'],
    ['provider-reported truncated text', '# Partial draft', 'max-tokens', 'truncated'],
    ['missing draft', '{"metadata":{}}', 'stop', 'missing-draft'],
    ['wrong draft type', '{"draft":22}', 'stop', 'schema-invalid'],
    ['extra JSON field', '{"draft":"正文","metadata":{}}', 'stop', 'schema-invalid'],
    ['JSON array', '["正文"]', 'stop', 'schema-invalid'],
    ['empty draft', ' \n ', 'stop', 'empty-draft'],
    ['NUL', '# 正文\0', 'stop', 'invalid-character'],
    ['oversized draft', 'x'.repeat(XHS_DRAFT_MAX_BYTES + 1), 'stop', 'too-large'],
    ['non-stop finish', '# 正文', 'tool-calls', 'unsupported-format'],
  ])('rejects %s with content-free evidence', (_name, output, finishReason, kind) => {
    expect(() => wrapXhsAgentText(output, finishReason)).toThrow(expect.objectContaining({
      code: 'XHS_BODY_OUTPUT_INVALID',
      detail: { xhsOutputDiagnostics: {
        version: 1, stage: 'agent-text', kind, finishReason,
        outputBytes: Buffer.byteLength(output),
        outputHash: createHash('sha256').update(output).digest('hex'),
      } },
    }))
  })

  it.each([
    ['```json\n{"draft":"ok"}\n```', 'invalid-json'],
    ['body only', 'invalid-json'],
    ['{"draft":"partial', 'invalid-json'],
    ['{}', 'missing-draft'],
    ['null', 'schema-invalid'],
    ['{"draft":1}', 'schema-invalid'],
    ['{"draft":" "}', 'empty-draft'],
    [JSON.stringify({ draft: 'bad\0' }), 'invalid-character'],
    [JSON.stringify({ draft: 'x'.repeat(XHS_DRAFT_MAX_BYTES + 1) }), 'too-large'],
  ])('keeps the internal JSON parser strict: %s', (output, kind) => {
    expect(captureError(() => parseXhsAgentDraft(output))).toMatchObject({
      code: 'XHS_BODY_OUTPUT_INVALID',
      detail: { xhsOutputDiagnostics: { stage: 'internal-json', kind } },
    })
  })
})
