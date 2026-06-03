---
layout: post
title: PostgreSQL XID Wraparound와 Autovacuum
description: >
  PostgreSQL MVCC에서 transaction ID wraparound가 왜 위험한지, freeze와 relfrozenxid가 어떤 역할을 하는지, autovacuum to prevent wraparound를 운영에서 어떻게 바라봐야 하는지 정리합니다.
tags: [postgresql, mvcc, vacuum, autovacuum, database]
sitemap: false
---

# PostgreSQL XID Wraparound와 Autovacuum

PostgreSQL을 운영하다 보면 가끔 이런 로그를 만난다.

```text
autovacuum: VACUUM public.some_table (to prevent wraparound)
```

문구만 보면 평소 autovacuum과 비슷해 보인다. 하지만 이 작업은 단순히 dead tuple을 치우는 청소에 가깝지 않다. PostgreSQL이 MVCC의 시간 감각을 잃지 않도록, 아주 오래된 transaction ID를 안전한 상태로 정리하는 생존 작업에 가깝다.

이 글은 세 가지 질문을 기준으로 정리한다.

```text
왜 transaction ID가 한 바퀴 도는 것이 위험한가
VACUUM FREEZE와 relfrozenxid는 무엇을 안전하게 만드는가
운영에서는 어떤 지표와 습관으로 이 일을 미리 제어해야 하는가
```

<style>
.wrap-visual {
  --wrap-panel: rgba(255, 250, 242, .075);
  --wrap-line: rgba(255, 250, 242, .18);
  --wrap-ink: #fffaf2;
  --wrap-muted: rgba(255, 250, 242, .72);
  --wrap-warn: #d8b16f;
  --wrap-danger: #d98989;
  --wrap-safe: #8fbf9b;
  --wrap-blue: #8fb4d9;
}

.wrap-visual .wrap-grid,
.wrap-visual .wrap-flow,
.wrap-visual .wrap-lanes {
  display: grid;
  gap: .65rem;
}

.wrap-visual .wrap-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.wrap-visual .wrap-flow {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.wrap-visual .wrap-lanes {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.wrap-visual .wrap-card,
.wrap-visual .wrap-step,
.wrap-visual .wrap-lane {
  min-width: 0;
  border: 1px solid var(--wrap-line);
  border-radius: 6px;
  background: var(--wrap-panel);
}

.wrap-visual .wrap-card,
.wrap-visual .wrap-lane {
  padding: .74rem;
}

.wrap-visual .wrap-step {
  position: relative;
  padding: .62rem;
}

.wrap-visual .wrap-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.5rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.wrap-visual .wrap-card b,
.wrap-visual .wrap-step b,
.wrap-visual .wrap-lane b {
  display: block;
  color: var(--wrap-ink);
  font-size: .72rem;
}

.wrap-visual .wrap-card span,
.wrap-visual .wrap-step span,
.wrap-visual .wrap-lane span {
  display: block;
  margin-top: .22rem;
  color: var(--wrap-muted);
  font-size: .64rem;
  line-height: 1.45;
}

.wrap-visual .wrap-ring {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .5rem;
  margin-top: .65rem;
}

.wrap-visual .wrap-chip {
  padding: .46rem .38rem;
  border: 1px solid rgba(143, 180, 217, .32);
  border-radius: 5px;
  color: var(--wrap-ink);
  background: rgba(143, 180, 217, .1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .58rem;
  line-height: 1.2;
  text-align: center;
}

.wrap-visual .wrap-chip[data-kind="warn"] {
  border-color: rgba(216, 177, 111, .68);
  background: rgba(216, 177, 111, .14);
}

.wrap-visual .wrap-chip[data-kind="danger"] {
  border-color: rgba(217, 137, 137, .68);
  background: rgba(217, 137, 137, .12);
}

.wrap-visual .wrap-chip[data-kind="safe"] {
  border-color: rgba(143, 191, 155, .68);
  background: rgba(143, 191, 155, .12);
}

.wrap-table {
  width: 100%;
  border: 1px solid rgba(143, 94, 60, .32);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 250, 242, .88) !important;
  font-size: .88rem;
}

.wrap-table th,
.wrap-table td {
  border: 0;
  border-bottom: 1px solid rgba(143, 94, 60, .22);
  color: var(--coffee-ink) !important;
  vertical-align: top;
}

.wrap-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
  font-weight: 700;
}

.wrap-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

.wrap-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

.wrap-table tbody tr:last-child td {
  border-bottom: 0;
}

.wrap-table td:first-child {
  color: #4d2d1e !important;
  font-weight: 700;
}

body.dark-mode .wrap-table {
  background: rgba(9, 13, 22, .86) !important;
  border-color: rgba(231, 212, 189, .24) !important;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
}

body.dark-mode .wrap-table th {
  color: #fff4e5 !important;
  background: rgba(244, 234, 220, .12) !important;
}

body.dark-mode .wrap-table td {
  color: #ead8c3 !important;
  border-color: rgba(231, 212, 189, .18) !important;
}

body.dark-mode .wrap-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .045) !important;
}

body.dark-mode .wrap-table tbody tr:nth-child(even) td {
  background: rgba(255, 250, 242, .074) !important;
}

body.dark-mode .wrap-table td:first-child {
  color: #f2c98c !important;
}

body.dark-mode .wrap-table code {
  color: #fff4e5 !important;
  background: rgba(255, 250, 242, .08) !important;
}

@media screen and (prefers-color-scheme: dark) {
  body:not(.light-mode) .wrap-table {
    background: rgba(9, 13, 22, .86) !important;
    border-color: rgba(231, 212, 189, .24) !important;
    box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
  }

  body:not(.light-mode) .wrap-table th {
    color: #fff4e5 !important;
    background: rgba(244, 234, 220, .12) !important;
  }

  body:not(.light-mode) .wrap-table td {
    color: #ead8c3 !important;
    border-color: rgba(231, 212, 189, .18) !important;
  }

  body:not(.light-mode) .wrap-table tbody tr:nth-child(odd) td {
    background: rgba(255, 250, 242, .045) !important;
  }

  body:not(.light-mode) .wrap-table tbody tr:nth-child(even) td {
    background: rgba(255, 250, 242, .074) !important;
  }

  body:not(.light-mode) .wrap-table td:first-child {
    color: #f2c98c !important;
  }

  body:not(.light-mode) .wrap-table code {
    color: #fff4e5 !important;
    background: rgba(255, 250, 242, .08) !important;
  }
}

body.light-mode .wrap-table {
  background: rgba(255, 250, 242, .88) !important;
  border-color: rgba(143, 94, 60, .32) !important;
  box-shadow: none !important;
}

body.light-mode .wrap-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
}

body.light-mode .wrap-table td {
  color: var(--coffee-ink) !important;
  border-color: rgba(143, 94, 60, .22) !important;
}

body.light-mode .wrap-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

body.light-mode .wrap-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

body.light-mode .wrap-table td:first-child {
  color: #4d2d1e !important;
}

@media screen and (max-width: 56rem) {
  .wrap-visual .wrap-grid,
  .wrap-visual .wrap-flow,
  .wrap-visual .wrap-lanes,
  .wrap-visual .wrap-ring {
    grid-template-columns: 1fr;
  }

  .wrap-visual .wrap-step:not(:last-child)::after {
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
}
</style>

## PostgreSQL의 row는 시간표를 들고 있다

PostgreSQL은 MVCC, 즉 multi-version concurrency control을 사용한다. 어떤 트랜잭션이 row를 읽을 때, 지금 저장된 값 하나만 보는 것이 아니라 "내 스냅샷에서 보이는 row version이 무엇인가"를 판단한다.

그 판단에 중요한 값이 row version의 `xmin`과 `xmax`다.

<table class="wrap-table">
  <thead>
    <tr>
      <th>필드</th>
      <th>의미</th>
      <th>읽기 판단에서의 역할</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>xmin</code></td>
      <td>이 row version을 만든 transaction ID</td>
      <td>내 스냅샷에서 이 생성 트랜잭션이 보이는 과거인지 판단한다.</td>
    </tr>
    <tr>
      <td><code>xmax</code></td>
      <td>이 row version을 삭제하거나 대체한 transaction ID</td>
      <td>내 스냅샷에서 이 row version이 이미 죽은 버전인지 판단한다.</td>
    </tr>
  </tbody>
</table>

그래서 PostgreSQL에서 `UPDATE`는 보통 제자리 덮어쓰기가 아니다. 기존 row version의 `xmax`를 채워 과거 버전으로 만들고, 현재 transaction ID를 `xmin`으로 가진 새 row version을 만든다.

<div class="gc-visual wrap-visual" role="img" aria-label="PostgreSQL MVCC에서 UPDATE는 기존 row version을 죽이고 새 row version을 만든다">
  <div class="gc-visual__header">
    <strong>UPDATE는 row version을 새로 만든다</strong>
    <span>freeze 여부와 무관하게, PostgreSQL의 일반 UPDATE는 기존 버전을 남기고 새 버전을 만든다.</span>
  </div>
  <div class="wrap-flow">
    <div class="wrap-step"><b>old tuple</b><span>xmin = 100<br>xmax = NULL</span></div>
    <div class="wrap-step"><b>UPDATE</b><span>transaction 200</span></div>
    <div class="wrap-step"><b>old tuple</b><span>xmin = 100<br>xmax = 200</span></div>
    <div class="wrap-step"><b>new tuple</b><span>xmin = 200<br>xmax = NULL</span></div>
    <div class="wrap-step"><b>VACUUM</b><span>아무도 old tuple을 보지 않으면 정리 가능</span></div>
  </div>
</div>

이 방식 덕분에 읽기와 쓰기는 덜 충돌한다. 읽는 쪽은 자기 스냅샷에 맞는 과거 버전을 볼 수 있고, 쓰는 쪽은 새 버전을 만들 수 있다. 대신 오래된 버전이 계속 남으므로, 언젠가는 vacuum이 필요하다.

## XID wraparound가 왜 문제가 되는가

PostgreSQL의 일반 transaction ID, 즉 XID는 32비트 공간을 사용한다. 그래서 충분히 오래 운영되고 transaction이 계속 발생하면 숫자는 언젠가 한 바퀴 돈다.

여기서 헷갈리기 쉬운 부분이 있다.

```text
XID 공간 자체는 32비트라 약 40억 개다.
하지만 MVCC 비교에서 안전하게 과거/미래를 구분하는 창은 양쪽 약 20억 개다.
```

PostgreSQL 공식 문서는 일반 XID 공간을 원형 공간으로 설명한다. 어떤 XID를 기준으로 약 20억 개는 더 오래된 XID이고, 다른 약 20억 개는 더 새로운 XID다. 그래서 row version이 만들어진 뒤 약 20억 transaction 이상 제대로 정리되지 않으면, 원래는 과거였던 row version이 갑자기 미래의 row처럼 해석될 수 있다.

그 결과는 단순 성능 저하가 아니다. 데이터는 물리적으로 남아 있어도 MVCC visibility 판단에서 보이지 않는 것처럼 해석될 수 있다. PostgreSQL 문서가 이 상황을 매우 강하게 경고하는 이유가 여기에 있다.

<div class="gc-visual wrap-visual" role="img" aria-label="Transaction ID는 원형 공간이라 너무 오래된 unfrozen row는 wraparound 후 미래처럼 보일 수 있다">
  <div class="gc-visual__header">
    <strong>XID는 직선보다 원에 가깝다</strong>
    <span>문제는 숫자가 다시 0으로 오는 것 자체가 아니라, 오래된 row version의 의미가 뒤집히는 것이다.</span>
  </div>
  <div class="wrap-ring">
    <div class="wrap-chip" data-kind="safe">과거<br>visible</div>
    <div class="wrap-chip">현재<br>current XID</div>
    <div class="wrap-chip" data-kind="warn">미래<br>not visible</div>
    <div class="wrap-chip" data-kind="danger">wrap 후<br>의미 뒤집힘</div>
  </div>
</div>

따라서 wraparound 대응의 핵심은 XID가 증가하지 못하게 막는 것이 아니다. XID는 계속 증가하고, 언젠가 돈다. 핵심은 너무 오래된 row version을 일반 XID 비교 대상에서 빼내는 것이다.

## Freeze는 row를 없애지 않는다

VACUUM은 충분히 오래된 row version을 frozen 상태로 만든다. frozen row version은 모든 현재와 미래의 정상 트랜잭션에서 이미 과거의 row로 취급된다.

중요한 점은 이것이다.

```text
freeze는 row를 조회 불가능하게 만드는 작업이 아니다.
오히려 그 row version을 항상 과거로 안전하게 확정하는 작업이다.
```

공식 문서 기준으로 frozen row version은 `FrozenTransactionId`로 삽입 XID를 가진 것처럼 취급된다. 다만 최신 PostgreSQL에서는 예전처럼 실제 `xmin`을 항상 `FrozenTransactionId` 값으로 물리 치환한다고 단정하면 안 된다. PostgreSQL 9.4 이후에는 원래 `xmin`을 보존하고 tuple flag bit로 frozen 상태를 표시할 수 있다. 그러니 글이나 코드에서 "반드시 `xmin = 2`로 바뀐다"고 설명하는 것은 부정확하다.

개념적으로만 이렇게 이해하면 안전하다.

```text
일반 row version:
  xmin을 스냅샷과 비교해야 visibility를 판단할 수 있다.

frozen row version:
  이미 충분히 오래된 과거로 확정되어 XID 비교 부담에서 벗어난다.
```

frozen row를 `UPDATE`하면 freeze가 풀려서 같은 row가 제자리 수정되는 것이 아니다. PostgreSQL의 일반 MVCC 규칙대로 기존 frozen tuple은 과거 버전으로 남고, 현재 transaction ID를 가진 새 tuple이 만들어진다.

## `relfrozenxid`는 테이블의 안전 기준선이다

PostgreSQL은 테이블마다 `pg_class.relfrozenxid`를 관리한다. 이 값은 대략 다음 의미를 가진다.

```text
이 테이블에서 relfrozenxid보다 오래된 transaction ID는
이미 frozen 처리되어 안전하다고 볼 수 있다.
```

정확히는 최근 `relfrozenxid`를 앞으로 당긴 VACUUM이 끝났을 때, 테이블에 남아 있는 가장 오래된 unfrozen XID를 추적하는 값이다. 그래서 PostgreSQL은 `age(relfrozenxid)`를 보며 어떤 테이블이 얼마나 오래 freeze 관리를 받지 못했는지 판단한다.

<div class="gc-visual wrap-visual" role="img" aria-label="current XID가 증가하면 relfrozenxid가 움직이지 않은 테이블의 age가 커진다">
  <div class="gc-visual__header">
    <strong>테이블은 움직이지 않아도 늙는다</strong>
    <span>테이블에 INSERT가 없어도 클러스터의 current XID는 계속 흐르고, relfrozenxid가 멈춰 있으면 age는 커진다.</span>
  </div>
  <div class="wrap-grid">
    <div class="wrap-card"><b>current XID</b><span>클러스터의 transaction 흐름을 따라 계속 증가한다.</span></div>
    <div class="wrap-card"><b>relfrozenxid</b><span>그 테이블이 어디까지 freeze되어 안전한지 나타낸다.</span></div>
    <div class="wrap-card"><b>age(relfrozenxid)</b><span>current XID와 relfrozenxid 사이의 거리다.</span></div>
    <div class="wrap-card"><b>위험 신호</b><span>age가 커지면 anti-wraparound vacuum 대상이 된다.</span></div>
  </div>
</div>

이 때문에 "이 테이블은 이제 SELECT만 하는데 왜 autovacuum이 도는가?"라는 질문이 생긴다. 이유는 단순하다. 테이블이 바뀌지 않아도, 클러스터 전체의 XID는 다른 트랜잭션 때문에 계속 흐른다. 과거 파티션이나 히스토리 테이블도 freeze를 끝내지 않았다면 계속 늙는다.

## 일반 autovacuum과 anti-wraparound autovacuum은 목적이 다르다

둘 다 autovacuum worker가 수행할 수 있고, 둘 다 VACUUM의 세계 안에 있다. 하지만 운영자가 느끼는 의미는 다르다.

<table class="wrap-table">
  <thead>
    <tr>
      <th>구분</th>
      <th>일반 autovacuum</th>
      <th>to prevent wraparound</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>주요 트리거</td>
      <td>UPDATE/DELETE로 dead tuple이 쌓임</td>
      <td><code>relfrozenxid</code> age가 위험 수준에 가까워짐</td>
    </tr>
    <tr>
      <td>목적</td>
      <td>공간 재사용, bloat 완화, 통계와 visibility map 관리</td>
      <td>XID wraparound로 인한 MVCC 의미 붕괴 방지</td>
    </tr>
    <tr>
      <td>스캔 범위</td>
      <td>주로 dead tuple이 있을 법한 페이지 중심</td>
      <td>unfrozen XID/MXID가 있을 수 있는 페이지까지 보는 aggressive scan</td>
    </tr>
    <tr>
      <td>부하 성격</td>
      <td>자주 조금씩 돌도록 튜닝하는 것이 목표</td>
      <td>늦게 발견되면 대용량 테이블에서 I/O와 CPU가 집중될 수 있음</td>
    </tr>
    <tr>
      <td>중단 가능성</td>
      <td>충돌 상황에서 더 쉽게 양보할 수 있음</td>
      <td>일반 autovacuum처럼 자동으로 쉽게 취소되지 않으며 강제 중단은 위험하다</td>
    </tr>
  </tbody>
</table>

여기서 "테이블 전체를 반드시 한 번도 빠짐없이 읽는다"라고 단정하면 조금 과하다. 공식 문서 기준으로 aggressive vacuum은 dead tuple이 있을 법한 페이지만 보는 것이 아니라, unfrozen XID나 MXID가 있을 수 있는 페이지를 방문한다. 이미 all-frozen으로 표시된 페이지는 건너뛸 수 있다.

그래도 운영 체감은 "테이블 전체에 가까운 무거운 스캔"으로 다가올 때가 많다. 특히 대용량 히스토리 테이블이 오래 freeze되지 않았다면, 어느 날 갑자기 특정 테이블의 autovacuum이 CPU와 I/O를 크게 먹는 것처럼 보일 수 있다.

## 왜 파티셔닝만으로는 해결되지 않는가

파티셔닝은 중요하다. 하지만 파티셔닝 자체가 wraparound 관리를 자동으로 끝내지는 않는다.

각 파티션은 실질적으로 별도 relation이고, 각자 `relfrozenxid`를 가진다. 월별 파티션을 만들었고 2024년 1월 파티션이 더 이상 쓰이지 않더라도, 그 파티션이 충분히 freeze되지 않았다면 `age(relfrozenxid)`는 계속 커진다.

그래서 오래된 파티션 전략은 둘 중 하나로 명확해야 한다.

- 보관이 필요 없으면 정책에 따라 `DROP` 또는 archive 후 제거한다.
- 보관해야 하면 트래픽 낮은 시간에 계획적으로 `VACUUM (FREEZE)`를 수행해 all-frozen 상태에 가깝게 만든다.

이렇게 해두면 미래의 aggressive vacuum 부담이 줄어든다. 특히 all-frozen page가 잘 유지되는 과거 파티션은 다음 vacuum에서 건너뛸 수 있는 여지가 커진다. 반대로 과거 파티션에도 업데이트나 row lock이 계속 발생하면 all-frozen 상태가 깨질 수 있고, 다음 vacuum 비용이 다시 생긴다.

## 운영에서 먼저 볼 지표

가장 먼저 볼 것은 database와 relation의 freeze age다.

```sql
SELECT
    datname,
    age(datfrozenxid) AS xid_age
FROM pg_database
WHERE datallowconn
ORDER BY xid_age DESC;
```

테이블 단위로는 TOAST table까지 같이 보는 편이 낫다. PostgreSQL 공식 문서도 relation과 TOAST relation의 age를 함께 확인하는 예시를 제시한다.

```sql
SELECT
    c.oid::regclass AS table_name,
    greatest(age(c.relfrozenxid), age(t.relfrozenxid)) AS xid_age,
    c.relfrozenxid,
    t.relfrozenxid AS toast_relfrozenxid
FROM pg_class c
LEFT JOIN pg_class t ON c.reltoastrelid = t.oid
WHERE c.relkind IN ('r', 'm')
ORDER BY xid_age DESC
LIMIT 20;
```

장기 트랜잭션도 같이 봐야 한다. 오래 열린 snapshot은 vacuum이 old row version을 안전하게 정리하거나 freeze하는 일을 어렵게 만든다.

```sql
SELECT
    pid,
    state,
    xact_start,
    now() - xact_start AS xact_age,
    query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

prepared transaction과 replication slot도 확인 대상이다. 특히 replication slot의 `xmin`이나 `catalog_xmin`이 오래 붙잡혀 있으면 vacuum 진행이 밀릴 수 있다.

```sql
SELECT
    gid,
    prepared,
    now() - prepared AS prepared_age,
    owner,
    database
FROM pg_prepared_xacts
ORDER BY prepared;
```

```sql
SELECT
    slot_name,
    active,
    xmin,
    catalog_xmin,
    restart_lsn
FROM pg_replication_slots;
```

## 튜닝은 autovacuum을 끄는 일이 아니다

가장 위험한 대응은 "autovacuum이 부하를 주니 꺼버리자"다. PostgreSQL은 wraparound 방지를 위해 autovacuum이 비활성화되어 있어도 필요한 autovacuum을 실행할 수 있다. 그만큼 이 작업은 선택 기능이 아니라 안전장치다.

운영에서 할 일은 autovacuum을 끄는 것이 아니라, 너무 늦게 응급 모드로 몰리지 않도록 평소에 작게 나누어 일하게 만드는 것이다.

대용량 테이블에서는 기본 scale factor가 너무 보수적일 수 있다. 예를 들어 10억 row 테이블에서 `autovacuum_vacuum_scale_factor`가 크면, vacuum이 시작되기 전에 너무 많은 dead tuple이나 unfrozen page가 쌓일 수 있다.

상황에 따라 테이블별 storage parameter를 조정한다.

```sql
ALTER TABLE big_event_history SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_vacuum_threshold = 50000
);
```

정적 대용량 테이블이나 닫힌 파티션은 계획적으로 freeze한다.

```sql
VACUUM (FREEZE, VERBOSE) event_history_2025_01;
```

이 작업도 무겁다. 그래서 운영 중 갑자기 마주치는 것이 아니라, 배치 창이나 트래픽이 낮은 시간에 분산해서 수행하는 편이 낫다.

## `VACUUM FULL`은 답이 아닐 때가 많다

wraparound 문제를 보고 `VACUUM FULL`을 떠올리기 쉽지만, 둘은 목적이 다르다.

일반 `VACUUM`은 dead row version을 정리하고 내부 공간을 재사용 가능하게 만들지만, 대부분의 경우 디스크 파일 크기를 즉시 OS에 반환하지 않는다. `VACUUM FULL`은 테이블을 새로 써서 파일 크기를 줄일 수 있지만, 더 무겁고 `ACCESS EXCLUSIVE` lock이 필요하다.

wraparound 방지의 핵심은 디스크 파일을 줄이는 것이 아니라 오래된 row version을 frozen 상태로 만들어 XID 비교 위험에서 빼내는 것이다. 따라서 bloat 정리와 wraparound 예방을 섞어서 생각하면 잘못된 결정을 하기 쉽다.

## 실무 체크리스트

운영에서 반복해서 봐야 할 질문은 다음이다.

- `age(datfrozenxid)`가 높은 database가 있는가?
- `age(relfrozenxid)`가 높은 대형 table이나 TOAST table이 있는가?
- `autovacuum_freeze_max_age`에 가까워지는 relation이 있는가?
- `idle in transaction` 상태의 오래된 세션이 있는가?
- 장기 batch transaction이 snapshot을 오래 붙잡고 있지 않은가?
- prepared transaction이 방치되어 있지 않은가?
- replication slot이 오래된 `xmin`이나 `catalog_xmin`을 붙잡고 있지 않은가?
- 닫힌 파티션에 대해 `VACUUM (FREEZE)` 또는 drop/archive 정책이 있는가?
- 대용량 hot table의 autovacuum threshold와 scale factor가 기본값에만 묶여 있지 않은가?
- autovacuum 로그를 남겨 어떤 테이블에서 오래 걸리는지 볼 수 있는가?

## 한 문장으로 정리하면

PostgreSQL의 wraparound 관리는 XID가 도는 것을 막는 일이 아니다. XID는 원형 공간에서 계속 흐른다. 중요한 것은 오래된 row version을 frozen 상태로 확정해, 한 바퀴 돈 뒤에도 과거가 미래처럼 보이지 않게 만드는 것이다.

`autovacuum: ... (to prevent wraparound)`는 "청소가 조금 늦었다"는 신호가 아니라 "MVCC의 시간표를 안전하게 다시 고정해야 한다"는 신호에 가깝다. 이 로그를 줄이는 가장 좋은 방법은 autovacuum을 피하는 것이 아니라, 테이블의 나이를 평소에 보고, 대형 테이블과 닫힌 파티션이 너무 늙기 전에 작게 관리하는 것이다.

## 참고한 자료

- [PostgreSQL Documentation: Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)
- [PostgreSQL Documentation: Vacuuming Configuration](https://www.postgresql.org/docs/current/runtime-config-vacuum.html)
- [PostgreSQL Documentation: MVCC Introduction](https://www.postgresql.org/docs/current/mvcc-intro.html)
- [PostgreSQL Documentation: pg_class](https://www.postgresql.org/docs/current/catalog-pg-class.html)
