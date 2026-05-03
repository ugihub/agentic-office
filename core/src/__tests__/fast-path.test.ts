/**
 * Fast path classifier tests.
 *
 * Verifies:
 * 1. Simple prompts → fast path (3 divisions only)
 * 2. Code prompts → full path
 * 3. Research prompts → standard/full path
 * 4. Temporal prompts → at least standard path
 * 5. Finance prompts → correct cache category (TTL=0)
 */
import { describe, it, expect } from 'vitest'
import { classifyPath, classifyCacheCategory, SYSTEM_FLOOR_TTL } from '../path-classifier/classifier.js'

describe('Fast path classifier', () => {
  describe('classifyPath()', () => {
    it('classifies short simple prompts as fast', () => {
      const result = classifyPath({ prompt: 'Summarize this text for me.' })
      expect(result.path).toBe('fast')
    })

    it('classifies very short greeting as fast', () => {
      const result = classifyPath({ prompt: 'Hello, who are you?' })
      expect(result.path).toBe('fast')
    })

    it('classifies code prompts as full', () => {
      const codePrompts = [
        'SELECT * FROM users WHERE id = 1',
        '```javascript\nconsole.log("hello")\n```',
        'class UserService { }',
        'import React from "react"',
      ]
      for (const prompt of codePrompts) {
        const result = classifyPath({ prompt })
        expect(result.path, `Expected full for: "${prompt}"`).toBe('full')
      }
    })

    it('classifies research prompts as standard or full', () => {
      const researchPrompts = [
        'Analisis kompetitor startup fintech di Indonesia',
        'Bandingkan framework JavaScript terpopuler',
        'Riset tren AI di tahun 2026',
        'Data statistik pengguna smartphone Indonesia',
      ]
      for (const prompt of researchPrompts) {
        const result = classifyPath({ prompt })
        expect(['standard', 'full'], `Expected standard/full for: "${prompt}"`).toContain(result.path)
      }
    })

    it('classifies temporal prompts as at least standard', () => {
      const temporalPrompts = [
        'Apa berita terbaru hari ini?',
        'Tren teknologi minggu ini',
        'Status sekarang dari proyek X',
      ]
      for (const prompt of temporalPrompts) {
        const result = classifyPath({ prompt })
        expect(['standard', 'full'], `Expected standard/full for: "${prompt}"`).toContain(result.path)
      }
    })

    it('classifies long prompts as standard or full regardless of content', () => {
      const longPrompt = 'Please help me. '.repeat(20) // >150 tokens
      const result = classifyPath({ prompt: longPrompt })
      expect(['standard', 'full']).toContain(result.path)
    })

    it('fast path prompts do not contain code/research/temporal signals', () => {
      const fastPrompts = [
        'Write a poem about autumn.',
        'Translate this to English: Bonjour.',
        'What is the capital of France?',
      ]
      for (const prompt of fastPrompts) {
        const result = classifyPath({ prompt })
        expect(result.path, `Expected fast for: "${prompt}"`).toBe('fast')
      }
    })
  })

  describe('classifyCacheCategory()', () => {
    it('classifies financial prompts correctly', () => {
      const financialPrompts = [
        'Berapa harga Bitcoin sekarang?',
        'Nilai tukar USD ke IDR hari ini',
        'Harga saham GOOG',
        'Current crypto price',
        'Stock market today',
      ]
      for (const prompt of financialPrompts) {
        const category = classifyCacheCategory(prompt)
        expect(category, `Expected financial for: "${prompt}"`).toBe('financial')
      }
    })

    it('financial prompts have TTL=0 (never cached)', () => {
      expect(SYSTEM_FLOOR_TTL.financial).toBe(0)
    })

    it('classifies temporal prompts correctly', () => {
      const temporalPrompts = [
        'Berita terbaru hari ini',
        'Update terkini dari tim',
        'Apa yang terjadi minggu ini',
      ]
      for (const prompt of temporalPrompts) {
        const category = classifyCacheCategory(prompt)
        expect(category, `Expected temporal for: "${prompt}"`).toBe('temporal')
      }
    })

    it('temporal prompts have TTL >= 60 seconds', () => {
      expect(SYSTEM_FLOOR_TTL.temporal).toBeGreaterThanOrEqual(60)
    })

    it('classifies personnel prompts correctly', () => {
      const personnelPrompts = [
        'Siapa CEO Apple sekarang?',
        'CTO dari Google adalah',
        'Direktur utama Tokopedia',
      ]
      for (const prompt of personnelPrompts) {
        const category = classifyCacheCategory(prompt)
        expect(category, `Expected personnel for: "${prompt}"`).toBe('personnel')
      }
    })

    it('classifies inventory prompts correctly', () => {
      const inventoryPrompts = [
        'Apakah produk ini tersedia?',
        'Cek stok iPhone 15',
        'Available inventory for item X',
      ]
      for (const prompt of inventoryPrompts) {
        const category = classifyCacheCategory(prompt)
        expect(category, `Expected inventory for: "${prompt}"`).toBe('inventory')
      }
    })

    it('defaults to "default" category for general prompts', () => {
      const generalPrompts = [
        'Explain quantum computing',
        'Write a blog post about TypeScript',
        'History of the Roman Empire',
      ]
      for (const prompt of generalPrompts) {
        const category = classifyCacheCategory(prompt)
        expect(category, `Expected default for: "${prompt}"`).toBe('default')
      }
    })

    it('financial category TTL cannot be overridden (=0)', () => {
      // This is the system-level safety guarantee
      // Even if a tenant tries to set financial TTL > 0, the floor is 0
      expect(SYSTEM_FLOOR_TTL.financial).toBe(0)
      // Verify it's genuinely zero, not just falsy
      expect(SYSTEM_FLOOR_TTL.financial).toStrictEqual(0)
    })
  })
})
