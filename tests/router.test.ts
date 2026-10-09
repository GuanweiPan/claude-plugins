import type { AgentSpawnInput, CommandRunInput, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { decide, parseVerdict } from '../hooks/route.ts'

const PARENT = 'claude-fable-5-1'
const USAGE = {
  input_tokens: 300,
  output_tokens: 12,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

// Stands in for the engine beneath the plugin: a classifier that replies
// `reply` (or fails), and a spawn that records what it was asked to start.
function world(on: On, reply: string | 'api-error' | 'throw') {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 9) })
  const spawned: AgentSpawnInput[] = []
  let classified = 0

  on('model.complete', async () => {
    classified++
    if (reply === 'throw') throw new Error('network down')
    if (reply === 'api-error') {
      return {
        value: {
          isAnswered: false,
          reason: 'api-error',
          status: 529,
          error: 'overloaded',
          usage: USAGE,
        },
      } as const
    }
    return { value: { isAnswered: true, text: reply, usage: USAGE } } as const
  })
  on('session.model', async () => ({ value: PARENT }))
  on('agent.spawn', async (_$, e) => {
    spawned.push(e)
    return { model: e.model ?? e.parentModel ?? PARENT, agentId: `a${spawned.length}` }
  })

  return { spawned, classified: () => classified }
}

// The kit's `$` takes the call's own arguments; the engine fills the rest.
type SpawnArgs = Pick<AgentSpawnInput, 'prompt' | 'description' | 'subagentType'> & {
  model?: string
}
const spawn = ($: Engine, args: SpawnArgs) => $.agent.spawn(args as AgentSpawnInput)

const BRIEF: SpawnArgs = {
  prompt: 'Find every file under src/ that imports lodash and list the paths.',
  description: 'Find lodash imports',
  subagentType: 'general-purpose',
}

describe('agent.spawn routing', () => {
  test('routes a confident small verdict to sonnet', async ($, on) => {
    const w = world(on, '{"tier":"small","confidence":0.82}')
    const res = await spawn($, BRIEF)
    expect(w.spawned[0]?.model).toBe('sonnet')
    expect(res.model).toBe('sonnet')
  })

  test('routes a confident light verdict to haiku', async ($, on) => {
    const w = world(on, '{"tier":"light","confidence":0.9}')
    await spawn($, BRIEF)
    expect(w.spawned[0]?.model).toBe('haiku')
  })

  test('low confidence inherits the session model', async ($, on) => {
    const w = world(on, '{"tier":"light","confidence":0.3}')
    await spawn($, BRIEF)
    expect(w.spawned[0]?.model).toBeUndefined()
  })

  test('top is never assigned', async ($, on) => {
    const w = world(on, '{"tier":"top","confidence":0.95}')
    await spawn($, BRIEF)
    expect(w.spawned[0]?.model).toBeUndefined()
  })

  test('a model set by the brief is left alone and not classified', async ($, on) => {
    const w = world(on, '{"tier":"light","confidence":0.9}')
    await spawn($, { ...BRIEF, model: 'opus' })
    expect(w.spawned[0]?.model).toBe('opus')
    expect(w.classified()).toBe(0)
  })

  test('agent types outside the list are left alone', async ($, on) => {
    const w = world(on, '{"tier":"light","confidence":0.9}')
    await spawn($, { ...BRIEF, subagentType: 'my-reviewer' })
    expect(w.classified()).toBe(0)
  })

  test('fails open on an odd answer', async ($, on) => {
    const w = world(on, 'I think this is a small task.')
    await spawn($, BRIEF)
    expect(w.spawned[0]?.model).toBeUndefined()
  })

  test('fails open on an API error', async ($, on) => {
    const w = world(on, 'api-error')
    await spawn($, BRIEF)
    expect(w.spawned.length).toBe(1)
    expect(w.spawned[0]?.model).toBeUndefined()
  })

  test('fails open when the classifier throws', async ($, on) => {
    const w = world(on, 'throw')
    await spawn($, BRIEF)
    expect(w.spawned.length).toBe(1)
    expect(w.spawned[0]?.model).toBeUndefined()
  })

  test('disabled leaves every spawn as written', { options: { enabled: false } }, async ($, on) => {
    const w = world(on, '{"tier":"light","confidence":0.9}')
    await spawn($, BRIEF)
    expect(w.classified()).toBe(0)
  })

  test('the command reports what was logged', async ($, on) => {
    world(on, '{"tier":"small","confidence":0.8}')
    on('command.run', async () => ({ text: 'core' }))
    await spawn($, BRIEF)
    const out = await $.command.run({ command: 'tier-router', args: '' } as CommandRunInput)
    expect(out.text).toContain('routed 1')
    expect(out.text).toContain('small 1')
  })
})

describe('pure logic', () => {
  const cfg = { light: 'haiku', small: 'sonnet', mid: 'opus', minConfidence: 0.5 }

  test('never raises above the parent family', () => {
    expect(decide({ tier: 'mid', confidence: 0.9 }, 'claude-opus-5-5', cfg).action).toBe('inherit')
    expect(decide({ tier: 'mid', confidence: 0.9 }, 'claude-sonnet-5-5', cfg).action).toBe(
      'inherit',
    )
    expect(decide({ tier: 'light', confidence: 0.9 }, 'claude-sonnet-5-5', cfg)).toEqual({
      action: 'route',
      model: 'haiku',
      reason: 'light @ 0.9',
    })
  })

  test('an unknown parent model is left alone', () => {
    expect(decide({ tier: 'light', confidence: 0.9 }, 'my-gateway-model', cfg).action).toBe(
      'inherit',
    )
  })

  test('parses only well-formed verdicts', () => {
    expect(parseVerdict('```json\n{"tier":"mid","confidence":0.7}\n```')).toEqual({
      tier: 'mid',
      confidence: 0.7,
    })
    expect(parseVerdict('{"tier":"huge","confidence":0.7}')).toBeUndefined()
    expect(parseVerdict('{"tier":"mid","confidence":7}')).toBeUndefined()
    expect(parseVerdict('nope')).toBeUndefined()
  })
})
