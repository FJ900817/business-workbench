/** Stable failure vocabulary for Business Workbench operations. */

/** Machine-readable Business Workbench failure codes. */
export type BusinessWorkbenchErrorCode =
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'INVALID_OPERATION'
  | 'BATCH_CORRUPT'
  | 'ARTIFACT_CONFLICT'
  | 'ARTIFACT_MISSING'
  | 'ARTIFACT_CORRUPT'
  | 'ARTIFACT_WRITE_FAILED'
  | 'LEASE_CONFLICT'
  | 'LEASE_EXPIRED'
  | 'LEASE_OWNER_MISMATCH'
  | 'EXECUTION_PACKAGE_CONFLICT'
  | 'EXECUTION_PACKAGE_MISSING'
  | 'READ_ROOT_UNAVAILABLE'
  | 'READ_DENIED'
  | 'PATH_INVALID'
  | 'INPUT_MISSING'
  | 'INPUT_DRIFT'
  | 'AGENT_RUNTIME_UNAVAILABLE'
  | 'AGENT_ACTION_NOT_ALLOWED'
  | 'AGENT_RUN_IN_PROGRESS'
  | 'AGENT_RUN_FAILED'
  | 'MODEL_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'EMPTY_AGENT_OUTPUT'
  | 'REASONING_BUDGET_EXHAUSTED'
  | 'SKILL_NOT_FOUND'
  | 'SKILL_NOT_ALLOWED'
  | 'SKILL_DRIFT'
  | 'SKILL_ORIGIN_NOT_ALLOWED'
  | 'TOOL_POLICY_VIOLATION'
  | 'XHS_BODY_INPUT_INVALID'
  | 'XHS_BODY_OUTPUT_INVALID'
  | 'XHS_TITLE_PAIR_CONTRACT_MISSING'
  | 'XHS_BODY_TITLE_P1_PAIR_FAILED'
  | 'XHS_COVER_PLAN_INVALID'
  | 'XHS_REVIEW_INVALID'
  | 'MAX_REVISION_REACHED'
  | 'XHS_RETRY_NOT_ALLOWED'
  | 'XHS_RETRY_LIMIT_REACHED'
  | 'XHS_CONTRACT_REPAIR_NOT_ALLOWED'
  | 'XHS_CONTRACT_REPAIR_LIMIT_REACHED'
  | 'XHS_LENGTH_REPAIR_NOT_ALLOWED'
  | 'XHS_LENGTH_REPAIR_LIMIT_REACHED'
  | 'XHS_LENGTH_REPAIR_PROPOSAL_INVALID'
  | 'XHS_LENGTH_REPAIR_UNSATISFIED'
  | 'OUTPUT_BUNDLE_CONFLICT'
  | 'OUTPUT_BUNDLE_MISSING'
  | 'OUTPUT_BUNDLE_CORRUPT'
  | 'OUTPUT_BUNDLE_WRITE_FAILED'
  | 'TELEMETRY_CORRUPT'
  | 'TELEMETRY_WRITE_FAILED'

/** Non-sensitive normalized event facts captured when a restricted Agent has no visible text. */
export interface RestrictedAgentOutputDiagnostics {
  readonly diagnosticsVersion: 2
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  readonly maxTokens?: number
  readonly agentRunId: string
  readonly sessionId: string
  /** Absent because the current successful-response event vocabulary carries no provider response id. */
  readonly responseId?: string
  readonly finishReason?: string
  readonly assistantMessageCount: number
  readonly textDeltaCount: number
  readonly reasoningDeltaCount: number
  readonly toolCallCount: number
  readonly finalEventCount: number
  readonly contentFieldType: 'absent' | 'array'
  readonly finalTextBytes: number
  readonly tokenUsage?: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cacheReadTokens?: number
    readonly cacheWriteTokens?: number
    readonly reasoningTokens?: number
  }
  readonly durationMs: number
  readonly errorStage: 'provider_response' | 'agent_event_mapping' | 'final_message_extraction' | 'business_output_extraction'
}

/** Optional non-sensitive structured failure detail. */
export interface BusinessWorkbenchErrorDetail {
  /** Authoritative current revision for a stale compare-and-swap request. */
  readonly currentRevision?: number
  /** Subject id when safe and useful to the caller. */
  readonly subjectId?: string
  readonly path?: string
  readonly expectedHash?: string
  readonly actualHash?: string
  /** Present only for an empty restricted-Agent output failure. */
  readonly outputDiagnostics?: RestrictedAgentOutputDiagnostics
  /** XHS output rejection evidence; never contains response text. */
  readonly xhsOutputDiagnostics?: {
    readonly version: 1
    readonly kind: 'invalid-json' | 'schema-invalid' | 'missing-draft' | 'truncated' | 'unsupported-format' | 'empty-draft' | 'invalid-character' | 'too-large'
    readonly stage: 'internal-json' | 'agent-text'
    readonly outputBytes: number
    readonly outputHash: string
    readonly finishReason?: string
  }
}

/** Error thrown for a rejected business operation or invalid durable relationship. */
export class BusinessWorkbenchError extends Error {
  override readonly name = 'BusinessWorkbenchError'

  /**
   * @param code - Stable failure discriminant.
   * @param message - Diagnostic that excludes Artifact bodies and credentials.
   * @param detail - Optional non-sensitive current-state detail.
   * @param options - Standard error options.
   */
  constructor(
    readonly code: BusinessWorkbenchErrorCode,
    message: string,
    readonly detail: BusinessWorkbenchErrorDetail = {},
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
