---
layout: post
title: Redis를 캐시로만 보면 놓치는 것들
description: >
  Redis의 자료구조, TTL과 eviction, Sentinel과 Cluster, Pub/Sub/List/Stream 큐 모델, Spring Boot에서 Lettuce를 사용할 때의 설정과 주의사항을 정리합니다.
tags: [redis, cache, spring-boot, lettuce, nosql, message-queue]
sitemap: false
---

# Redis를 캐시로만 보면 놓치는 것들

Redis를 처음 만나면 보통 이렇게 기억한다.

> 메모리에 올려두는 빠른 cache.

틀린 말은 아니다. 하지만 Redis를 cache로만 보면 중요한 부분을 많이 놓친다. Redis는 단순 key-value cache라기보다, 메모리 위에서 동작하는 data structure server에 가깝다. 문자열 하나를 저장하는 것뿐 아니라 Hash, List, Set, Sorted Set, Stream 같은 자료구조를 명령어 단위로 조작한다.

그래서 Redis를 잘 쓴다는 말은 두 가지를 같이 이해한다는 뜻이다.

```text
데이터를 어떻게 빨리 읽을 것인가
데이터가 많아지고 장애가 날 때 어떻게 버틸 것인가
```

<style>
.redis-visual {
  --redis-panel: rgba(255, 250, 242, .075);
  --redis-line: rgba(255, 250, 242, .18);
  --redis-ink: #fffaf2;
  --redis-muted: rgba(255, 250, 242, .7);
  --redis-red: #d98989;
  --redis-gold: #d8b16f;
  --redis-green: #8fbf9b;
  --redis-blue: #8fb4d9;
}

.redis-visual .redis-grid,
.redis-visual .redis-flow,
.redis-visual .redis-lanes,
.redis-visual .redis-note-grid {
  display: grid;
  gap: .65rem;
}

.redis-visual .redis-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.redis-visual .redis-lanes {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.redis-visual .redis-flow {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.redis-visual .redis-note-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.redis-visual .redis-card,
.redis-visual .redis-step,
.redis-visual .redis-note,
.redis-visual .redis-lane {
  min-width: 0;
  border: 1px solid var(--redis-line);
  border-radius: 6px;
  background: var(--redis-panel);
}

.redis-visual .redis-card,
.redis-visual .redis-note,
.redis-visual .redis-lane {
  padding: .72rem;
}

.redis-visual .redis-card-title,
.redis-visual .redis-step b,
.redis-visual .redis-note b,
.redis-visual .redis-lane b {
  display: block;
  color: var(--redis-ink);
}

.redis-visual .redis-card-title {
  margin-bottom: .48rem;
  font-size: .74rem;
}

.redis-visual .redis-card p,
.redis-visual .redis-step span,
.redis-visual .redis-note span,
.redis-visual .redis-lane span {
  display: block;
  margin: 0;
  color: var(--redis-muted);
  font-size: .64rem;
  line-height: 1.45;
}

.redis-visual .redis-step {
  position: relative;
  padding: .58rem .62rem;
}

.redis-visual .redis-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.redis-visual .redis-step b {
  font-size: .66rem;
}

.redis-visual .redis-step span {
  margin-top: .14rem;
}

.redis-visual .redis-path {
  margin: 0;
  padding: 0;
  list-style: none;
}

.redis-visual .redis-path li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: .5rem;
  min-width: 0;
  padding: .52rem .56rem;
  border: 1px solid rgba(255, 250, 242, .14);
  border-radius: 6px;
  background: rgba(8, 10, 17, .24);
}

.redis-visual .redis-path li + li {
  margin-top: .42rem;
}

.redis-visual .redis-path b {
  width: 1.35rem;
  height: 1.35rem;
  border: 1px solid rgba(255, 250, 242, .16);
  border-radius: 50%;
  color: var(--redis-ink);
  background: rgba(255, 250, 242, .08);
  font-size: .68rem;
  line-height: 1.35rem;
  text-align: center;
}

.redis-visual .redis-path strong,
.redis-visual .redis-path span {
  display: block;
}

.redis-visual .redis-path strong {
  color: var(--redis-ink);
  font-size: .68rem;
}

.redis-visual .redis-path span {
  color: var(--redis-muted);
  font-size: .62rem;
  line-height: 1.45;
}

.redis-visual code {
  color: var(--redis-ink);
  background: rgba(8, 10, 17, .32);
}

.redis-visual .redis-chip-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .4rem;
  margin-top: .55rem;
}

.redis-visual .redis-chip {
  padding: .35rem .3rem;
  border: 1px solid rgba(143, 180, 217, .35);
  border-radius: 5px;
  color: var(--redis-ink);
  background: rgba(143, 180, 217, .1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .58rem;
  line-height: 1.22;
  text-align: center;
}

.redis-visual .redis-chip[data-kind="hot"] {
  border-color: rgba(216, 177, 111, .68);
  background: rgba(216, 177, 111, .14);
}

.redis-visual .redis-chip[data-kind="danger"] {
  border-color: rgba(217, 137, 137, .68);
  background: rgba(217, 137, 137, .12);
}

.redis-compare-table {
  width: 100%;
  border: 1px solid rgba(143, 94, 60, .32);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 250, 242, .88) !important;
  font-size: .88rem;
}

.redis-compare-table th,
.redis-compare-table td {
  border: 0;
  border-bottom: 1px solid rgba(143, 94, 60, .22);
  color: var(--coffee-ink) !important;
  vertical-align: top;
}

.redis-compare-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
  font-weight: 700;
}

.redis-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

.redis-compare-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

.redis-compare-table tbody tr:last-child td {
  border-bottom: 0;
}

.redis-compare-table td:first-child {
  color: #4d2d1e !important;
  font-weight: 700;
}

body.dark-mode .redis-compare-table {
  background: rgba(9, 13, 22, .86) !important;
  border-color: rgba(231, 212, 189, .24) !important;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
}

body.dark-mode .redis-compare-table th {
  color: #fff4e5 !important;
  background: rgba(244, 234, 220, .12) !important;
}

body.dark-mode .redis-compare-table td {
  color: #ead8c3 !important;
  border-color: rgba(231, 212, 189, .18) !important;
}

body.dark-mode .redis-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .045) !important;
}

body.dark-mode .redis-compare-table tbody tr:nth-child(even) td {
  background: rgba(255, 250, 242, .074) !important;
}

@media screen and (prefers-color-scheme: dark) {
  body:not(.light-mode) .redis-compare-table {
    background: rgba(9, 13, 22, .86) !important;
    border-color: rgba(231, 212, 189, .24) !important;
    box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
  }

  body:not(.light-mode) .redis-compare-table th {
    color: #fff4e5 !important;
    background: rgba(244, 234, 220, .12) !important;
  }

  body:not(.light-mode) .redis-compare-table td {
    color: #ead8c3 !important;
    border-color: rgba(231, 212, 189, .18) !important;
  }

  body:not(.light-mode) .redis-compare-table tbody tr:nth-child(odd) td {
    background: rgba(255, 250, 242, .045) !important;
  }

  body:not(.light-mode) .redis-compare-table tbody tr:nth-child(even) td {
    background: rgba(255, 250, 242, .074) !important;
  }
}

body.light-mode .redis-compare-table {
  background: rgba(255, 250, 242, .88) !important;
  border-color: rgba(143, 94, 60, .32) !important;
  box-shadow: none !important;
}

body.light-mode .redis-compare-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
}

body.light-mode .redis-compare-table td {
  color: var(--coffee-ink) !important;
  border-color: rgba(143, 94, 60, .22) !important;
}

body.light-mode .redis-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

body.light-mode .redis-compare-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

body.light-mode .redis-compare-table td:first-child {
  color: #4d2d1e !important;
}

@media screen and (max-width: 56rem) {
  .redis-visual .redis-grid,
  .redis-visual .redis-flow,
  .redis-visual .redis-lanes,
  .redis-visual .redis-note-grid {
    grid-template-columns: 1fr;
  }

  .redis-visual .redis-step:not(:last-child)::after {
    content: "";
    left: 50%;
    right: auto;
    top: auto;
    bottom: -.45rem;
    width: 1px;
    height: .45rem;
    background: rgba(255, 250, 242, .3);
    transform: none;
  }

  .redis-visual .redis-chip-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<div class="gc-visual redis-visual" role="img" aria-label="Redis는 cache, session store, counter, lock, rate limit, event queue 등 여러 용도로 쓰이는 in-memory data structure server다">
  <div class="gc-visual__header">
    <strong>Redis를 쓰는 자리</strong>
    <span>빠른 cache 하나로 시작하지만, 실제 운영에서는 TTL, memory, persistence, topology까지 같이 설계해야 한다.</span>
  </div>
  <div class="redis-note-grid">
    <div class="redis-note"><b>Cache</b><span>DB 부하를 줄이고 read latency를 낮춘다.</span></div>
    <div class="redis-note"><b>Session</b><span>TTL이 있는 사용자 상태를 여러 서버가 공유한다.</span></div>
    <div class="redis-note"><b>Counter</b><span>조회수, rate limit, idempotency marker에 쓴다.</span></div>
    <div class="redis-note"><b>Queue</b><span>Pub/Sub, List, Stream으로 이벤트 흐름을 만든다.</span></div>
  </div>
</div>

## Redis는 자료구조 서버다

Redis의 기본 단위는 key다. 하지만 value는 단순 문자열만이 아니다.

<table class="redis-compare-table">
  <thead>
    <tr>
      <th>자료구조</th>
      <th>잘 맞는 용도</th>
      <th>조심할 점</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>String</td>
      <td>cache value, counter, token, flag</td>
      <td>큰 JSON을 통째로 저장하면 부분 갱신과 네트워크 비용이 커진다.</td>
    </tr>
    <tr>
      <td>Hash</td>
      <td>객체의 field 단위 저장, profile, 설정값</td>
      <td>field가 지나치게 많으면 한 key 안의 큰 collection이 된다.</td>
    </tr>
    <tr>
      <td>List</td>
      <td>간단한 FIFO/LIFO queue, blocking pop</td>
      <td>ack/retry/consumer group이 필요하면 Stream이 낫다.</td>
    </tr>
    <tr>
      <td>Set</td>
      <td>중복 없는 membership, tag, unique user set</td>
      <td>큰 set 연산은 single thread를 오래 붙잡을 수 있다.</td>
    </tr>
    <tr>
      <td>Sorted Set</td>
      <td>ranking, score 기반 range query, delayed job</td>
      <td>score 갱신이 잦고 크기가 크면 메모리와 CPU를 같이 쓴다.</td>
    </tr>
    <tr>
      <td>Stream</td>
      <td>append-only event log, consumer group</td>
      <td>trim, pending entries, retry 정책을 같이 설계해야 한다.</td>
    </tr>
  </tbody>
</table>

Redis가 빠른 이유는 대부분의 명령을 메모리에서 처리하고, event loop 중심으로 단순하게 실행하기 때문이다. 하지만 이 말은 반대로, 오래 걸리는 명령 하나가 다른 요청들을 밀어낼 수 있다는 뜻이기도 하다.

그래서 운영 Redis에서 제일 먼저 피해야 할 습관은 “큰 key를 만들고, 큰 명령을 아무렇지 않게 호출하는 것”이다.

```text
위험한 냄새가 나는 명령:
KEYS *
FLUSHALL
FLUSHDB
SAVE
큰 collection에 대한 전체 조회
큰 key에 대한 DEL
```

공식 문서도 `KEYS`는 production에서 극도로 조심해야 하고, 일반 애플리케이션 코드에서는 `SCAN`이나 별도 index set을 고려하라고 설명한다.

## TTL은 collection 내부가 아니라 key에 붙는다

Redis의 expire는 key 단위다.

```text
SET user:1:name "dngur"
EXPIRE user:1:name 60
```

이 key는 60초 뒤 만료될 수 있다. 하지만 Hash의 field 하나, List의 item 하나, Set의 member 하나에 개별 TTL이 붙는 것은 아니다.

```text
HSET user:1 name "dngur" age 20
EXPIRE user:1 60
```

이 경우 TTL은 `user:1`이라는 Hash key 전체에 적용된다. field별 TTL이 필요하다면 key를 더 잘게 나누거나, Sorted Set에 만료 timestamp를 score로 넣고 별도 정리 작업을 두는 식으로 설계를 바꿔야 한다.

TTL은 cache freshness를 다루는 도구이고, eviction은 memory pressure를 다루는 도구다. 둘은 비슷해 보이지만 목적이 다르다.

```text
TTL:
  시간이 지나면 사라져도 되는 데이터

eviction:
  maxmemory를 넘었을 때 무엇을 버릴지 정하는 정책
```

## maxmemory와 eviction policy

Redis가 `maxmemory`에 도달하면, 설정된 `maxmemory-policy`에 따라 key를 제거하거나 쓰기를 거부한다.

<div class="gc-visual redis-visual" role="img" aria-label="Redis eviction policy는 maxmemory 초과 시 allkeys 또는 volatile key 집합에서 LRU, LFU, random, TTL 기준으로 제거 대상을 고른다">
  <div class="gc-visual__header">
    <strong>Eviction은 TTL과 다르다</strong>
    <span>TTL은 시간이 기준이고, eviction은 메모리 압박이 기준이다.</span>
  </div>
  <div class="redis-lanes">
    <div class="redis-lane">
      <b>allkeys-*</b>
      <span>전체 keyspace에서 제거 후보를 고른다. 순수 cache라면 보통 이쪽이 단순하다.</span>
      <div class="redis-chip-row">
        <span class="redis-chip">allkeys-lru</span>
        <span class="redis-chip">allkeys-lfu</span>
        <span class="redis-chip">allkeys-random</span>
        <span class="redis-chip" data-kind="hot">cache only</span>
      </div>
    </div>
    <div class="redis-lane">
      <b>volatile-*</b>
      <span>TTL이 있는 key만 제거 후보가 된다. 영구 key와 임시 key를 섞는 설계에서 쓴다.</span>
      <div class="redis-chip-row">
        <span class="redis-chip">volatile-lru</span>
        <span class="redis-chip">volatile-lfu</span>
        <span class="redis-chip">volatile-ttl</span>
        <span class="redis-chip">volatile-random</span>
      </div>
    </div>
    <div class="redis-lane">
      <b>noeviction</b>
      <span>메모리를 넘으면 쓰기 명령이 실패한다. 데이터 손실보다 write failure가 낫다면 선택한다.</span>
      <div class="redis-chip-row">
        <span class="redis-chip" data-kind="danger">write error</span>
        <span class="redis-chip">read ok</span>
        <span class="redis-chip">strict memory</span>
        <span class="redis-chip">monitoring</span>
      </div>
    </div>
  </div>
</div>

순수 cache라면 `allkeys-lru`나 `allkeys-lfu`가 단순하다. TTL이 없는 cache key도 제거 후보가 되기 때문이다. 반대로 중요한 영구 key와 임시 key가 같은 Redis에 섞여 있다면 `volatile-*` 정책이 더 안전해 보일 수 있다. 다만 TTL 없는 key는 제거 후보가 아니므로, 메모리 압박이 왔을 때 정책이 기대대로 동작하는지 반드시 확인해야 한다.

`noeviction`은 key를 버리지 않는다. 대신 쓰기 명령이 에러를 반환할 수 있다. 캐시로 쓰는 Redis라면 장애 모드가 더 거칠어질 수 있고, source of truth처럼 쓰는 Redis라면 오히려 명시적 실패가 더 안전할 수 있다.

여기서 중요한 운영 감각이 하나 있다.

> Redis eviction은 정확한 전역 LRU/LFU가 아니라 샘플링 기반 근사 알고리즘이다.

그래서 `maxmemory-samples`를 키우면 더 정확한 후보를 고를 수 있지만, 그만큼 CPU 비용도 늘어난다.

## Persistence는 cache인지 data인지 먼저 정해야 한다

Redis는 in-memory로 동작하지만 디스크 persistence 옵션을 갖고 있다.

```text
RDB = 특정 시점 snapshot
AOF = write command log
No persistence = 재시작하면 사라져도 되는 cache
RDB + AOF = 둘을 함께 사용
```

RDB는 point-in-time snapshot이다. 파일이 작고 재시작이 빠른 편이지만, snapshot 사이에 장애가 나면 최근 데이터가 사라질 수 있다. AOF는 write operation을 log로 남기고 재시작 시 replay한다. 더 촘촘한 복구가 가능하지만 파일 크기, fsync 정책, rewrite 비용을 같이 봐야 한다.

Redis를 cache로만 쓴다면 persistence를 끄는 선택도 자연스럽다. 재시작 후 cache miss가 늘 뿐, 원본 DB에서 다시 채울 수 있기 때문이다.

반대로 session, idempotency key, rate limit counter, queue처럼 Redis 안의 데이터가 서비스 의미를 갖는다면 persistence와 replication을 반드시 같이 봐야 한다. “Redis가 빠르다”와 “Redis에 저장한 데이터가 반드시 안전하다”는 다른 문장이다.

## Sentinel과 Cluster는 해결하는 문제가 다르다

Sentinel과 Cluster는 둘 다 고가용성과 관련이 있지만, 같은 기능이 아니다.

<table class="redis-compare-table">
  <thead>
    <tr>
      <th>구분</th>
      <th>Sentinel</th>
      <th>Cluster</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>주요 목적</td>
      <td>Master 장애 감지와 failover</td>
      <td>Sharding과 failover</td>
    </tr>
    <tr>
      <td>데이터 분산</td>
      <td>기본적으로 하나의 master dataset</td>
      <td>16384 hash slot으로 keyspace 분산</td>
    </tr>
    <tr>
      <td>클라이언트 요구</td>
      <td>Sentinel을 통해 현재 master 발견</td>
      <td>Cluster-aware client가 slot redirect를 처리해야 함</td>
    </tr>
    <tr>
      <td>장애 판단</td>
      <td>SDOWN, ODOWN, quorum 개념</td>
      <td>노드 간 gossip, majority, replica promotion</td>
    </tr>
    <tr>
      <td>주의점</td>
      <td>scale-out이 아니라 failover 중심</td>
      <td>multi-key command는 같은 slot 조건을 고려해야 함</td>
    </tr>
  </tbody>
</table>

Sentinel은 master를 감시하고, 충분한 Sentinel이 장애를 인정하면 replica 중 하나를 master로 승격한다. Redis 문서의 표현을 빌리면 SDOWN은 특정 Sentinel이 주관적으로 판단한 down 상태이고, ODOWN은 quorum 이상이 동의한 객관적 down 상태다.

Cluster는 keyspace를 16384개 hash slot으로 나눈다.

```text
HASH_SLOT = CRC16(key) mod 16384
```

각 master node는 slot의 일부를 담당한다. client가 잘못된 node에 요청하면 Redis는 올바른 node를 알려주는 redirect를 반환하고, cluster-aware client는 이를 따라가야 한다.

Cluster에서는 key를 묶어 같은 slot으로 보내야 할 때 hash tag를 쓴다.

```text
cart:{user-1}
cart-item:{user-1}:a
cart-item:{user-1}:b
```

중괄호 안의 `user-1`만 hash slot 계산에 쓰이므로, 관련 key를 같은 slot에 둘 수 있다. multi-key command나 transaction-like 흐름을 Redis Cluster에서 쓸 때 자주 필요한 감각이다.

## Redis를 queue로 쓸 때는 보장 수준을 골라야 한다

Redis로 event queue를 만들 수 있다. 하지만 어떤 자료구조를 쓰는지에 따라 보장 수준이 완전히 달라진다.

<div class="gc-visual redis-visual" role="img" aria-label="Redis에서 메시징을 구현하는 방식은 Pub/Sub, List, Stream이 있고 각각 저장 여부와 delivery 보장이 다르다">
  <div class="gc-visual__header">
    <strong>Redis messaging 선택지</strong>
    <span>가벼운 알림인지, 작업 큐인지, 재처리 가능한 이벤트 로그인지에 따라 선택이 달라진다.</span>
  </div>
  <div class="redis-lanes">
    <div class="redis-lane">
      <b>Pub/Sub</b>
      <span>구독 중인 client에게 push한다. 메시지는 저장되지 않고 at-most-once에 가깝다.</span>
      <div class="redis-chip-row">
        <span class="redis-chip">PUBLISH</span>
        <span class="redis-chip">SUBSCRIBE</span>
        <span class="redis-chip" data-kind="danger">no replay</span>
        <span class="redis-chip">notification</span>
      </div>
    </div>
    <div class="redis-lane">
      <b>List</b>
      <span><code>LPUSH</code>/<code>BRPOP</code>으로 간단한 queue를 만든다. ack와 재처리는 직접 설계해야 한다.</span>
      <div class="redis-chip-row">
        <span class="redis-chip">LPUSH</span>
        <span class="redis-chip">BRPOP</span>
        <span class="redis-chip">BLPOP</span>
        <span class="redis-chip">simple queue</span>
      </div>
    </div>
    <div class="redis-lane">
      <b>Stream</b>
      <span>append-only log와 consumer group을 제공한다. <code>XACK</code> 기반 처리 확인이 가능하다.</span>
      <div class="redis-chip-row">
        <span class="redis-chip">XADD</span>
        <span class="redis-chip">XGROUP</span>
        <span class="redis-chip">XREADGROUP</span>
        <span class="redis-chip" data-kind="hot">XACK</span>
      </div>
    </div>
  </div>
</div>

Pub/Sub은 가장 가볍다. 하지만 Redis 공식 문서 기준으로 Pub/Sub은 at-most-once delivery semantics를 갖는다. subscriber가 연결되어 있지 않거나 처리 중 실패하면 메시지를 다시 받을 방법이 없다. 모니터링 알림, live notification처럼 유실이 치명적이지 않은 곳에 어울린다.

List는 간단한 작업 큐를 만들기 쉽다.

```text
producer:
  LPUSH jobs payload

consumer:
  BRPOP jobs 5
```

여기서 `BLPOP`/`BRPOP`의 timeout `0`은 즉시 반환이 아니라 무기한 대기다. 일정 시간마다 loop를 돌며 shutdown signal이나 health 상태를 확인하고 싶다면 0보다 작은 적절한 timeout을 두는 편이 운영하기 쉽다.

List는 “한 메시지를 한 consumer가 가져간다”는 queue에는 충분할 수 있다. 하지만 소비 후 ack, 실패 시 재처리, pending 상태 추적이 필요하면 직접 구현할 것이 많아진다.

Stream은 이 빈틈을 많이 채운다.

```text
XADD order-events * orderId 123 status paid
XGROUP CREATE order-events order-workers $
XREADGROUP GROUP order-workers worker-1 COUNT 10 BLOCK 1000 STREAMS order-events >
XACK order-events order-workers 1680000000000-0
```

Stream은 append-only log에 가깝고, consumer group을 통해 여러 consumer가 같은 stream을 나누어 읽을 수 있다. `XACK`로 처리 완료를 표시하고, pending entries를 추적할 수 있다. 대신 stream이 무한히 커지지 않도록 `XTRIM`이나 maxlen 정책을 함께 설계해야 한다.

## Spring Boot에서 Redis를 붙이는 기본 흐름

Spring Boot에서는 보통 `spring-boot-starter-data-redis`를 추가하면 Spring Data Redis가 Redis 접근 추상화를 제공한다. 기본 client는 Lettuce가 흔히 쓰인다.

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.apache.commons:commons-pool2")
}
```

가장 단순한 설정은 property로 시작한다.

```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      connect-timeout: 500ms
      timeout: 1s
      lettuce:
        pool:
          max-active: 16
          max-idle: 8
          min-idle: 0
          max-wait: 500ms
```

`StringRedisTemplate`은 문자열 중심으로 쓸 때 편하다.

```java
@Service
public class LoginAttemptStore {

    private final StringRedisTemplate redis;

    public LoginAttemptStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public long increase(String userId) {
        String key = "login:fail:" + userId;
        Long count = redis.opsForValue().increment(key);
        redis.expire(key, Duration.ofMinutes(10));
        return count == null ? 0 : count;
    }
}
```

객체를 저장한다면 serializer를 명시하는 편이 안전하다.

```java
@Bean
RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
    RedisTemplate<String, Object> template = new RedisTemplate<>();
    template.setConnectionFactory(connectionFactory);
    template.setKeySerializer(new StringRedisSerializer());
    template.setHashKeySerializer(new StringRedisSerializer());
    template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
    template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
    template.afterPropertiesSet();
    return template;
}
```

serializer를 암묵적으로 두면 나중에 타입 변경, class package 변경, 다국어 client 접근, 운영 redis-cli 확인에서 비용이 커진다. key는 읽을 수 있는 문자열로 두고, value는 JSON인지 binary인지 명확히 정해두는 편이 좋다.

## Spring Cache로 쓸 때

Spring Cache를 Redis 위에 올리면 `@Cacheable`로 cache-aside 패턴을 쉽게 만들 수 있다.

```java
@Service
public class ProductService {

    @Cacheable(cacheNames = "product", key = "#id")
    public Product getProduct(Long id) {
        return productRepository.findById(id)
            .orElseThrow();
    }
}
```

CacheManager에는 TTL과 serializer를 같이 넣는다.

```java
@Bean
RedisCacheManager redisCacheManager(RedisConnectionFactory connectionFactory) {
    RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
        .entryTtl(Duration.ofMinutes(10))
        .disableCachingNullValues()
        .serializeKeysWith(
            RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer())
        )
        .serializeValuesWith(
            RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer())
        );

    return RedisCacheManager.builder(connectionFactory)
        .cacheDefaults(config)
        .withCacheConfiguration(
            "product",
            config.entryTtl(Duration.ofMinutes(5))
        )
        .build();
}
```

운영 cache에서 TTL은 거의 필수다. 영구 cache는 언젠가 source of truth와 어긋난다. TTL을 너무 길게 잡으면 stale data가 오래 남고, 너무 짧게 잡으면 DB를 보호하지 못한다.

여기에 cache stampede도 고려해야 한다. 같은 key가 동시에 만료되면 많은 요청이 한꺼번에 DB로 몰릴 수 있다. 해결책은 상황에 따라 다르다.

- TTL에 작은 jitter를 섞는다.
- hot key는 refresh-ahead로 미리 갱신한다.
- miss 시 분산 lock이나 single-flight로 DB 조회를 합친다.
- null caching을 쓸지 명확히 정한다.

## Lettuce를 이해해야 하는 이유

Lettuce는 Netty 기반 Redis client다. Spring Data Redis는 Lettuce를 통해 non-blocking I/O 기반 client를 제공하지만, Spring MVC에서 `RedisTemplate`을 동기 방식으로 쓰면 애플리케이션 코드 관점에서는 동기 호출처럼 느껴진다.

중요한 지점은 connection이다.

Spring Data Redis의 `LettuceConnectionFactory`는 기본적으로 여러 `LettuceConnection`이 하나의 thread-safe native connection을 공유할 수 있다. 하지만 `LettuceConnection` 자체와 clustered variant는 thread-safe가 아니므로, 인스턴스를 여러 스레드에서 직접 공유하면 안 된다. 보통은 `RedisTemplate`이 connection 획득과 반환을 관리하므로 직접 만질 일이 적다.

공식 API 문서 기준으로 `shareNativeConnection`이 `true`이면 일반 작업은 shared native connection을 사용하고, blocking이나 transaction 작업은 별도 connection provider를 통해 connection을 고른다. `shareNativeConnection`을 `false`로 끄면 모든 작업이 새 connection 또는 pool connection을 사용한다.

<div class="gc-visual redis-visual" role="img" aria-label="Spring Boot에서 RedisTemplate은 LettuceConnectionFactory를 통해 Lettuce native connection을 사용하고 Redis로 명령을 보낸다">
  <div class="gc-visual__header">
    <strong>Spring Boot와 Lettuce 연결 흐름</strong>
    <span>Template은 편하지만, 실제 병목은 timeout, connection, Redis command, key 설계에서 자주 생긴다.</span>
  </div>
  <div class="redis-flow">
    <div class="redis-step"><b>1</b><span>Service</span></div>
    <div class="redis-step"><b>2</b><span>RedisTemplate</span></div>
    <div class="redis-step"><b>3</b><span>LettuceConnectionFactory</span></div>
    <div class="redis-step"><b>4</b><span>Lettuce / Netty</span></div>
    <div class="redis-step"><b>5</b><span>Redis Server</span></div>
  </div>
</div>

## Lettuce 설정 예시

기본 property로 충분하지 않다면 `LettuceConnectionFactory`를 명시적으로 구성한다.

```java
@Configuration
public class RedisConfig {

    @Bean
    LettuceConnectionFactory redisConnectionFactory() {
        RedisStandaloneConfiguration server = new RedisStandaloneConfiguration("localhost", 6379);

        LettuceClientConfiguration client = LettuceClientConfiguration.builder()
            .commandTimeout(Duration.ofSeconds(1))
            .shutdownTimeout(Duration.ofMillis(100))
            .clientOptions(ClientOptions.builder()
                .autoReconnect(true)
                .build())
            .build();

        return new LettuceConnectionFactory(server, client);
    }
}
```

pool이 필요하면 `commons-pool2`와 함께 pooling configuration을 쓴다.

```java
@Bean
LettuceConnectionFactory pooledRedisConnectionFactory() {
    RedisStandaloneConfiguration server = new RedisStandaloneConfiguration("localhost", 6379);

    GenericObjectPoolConfig<?> pool = new GenericObjectPoolConfig<>();
    pool.setMaxTotal(16);
    pool.setMaxIdle(8);
    pool.setMinIdle(0);
    pool.setMaxWait(Duration.ofMillis(500));

    LettuceClientConfiguration client = LettucePoolingClientConfiguration.builder()
        .poolConfig(pool)
        .commandTimeout(Duration.ofSeconds(1))
        .build();

    return new LettuceConnectionFactory(server, client);
}
```

pool을 늘린다고 Redis 처리량이 무조건 늘지는 않는다. Redis server는 명령을 매우 빠르게 처리하지만, single-thread event loop 특성상 비싼 명령이 섞이면 queueing이 생긴다. connection pool은 client 쪽 대기와 격리를 도와줄 수 있지만, Redis server의 CPU, command latency, network, slowlog가 병목이면 pool만 늘려서는 해결되지 않는다.

## Lettuce 사용 시 유의사항

### 1. timeout은 짧고 명확하게 둔다

Redis는 빠른 저장소로 쓰는 경우가 많다. 그러면 timeout도 그 기대에 맞아야 한다. 요청 전체 SLA가 200ms인데 Redis command timeout이 60초라면, 장애 시 애플리케이션 thread가 너무 오래 붙잡힌다.

```text
connect timeout:
  Redis에 새 연결을 맺는 시간

command timeout:
  GET, SET 같은 명령이 끝나길 기다리는 시간

pool max-wait:
  pool에서 connection을 빌릴 때 기다리는 시간
```

이 셋은 서로 다르다. timeout 로그를 볼 때도 “connect가 느린지, pool이 고갈됐는지, Redis command가 느린지”를 분리해서 봐야 한다.

### 2. blocking command는 connection을 분리한다

`BLPOP`, `BRPOP`, Pub/Sub subscribe 같은 작업은 connection을 오래 점유한다. 일반 cache GET/SET과 같은 connection을 공유하면 다른 명령이 밀릴 수 있다.

Spring Data Redis의 `shareNativeConnection` 기본 동작은 일반 작업과 blocking/transaction 작업을 구분하려고 한다. 하지만 직접 connection을 다루거나, custom factory/pool을 구성한다면 blocking 작업 전용 connection 또는 별도 `RedisTemplate`을 두는 편이 명확하다.

### 3. 큰 key 삭제는 `UNLINK`를 고려한다

큰 List, Set, Hash를 `DEL`로 지우면 메모리 해제가 main thread에서 부담이 될 수 있다. Redis에는 key를 keyspace에서 분리하고 실제 메모리 회수를 background에서 처리하는 `UNLINK`가 있다. 큰 key 정리 작업이라면 `DEL`과 `UNLINK`의 차이를 이해하고 선택해야 한다.

### 4. Cluster에서는 key naming이 routing이다

Redis Cluster에서는 key가 hash slot을 결정한다. 관련 key를 같은 slot에 두어야 한다면 hash tag를 써야 한다.

```text
order:{123}:summary
order:{123}:items
order:{123}:payment
```

이렇게 하면 `{123}` 부분만 hash slot 계산에 쓰여 같은 slot으로 간다. 반대로 아무 생각 없이 key를 만들면 multi-key command가 cluster에서 실패하거나 redirect가 늘어날 수 있다.

### 5. cache miss도 장애 모드다

Redis cache 장애는 Redis가 죽었을 때만 생기지 않는다. eviction, TTL 만료, deploy 후 cold cache, hot key 만료가 모두 DB로 전이될 수 있다.

```text
Redis hit:
  빠른 응답

Redis miss:
  DB query
  serialization
  Redis write-back
  동시 요청이면 stampede 가능
```

Redis를 붙였으면 hit ratio, command latency, used memory, evicted keys, expired keys, connected clients, slowlog, replication lag를 같이 봐야 한다.

## 운영 체크리스트

Redis를 붙이기 전에 다음 질문을 먼저 정리해두면 장애 때 덜 흔들린다.

- 이 Redis는 cache인가, session store인가, queue인가, source of truth에 가까운가?
- key마다 TTL이 있는가?
- `maxmemory`와 `maxmemory-policy`는 무엇인가?
- eviction이 발생해도 서비스 의미가 깨지지 않는가?
- RDB/AOF persistence를 켤 것인가?
- Sentinel/Cluster 중 어떤 topology가 필요한가?
- 큰 collection key가 생기지 않는가?
- `KEYS`, 큰 `DEL`, `FLUSH*`, `SAVE` 같은 명령이 운영 경로에 없는가?
- Spring Boot에서 command timeout, connect timeout, pool wait timeout이 분리되어 있는가?
- blocking Redis 작업이 일반 cache 작업과 connection을 공유하지 않는가?
- serializer와 key naming 규칙이 문서화되어 있는가?

## 한 문장으로 정리하면

Redis는 빠른 cache이기도 하지만, 실제로는 TTL, eviction, persistence, topology, client connection까지 함께 설계해야 하는 in-memory data structure server다.

Spring Boot에서 Lettuce를 쓸 때도 핵심은 같다. `RedisTemplate`은 Redis를 쉽게 쓰게 해주지만, timeout과 connection 공유, blocking command, serializer, key naming을 흐릿하게 만들면 장애는 훨씬 늦게 드러난다.

Redis를 잘 쓰는 기준은 “빨랐다”가 아니라 “느려지고, 메모리가 차고, master가 바뀌고, key가 사라져도 어떤 일이 일어나는지 알고 있다”에 가깝다.

## 참고한 자료

- [Redis key eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence)
- [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Redis Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)
- [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [Redis XREADGROUP](https://redis.io/docs/latest/commands/xreadgroup)
- [Redis BLPOP](https://redis.io/commands/blpop/)
- [Redis KEYS](https://redis.io/docs/latest/commands/keys/)
- [Spring Data Redis drivers](https://docs.spring.io/spring-data/redis/reference/redis/drivers.html)
- [Spring Boot RedisAutoConfiguration](https://docs.spring.io/spring-boot/3.5/api/java/org/springframework/boot/autoconfigure/data/redis/RedisAutoConfiguration.html)
- [Spring Data Redis LettuceConnectionFactory API](https://docs.spring.io/spring-data/redis/reference/3.5/api/java/org/springframework/data/redis/connection/lettuce/LettuceConnectionFactory.html)
- [Lettuce production usage](https://redis.io/docs/latest/develop/clients/lettuce/produsage/)
- [Lettuce connecting Redis](https://redis.github.io/lettuce/user-guide/connecting-redis/)
