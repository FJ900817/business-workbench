# Business Workbench UI Architecture V0.1

English | [中文](business-workbench-ui-architecture-v0.1.zh.md)

This document proposes a three-year product architecture for the Business Workbench UI for human review. It defines information organization, page responsibilities, data projection, and extension rules. It does not claim that these pages exist and does not authorize changes to current business workflows.

## 1. Product position

**Core position: Business Workbench is a multi-project operating system for auditable AI production. It organizes business truth, AI execution, human decisions, artifacts, and evidence into traceable, recoverable, and extensible production loops.**

It is not another chat entry. It addresses five production problems: scattered task identity and business truth, invisible execution state, missing human-control points, untraceable artifact versions and sources, and uncontrolled failure recovery.

| Compared product | Primary interaction | Business Workbench distinction |
|---|---|---|
| ChatGPT chat | Conversation-centered, with results primarily in message history | Centers projects, workflows, jobs, artifacts, and review evidence; conversation may be an entry but is not the business record |
| Coding agents such as Claude Code | Repositories and development tasks | Serves content, visual, consulting, and enterprise delivery work whose primary outputs are constrained business Artifacts rather than code diffs |
| General automation tools | Triggers, connectors, and step orchestration | Also governs business truth, human gates, lineage, bounded recovery, and auditable evidence |
| SaaS administration UI | Fixed forms and CRUD records | Organizes dynamic production lifecycles while preserving strict business constraints and human control |

The product unit is a traceable production task, not a conversation. Its value comes from visible state, verifiable output, explicit human decisions, and a controlled next step.

## 2. Information architecture

```text
Business Workbench
├─ Project layer
│  ├─ Home / Dashboard
│  ├─ Projects
│  │  ├─ Project Overview
│  │  ├─ Workflow Detail
│  │  └─ Project context and business-truth entry points
│  └─ Cross-project work queue
├─ Production-capability layer
│  ├─ Workflows
│  ├─ Review Center
│  ├─ Artifact Center
│  └─ Studios
│     ├─ Cover Studio
│     └─ Image Studio (reserved)
└─ System layer
   ├─ Runtime health and recovery
   ├─ Capability, template, and Runtime versions
   ├─ Integrations and Providers
   ├─ Gates, policy, and permissions
   └─ Audit and settings
```

The project layer answers who the work is for, what it should achieve, and where it is in production. The capability layer answers how work is executed, reviewed, and managed. The system layer identifies the controlled capabilities, health, rules, and evidence. These layers remain separate: a project does not own Renderer implementation, a Studio does not define business truth, and system settings do not replace project approval.

## 3. Primary navigation

V0.1 uses stable global left navigation, a project switcher, and a contextual top bar. Primary navigation does not contain channel-specific names such as Xiaohongshu notes or WeChat articles.

| Entry | Layer | Responsibility |
|---|---|---|
| Home | Project | Aggregate work awaiting review, blocks, active jobs, recent completion, and health signals |
| Projects | Project | Browse the project portfolio and enter a Project Overview |
| Workflows | Production capability | View running, human-waiting, failed, and completed Workflow / Job records across projects |
| Reviews | Production capability | Handle Reviews and Gates that require an explicit human decision |
| Artifacts | Production capability | Find, preview, and trace Artifacts, versions, SHA values, and lineage |
| Studios | Production capability | Enter Cover Studio and reserve space for Image Studio and later specialist workspaces |
| System | System | Inspect health, capability versions, integrations, policy, and audit; collapsed by default for production users |

The project switcher changes scope, not page type. Users can enter work from a global queue or view the same page filtered to one project.

## 4. Page map and responsibilities

### PAGE 1: Dashboard

The Dashboard answers what needs attention today; it is not a vanity analytics screen. The first view prioritizes work awaiting review, Gate blocks, active tasks, recently completed artifacts, and runtime health. Every item shows current state, reason, responsible stage or person, and the available next step.

Grok Bot can summarize production state here, but it does not create a separate chat stream or replace the original status and evidence.

### PAGE 2: Project Overview

Project Overview presents project identity, business objective, enabled production capabilities, current production period, major workflows, review queue, and recent artifacts. A project may be a Xiaohongshu virtual product, a WeChat content factory, or a B2B consulting engagement without changing the page frame.

Channel-specific content enters through capability cards and workflow definitions. The page references the source of business truth instead of copying another truth set into the UI.

### PAGE 3: Workflow Detail

Workflow Detail is the primary lifecycle view for one production task. A timeline or node graph shows Workflow, Job, Attempt, Gate, Review, and Artifact relationships while emphasizing the current node, inputs, outputs, failure reason, recovery eligibility, and next step.

The default surface uses business language. Execution parameters, Runtime versions, request hashes, and SHA evidence live in an Evidence Context Panel. Failure remains visible and a retry or revision never appears as an overwrite of the failed result.

### PAGE 4: Review Center

Review Center is the formal human-control surface. It provides a review queue, locked source identity, version comparison, constraint results, review comments, and explicit decisions. A review binds its source Job, Attempt, Artifact SHA, and Review type.

Approval cannot be implied by a chat reply. Approve, request changes, block, and reject are explicit, auditable, bounded decisions, and the UI states which next node the decision unlocks or blocks.

### PAGE 5: Artifact Center

Artifact Center manages production outputs rather than generic files. Each Artifact Card presents type, project, source task, version, state, creation time, SHA, preview capability, lineage, and promotion eligibility.

Artifact details can preview files, images, Markdown, Output Bundles, Renderer results, and prior versions. Deletion, overwrite, and promotion are separate controlled actions. V0.1 emphasizes read-only tracing and preview.

### PAGE 6: Cover Studio

Cover Studio presents the deterministic handoff from final body to cover: final body, `title_pair_contract`, template route, Cover Plan, P1-P8 pages, image slots, Renderer results, Gates, and Baseline comparison.

Swiss and Editorial are template families and route results, not separate products. The Studio cannot let AI freely change a template sequence and does not generate image material. It consumes selected assets and invokes the Certified Cover Renderer for stable composition.

### PAGE 7: Image Studio (reserved)

Image Studio creates and selects material. It will cover requirement parsing, Prompt versions, multi-model generation, candidate comparison, human selection, and asset-library retention. Its formal output is an approved image Artifact with lineage, consumed by Cover Studio and the Renderer.

Image Studio is not the Renderer. The first manages generative uncertainty and human choice; the second produces deterministic final pages from fixed templates, fields, and selected assets. Their handoff binds a material task, slot identity, file SHA, and approval state.

## 5. Extensible project model

A future WeChat project reuses Dashboard, Project Overview, Workflow Detail, Review Center, Artifact Center, system views, Grok Bot states, and Job, Artifact, Review, and Gate components.

It adds only its workflow definitions, task contracts, article rules, long-form preview, and channel-specific Studios. Article Studio or Publishing Preview can register under Studios without introducing another global navigation system.

Extension follows three rules: a project declares enabled capabilities; capabilities expose data and actions through existing business services; and the UI Shell composes surfaces from the capability list. A channel must not change the generic meaning of Job, Artifact, Review, or Gate, and channel fields must not become global fields.

## 6. Data projection

The UI neither redefines business data nor writes persistence files directly. It reads query projections from current services and invokes existing controlled commands for actions.

| Existing business object | UI representation | Primary surfaces |
|---|---|---|
| Project | Project context, objective, capability, and production state | Dashboard, Project Overview |
| Workflow | Production definition and instance progress | Project Overview, Workflow Detail |
| Job | Production work with one explicit identity | Dashboard, Workflows, Workflow Detail |
| Attempt | One immutable execution and result | Workflow Detail, Evidence Panel |
| Artifact | Previewable and traceable production output | Artifact Center, Review Center, Studios |
| Review | Human judgment, feedback, and approval scope | Review Center, Workflow Detail |
| Gate | Deterministic eligibility for the next stage | Global Status, Workflow Detail, Studios |
| Renderer Result | Page PNGs, manifests, validation, and Runtime identity | Cover Studio, Artifact Center |
| Baseline / Contract identity | Regression reference and acceptance basis | Cover Studio, System, Evidence Panel |

Lists and dashboards may use read-only indexes for retrieval, but an index is not a new source of truth. The UI does not infer Gate success from appearance, infer approval from file existence, or treat a frontend draft as an Artifact.

## 7. AI Mascot: Grok Bot

The already approved Grok Bot identity is retained without redesign. Its formal role is **AI Workbench Assistant / Digital Operator**: make system state easier to understand and draw attention to exceptions and next steps without becoming a chatbot or decision agent.

| State | Meaning | Typical placement |
|---|---|---|
| `idle` | No urgent item and useful work is available | Dashboard empty state, Project Overview |
| `thinking` | An AI Job is active; show its stage, not fabricated progress | Current Workflow node |
| `awaiting_review` | System work is complete and awaits a human decision | Dashboard, Review Center |
| `alert` | An exception needs attention but remains actionable | Project card, Workflow Detail |
| `blocked` | A Gate has stopped progression and exposes the reason | Workflow and Studio acceptance areas |
| `success` | A bounded stage completed; this does not imply project completion | Completion feedback, Artifact results |

The mascot supplements status text and never replaces a status label, error reason, or review action. Critical approvals minimize animation and emotional expression. Every state has text and accessibility labels and never relies on color or expression alone.

## 8. Visual design system direction

The design language is a quiet creative operations space. Content and artifacts remain primary while light visual hierarchy communicates production state, avoiding the dense tables of ERP products and the appearance of a technical console.

- Canvas: warm low-contrast neutrals with clear detail and preview layers and limited shadow.
- Color: brand purple for focus and active AI work, green only for verified results, amber for attention, and red for blocks or destructive actions.
- Typography: clear headings, comfortable prose, and monospace technical evidence with an explicit hierarchy between business content and engineering evidence.
- Density: restrained initial views with progressive disclosure through Context Panels and Evidence Drawers instead of exhaustive tables.
- Preview: Markdown, image, and page artifacts receive substantial canvas area with metadata organized around them.
- Motion: only communicates state change, node progression, and panel relationships; it is brief, optional, and never pretends to show real progress.

The system borrows Linear's state clarity, Notion's content space, Figma's object-property relationship, and Raycast's action speed without copying any one appearance. Its identity comes from the combination of production timeline, Artifact preview, and Evidence Context.

## 9. Component system and layout rules

Global components include `Card`, `Status`, `Timeline`, `Preview`, `Review Block`, `Artifact Card`, `Workflow Node`, `Gate Row`, `Diff View`, and `Evidence Drawer`. They express stable business concepts and contain no Xiaohongshu-specific fields. Cover Page Grid and Image Candidate Grid are Studio-specific composites.

Pages use four regions: global navigation on the left, project and environment context on top, the main workspace in the center, and a collapsible Context Panel on the right.

- Detail pages serve objects needing a stable URL, deep lifecycle, or shareable context, including Jobs, Artifacts, and Reviews.
- The right panel exposes sources, Gates, metadata, and lightweight actions without leaving the current work.
- Modals are limited to short confirmations, one bounded choice, and destructive-action review. Long reviews, diffs, lineage, and failure diagnosis never use modals.
- Two- or three-column layouts support source-candidate-review tasks that require simultaneous comparison. Mobile V0.1 supports read-only inspection and does not promise full production operation.

## 10. Phase-one development scope

After human approval, phase one builds only the generic UI frame needed by the validated business chain: application Shell and project switcher, Dashboard, Project Overview, Workflow Detail, Review Center, Artifact Center, read-only Cover Studio evidence and preview, and an Image Studio placeholder with interface responsibilities.

The Xiaohongshu virtual product becomes the first Project Adapter while pages retain the generic Project, Workflow, Job, Artifact, Review, and Gate vocabulary. Phase one excludes a free-form workflow builder, image-model integration, publishing integrations, changes to Business Workbench data contracts, and an open-ended Grok Bot chat surface.

Acceptance focuses on whether users can understand why a task has its current state, find its inputs, output, review, and failure evidence, make a bounded human decision in the correct place, and avoid creating any new business truth through UI display.

## 11. Extension roadmap

| Stage | Goal | Main increment |
|---|---|---|
| V0.1 | Visible, reviewable, traceable | Generic Shell, seven core pages, Xiaohongshu adapter, read-only Cover Studio |
| V0.2 | Controlled action and material loop | Bounded actions, promotion, Image Studio, multi-model candidates, and material selection |
| V0.3 | Validate a second business domain | WeChat Project Adapter, long-form content and publishing preview, and measured page/component reuse |
| V1 | Multi-project production platform | Capability registration, cross-project queues, role permissions, policy configuration, and project templates |
| Three-year direction | Enterprise AI production workbench | Portfolio views, cross-project asset reuse, governance and audit, enterprise delivery, and a pluggable Studio ecosystem |

Each expansion should add a Project Adapter, Workflow definition, or Studio capability first. Global information architecture changes only when a generic business object truly changes.

## 12. Human decisions before development

Development starts only after five product decisions are confirmed: the core position; the seven primary navigation entries; the project switcher as a global scope control; Review Center as the sole formal human-decision surface; and the stated separation between Image Studio and Renderer. No page, component, action, or data binding is created before approval.
