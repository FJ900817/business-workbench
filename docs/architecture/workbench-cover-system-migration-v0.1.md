# Workbench cover-system migration design V0.1

English | [中文](workbench-cover-system-migration-v0.1.zh.md)

This reference maps the existing Obsidian S15/G3.10 XHS cover system into Business Workbench. Its scope ends at rule mapping, execution stages, data ownership, and equivalence verification; it does not implement code, integrate an image-generation provider, generate images, change the body-production path, or write to Obsidian.

## Audit inputs

This design reflects the active S15/G3.10 files and Business Workbench source on 2026-09-10. The Workbench HEAD is `4aaefd40e10b067a27b32f606b45ca10b78faba2`. The Obsidian/S15 paths below are relative to `<PRIVATE_XHS_VAULT_ROOT>/`.

The principal Obsidian/S15 inputs are:

- `03 项目生态【生命体】/项目-小红书/01_小红书生产创作系统/00_系统总控/新版封面系统与笔记创作系统接口交接说明_V1.0.md`
- `.agents/skills/S15-封面设计-G3.10/SKILL.md`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/routing/routing_matrix.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/config/formal_selection_map.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/contracts/P1-P8页面设计契约总表.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/contracts/P1-P8图片槽位契约.json`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/rules/热点流量型_Editorial共享封面生产规范_V1.0.md`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/02_正式Skill/rules/干货型_Swiss共享封面生产规范_V1.0.md`
- `.agents/skills/S15-封面设计-G3.10/00_系统核心/01_正式模板库/template_library_index.json`

Migration must capture these files as immutable snapshots. A filename or version alone cannot prove rule equivalence; the execution package must also record each source SHA-256, each template-tree hash, and the corresponding hash-algorithm identifier.

The key SHA-256 values observed in this audit are: interface specification `208a5fd5d05e578b0b26eb6aba642d24a2c495c04c52c3b415564801d0384486`, routing matrix `67a05e4403ab005cbd2f952bd81d40e2e09ff0cb4481933eef04161f076d395e`, formal template selection map `39574135d483773f11b4a5ce3b2550dc35f8f3f28e4a76f2f75aaf269abd4cd6`, page-design contract `f884204fcb95cce71bbe3632834525f4455f23be09d0f05828bebc0329033d03`, and image-slot contract `ada238ebda97419e56564905da7fac75c10ad24b7ca3c7a3196384021bf4fbd0`. These values identify this audit's inputs only; implementation must freeze a new snapshot rather than hard-code them as permanent versions.

## A. Existing Obsidian cover flow

### Formal execution sequence

The existing cover system takes control only after body finalization. System 2 produces a task card, a human approves it, and System 1/S3 produces `小红书笔记完整方案.md`. S15/G3.10 may start only after a human approves that body as final and the file contains `content_status=final` and a non-empty `finalized_at`. The task card is not a formal S15 business input, and S15 must not fall back to it when final-note fields are missing.

```text
正文终稿与终稿确认
→ 建立 G3.10 任务和终稿快照
→ note_type 确定模板家族与模板版本
→ 拆分 P1-P8、生成文案和换行合同
→ 使用真实模板生成无素材框架预览
→ 人工确认内容和视觉方向
→ 生成 image_tasks.json 与素材提示词
→ 人工确认素材方向
→ 生成素材并形成联系总览
→ 人工确认素材
→ 锁定素材并注入固定模板
→ Playwright/Chromium 渲染 P1-P8
→ 校验并生成 production_manifest 与执行报告
→ 人工视觉终审
→ S6 发布同步
```

Material generation cannot start before frame approval, and final PNG rendering cannot start before material approval. Successful technical rendering never substitutes for human visual approval.

### Final-note input

The only required business input is the human-approved `小红书笔记完整方案.md`. Required information includes product, account, production round, `note_id`, `note_type`, final title, full body, public facts and conclusions, brand or product names, CTA, formal topics, `content_status=final`, and a non-empty `finalized_at`. Title-pair data, real images, evidence sources, protected wording, and excluded visual directions are optional inputs, but missing data never permits fabricated facts.

S15 generates its own `task_id`. After migration, the system must retain both the Workbench Job ID and the S15 business `task_id`; neither may replace the other.

### Template routing

Workbench uses `hot-traffic`, `dry-search`, and `recommendation`, while S15 uses `hot_traffic`, `search_solution`, and `recommendation_conversion`. The migration adapter must apply the closed mapping below; it may not use fuzzy matching or let AI choose.

| Workbench note_type | S15 note_type | Template family | Template version |
|---|---|---|---|
| `hot-traffic` | `hot_traffic` | Editorial | `V1_1_Editorial_Clean` |
| `dry-search` | `search_solution` | Swiss | `V2_1_Swiss_Purple_QingYa` |
| `recommendation` | `recommendation_conversion` | Swiss | `V2_1_Swiss_Purple_QingYa` |

Editorial maps P1-P8 to `M01, M02, M03, M05, M06, M07, M09, M15`. Swiss maps P1-P8 to `S01, S02, S06, S05, S03_G3.7-B_POSTER, S10, S07, S12`. Historical Editorial `V1` and Swiss `S04/S08/S09/S11` are read-only historical identifiers and cannot enter new production.

Editorial `visual_route` is restricted to `brand_campaign`, `brand_visual_system`, `master_design_philosophy_concept`, or `brand_evolution_timeline`. Swiss uses `search_solution` or `recommendation_conversion` according to note type. A `visual_route` can never change the template family, template version, or P1-P8 mapping.

### P1-P8 page responsibilities

| Page | Editorial hot-traffic | Swiss search | Swiss recommendation |
|---|---|---|---|
| P1 | High-conflict cover with one core tension | Problem and direct answer | Recommendation target, audience, and value |
| P2 | Real scene and first visual evidence | Wrong assumption compared with actual cause | Ordinary choice compared with reasoned choice |
| P3 | Core judgment and supporting reason | Three-step solution framework | Three-step recommendation or selection framework |
| P4 | Checklist of key checks, problems, or judgments | Three obstacles or risks | Three pitfalls and unsuitable situations |
| P5 | Four-image evidence wall with one coherent visual system | Real case or visual evidence | Real product, resource, case, or result |
| P6 | Intermediate synthesis and structured conclusion | Six judgment indicators | Six judgment dimensions |
| P7 | One strong judgment or shareable statement | Three corrective actions or conclusions | Three usage suggestions or conclusions |
| P8 | Before/After closure with no new thesis | Eight-cell action matrix and summary | Eight-cell saveable matrix and natural handoff |

Each page must consume the prior page's conclusion and provide the next page's input. P8 closes existing content and cannot introduce a new knowledge branch.

### Copy slots

The formal templates, `field_map.json`, `injection_contract.json`, and page-design contract own the DOM, selectors, fixed copy, type sizes, colors, and layout. AI may supply only values for writable fields. The Host may inject only through `textContent` or a controlled asset path; neither AI nor the injector may write HTML, CSS, `innerHTML`, or fixed fields.

| Page | Required writable Editorial slots |
|---|---|
| P1 | Primary title, subtitle, summary, hero image |
| P2 | Primary title, summary, one body item, hero image |
| P3 | Primary title, key statement, three body items, hero image |
| P4 | Primary title, five item titles and bodies, summary |
| P5 | Primary title, four image captions, four images |
| P6 | Primary title, summary, four item titles and bodies, key statement |
| P7 | Primary title, summary, one body item |
| P8 | Primary title, Before/After section titles, and three items per section |

| Page | Required writable Swiss slots |
|---|---|
| P1 | Primary title and summary |
| P2 | Primary title, four comparison body items, and summary |
| P3 | Primary title and three process-node titles and bodies |
| P4 | Primary title and three warning titles and bodies |
| P5 | Primary title, owner/status/format/review metadata, and hero image |
| P6 | Primary title and six metric labels and values |
| P7 | Primary title, three conclusion titles and bodies, and summary |
| P8 | Primary title, eight matrix labels, summary, and fixed hero-number field |

Editorial title-line limits are fixed: P1/P2 use two unequal lines, P3 uses `4+5`, P4 uses one six-character line, P5 uses `5+5` or `6+6`, P6 uses `5+6` or `6+6` with six characters on the second line, P7 uses `6+6`, and P8 uses `4+4` or `5+5`. Every Swiss P1-P8 title uses exactly two lines; P1 uses 5–6 characters on the first line and 7–8 on the longer second line, P2 uses 6–7 and 5–6, and P3-P8 use 5–6 characters per line. Browser-observed lines are authoritative; reducing type size, tightening tracking, or expanding containers cannot make over-capacity copy valid.

The body title and P1 title may use different wording, but they must retain the same subject, problem, answer, conclusion, and verified numbers. P1 may compress the expression but cannot introduce another topic or add a promise or number absent from the final note.

### Image slots

| Type | Page | Slot | Container size | Crop rule |
|---|---|---|---|---|
| Editorial | P1/M01 | `page.image.hero` | 904×565, about 16:10 | `cover`, `50% 62%` |
| Editorial | P2/M02 | `page.image.hero` | 904×638.625, about 1.42:1 | `cover`, `50% 58%` |
| Editorial | P3/M03 | `page.image.hero` | 904×565, about 16:10 | `cover`, `50% 50%` |
| Editorial | P5/M06 | `page.image.item_01` through `04` | 439×329.25 each, 4:3 | `cover`, `50% 50%` |
| Swiss | P5/S03 | `page.image.hero` | 920×446.59375, about 2.06:1 | `cover`, `50% 55%` |

Editorial has seven formal material slots; P4/P6/P7/P8 cannot acquire images. Swiss has one P5 image slot; other pages cannot gain images ad hoc. The subject must remain inside a safe area inset 10% from each edge. Unknown sources, missing assets, or crops that lose the subject must stop execution; a solid block or fabricated image cannot fill a final composition.

Editorial material cannot contain text, logos, watermarks, recognizable software UI, pseudo-text, product names, the Leo signature, or page numbers. An image model cannot generate complete P1-P8 pages. Swiss P5 may use a real poster, case image, or text poster, but its source must be explicit.

### Fixed prohibitions

- A formal cover task cannot exist before final-note approval; S15 cannot change the final-note status or source bytes.
- S15 cannot read the task card to fill missing final-note metadata and cannot invent facts, numbers, cases, brand evidence, or product promises.
- AI cannot decide the template family, version, template ID, DOM structure, fixed section labels, fonts, colors, canvas size, or material slots.
- No component may write undefined fields, fixed fields, HTML, CSS, or `innerHTML`, or modify the formal template source.
- No component may reduce type size, hide overflow, enlarge a container, or apply temporary CSS to make invalid copy pass.
- Material generation cannot precede frame review, final PNG rendering cannot precede material review, and technical validation cannot replace visual approval.
- Rendering cannot use viewport or fullPage screenshots; it must capture `.poster.xhs` and fail if that element is absent or invalid.
- Consumer pages cannot expose internal task IDs, template IDs, test numbers, technical paths, or internal year markers.
- Swiss cannot use words outside its controlled English-node vocabulary or fork template components or font rules between search and recommendation notes.

### Acceptance rules

Formal acceptance has six layers: final status and metadata; routing and template hashes; P1-P8 page and field schema; title capacity and browser-observed lines; asset source, slot, crop, and human approval; and rendered file count, dimensions, font, template integrity, overflow, border, and crop. Any hard-check failure remains a failure and cannot be silently repaired or advanced.

The completed result must contain `P1.png` through `P8.png` in order, a contact sheet, `production_manifest.json`, an observed-line report, and an execution report. S6 reads only the final note, the eight PNGs, and a valid production manifest.

## B. Corresponding Workbench stages

### Directly reusable capabilities

Business Workbench already provides durable Batch/Job/Attempt records, execution leases, recovery, immutable text artifacts, execution packages, read and skill allow-lists, source hashes, review evidence, lineage, idempotency, and compare-and-swap updates. These capabilities can own cover-task state, input snapshots, human decisions, and failure evidence.

The current implementation cannot directly carry cover output: `BusinessJobType` admits only `xhs-body`, Agent actions contain only body actions, ordinary artifacts store UTF-8 `.md` content, the body output bundle is fixed at three text files, and Review is bound to body candidates. Migration therefore needs an `xhs-cover` type, cover-specific actions, verifiable binary artifacts and variable-size bundles, and cover Review records inside the Business Workbench package. It does not require changes to AgentLoop, WorkflowEngine, the core Session format, or Harness Core.

### Stage mapping

| Obsidian/S15 stage | Workbench stage | Authoritative output | Human pause |
|---|---|---|---|
| Final check, snapshot, routing, P1-P8 decomposition, and real-template preview | `xhs-cover-plan-v0` | Cover Plan Bundle | Content and visual-plan review |
| `image_tasks.json`, prompts, material generation, and contact sheet | `xhs-cover-material-generate-v0` | Material Requirement/Asset Bundle | Material-direction and material review |
| Asset lock, template injection, rendering, validation, and reports | `xhs-cover-compose-v0` | Cover Candidate Bundle | Final visual review |

`task_manifest.json` remains an S15 compatibility projection, while the Workbench Job is the sole lifecycle source of truth. The Obsidian `G3.10_封面任务` directory is a later promotion target, not the execution-time state authority.

### Workflow 05: `xhs-cover-plan-v0`

Inputs are the approved final-note artifact, final-approval evidence, full body, `note_type`, product module, title-pair data, optional real evidence and brand-asset references, and S15 rule and template snapshots. The execution package exposes only these exact files and cannot scan Obsidian.

The Host first verifies final status, approval evidence, source hash, note-type mapping, routing data, and template-tree hash. AI may derive P1-P8 titles, copy, evidence allocation, and a controlled visual direction from the final note. The Host supplies the fixed template IDs, writable fields, line allocation, capacity limits, and image slots.

Outputs include at least `source_note_manifest.json`, `note_content_plan.json`, `P1-P8审核单.md`, `render_line_contract.json`, `visual_route.json`, a visual-direction explanation, and references to real-template previews. Success enters `WAITING_COVER_PLAN_REVIEW`; human approval creates a Review artifact bound to the Plan Bundle ID and hash.

Acceptance requires a verifiable final-note source, unique routing, exactly P1-P8, exact template mapping, only allowed fields, complete page responsibilities and handoffs, capacity-compliant content, no new facts, and a preview rendered with the real template and font. Any failure blocks Workflow 06.

### Workflow 06: `xhs-cover-material-generate-v0`

Inputs are the approved Plan Bundle, its Review artifact, fixed image-slot definitions, permitted real assets, and source hashes. The direct source must be the approved plan; this stage cannot derive a replacement plan from the body.

Before an image provider is integrated, V0.1 only compiles material requirements. It outputs `image_tasks.json`, per-slot prompts, a material-requirements list, and a draft material manifest without producing images. Each item records page, slot ID, count, container dimensions, target ratio, safe area, scene, style, core proof, allowed facts, prohibitions, and maximum attempts. Pages without images explicitly record zero demand.

After provider integration, the same stage may call a controlled adapter only after human approval of material direction. It stores returned material as immutable artifacts, creates `asset_manifest.json` and a contact sheet, and then pauses for material review. Workflow 07 may consume only the material hashes bound by that Review.

Acceptance requires one-to-one correspondence with every template slot, no missing or extra count, dimensions and crop data derived from templates rather than AI, no unapproved facts in prompts, sourced and hashed material, and no duplicate billing or implicit retry after failure. Without human approval, material generation and composition remain blocked.

### Workflow 07: `xhs-cover-compose-v0`

Inputs are the approved Plan Bundle, approved Asset Bundle, template-tree snapshot, field-injection specification, line contract, font manifest, and all source hashes. This stage invokes neither a language model nor an image model.

The Host copies templates into an isolated workspace, injects approved copy and material by field ID, runs Playwright/Chromium, captures `.poster.xhs`, and produces P1-P8, a contact sheet, production manifest, line-count report, and execution report. Template source, layout, and copy structure remain read-only.

Acceptance requires eight ordered pages, value round-trip, unchanged template and asset hashes, no font fallback, no overflow or collision, passing line limits, safe cropping, no surrounding border or transparent blank region, and no internal fields on consumer pages. Success enters `WAITING_FINAL_VISUAL_REVIEW`; human approval grants promotion eligibility only, and this stage cannot write to Obsidian or publish.

### File mapping

| Existing G3.10 file | Workbench owner |
|---|---|
| `task_manifest.json` and task status | Job/Attempt state and compatibility projection |
| Final-note snapshot and `source_note_manifest.json` | Input artifact and execution package |
| `note_content_plan.json`, review sheet, visual route, line contract, and template preview | Cover Plan Bundle |
| Plan and visual review record | Cover Plan Review artifact |
| `image_tasks.json`, prompts, and material requirements | Material Requirement Bundle |
| Individual assets, contact sheet, `asset_manifest.json`, and material review | Material Asset Bundle and Review artifact |
| P1-P8, contact sheet, production manifest, line report, and execution report | Cover Candidate Bundle and Validation artifact |
| HTML working copies and browser caches | Attempt-local temporary workspace, never a formal artifact |

## C. Business sources of truth

Business truth comes from the human-approved final note and its approval evidence: product, account, production round, note identity, note type, final title, body, core problem and judgment, public facts and numbers, brand and product names, CTA, topics, real-case sources, permitted real material, and explicitly protected copy. Workbench must snapshot these bytes and their hashes and cannot revise or write them back during cover production.

An approved P1-P8 plan and approved material become downstream truth for that cover task, but only for the bound Job, Attempt, and source hashes. A change to any upstream body, plan, or material hash invalidates every downstream approval.

Template names, template versions, P1-P8 mappings, image slots, and rendering rules are system rules rather than per-note business truth. AI-generated page copy and visual direction are not business truth before human approval.

## D. Execution parameters

Execution parameters include Workbench Job/Attempt ID, S15 task ID, working directory, artifact ID, input and output hashes, timestamps, lease, idempotency key, stage status, template-tree hash algorithm, browser and Playwright versions, font manifest, rendering scale, temporary paths, provider and model names, timeout, maximum generation attempts, and call receipts.

Template family and version are derived execution parameters from fixed routing. For Editorial, AI may propose a `visual_route` from the controlled enum, but Host validation and human approval must freeze it; Swiss derives its route from note type. Execution parameters cannot be written back into the body or treated as new business content.

## E. Values that code must fix

- The complete three-entry mapping from Workbench note types to S15 note types, with rejection of unknown values.
- The template family, template version, and P1-P8 template IDs for all three note types.
- P1-P8 count, order, page responsibilities, required and optional fields, fixed fields, and prohibited writes.
- Character capacity, line count, punctuation, number-source, and browser-observation rules for every text slot.
- Page, field ID, count, container size, ratio, safe area, crop position, and missing-material behavior for every image slot.
- Hash verification for templates, rules, fonts, inputs, plans, materials, and outputs.
- Admission and invalidation conditions for final-note, plan, material, and final-visual human approvals.
- Read-only templates, path isolation, symlink-escape prevention, cross-Job read prevention, and no Obsidian writes.
- Fixed DOM injection, `.poster.xhs` capture, final filenames, page count, dimensions, and manifest checks.
- Provider authorization, call ceilings, idempotency, failure exit, and runtime recovery without duplicate image generation.

The Host must enforce these rules; a prompt asking the model to comply is insufficient.

## F. Values that AI may generate

Within the final note and fixed page responsibilities, AI may derive P1-P8 page titles, summaries, items, key judgments, Before/After copy, topic label, and material semantics. For existing image slots, AI may describe scene, subject, composition, style, and negative prompts. It may also propose an Editorial route from the controlled visual-route enum.

AI cannot determine template family, version, template ID, page count, field IDs, image count, slot dimensions, fonts, colors, DOM, CSS, actual line breaks, output dimensions, or whether to skip human review. It cannot add facts, numbers, experiences, outcome promises, brand evidence, product modules, or pages absent from the final note.

The Host owns identity, routing, hashes, fields, counts, characters, lines, dimensions, paths, template integrity, and file integrity. AI owns bounded semantic translation and material descriptions. Jian-ge owns plan selection, material selection, and final visual approval.

## Equivalence strategy for one note

“Obsidian output is approximately equal to Workbench output” must resolve to measurable conditions rather than visual intuition or a model's self-report.

### Migrating an existing G3.10 task

To reproduce an existing task, Workbench must directly import the final-note snapshot, `note_content_plan.json`, `render_line_contract.json`, `visual_route.json`, approved material, and `asset_manifest.json`, verify their original hashes, and then compose the templates. Regenerating page copy or material through AI proves only rule equivalence, not output equivalence.

### Producing a new cover task

A new task that uses AI-generated page copy or material descriptions cannot guarantee byte-identical or pixel-identical output to another Obsidian Agent run. The guaranteed equivalence is the same final-note hash, routing, template tree, P1-P8 responsibilities, field set, image slots, human-review stages, and deterministic acceptance result.

### Equivalence verification matrix

| Layer | Evidence that must match |
|---|---|
| Input | Final-note bytes and hash, approval record, note identity, and note type |
| Rules | Routing-file hash, page-contract hash, image-slot-contract hash, template-tree hash, and font-manifest hash |
| Plan | P1-P8 template IDs, field set, page order, and line contract; replay also requires field-value equality |
| Material | Asset ID, slot, file hash, dimensions, ratio, crop position, and human approval |
| Render input | Template-copy hash, injected field values, asset hashes, browser version, and font version |
| Output | Eight-file count and order, physical dimensions, no overflow or crop loss, and template structure; same-environment replay also compares byte or perceptual differences |
| State | Every human approval and failure binds the same direct source and hash |

PNG files should not be byte-identical by default across machines because font anti-aliasing, browser behavior, and encoding may differ. A single pinned render environment may require byte hashes; cross-environment verification must require fixed structure, dimensions, a pixel-difference threshold, and recorded browser, operating-system, font-file, and template versions.

## Differences to resolve before implementation

1. `P1-P8图片槽位契约.json` explicitly lists only the `Swiss_recommendation` P5 slot, while `note_content_plan.schema.json` requires a P5 hero image for both Swiss search and recommendation. The S15 authority must confirm whether search reuses that slot before migration; Workbench cannot silently add the missing record.
2. The root S15 entry and interface specification validate final PNGs at 1080×1440, while the Editorial/Swiss shared rules describe 2160×2880 output or “@2x equivalent to 1080×1440.” Implementation must freeze separate logical-canvas, render-scale, and physical-file-dimension fields rather than accept both physical sizes.
3. `formal_selection_map.json` still reports `formal_library_status` as `packaged_not_entered`, while the template index marks both new libraries as formal sources of truth. Workbench must use an explicitly approved template index and tree hash and remove this status ambiguity before integration.
4. The current `production_manifest` schema constrains only a small set of top-level fields and cannot prove the complete relationship among eight pages, material, templates, fonts, and validation results. The Workbench Cover Candidate Bundle needs a stronger manifest without changing the old file's business meaning.
5. Current Workbench artifacts and output bundles support only body text results and cannot safely store PNGs or arbitrary file counts. Binary artifacts and variable-size bundles are prerequisites for composition.
6. S15 supports `review` and `fast`, while the formal process requires three human pauses. Workbench V0.1 migration validation should expose only the review path; retaining fast mode requires separate approval.

Until these six items are resolved, the system may implement read-only parsing, plan compilation, and zero-provider replay design, but it cannot claim formal 1:1 production equivalence between Workbench and Obsidian.

## Conclusion

Migration should keep one Business Workbench plugin and three versioned actions: `xhs-cover-plan-v0`, `xhs-cover-material-generate-v0`, and `xhs-cover-compose-v0`. Workbench owns durable state, immutable evidence, restricted input, human approval, and recovery. S15 rule snapshots own templates, pages, fields, material slots, and rendering rules. AI performs semantic translation only within fixed slots. Obsidian remains an approved compatibility projection and publishing input.

The first implementation step is not image-provider integration. It is to freeze the S15 rule snapshot, resolve the six authority differences, and perform a zero-provider shadow replay with an existing final note, plan, and approved material. An image-provider adapter is appropriate only after input, routing, field, material, and rendering equivalence passes.
