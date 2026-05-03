import { describe, it, expect, vi } from 'vitest'
import {
  ok,
  err,
  tryAsync,
  trySync,
  mapOk,
  mapErr,
  andThen,
  unwrapOrThrow,
  collectResults,
  type Result,
} from '../result.js'

describe('Result<T, E>', () => {
  describe('ok()', () => {
    it('creates a success result', () => {
      const result = ok(42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(42)
      }
    })

    it('accepts any value type', () => {
      const str = ok('hello')
      const obj = ok({ id: 'task_123', value: 99 })
      const arr = ok([1, 2, 3])
      expect(str.ok).toBe(true)
      expect(obj.ok).toBe(true)
      expect(arr.ok).toBe(true)
    })
  })

  describe('err()', () => {
    it('creates a failure result', () => {
      const error = new Error('something failed')
      const result = err(error)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe(error)
      }
    })

    it('accepts non-Error error types', () => {
      const result = err('string error')
      expect(result.ok).toBe(false)
    })
  })

  describe('tryAsync()', () => {
    it('wraps a resolved promise as ok', async () => {
      const result = await tryAsync(async () => 42)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(42)
    })

    it('wraps a thrown Error as err', async () => {
      const result = await tryAsync(async () => {
        throw new Error('async failure')
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('async failure')
    })

    it('converts non-Error throws to Error', async () => {
      const result = await tryAsync(async () => {
        throw 'string thrown'
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBeInstanceOf(Error)
    })
  })

  describe('trySync()', () => {
    it('wraps a sync value as ok', () => {
      const result = trySync(() => 42)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(42)
    })

    it('wraps a thrown Error as err', () => {
      const result = trySync(() => {
        throw new Error('sync failure')
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('sync failure')
    })
  })

  describe('mapOk()', () => {
    it('transforms the value of a success result', () => {
      const result = mapOk(ok(5), (x) => x * 2)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(10)
    })

    it('does not call fn on error', () => {
      const fn = vi.fn()
      const result = mapOk(err(new Error('nope')) as Result<number, Error>, fn)
      expect(result.ok).toBe(false)
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('mapErr()', () => {
    it('transforms the error of a failure result', () => {
      const result = mapErr(err('original'), (e) => new Error(e))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('original')
    })

    it('does not call fn on success', () => {
      const fn = vi.fn()
      mapErr(ok(42) as Result<number, string>, fn)
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('andThen()', () => {
    it('chains success results', () => {
      const result = andThen(ok(5), (x) => ok(x * 2))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(10)
    })

    it('short-circuits on error', () => {
      const fn = vi.fn(() => ok(99))
      const result = andThen(err(new Error('stop')) as Result<number, Error>, fn)
      expect(result.ok).toBe(false)
      expect(fn).not.toHaveBeenCalled()
    })

    it('propagates error from chained function', () => {
      const result = andThen(ok(5), (_x) => err(new Error('inner failure')))
      expect(result.ok).toBe(false)
    })
  })

  describe('unwrapOrThrow()', () => {
    it('returns the value on success', () => {
      expect(unwrapOrThrow(ok(42))).toBe(42)
    })

    it('throws the error on failure', () => {
      const error = new Error('boom')
      expect(() => unwrapOrThrow(err(error))).toThrow('boom')
    })

    it('wraps non-Error errors in Error', () => {
      expect(() => unwrapOrThrow(err('string error'))).toThrow('string error')
    })
  })

  describe('collectResults()', () => {
    it('collects all success values', () => {
      const results = [ok(1), ok(2), ok(3)]
      const collected = collectResults(results)
      expect(collected.ok).toBe(true)
      if (collected.ok) expect(collected.value).toEqual([1, 2, 3])
    })

    it('fails fast on first error', () => {
      const results = [ok(1), err(new Error('fail')), ok(3)]
      const collected = collectResults(results)
      expect(collected.ok).toBe(false)
    })

    it('handles empty array', () => {
      const collected = collectResults([])
      expect(collected.ok).toBe(true)
      if (collected.ok) expect(collected.value).toEqual([])
    })
  })
})
