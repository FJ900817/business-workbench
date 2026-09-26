/** `sidebar` namespace dictionaries: shell controls (brand row, New Session, fold toggle). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
  'toggle.open': '打开侧边栏',
  'toggle.collapse': '收起侧边栏',
  'workspace.panel': 'AI Workspace 一级入口',
  'workspace.heading': 'AI Workspace',
  'workspace.command': '总控',
  'workspace.projects': '项目',
  'workspace.work': '工作台',
  'workspace.studios': '创作工作室',
  'workspace.radar': '资讯雷达',
  'harness.more': '更多能力',
  'harness.workspace': '工作区',
  'harness.workspace.note': '浏览器在下方',
  'harness.workspace.hint': '原生 Workspace 与 Session 浏览器',
  'harness.jobs': '任务看板',
  'harness.jobs.hint': '任务状态由会话内的后台任务入口展示',
  'harness.ssh': 'SSH',
  'harness.ssh.hint': '通过对话中的终端工具使用',
  'harness.skills': '技能中心',
  'harness.skills.hint': 'Skills 通过输入建议与设置能力提供',
} satisfies Record<string, string>

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'workspace.panel': 'AI Workspace navigation',
  'workspace.heading': 'AI Workspace',
  'workspace.command': 'Overview',
  'workspace.projects': 'Portfolio',
  'workspace.work': 'Production',
  'workspace.studios': 'Creative',
  'workspace.radar': 'Signals',
  'harness.more': 'More tools',
  'harness.workspace': 'Workspaces',
  'harness.workspace.note': 'Browser below',
  'harness.workspace.hint': 'Native Workspace and Session browser',
  'harness.jobs': 'Task board',
  'harness.jobs.hint': 'Background task status is shown inside a Session',
  'harness.ssh': 'SSH',
  'harness.ssh.hint': 'Use through the terminal tool in a conversation',
  'harness.skills': 'Skills center',
  'harness.skills.hint': 'Skills are available through input suggestions and settings',
} satisfies Record<SidebarKey, string>
