import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  installP5FesBridgeWith,
  setCurrentP5Source,
  __resetP5FesBridgeForTests,
} from '../p5FesBridge'

// Fresh fake p5 constructor per test — static properties only, because
// that's all FES touches on the class. Avoids pulling the real `p5`
// module and its CJS `gifenc` transitive (which trips Vitest's ESM
// resolver — same reason P5VizRenderer.test.ts mocks `p5`).
const p5 = {} as Record<string, unknown>
const installP5FesBridge = (): void => installP5FesBridgeWith(p5)
import {
  subscribeLog,
  getLogHistory,
  __resetEngineLogForTests,
  type LogEntry,
} from '../../engine/engineLog'

type P5Static = {
  disableFriendlyErrors: boolean
  _fesLogger?: (msg: string) => void
}

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()))

beforeEach(() => {
  __resetEngineLogForTests()
  __resetP5FesBridgeForTests(p5)
})

describe('installP5FesBridge', () => {
  it('sets p5._fesLogger on first call and leaves disableFriendlyErrors off', () => {
    const ctor = p5 as unknown as P5Static
    expect(ctor._fesLogger).toBeUndefined()
    installP5FesBridge()
    expect(typeof ctor._fesLogger).toBe('function')
    expect(ctor.disableFriendlyErrors).toBe(false)
  })

  it('is idempotent — repeated calls do not replace the logger', () => {
    installP5FesBridge()
    const first = (p5 as unknown as P5Static)._fesLogger
    installP5FesBridge()
    const second = (p5 as unknown as P5Static)._fesLogger
    expect(second).toBe(first)
  })

  it('routes FES messages through emitLog with runtime=p5, level=warn', async () => {
    installP5FesBridge()
    const spy = vi.fn<[LogEntry | null, readonly LogEntry[]], void>()
    subscribeLog(spy)
    ;(p5 as unknown as P5Static)._fesLogger?.(
      '\n🌸 p5.js says: Did you mean `ellipse`?',
    )
    await flush()
    expect(spy).toHaveBeenCalled()
    const [entry] = spy.mock.calls[0]
    expect(entry?.runtime).toBe('p5')
    expect(entry?.level).toBe('warn')
    expect(entry?.message).toBe('Did you mean `ellipse`?')
  })

  it('strips the "🌸 p5.js says:" translation prefix', () => {
    installP5FesBridge()
    ;(p5 as unknown as P5Static)._fesLogger?.(
      '   🌸 p5.js says: parameter #0 looks off.',
    )
    const last = getLogHistory().at(-1)
    expect(last?.message).toBe('parameter #0 looks off.')
  })

  it('accepts messages without the prefix verbatim', () => {
    installP5FesBridge()
    ;(p5 as unknown as P5Static)._fesLogger?.('plain message')
    const last = getLogHistory().at(-1)
    expect(last?.message).toBe('plain message')
  })

  it('drops empty / whitespace-only FES messages', () => {
    installP5FesBridge()
    ;(p5 as unknown as P5Static)._fesLogger?.('\n🌸 p5.js says:   ')
    expect(getLogHistory()).toHaveLength(0)
  })
})

describe('setCurrentP5Source', () => {
  it('stamps the source onto subsequent FES log entries', () => {
    installP5FesBridge()
    setCurrentP5Source('patterns/piano-roll.p5')
    ;(p5 as unknown as P5Static)._fesLogger?.(
      '🌸 p5.js says: forgot to call noFill()',
    )
    const last = getLogHistory().at(-1)
    expect(last?.source).toBe('patterns/piano-roll.p5')
  })

  it('omits source when cleared', () => {
    installP5FesBridge()
    setCurrentP5Source('a.p5')
    setCurrentP5Source(null)
    ;(p5 as unknown as P5Static)._fesLogger?.('🌸 p5.js says: anything')
    const last = getLogHistory().at(-1)
    expect(last?.source).toBeUndefined()
  })
})
