---
layout: post
title: Consistent Hashing은 왜 서버가 바뀌어도 전체를 흔들지 않을까
description: >
  Consistent Hashing의 hash ring, clockwise lookup, virtual node, hot key, rebalancing 비용과 Dynamo, Cassandra, Kafka와의 연결을 정리합니다.
tags: [algorithm, distributed-system, consistent-hashing, cassandra, kafka]
sitemap: false
---

# Consistent Hashing은 왜 서버가 바뀌어도 전체를 흔들지 않을까

분산 시스템에서 자주 마주치는 질문이 있다.

> 이 key는 어느 서버가 맡아야 할까?

처음에는 간단해 보인다.

```text
server = hash(key) % N
```

서버가 4대라면 `hash(key) % 4`를 계산하면 된다. 구현은 쉽고, 해시 함수가 괜찮다면 분산도 나쁘지 않다.

문제는 서버 수가 바뀌는 순간 시작된다.

`N = 4`에서 `N = 5`가 되면 같은 key라도 나머지 연산의 결과가 거의 전부 바뀐다. 서버를 한 대 추가했을 뿐인데, 대다수 key의 소유자가 바뀌고, 캐시도 비고, 데이터도 대량으로 이동해야 한다.

Consistent Hashing은 이 문제를 다르게 푼다.

> 서버 수가 바뀌어도 전체 key를 다시 흔들지 말고, 영향을 받는 구간만 움직이게 하자.

<style>
.hash-visual {
  --hash-panel: rgba(255, 250, 242, .075);
  --hash-panel-soft: rgba(255, 250, 242, .052);
  --hash-line: rgba(255, 250, 242, .18);
  --hash-ink: #fffaf2;
  --hash-muted: rgba(255, 250, 242, .7);
  --hash-gold: #d8b16f;
  --hash-green: #8fbf9b;
  --hash-blue: #8fb4d9;
  --hash-red: #d98989;
}

.hash-visual .hash-flow,
.hash-visual .hash-grid,
.hash-visual .hash-note-grid,
.hash-visual .hash-vnode-grid {
  display: grid;
  gap: .65rem;
}

.hash-visual .hash-flow {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.hash-visual .hash-grid {
  grid-template-columns: 1.05fr .95fr;
  align-items: stretch;
}

.hash-visual .hash-note-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.hash-visual .hash-vnode-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.hash-visual .hash-step,
.hash-visual .hash-card,
.hash-visual .hash-note,
.hash-visual .hash-lane {
  min-width: 0;
  border: 1px solid var(--hash-line);
  border-radius: 6px;
  background: var(--hash-panel);
}

.hash-visual .hash-step {
  position: relative;
  padding: .58rem .62rem;
}

.hash-visual .hash-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.hash-visual b,
.hash-visual strong {
  display: block;
  color: var(--hash-ink);
}

.hash-visual span,
.hash-visual em {
  display: block;
  color: var(--hash-muted);
  font-style: normal;
  line-height: 1.45;
}

.hash-visual .hash-step b,
.hash-visual .hash-note b,
.hash-visual .hash-lane b {
  font-size: .66rem;
}

.hash-visual .hash-step span,
.hash-visual .hash-note span,
.hash-visual .hash-lane span {
  margin-top: .14rem;
  font-size: .62rem;
}

.hash-visual .hash-card,
.hash-visual .hash-note,
.hash-visual .hash-lane {
  padding: .68rem;
}

.hash-visual .hash-card-title {
  margin-bottom: .5rem;
  font-size: .74rem;
}

.hash-ring {
  position: relative;
  min-height: 19rem;
}

.hash-ring::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(15rem, 78%);
  aspect-ratio: 1;
  border: 1px solid rgba(255, 250, 242, .28);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(255, 250, 242, .045) 0 38%, transparent 39%),
    conic-gradient(from 310deg, rgba(216, 177, 111, .18) 0 64deg, transparent 64deg 360deg);
  transform: translate(-50%, -50%);
}

.hash-token {
  position: absolute;
  min-width: 3.2rem;
  padding: .34rem .42rem;
  border: 1px solid rgba(255, 250, 242, .18);
  border-radius: 999px;
  color: var(--hash-ink);
  background: rgba(8, 10, 17, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .62rem;
  text-align: center;
  white-space: nowrap;
}

.hash-token[data-kind="node"] {
  border-color: rgba(143, 191, 155, .55);
  background: rgba(143, 191, 155, .18);
}

.hash-token[data-kind="new"] {
  border-color: rgba(216, 177, 111, .62);
  background: rgba(216, 177, 111, .2);
}

.hash-token[data-kind="key"] {
  border-color: rgba(143, 180, 217, .55);
  background: rgba(143, 180, 217, .16);
}

.hash-at-top {
  left: 50%;
  top: 1.2rem;
  transform: translateX(-50%);
}

.hash-at-right {
  right: 1.2rem;
  top: 48%;
  transform: translateY(-50%);
}

.hash-at-bottom {
  left: 50%;
  bottom: 1.2rem;
  transform: translateX(-50%);
}

.hash-at-left {
  left: 1.2rem;
  top: 48%;
  transform: translateY(-50%);
}

.hash-key-main {
  right: 24%;
  top: 25%;
}

.hash-key-moved {
  left: 24%;
  bottom: 26%;
}

.hash-lane + .hash-lane {
  margin-top: .5rem;
}

.hash-lane-track {
  display: grid;
  grid-template-columns: 1.1fr .7fr 1.1fr;
  gap: .38rem;
  margin-top: .5rem;
}

.hash-segment {
  min-height: 2rem;
  padding: .32rem .3rem;
  border: 1px solid rgba(255, 250, 242, .15);
  border-radius: 5px;
  color: var(--hash-ink);
  background: rgba(255, 250, 242, .07);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .58rem;
  line-height: 1.25;
  text-align: center;
}

.hash-segment[data-kind="moved"] {
  border-color: rgba(216, 177, 111, .5);
  background: rgba(216, 177, 111, .16);
}

.hash-segment[data-kind="stable"] {
  border-color: rgba(143, 191, 155, .45);
  background: rgba(143, 191, 155, .12);
}

.hash-chip-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .34rem;
  margin-top: .45rem;
}

.hash-chip {
  min-height: 1.85rem;
  padding: .32rem .24rem;
  border: 1px solid rgba(143, 180, 217, .45);
  border-radius: 5px;
  color: var(--hash-ink);
  background: rgba(143, 180, 217, .12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .58rem;
  line-height: 1.22;
  text-align: center;
}

.hash-compare-table {
  width: 100%;
  border: 1px solid rgba(143, 94, 60, .32);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 250, 242, .88) !important;
  font-size: .88rem;
}

.hash-compare-table th,
.hash-compare-table td {
  border: 0;
  border-bottom: 1px solid rgba(143, 94, 60, .22);
  color: var(--coffee-ink) !important;
  vertical-align: top;
}

.hash-compare-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
  font-weight: 700;
}

.hash-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

.hash-compare-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

.hash-compare-table tbody tr:last-child td {
  border-bottom: 0;
}

.hash-compare-table td:first-child {
  color: #4d2d1e !important;
  font-weight: 700;
}

body.dark-mode .hash-compare-table {
  background: rgba(9, 13, 22, .86) !important;
  border-color: rgba(231, 212, 189, .24) !important;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
}

body.dark-mode .hash-compare-table th {
  color: #fff4e5 !important;
  background: rgba(244, 234, 220, .12) !important;
}

body.dark-mode .hash-compare-table td {
  color: #ead8c3 !important;
  border-color: rgba(231, 212, 189, .18) !important;
}

body.dark-mode .hash-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .045) !important;
}

body.dark-mode .hash-compare-table tbody tr:nth-child(even) td {
  background: rgba(255, 250, 242, .074) !important;
}

@media screen and (prefers-color-scheme: dark) {
  body:not(.light-mode) .hash-compare-table {
    background: rgba(9, 13, 22, .86) !important;
    border-color: rgba(231, 212, 189, .24) !important;
    box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
  }

  body:not(.light-mode) .hash-compare-table th {
    color: #fff4e5 !important;
    background: rgba(244, 234, 220, .12) !important;
  }

  body:not(.light-mode) .hash-compare-table td {
    color: #ead8c3 !important;
    border-color: rgba(231, 212, 189, .18) !important;
  }

  body:not(.light-mode) .hash-compare-table tbody tr:nth-child(odd) td {
    background: rgba(255, 250, 242, .045) !important;
  }

  body:not(.light-mode) .hash-compare-table tbody tr:nth-child(even) td {
    background: rgba(255, 250, 242, .074) !important;
  }
}

body.light-mode .hash-compare-table {
  background: rgba(255, 250, 242, .88) !important;
  border-color: rgba(143, 94, 60, .32) !important;
  box-shadow: none !important;
}

body.light-mode .hash-compare-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
}

body.light-mode .hash-compare-table td {
  color: var(--coffee-ink) !important;
  border-color: rgba(143, 94, 60, .22) !important;
}

body.light-mode .hash-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

body.light-mode .hash-compare-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

body.light-mode .hash-compare-table td:first-child {
  color: #4d2d1e !important;
}

@media screen and (max-width: 56rem) {
  .hash-visual .hash-flow,
  .hash-visual .hash-grid,
  .hash-visual .hash-note-grid,
  .hash-visual .hash-vnode-grid {
    grid-template-columns: 1fr;
  }

  .hash-visual .hash-step:not(:last-child)::after {
    content: "";
    left: 50%;
    right: auto;
    top: auto;
    bottom: -.5rem;
    width: 1px;
    height: .5rem;
    background: rgba(255, 250, 242, .34);
    transform: translateX(-50%);
  }

  .hash-ring {
    min-height: 16rem;
  }

  .hash-token {
    min-width: 2.8rem;
    font-size: .56rem;
  }

  .hash-chip-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<div class="gc-visual hash-visual" role="img" aria-label="Consistent Hashing은 key와 node를 같은 hash ring에 놓고, key 위치에서 시계 방향으로 처음 만나는 node에 배치한다">
  <div class="gc-visual__header">
    <strong>Hash Ring 기본 규칙</strong>
    <span>key와 node를 같은 원형 hash space에 놓고, key 위치에서 시계 방향으로 처음 만나는 node가 owner가 된다.</span>
  </div>
  <div class="hash-grid">
    <div class="hash-card">
      <b class="hash-card-title">ring lookup</b>
      <div class="hash-ring">
        <span class="hash-token hash-at-top" data-kind="node">Node A</span>
        <span class="hash-token hash-at-right" data-kind="node">Node B</span>
        <span class="hash-token hash-at-bottom" data-kind="node">Node C</span>
        <span class="hash-token hash-key-main" data-kind="key">key K</span>
        <span class="hash-token hash-key-moved" data-kind="key">key M</span>
      </div>
    </div>
    <div class="hash-card">
      <b class="hash-card-title">lookup rule</b>
      <div class="hash-flow">
        <div class="hash-step"><b>1</b><span>hash(key)</span></div>
        <div class="hash-step"><b>2</b><span>ring 위치</span></div>
        <div class="hash-step"><b>3</b><span>clockwise 이동</span></div>
        <div class="hash-step"><b>4</b><span>첫 node 선택</span></div>
        <div class="hash-step"><b>5</b><span>owner 결정</span></div>
      </div>
    </div>
  </div>
</div>

## 왜 `hash(key) % N`으로는 부족할까

서버 수가 고정되어 있다면 modulo hashing도 쓸 수 있다. 문제는 클러스터가 고정되어 있지 않다는 점이다. 서버는 추가되고, 빠지고, 교체된다.

```text
N = 4
server = hash(key) % 4

N = 5
server = hash(key) % 5
```

이렇게 바뀌면 key 대부분의 목적지가 바뀐다. 실제 시스템에서는 이것이 단순 계산 문제가 아니다.

- 캐시라면 cache miss가 한꺼번에 늘어난다.
- 저장소라면 데이터 이동량이 폭증한다.
- Kafka처럼 key와 partition ordering이 연결된 시스템에서는 mapping 변화가 ordering 기대를 흔들 수 있다.
- LSM 기반 저장소라면 이동된 데이터가 compaction과 tail latency를 건드릴 수 있다.

Consistent Hashing은 서버 수 변경을 “전체 재배치”가 아니라 “일부 구간의 ownership 변경”으로 줄인다.

## 링 위에 서버와 key를 같이 올린다

Consistent Hashing은 해시 함수의 출력 공간을 원처럼 생각한다.

```text
0 ................................ 2^32 - 1
^                                  |
|__________________________________|
```

서버도 해시한다.

```text
hash(nodeA)
hash(nodeB)
hash(nodeC)
```

key도 해시한다.

```text
hash("user:123")
```

key는 자기 위치에서 시계 방향으로 이동하다가 처음 만나는 node에 배치된다. 이때 node는 key의 owner가 된다.

## 서버가 추가되면 일부 구간만 움직인다

새 서버 `D`가 `A`와 `B` 사이에 들어왔다고 하자. 그러면 `D` 바로 이전 구간에 있던 key들만 `D`로 이동한다. `C` 주변의 key, `A` 이전의 key, `B` 이후의 key는 그대로 남는다.

<div class="gc-visual hash-visual" role="img" aria-label="새 노드 D가 A와 B 사이에 추가되면 D가 가져가는 작은 구간만 이동하고 나머지 구간은 안정적으로 유지된다">
  <div class="gc-visual__header">
    <strong>노드 추가 시 이동 범위</strong>
    <span>전체 key가 다시 섞이지 않고, 새 node가 끼어든 구간만 owner가 바뀐다.</span>
  </div>
  <div class="hash-grid">
    <div class="hash-card">
      <b class="hash-card-title">before</b>
      <div class="hash-lane">
        <b>A -> B</b>
        <span>B가 넓은 구간을 담당한다.</span>
        <div class="hash-lane-track">
          <span class="hash-segment" data-kind="stable">A range</span>
          <span class="hash-segment" data-kind="stable">B owns</span>
          <span class="hash-segment" data-kind="stable">B owns</span>
        </div>
      </div>
    </div>
    <div class="hash-card">
      <b class="hash-card-title">after adding D</b>
      <div class="hash-lane">
        <b>A -> D -> B</b>
        <span>D가 들어온 구간 일부만 B에서 D로 이동한다.</span>
        <div class="hash-lane-track">
          <span class="hash-segment" data-kind="stable">A range</span>
          <span class="hash-segment" data-kind="moved">move to D</span>
          <span class="hash-segment" data-kind="stable">B keeps</span>
        </div>
      </div>
    </div>
  </div>
</div>

반대로 서버가 빠지면 그 서버가 담당하던 구간만 다음 node로 넘어간다. 그래서 Consistent Hashing은 “클러스터 membership 변화에 대한 이동 비용”을 줄이는 알고리즘이다.

## 그래도 균등 분산은 자동으로 보장되지 않는다

링을 만든다고 모든 문제가 끝나지는 않는다. 서버를 한 점씩만 링 위에 올리면 위치가 운 나쁘게 몰릴 수 있다.

```text
A --------------------------- B -- C
```

이런 배치에서는 `A`나 `B`가 담당하는 구간이 지나치게 커질 수 있다. hash function이 균등하더라도 node가 적으면 구간 길이 편차가 커질 수 있고, 결국 특정 서버에 데이터와 요청이 몰린다.

여기서 virtual node가 등장한다.

## Virtual Node는 물리 노드를 여러 점으로 쪼갠다

Virtual node, 줄여서 vnode는 물리 서버 하나를 링 위의 여러 위치로 표현하는 방법이다.

```text
Node A -> A1, A2, A3, A4
Node B -> B1, B2, B3, B4
Node C -> C1, C2, C3, C4
```

<div class="gc-visual hash-visual" role="img" aria-label="Virtual node는 하나의 물리 노드를 여러 token 위치로 나누어 링 전체에 분산한다">
  <div class="gc-visual__header">
    <strong>Virtual Node</strong>
    <span>물리 node 하나가 여러 token range를 맡으면 구간 편차가 줄고, 추가/삭제 시 작은 단위로 streaming할 수 있다.</span>
  </div>
  <div class="hash-vnode-grid">
    <div class="hash-note"><b>Node A</b><span>A1, A2, A3, A4</span></div>
    <div class="hash-note"><b>Node B</b><span>B1, B2, B3, B4</span></div>
    <div class="hash-note"><b>Node C</b><span>C1, C2, C3, C4</span></div>
    <div class="hash-note"><b>Node D</b><span>D1, D2, D3, D4</span></div>
  </div>
  <div class="hash-chip-row">
    <span class="hash-chip">A1</span>
    <span class="hash-chip">C1</span>
    <span class="hash-chip">B1</span>
    <span class="hash-chip">D1</span>
    <span class="hash-chip">A2</span>
    <span class="hash-chip">B2</span>
    <span class="hash-chip">D2</span>
    <span class="hash-chip">C2</span>
  </div>
</div>

vnode의 장점은 세 가지다.

1. 구간 편차가 줄어 load balancing이 좋아진다.
2. 새 서버가 들어올 때 여러 서버에서 조금씩 데이터를 받아 올 수 있다.
3. 성능이 다른 서버에 더 많은 vnode를 줄 수 있다.

하지만 vnode가 많다고 항상 좋은 것은 아니다. token 관리, streaming, repair, 모니터링의 단위가 늘어난다. Cassandra 문서도 vnode가 load distribution에는 도움을 주지만 token 관리 오버헤드를 늘릴 수 있다고 설명한다.

## Consistent Hashing은 partitioning만이 아니다

분산 저장소에서는 partitioning과 replication이 함께 간다.

replication factor가 3이라면 key의 primary owner 하나만 고르는 것이 아니라, 링에서 이어지는 다음 node들까지 replica로 선택할 수 있다.

```text
key K owner: Node B
replica candidates: Node B, Node C, Node D
```

Dynamo 계열 시스템에서는 이런 ownership과 replica list가 quorum, read repair, anti-entropy와 연결된다.

예를 들어 replica 수 `N = 3`, write quorum `W = 2`, read quorum `R = 2`라면:

```text
R + W > N
```

조건을 만족하므로 읽기와 쓰기 quorum이 적어도 하나의 replica에서 겹친다. 물론 이것만으로 모든 일관성 문제가 사라지는 것은 아니다. 네트워크 partition, stale replica, conflict resolution, hinted handoff, read repair 같은 운영상의 문제가 뒤따른다.

## 균등한 hash와 균등한 workload는 다르다

Consistent Hashing은 key space를 나누는 데 도움을 준다. 하지만 실제 트래픽은 균등하지 않다.

```text
데이터 크기 != 요청 수 != CPU 비용
```

작은 key 하나가 전체 트래픽의 큰 비율을 차지할 수 있다. celebrity user, 인기 게시글, 대형 채팅방, 실시간 경기 이벤트 같은 key는 해시가 아무리 균등해도 한 partition을 뜨겁게 만든다.

이것이 hot key 문제다.

해결 방법은 상황에 따라 달라진다.

- key salting: `user123#0`, `user123#1`처럼 나누어 write를 퍼뜨린다.
- read aggregation: salting된 key를 다시 모아서 읽는다.
- adaptive replication: hot partition의 replica를 늘린다.
- dynamic partitioning: load 기준으로 shard를 쪼갠다.
- cache isolation: hot key를 별도 캐시나 경로로 분리한다.

이 모든 방법에는 대가가 있다. 특히 key salting은 쓰기는 퍼뜨리지만 읽기에는 aggregation 비용을 남긴다.

## Kafka와는 어떻게 연결될까

Kafka producer도 key가 있는 record를 partition에 배치한다. 가장 단순하게 보면 `hash(key) % partition_count` 계열의 문제다.

Kafka에서 같은 key를 같은 partition으로 보내는 이유는 보통 per-key ordering 때문이다. 한 partition 안에서는 record order가 보존되지만, 여러 partition 사이에는 전체 순서가 없다.

따라서 partition 수를 늘리면 주의해야 한다. key-to-partition mapping이 바뀔 수 있고, 같은 key가 과거와 다른 partition으로 갈 수 있다. Kafka 문서도 partition 수를 바꾸는 일이 key 기반 ordering과 partitioning에 영향을 줄 수 있음을 설명한다.

여기서 tradeoff가 나온다.

<table class="hash-compare-table">
  <thead>
    <tr>
      <th>선택</th>
      <th>장점</th>
      <th>대가</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>같은 key는 같은 partition</td>
      <td>per-key ordering을 유지하기 쉽다.</td>
      <td>hot key가 생기면 특정 partition이 막힌다.</td>
    </tr>
    <tr>
      <td>key를 더 잘게 분산</td>
      <td>병렬성과 처리량을 높일 수 있다.</td>
      <td>ordering과 aggregation이 어려워진다.</td>
    </tr>
    <tr>
      <td>partition 수 증가</td>
      <td>병렬 처리 여지를 늘린다.</td>
      <td>기존 key mapping, cache, consumer 배치가 흔들릴 수 있다.</td>
    </tr>
  </tbody>
</table>

## Rebalancing은 계산보다 운영 비용이 크다

Consistent Hashing은 이동해야 할 key 범위를 줄여준다. 하지만 이동이 “공짜”라는 뜻은 아니다.

노드 추가나 제거가 발생하면 실제로는 다음 비용이 생긴다.

- 네트워크 대역폭: 새 owner에게 데이터를 streaming해야 한다.
- 디스크 I/O: 읽고 쓰는 작업이 foreground traffic과 경쟁한다.
- cache miss: ownership이 바뀐 구간은 cache가 따뜻하지 않다.
- LSM compaction: Cassandra, ScyllaDB 같은 LSM 계열에서는 이동된 SSTable과 compaction이 tail latency를 흔들 수 있다.
- 운영 위험: 장애 복구와 scale-out이 동시에 일어나면 rebalance가 더 오래 걸린다.

그래서 좋은 partitioning은 단지 “어디에 둘까”가 아니라 “바뀔 때 얼마나 조용히 움직일 수 있을까”까지 포함한다.

## 언제 Consistent Hashing을 떠올려야 할까

다음 조건이 보이면 Consistent Hashing을 검토할 만하다.

- 서버 수가 자주 바뀐다.
- key ownership이 안정적이어야 한다.
- cache miss나 data movement 비용이 크다.
- 중앙 coordinator 없이도 ownership을 계산하고 싶다.
- partitioning과 replication을 함께 설계해야 한다.

반대로 단순하고 작은 시스템이라면 그냥 modulo hashing이나 명시적 shard map이 더 낫다. Consistent Hashing은 분산 시스템의 변화 비용을 줄이는 도구이지, 모든 배치 문제를 자동으로 해결하는 마법은 아니다.

## 한 문장으로 정리하면

Consistent Hashing은 key와 node를 같은 hash space에 배치해서, node 추가와 제거가 일어나도 전체 key를 다시 흔들지 않고 영향받는 구간만 이동시키는 distributed placement algorithm이다.

하지만 현실의 어려움은 그 다음에 온다. vnode로 구간 편차를 줄이고, replication으로 가용성을 만들고, quorum과 repair로 일관성을 다루고, hot key와 rebalancing 비용을 운영에서 견뎌야 한다. 균등한 hash는 시작일 뿐이고, 좋은 분산 시스템은 데이터 크기와 요청량과 이동 비용이 서로 다르다는 사실을 계속 다룬다.

## 참고한 자료

- [Consistent Hashing and Random Trees, Karger et al.](https://people.csail.mit.edu/karger/Papers/web.pdf)
- [Dynamo: Amazon's Highly Available Key-value Store](https://www.cs.princeton.edu/courses/archive/spring21/cos418/papers/dynamo.pdf)
- [Apache Cassandra - Dynamo](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)
- [Apache Cassandra - Adding, replacing, moving and removing nodes](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/topo_changes.html)
- [Apache Kafka - Basic Kafka Operations](https://kafka.apache.org/38/operations/basic-kafka-operations/)
- [Apache Kafka - Protocol, Partitioning and bootstrapping](https://kafka.apache.org/35/design/protocol/)
