# ADR-001: BullMQ-only Message Bus (No RabbitMQ in MVP)

## Status

Accepted — 2026-05-03

## Context

Bureau membutuhkan message bus untuk komunikasi antar-divisi AI agent. Dua kandidat utama adalah:

- **BullMQ** (di atas Redis): job queue yang sudah terbukti, dengan retry, dead letter, dan stalled detection native
- **RabbitMQ**: AMQP broker dengan fitur fan-out, routing, dan multi-cluster yang lebih canggih

Pertanyaan yang memaksa keputusan ini: apakah kompleksitas tambahan RabbitMQ dibutuhkan untuk MVP dalam satu cluster?

## Options Considered

### Option 1: BullMQ-only (Redis-backed)

- Pro: Satu dependency lebih sedikit (Redis sudah ada untuk cache + rate limit)
- Pro: API sederhana, TypeScript-first, integrasi Vitest mudah
- Pro: `stalledInterval`, `lockDuration`, `maxStalledCount` menggantikan heartbeat custom
- Pro: Dead letter queue native (`removeOnFail: false`, separate failed queue)
- Pro: Queue per divisi mudah: `new Queue('bureau.ssc.hr')`, `new Queue('bureau.production')`
- Con: Tidak ada AMQP routing (exchange + binding)
- Con: Fan-out ke multiple consumer harus manual (iterate queues)
- Con: Cross-cluster broadcast membutuhkan workaround
- **Accepted** karena: semua divisi ada dalam satu cluster, fan-out belum dibutuhkan di MVP

### Option 2: RabbitMQ + BullMQ (keduanya)

- Pro: AMQP routing yang powerful
- Pro: Fan-out native via exchanges
- Con: **Dua sistem yang overlapping** — waste resource dan mental overhead
- Con: Dua infrastruktur yang harus di-maintain (port, auth, monitoring)
- Con: Dua client library, dua set connection pool
- **Rejected** karena: premature optimization. Tidak ada use case cross-cluster di MVP.

### Option 3: RabbitMQ-only

- Pro: AMQP standar industri
- Pro: Fan-out native
- Con: Harus tetap pakai Redis untuk cache dan rate limiting → tidak menghemat dependency
- Con: BullMQ job tracking (retry, delay, priority) harus re-implement manual
- Con: TypeScript experience lebih buruk dari BullMQ
- **Rejected** karena: Redis tetap dibutuhkan, jadi tidak ada penghematan infrastructure.

## Decision

Gunakan **BullMQ-only** di atas Redis untuk semua messaging antar-divisi di MVP. RabbitMQ tidak diinstall, tidak ada dalam docker-compose.yml.

## Consequences

### Diterima

- Satu Redis instance melayani BullMQ + cache + rate limit — efisien untuk MVP
- Outbox pattern tetap diperlukan untuk atomicity antara MongoDB write dan BullMQ enqueue
- Topology: satu queue per divisi (`bureau.ssc.hr`, `bureau.ssc.finance`, `bureau.production`, dll)
- Stalled detection via BullMQ native, bukan heartbeat custom ke MongoDB

### Trade-off yang disadari

- Fan-out ke multiple consumer harus dilakukan dengan iterate queue list — tidak se-elegant exchange
- Kalau Bureau berkembang ke multi-cluster deployment, RabbitMQ perlu dievaluasi ulang
- BullMQ tidak persistent jika Redis crash tanpa AOF — **wajib aktifkan `appendonly yes`**

## Implementation Notes

```typescript
// Queue topology yang digunakan
const QUEUES = {
  SSC_HR: "bureau.ssc.hr",
  SSC_FINANCE: "bureau.ssc.finance",
  SSC_COMPLIANCE: "bureau.ssc.compliance",
  SSC_IT: "bureau.ssc.it",
  RESEARCH: "bureau.research",
  PRODUCTION: "bureau.production",
  QA: "bureau.qa",
  MARKETING: "bureau.marketing",
  OUTBOX: "bureau.outbox",
  DEAD_LETTER: "bureau.dead-letter",
} as const;

// Worker config wajib di setiap Worker
const WORKER_CONFIG = {
  lockDuration: 60000, // 60s lock per job
  stalledInterval: 30000, // check stalled setiap 30s
  maxStalledCount: 2, // retry max 2x sebelum failed
} as const;
```

## When to Revisit

Keputusan ini perlu di-review kalau:

- [ ] Bureau perlu deploy ke lebih dari satu cluster (multi-region)
- [ ] Fan-out ke 10+ consumer per event menjadi requirement nyata
- [ ] BullMQ/Redis menjadi bottleneck di load test (>1000 job/detik)
- [ ] Ada requirement AMQP-compliance dari enterprise customer

## Known Unknowns saat keputusan dibuat

- Belum diketahui apakah future tenant dengan volume tinggi membutuhkan cross-cluster
- Belum diuji apakah BullMQ cukup untuk fan-out ke semua SSC agents secara simultan
- Redis AOF performance impact pada high-write workload belum di-benchmark
