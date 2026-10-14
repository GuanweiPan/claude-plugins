import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import {
  buildPrompt,
  decide,
  parseList,
  parseVerdict,
  RUBRIC,
  type RouterConfig,
  type Verdict,
} from './route.ts'

const LOG_KEY = 'tier-router:log'
const LOG_LIMIT = 500
const COMMAND = 'tier-router'

type LogEntry = {
  at: number
  agentType: string
  description: string
  parentModel: string
  verdict?: Verdict
  outcome: 'routed' | 'inherited' | 'preset' | 'failed-open'
  reason: string
  model?: string
}

type Settings = RouterConfig & {
  enabled: boolean
  classifierModel: string
  agentTypes: string[]
  announce: boolean
  timeoutMs: number
}

function readSettings(options: PluginOptions): Settings {
  const str = (key: string, fallback: string) =>
    typeof options[key] === 'string' && options[key] !== '' ? (options[key] as string) : fallback
  const num = (key: string, fallback: number) =>
    typeof options[key] === 'number' ? (options[key] as number) : fallback
  const bool = (key: string, fallback: boolean) =>
    typeof options[key] === 'boolean' ? (options[key] as boolean) : fallback

  return {
    enabled: bool('enabled', true),
    classifierModel: str('classifierModel', 'haiku'),
    light: str('lightModel', 'haiku'),
    small: str('smallModel', 'sonnet'),
    mid: str('midModel', 'opus'),
    minConfidence: num('minConfidence', 0.5),
    agentTypes: parseList(str('agentTypes', 'general-purpose,claude,Explore,Plan')),
    announce: bool('announce', true),
    timeoutMs: num('timeoutMs', 8000),
  }
}

async function appendLog($: EngineInterface, entry: LogEntry): Promise<void> {
  try {
    const prev = await $.store.get(LOG_KEY)
    const list = Array.isArray(prev) ? (prev as LogEntry[]) : []
    await $.store.set(LOG_KEY, [...list, entry].slice(-LOG_LIMIT))
  } catch {
    // Logging must never affect a spawn.
  }
}

function announce($: EngineInterface, on: boolean, toolUseId: string, text: string): void {
  if (!on || !toolUseId) return
  try {
    $.ui.notice(toolUseId, `tier-router: ${text}`)
  } catch {
    // The dialog may already be closed; nothing to show.
  }
}

function summarize(list: LogEntry[]): string {
  if (list.length === 0) return 'tier-router: no delegations logged yet.'
  const count = (pred: (e: LogEntry) => boolean) => list.filter(pred).length
  const byTier = (['light', 'small', 'mid', 'top'] as const)
    .map(t => `${t} ${count(e => e.verdict?.tier === t)}`)
    .join(' · ')
  const lines = [
    `tier-router: ${list.length} delegations logged`,
    `  routed ${count(e => e.outcome === 'routed')} · inherited ${count(e => e.outcome === 'inherited')} · preset ${count(e => e.outcome === 'preset')} · failed open ${count(e => e.outcome === 'failed-open')}`,
    `  verdicts: ${byTier}`,
    '  last 10:',
    ...list.slice(-10).map(e => {
      const when = new Date(e.at).toISOString().slice(5, 16).replace('T', ' ')
      const tier = e.verdict ? `${e.verdict.tier}@${e.verdict.confidence}` : '-'
      return `    ${when}  ${e.agentType.padEnd(16)} ${tier.padEnd(10)} ${e.outcome.padEnd(11)} ${e.model ?? ''}  ${e.description}  (${e.reason})`
    }),
  ]
  return lines.join('\n')
}

export const register: Register = (on, options) => {
  const cfg = readSettings(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show the delegation tier router log (args: clear)',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      await $.store.delete(LOG_KEY)
      return { text: 'tier-router: log cleared.' }
    }
    const list = await $.store.get(LOG_KEY)
    return { text: summarize(Array.isArray(list) ? (list as LogEntry[]) : []) }
  }).catch(() => ({ text: 'tier-router: could not read the log.' }))

  on('agent.spawn', async ($, e, next) => {
    if (!cfg.enabled) return next(e)
    // Forks always inherit, workflow agents cannot be rewritten, and
    // teammates are long-lived: leave all three alone.
    if (e.fork || e.workflow || e.isTeammate) return next(e)
    // Only route types whose definitions carry no model of their own.
    if (!cfg.agentTypes.includes(e.subagentType)) return next(e)

    // parentModel is what `inherit` resolves to; fall back to the session's.
    const parentModel = e.parentModel || (await $.session.model())
    const base = {
      at: await $.clock.now(),
      agentType: e.subagentType,
      description: e.description,
      parentModel,
    }

    // The orchestrator chose a model on purpose: respect it.
    if (e.model) {
      const res = await next(e)
      await appendLog($, {
        ...base,
        outcome: 'preset',
        reason: `brief set ${e.model}`,
        model: res.model,
      })
      return res
    }

    const reply = await $.model.complete({
      model: cfg.classifierModel,
      system: RUBRIC,
      prompt: buildPrompt(e.description, e.prompt),
      maxTokens: 64,
      effort: 'low',
      timeoutMs: cfg.timeoutMs,
    })
    const verdict = reply.isAnswered ? parseVerdict(reply.text) : undefined

    if (!verdict) {
      const reason = reply.isAnswered ? 'unparseable verdict' : `classifier ${reply.reason}`
      const res = await next(e)
      await appendLog($, { ...base, outcome: 'failed-open', reason, model: res.model })
      return res
    }

    const decision = decide(verdict, parentModel, cfg)
    if (decision.action === 'inherit') {
      const res = await next(e)
      await appendLog($, {
        ...base,
        verdict,
        outcome: 'inherited',
        reason: decision.reason,
        model: res.model,
      })
      return res
    }

    announce(
      $,
      cfg.announce,
      e.tool_use_id,
      `${verdict.tier} → ${decision.model} (${verdict.confidence})`,
    )
    const res = await next({ ...e, model: decision.model })
    await appendLog($, {
      ...base,
      verdict,
      outcome: 'routed',
      reason: decision.reason,
      model: res.model,
    })
    return res
  }).catch(($, e, next) => next(e)) // Fail open: any error leaves the spawn as written.
}
