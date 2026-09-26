# Cover System Formal Rule Map V0.1

English | [中文](cover-system-formal-rule-map-v0.1.zh.md)

## Document purpose

This document only records the state of the specified formal sources on 2026-09-10. It does not freeze rules, design a workflow, or resolve source conflicts. A future Workbench migration must not treat this document as a new authority above the formal S15 sources.

## Formal sources

| Source | SHA-256 | Purpose |
|---|---|---|
| `S15-封面设计-G3.10/00_系统核心/02_正式Skill/contracts/P1-P8页面设计契约总表.json` | `f884204fcb95cce71bbe3632834525f4455f23be09d0f05828bebc0329033d03` | Page responsibilities, fields, templates, and measured text capacity |
| `S15-封面设计-G3.10/00_系统核心/02_正式Skill/contracts/P1-P8图片槽位契约.json` | `ada238ebda97419e56564905da7fac75c10ad24b7ca3c7a3196384021bf4fbd0` | Image slots, cropping, and missing-image handling |
| `S15-封面设计-G3.10/00_系统核心/02_正式Skill/rules/热点流量型_Editorial共享封面生产规范_V1.0.md` | `c9d5db4307c1509246e7852ca1fd71e090d6dfd49c05442b6247f3900a2d62d6` | Editorial routing, page rules, and acceptance gates |
| `S15-封面设计-G3.10/00_系统核心/02_正式Skill/rules/干货型_Swiss共享封面生产规范_V1.0.md` | `38b8cfc041439147432e9a8e03b72505368cd95d7f931b8e24199890e2ec0e33` | Swiss routing, page rules, and acceptance gates |
| `账号2/2026-08/第02周/note001/小红书笔记完整方案.md` | `17bd8f59aaba0c88e8ec333e2bfb67e15f6c2eaff0977359bcf28f80fb04f5e3` | Formal body used as the cover input in this audit |

## 1. Template routes

| Note type | Formal enum | Template route | Template library version | P1-P8 templates | Rule source |
|---|---|---|---|---|---|
| Hot traffic | `hot_traffic`, recorded as `editorial_hot_traffic` by the visual system | Editorial | `V1_1_Editorial_Clean` | M01, M02, M03, M05, M06, M07, M09, M15 | Editorial shared rule V1.0, sections 1–3 |
| Search solution | `search_solution` | Swiss | `V2_1_Swiss_Purple_QingYa` | S01, S02, S06, S05, S03_G3.7-B_POSTER, S10, S07, S12 | Swiss shared rule V1.0, sections 1–3 and 14 |
| Recommendation conversion | `recommendation_conversion` | Swiss | `V2_1_Swiss_Purple_QingYa` | S01, S02, S06, S05, S03_G3.7-B_POSTER, S10, S07, S12 | Swiss shared rule V1.0, sections 1–3 and 14 |

Routing conclusion: `note_type` determines the template family and version. The specified sources do not authorize the AI to choose a template freely, invent a template, or create separate rendering branches for the two Swiss note types.

## 2. Title rules

### Editorial

Editorial uses full-character counting: each Han character, digit, English letter, and punctuation mark counts as one. Spaces cannot pad the count, and meaningless punctuation is forbidden.

| Page | Template | Lines | Character limit | Page-specific prohibitions |
|---|---|---|---|---|
| P1 | M01 | Exactly 2 | `6–7 + 5–6` or `5–6 + 6–7` | Lines must have different lengths; font, size, line height, and weight must match; the break must preserve meaning |
| P2 | M02 | Exactly 2 | `6–7 + 5–6` or `5–6 + 6–7` | Lines must have different lengths; do not create hierarchy with different sizes; the break must preserve meaning |
| P3 | M03 | Exactly 2 | Fixed `4 + 5` | Do not change the fixed line lengths |
| P4 | M05 | Exactly 1 | Fixed 6 characters | Do not wrap |
| P5 | M06 | Exactly 2 | `5 + 5` or `6 + 6` | Lines must have equal lengths |
| P6 | M07 | Exactly 2 | `5 + 6` or `6 + 6` | The second line must contain 6 characters |
| P7 | M09 | Exactly 2 | Fixed `6 + 6` | Lines must have equal lengths |
| P8 | M15 | Upper and lower blocks | `4 + 4` or `5 + 5` | Blocks must have equal lengths; `4 + 5` and `5 + 4` are forbidden |

All pages also prohibit orphan characters, orphan words, automatic third lines, broken meaning, and browser rendering that differs from the rule. The Editorial shared rule stops before generating the overall framework preview when a title fails. P1 semantic direction is owned separately by `小红书正文标题与P1封面标题配对规范_V1.0.md` and is outside the specified source set.

### Swiss

Swiss capacity counts Chinese Han characters and excludes punctuation. Every page must contain exactly one explicit line break to form exactly two lines. Single-line, three-line, and automatic third-line titles are forbidden.

| Page | Template | Lines | First line | Second line | Page-specific prohibitions |
|---|---|---|---|---|---|
| P1 | S01 | Exactly 2 | 5–6 | 7–8 | Second line must be strictly longer; Zhuote Qingyati at 156px; no font shrinking |
| P2 | S02 | Exactly 2 | 6–7 | 5–6 | Do not exceed capacity or break meaning |
| P3 | S06 | Exactly 2 | 5–6 | 5–6 | Do not exceed capacity or break meaning |
| P4 | S05 | Exactly 2 | 5–6 | 5–6 | Do not exceed capacity or break meaning |
| P5 | S03_G3.7-B_POSTER | Exactly 2 | 5–6 | 5–6 | Do not exceed capacity or break meaning |
| P6 | S10 | Exactly 2 | 5–6 | 5–6 | Do not exceed capacity or break meaning |
| P7 | S07 | Exactly 2 | 5–6 | 5–6 | Do not exceed capacity or break meaning |
| P8 | S12 | Exactly 2 | 5–6 | 5–6 | Do not exceed capacity or break meaning |

P2–P8 use the Swiss templates' default sans-serif typeface and do not inherit the P1 face. No title may evade the capacity gate through font shrinking, template changes, or hidden overflow. P1 semantic direction is likewise delegated to `小红书正文标题与P1封面标题配对规范_V1.0.md`.

## 3. P1-P8 page responsibilities

### Editorial

| Page | Responsibility |
|---|---|
| P1 | Strong-conflict cover: establish the first click reason, retain one concrete professional difficulty or core conflict, and use one hero image. |
| P2 | Real scene and visual evidence: prove that the issue exists through a real work process or strongest case image and establish professional resonance. |
| P3 | Core judgment and explanation: state one clear judgment, provide the reason or cause, and expand it in a split text-and-image layout. |
| P4 | Checklist, question, or key judgments: list checkpoints for one observation angle without imagery. The shared rule permits 4–5 items, but the final body and legal template fields determine the count. |
| P5 | Multi-image evidence wall: use a coherent 2×2 group of four images and four labels to present four aspects or evidence items one-to-one. |
| P6 | Stage conclusion and structured summary: summarize P2–P5, move from surface evidence to mechanism, and avoid repeating the P4 checklist. |
| P7 | Strong judgment and shareable statement: retain one judgment most worth saving or sharing and close with large type and generous whitespace. |
| P8 | Before/After close: show old versus new cognition or wrong versus right without introducing a new core point. |

### Swiss

Swiss search and recommendation modes share templates and page structures but use different content-adaptation semantics when extracting from the final body.

| Page | Shared structural responsibility | Search-solution content | Recommendation-conversion content |
|---|---|---|---|
| P1 | Problem and core-answer entry | State the search question and give the answer direction immediately | State what is recommended, for whom, and its core value |
| P2 | Scene or state comparison | Wrong belief versus actual cause | Ordinary choice versus reasoned choice |
| P3 | Three-step process | Core solution framework | Recommendation or screening framework |
| P4 | Three warning rows | Common blockers and execution pitfalls | Pitfalls and unsuitable audiences |
| P5 | Four dimensions plus image slot | Case or visual evidence | Real product, resource, case, or result |
| P6 | Six horizontal bars | Judgment indicators | Judgment dimensions |
| P7 | Three list items plus summary | Key conclusions or correction list | Use advice or conclusion list |
| P8 | Eight-cell matrix plus summary | Action matrix or saveable summary | Saveable matrix and natural product bridge |

## 4. Image slots

### Editorial

| Page | Images | Slot and dimensions | Restrictions |
|---|---:|---|---|
| P1 / M01 | 1 | `page.image.hero`, 904×565, 1.6:1, `cover`, focus `50% 62%` | Real and sourced, with subject inside the 10% safe boundary; no text poster; prefer professional state, silhouette, back, or hands; no front-facing portrait or exaggerated anxiety |
| P2 / M02 | 1 | `page.image.hero`, 904×638.625, about 1.42:1, focus `50% 58%` | Real desk or work scene; screens must be unreadable; no stock-business look |
| P3 / M03 | 1 | `page.image.hero`, 904×565, 1.6:1, focus `50% 50%` | Express judgment, comparison, choice, or tradeoff; do not repeat a generic computer-work scene |
| P5 / M06 | 4 | `page.image.item_01—04`, each 439×329.25, 4:3 | All four must share lighting, color temperature, grain, texture, and cropping logic, while carrying four separate aspects |
| P4 / P6 / P7 / P8 | 0 | None | Do not force imagery onto the page |

Editorial requires seven assets in total. Image 2.0 assets may not contain text, logos, watermarks, recognizable software UI, fake text, product names, Leo signatures, or page numbers, and Image 2.0 must not generate complete P1-P8 pages.

### Swiss

| Page | Images | Slot and dimensions | Restrictions |
|---|---:|---|---|
| P5 / S03_G3.7-B_POSTER | 1 | `page.image.hero`, 920×446.59375, about 2.06:1, `cover`, focus `50% 55%` | Sourced with subject inside the 10% safe boundary; text posters, people, and screenshots are allowed; a missing image stops the page and cannot be replaced with a color block or fabricated image |
| P1 / P2 / P3 / P4 / P6 / P7 / P8 | 0 | The specified image-slot contract declares no slots | Do not invent image slots |

Every declared image slot requires a minimum source resolution of 1080×1440, keeps template styling immutable, and must crop without losing the subject. During framework preview, the Swiss shared rule uses only a gray P5 placeholder and neither generates assets nor invokes Image 2.0.

## 5. English node rules

| Node group | Template, version, and page | Location in specified sources | Current fact |
|---|---|---|---|
| `INPUT / SYSTEM` | Swiss, S01, P1; page contract covers both `Swiss_search_solution` and `Swiss_recommendation` | P1/S01 `fixed_fields` in `P1-P8页面设计契约总表.json` | The template/page contract still records them as immutable fixed nodes. |
| `SOURCE / RENDER / SHARE` | Swiss, S06, P3; page contract covers search and recommendation modes | P3/S06 `fixed_fields` in `P1-P8页面设计契约总表.json`; the same page also contains `SOURCE / OUTPUT` | The template/page contract still records them as immutable fixed nodes. |
| `SENSE / JUDGE / ACT` | Swiss `V2_1_Swiss_Purple_QingYa`; P1 uses `SENSE → JUDGE`; P3 uses SENSE, JUDGE, ACT in three rows and `SENSE → JUDGE` at the bottom | Section 9, “Controlled English node vocabulary,” in Swiss shared rule V1.0 | The shared rule declares these current controlled nodes; `INPUT / OUTPUT` are temporarily unused and replaced by SENSE / JUDGE. |

These groups belong to specific Swiss template page nodes, not to Editorial or to the note type itself. The page design contract and Swiss shared rule conflict over the current displayed group; see conflict C2.

## 6. Account 2 final version

| Item | Confirmed result |
|---|---|
| Formal body status | `content_status: final` |
| Finalized at | `2026-09-05T22:37:23+0800` |
| Final title | `设计师审美提升难？每天20分钟分4步练` |
| Body source file SHA-256 | `17bd8f59aaba0c88e8ec333e2bfb67e15f6c2eaff0977359bcf28f80fb04f5e3` |
| Note type | Search solution, formal visual enum `search_solution` |
| Cover route | Swiss |
| Template library | `V2_1_Swiss_Purple_QingYa` |
| P1-P8 templates | S01, S02, S06, S05, S03_G3.7-B_POSTER, S10, S07, S12 |

The body file labels the title as 19 full characters. Direct counting under the full-character method stated by the Editorial rule yields 18 characters. This does not change the Swiss route but is input metadata conflict C5.

## 7. Conflict list

### C1: Shared title hard rules conflict with page design capacity

- Conflict: the shared rules specify exact line counts and per-line ranges. The page design contract records `recommended_lines: 2`, `max_lines: 3` for every title and different whole-field `max_chars`. For example, the Editorial P1 shared rule permits 11–13 full characters while the page contract caps Chinese at 10; Editorial P4 requires one line of six characters while the page contract recommends two lines, allows three, and caps at nine; Swiss P1 requires 5–6 plus 7–8 while the page contract caps the field at 13 and allows three lines.
- Files: `P1-P8页面设计契约总表.json`, Editorial shared rule V1.0, and Swiss shared rule V1.0.
- Human decision required: whether shared hard rules or measured page-capacity fields are authoritative for Workbench planning and acceptance. They must not be merged into an invented rule before that decision.

### C2: Swiss has two current English node sets

- Conflict: the page design contract fixes P1 to `INPUT / SYSTEM` and P3 to `SOURCE / RENDER / SHARE` plus `SOURCE / OUTPUT`. The Swiss shared rule changes P1 to `SENSE → JUDGE`, P3 to `SENSE / JUDGE / ACT`, and says `INPUT / OUTPUT` are temporarily unused. It does not explain why the page contract still contains the old nodes or state the migration status of `SYSTEM / SOURCE / RENDER / SHARE`.
- Files: `P1-P8页面设计契约总表.json` and Swiss shared rule V1.0.
- Human decision required: which layer must be synchronized among the formal template DOM, contract JSON, and current shared rule, and which group Workbench plans must emit.

### C3: Swiss search lacks a dedicated P5 image-slot declaration

- Conflict: the page design contract includes `page.image.hero` for both search and recommendation P5 pages, and the Swiss shared rule defines P5 as a shared structure with an image slot. The image-slot contract's only Swiss slot has `note_mode` set only to `Swiss_recommendation`, with no `Swiss_search_solution` declaration.
- Files: `P1-P8页面设计契约总表.json`, `P1-P8图片槽位契约.json`, and Swiss shared rule V1.0.
- Human decision required: whether search mode formally reuses the same P5 image slot and how the image-slot contract should express the shared scope.

### C4: Editorial P4 item count is not fully aligned

- Conflict: the Editorial shared rule permits four or five P4 items based on the final body and legal template fields, while the current P4/M05 page design contract requires five list fields.
- Files: `P1-P8页面设计契约总表.json` and Editorial shared rule V1.0.
- Human decision required: whether a formal four-item field fallback exists or current M05 always requires five items.

### C5: Account 2 declared title count differs from deterministic count

- Conflict: the formal body labels its title as 19 full characters; the title text has 18 characters under the full-character method in the specified Editorial shared rule.
- Files: the Account 2 `小红书笔记完整方案.md` and the full-character definition in Editorial shared rule V1.0.
- Human decision required: whether the cover content adapter records the source declaration or recalculates the count. It must not silently rewrite the source body.

## Execution boundaries

- Provider calls: 0
- Images generated: 0
- Code changes: 0
- Obsidian changes: 0
