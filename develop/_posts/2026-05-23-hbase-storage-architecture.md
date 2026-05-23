---
layout: post
title: HBase는 어떻게 HDFS 위에서 랜덤 읽기와 쓰기를 만들까
description: >
  HBase의 Region, RegionServer, WAL, MemStore, HFile, BlockCache, ZooKeeper, HDFS의 역할과 읽기/쓰기 흐름을 정리합니다.
tags: [database, hbase, hdfs, nosql, storage-engine]
sitemap: false
---

# HBase는 어떻게 HDFS 위에서 랜덤 읽기와 쓰기를 만들까

HDFS는 큰 파일을 여러 노드에 나누어 안전하게 보관하는 데 강하다. 하지만 HDFS 자체가 작은 row 하나를 빠르게 찾아 고치기 위한 데이터베이스는 아니다.

HBase는 그 위에 한 겹을 더 올린다.

> 큰 파일은 HDFS에 맡기고, row key 단위의 읽기와 쓰기는 RegionServer가 맡는다.

이 한 문장 안에 HBase의 핵심 구조가 들어 있다. HBase는 데이터를 row key 순서로 나누고, 각 구간을 Region으로 관리한다. 쓰기는 먼저 WAL과 MemStore에 받아 두고, 나중에 HFile이라는 불변 파일로 HDFS에 내려보낸다. 읽기는 MemStore, BlockCache, HFile을 함께 보면서 가장 최신의 cell을 찾아낸다.

<style>
.hbase-visual {
  --hbase-panel: rgba(255, 250, 242, .075);
  --hbase-panel-soft: rgba(255, 250, 242, .052);
  --hbase-line: rgba(255, 250, 242, .18);
  --hbase-ink: #fffaf2;
  --hbase-muted: rgba(255, 250, 242, .7);
  --hbase-gold: #d8b16f;
  --hbase-green: #8fbf9b;
  --hbase-blue: #8fb4d9;
  --hbase-red: #d98989;
}

.hbase-visual .hbase-flow,
.hbase-visual .hbase-grid,
.hbase-visual .hbase-region,
.hbase-visual .hbase-read-grid,
.hbase-visual .hbase-role-grid {
  display: grid;
  gap: .65rem;
}

.hbase-visual .hbase-flow {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.hbase-visual .hbase-grid {
  grid-template-columns: .95fr 1.1fr 1.05fr;
}

.hbase-visual .hbase-read-grid,
.hbase-visual .hbase-role-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.hbase-visual .hbase-step,
.hbase-visual .hbase-card,
.hbase-visual .hbase-store,
.hbase-visual .hbase-note {
  min-width: 0;
  border: 1px solid var(--hbase-line);
  border-radius: 6px;
  background: var(--hbase-panel);
}

.hbase-visual .hbase-step {
  position: relative;
  padding: .58rem .62rem;
}

.hbase-visual .hbase-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.hbase-visual b,
.hbase-visual strong {
  display: block;
  color: var(--hbase-ink);
}

.hbase-visual span,
.hbase-visual em {
  display: block;
  color: var(--hbase-muted);
  font-style: normal;
  line-height: 1.45;
}

.hbase-visual .hbase-step b,
.hbase-visual .hbase-note b {
  font-size: .66rem;
}

.hbase-visual .hbase-step span,
.hbase-visual .hbase-note span {
  margin-top: .14rem;
  font-size: .62rem;
}

.hbase-visual .hbase-card,
.hbase-visual .hbase-store,
.hbase-visual .hbase-note {
  padding: .68rem;
}

.hbase-visual .hbase-card-title {
  margin-bottom: .48rem;
  font-size: .74rem;
}

.hbase-visual .hbase-region {
  grid-template-columns: 1fr;
}

.hbase-visual .hbase-region-label {
  padding: .4rem .5rem;
  border: 1px solid rgba(143, 180, 217, .35);
  border-radius: 5px;
  color: var(--hbase-ink);
  background: rgba(143, 180, 217, .12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .62rem;
}

.hbase-visual .hbase-store {
  background: var(--hbase-panel-soft);
}

.hbase-visual .hbase-store + .hbase-store {
  margin-top: .45rem;
}

.hbase-visual .hbase-store-row {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr);
  gap: .42rem;
  align-items: center;
}

.hbase-visual .hbase-store-row + .hbase-store-row {
  margin-top: .34rem;
}

.hbase-visual .hbase-chip {
  min-height: 1.85rem;
  padding: .32rem .25rem;
  border: 1px solid rgba(255, 250, 242, .15);
  border-radius: 5px;
  color: var(--hbase-ink);
  background: rgba(8, 10, 17, .28);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .6rem;
  line-height: 1.25;
  text-align: center;
}

.hbase-visual .hbase-chip[data-kind="wal"] {
  border-color: rgba(143, 180, 217, .48);
  background: rgba(143, 180, 217, .14);
}

.hbase-visual .hbase-chip[data-kind="mem"] {
  border-color: rgba(216, 177, 111, .48);
  background: rgba(216, 177, 111, .14);
}

.hbase-visual .hbase-chip[data-kind="hfile"] {
  border-color: rgba(143, 191, 155, .48);
  background: rgba(143, 191, 155, .14);
}

.hbase-visual .hbase-chip[data-kind="hot"] {
  border-color: rgba(217, 137, 137, .48);
  background: rgba(217, 137, 137, .14);
}

.hbase-compare-table {
  width: 100%;
  border: 1px solid rgba(143, 94, 60, .32);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 250, 242, .88) !important;
  font-size: .88rem;
}

.hbase-compare-table th,
.hbase-compare-table td {
  border: 0;
  border-bottom: 1px solid rgba(143, 94, 60, .22);
  color: var(--coffee-ink) !important;
  vertical-align: top;
}

.hbase-compare-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
  font-weight: 700;
}

.hbase-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

.hbase-compare-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

.hbase-compare-table tbody tr:last-child td {
  border-bottom: 0;
}

.hbase-compare-table td:first-child {
  color: #4d2d1e !important;
  font-weight: 700;
}

@media screen and (max-width: 56rem) {
  .hbase-visual .hbase-flow,
  .hbase-visual .hbase-grid,
  .hbase-visual .hbase-read-grid,
  .hbase-visual .hbase-role-grid {
    grid-template-columns: 1fr;
  }

  .hbase-visual .hbase-step:not(:last-child)::after {
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
}
</style>

<div class="gc-visual hbase-visual" role="img" aria-label="HBase 쓰기 경로: client, regionserver, WAL, MemStore, HFile, compaction">
  <div class="gc-visual__header">
    <strong>HBase 쓰기 경로</strong>
    <span>먼저 WAL을 HDFS에 기록하고, Column Family별 MemStore에 반영한 뒤, flush와 compaction으로 HFile을 정리한다.</span>
  </div>
  <div class="hbase-flow">
    <div class="hbase-step"><b>Client</b><span>Put 요청</span></div>
    <div class="hbase-step"><b>RegionServer</b><span>대상 Region 처리</span></div>
    <div class="hbase-step"><b>WAL</b><span>HDFS append</span></div>
    <div class="hbase-step"><b>MemStore</b><span>메모리 정렬</span></div>
    <div class="hbase-step"><b>Flush</b><span>HFile 생성</span></div>
    <div class="hbase-step"><b>Compaction</b><span>파일 병합</span></div>
  </div>
</div>

## HBase의 위치: HDFS를 데이터베이스처럼 쓰기

HDFS는 NameNode와 DataNode로 구성된다. NameNode는 파일 시스템의 네임스페이스와 블록 위치 메타데이터를 관리하고, DataNode는 실제 블록을 저장한다. HBase는 이 HDFS 위에 올라가서 HFile과 WAL을 저장한다.

그렇다고 클라이언트가 HDFS 파일을 직접 뒤지는 것은 아니다. 클라이언트는 row key가 속한 Region을 가진 RegionServer에 요청을 보낸다. RegionServer가 MemStore, BlockCache, HFile, WAL을 관리하면서 데이터베이스처럼 보이는 인터페이스를 제공한다.

역할을 나누면 이렇게 볼 수 있다.

<div class="gc-visual hbase-visual" role="img" aria-label="HBase, HDFS, ZooKeeper의 역할 비교">
  <div class="gc-visual__header">
    <strong>컴포넌트 역할</strong>
    <span>HBase는 읽기/쓰기 경로를 맡고, HDFS는 영속 저장을 맡고, ZooKeeper는 클러스터 조율에 관여한다.</span>
  </div>
  <div class="hbase-role-grid">
    <div class="hbase-note"><b>RegionServer</b><span>Region의 읽기/쓰기 요청을 직접 처리한다. WAL, MemStore, StoreFile, BlockCache를 관리한다.</span></div>
    <div class="hbase-note"><b>HDFS</b><span>HFile과 WAL을 DataNode 블록으로 저장하고 복제한다. NameNode는 블록 위치를 관리한다.</span></div>
    <div class="hbase-note"><b>ZooKeeper</b><span>HMaster 선출, 서버 생존성, 클러스터 조율에 관여한다. 최신 HBase에서는 일부 상태가 MasterProcWAL로 이동했다.</span></div>
  </div>
</div>

## Region은 row key 범위다

HBase 테이블은 row key 순서로 정렬된다. 하나의 테이블은 여러 Region으로 나뉘고, 각 Region은 연속된 row key 범위를 맡는다.

```text
table: event_log

Region A  0000 .. 3999
Region B  4000 .. 7999
Region C  8000 .. ffff
```

Region이 커지면 row key 범위를 기준으로 split된다. 이 덕분에 테이블 하나가 여러 RegionServer에 분산될 수 있다.

반대로 row key가 한 방향으로만 증가하면 문제가 생긴다. 예를 들어 timestamp를 그대로 앞에 둔 key는 최신 쓰기가 항상 마지막 Region으로 몰릴 수 있다. 이것이 hotspotting이다. 그래서 HBase의 row key 설계는 단순한 식별자 설계가 아니라 부하 분산 설계에 가깝다.

## Store는 Column Family 하나에 대응한다

Region 안에는 Store가 있다. Store는 Column Family 하나에 대응한다. 그리고 Store는 MemStore 하나와 StoreFile, 즉 HFile들을 가진다.

<div class="gc-visual hbase-visual" role="img" aria-label="하나의 HBase Region 안에서 Column Family마다 Store가 있고, 각 Store는 MemStore와 HFile을 가진다">
  <div class="gc-visual__header">
    <strong>Region 내부 구조</strong>
    <span>Region은 row key 범위이고, Column Family마다 별도의 Store, MemStore, HFile 세트를 가진다.</span>
  </div>
  <div class="hbase-grid">
    <div class="hbase-card">
      <b class="hbase-card-title">Region</b>
      <div class="hbase-region">
        <span class="hbase-region-label">row key 4000 .. 7999</span>
        <span class="hbase-region-label">served by RegionServer-3</span>
      </div>
    </div>
    <div class="hbase-card">
      <b class="hbase-card-title">Store: cf_profile</b>
      <div class="hbase-store">
        <div class="hbase-store-row"><b>Mem</b><span class="hbase-chip" data-kind="mem">sorted cells</span></div>
        <div class="hbase-store-row"><b>HFile</b><span class="hbase-chip" data-kind="hfile">profile files</span></div>
      </div>
    </div>
    <div class="hbase-card">
      <b class="hbase-card-title">Store: cf_event</b>
      <div class="hbase-store">
        <div class="hbase-store-row"><b>Mem</b><span class="hbase-chip" data-kind="mem">sorted cells</span></div>
        <div class="hbase-store-row"><b>HFile</b><span class="hbase-chip" data-kind="hfile">event files</span></div>
      </div>
    </div>
  </div>
</div>

중요한 점은 Column Family가 물리적으로도 분리된다는 것이다. 같은 row key의 cell이라도 Column Family가 다르면 다른 Store에 들어가고, 다른 MemStore와 다른 HFile 세트를 거친다.

이 구조는 장점이 있다. 자주 함께 읽는 컬럼을 같은 Family에 묶고, 압축, TTL, Bloom Filter 같은 설정을 Family별로 다르게 줄 수 있다. 하지만 Column Family를 너무 많이 만들면 MemStore, flush, compaction, 파일 관리가 모두 늘어난다. 그래서 HBase에서는 보통 Column Family를 적게 유지하는 설계가 권장된다.

## 쓰기: WAL에 먼저 남기고 MemStore에 쌓는다

HBase의 쓰기는 LSM Tree 계열의 느낌을 갖는다.

```text
Put(row, cf:qualifier, value)

1. 대상 RegionServer에 도착한다.
2. 변경 내용을 WAL에 append한다.
3. 해당 Column Family의 MemStore에 cell을 넣는다.
4. MemStore가 커지면 HFile로 flush한다.
5. HFile이 많아지면 compaction으로 병합한다.
```

WAL은 메모리 버퍼가 아니다. 장애 복구를 위해 HDFS의 WAL 경로에 남는 append-only 로그다. RegionServer가 죽어도 WAL을 재생하면 아직 HFile로 flush되지 않은 MemStore 변경분을 복구할 수 있다.

MemStore는 메모리 안의 정렬된 구조다. HBase의 cell은 row key, column family, qualifier, timestamp, value를 포함하고, MemStore와 HFile 모두 이 논리적 cell 구조를 유지한다. 차이는 저장 위치와 물리적 형식이다. MemStore는 메모리 구조이고, HFile은 HDFS에 저장되는 불변 파일이다.

Flush는 보통 Region 단위로 이해하는 편이 안전하다. 특정 MemStore가 임계치에 닿으면 같은 Region에 속한 MemStore들이 함께 flush될 수 있다. 그래서 Column Family를 많이 만들면 작은 flush와 많은 HFile이 생기기 쉽다.

## 읽기: 최신 계층부터 보고 HFile을 좁혀간다

읽기는 여러 계층을 합쳐서 본다. 아직 flush되지 않은 최신 값은 MemStore에 있고, 이미 내려간 값은 HFile에 있다. 같은 row와 column에 여러 timestamp 버전이 있을 수 있으므로, HBase는 후보들을 합쳐 가장 적절한 cell을 반환한다.

<div class="gc-visual hbase-visual" role="img" aria-label="HBase 읽기 경로: MemStore, BlockCache, Bloom Filter, HFile Index, HDFS Block">
  <div class="gc-visual__header">
    <strong>HBase 읽기 경로</strong>
    <span>최신 데이터와 캐시를 먼저 보고, Bloom Filter와 HFile index로 디스크 접근 범위를 줄인다.</span>
  </div>
  <div class="hbase-read-grid">
    <div class="hbase-note"><b>1. MemStore</b><span>아직 flush되지 않은 최신 cell을 확인한다.</span></div>
    <div class="hbase-note"><b>2. BlockCache</b><span>자주 읽은 HFile block이 메모리에 있으면 디스크를 피한다.</span></div>
    <div class="hbase-note"><b>3. HFile</b><span>Bloom Filter와 index로 필요한 block만 좁혀 읽는다.</span></div>
  </div>
</div>

Bloom Filter는 “없음”을 빠르게 말해준다. 어떤 row key가 특정 HFile에 없다는 판단이 나오면 그 파일은 읽지 않아도 된다. “있을 수 있음”이 나오면 index를 따라 실제 block을 확인한다.

BlockCache는 읽기 성능의 중요한 완충지대다. HFile의 데이터 block이나 index block이 캐시에 있으면 HDFS read를 줄일 수 있다. 읽기 중심 워크로드에서는 BlockCache 효율이 p99 latency에 직접 영향을 준다.

## HFile은 단순한 덤프 파일이 아니다

HFile은 MemStore를 그대로 파일로 던진 결과가 아니다. 정렬된 cell들이 block 단위로 들어가고, index와 Bloom Filter, metadata가 붙는다. 큰 HFile에서도 필요한 block만 찾기 위해 multi-level index가 사용된다.

대략 이렇게 보면 된다.

```text
HFile
  Data Blocks       실제 cell 데이터
  Leaf Index        data block 위치
  Bloom Blocks      부재 확인 최적화
  Meta/File Info    통계, 설정, 메타데이터
  Trailer           파일 각 영역의 위치
```

HFile이 불변이라는 점도 중요하다. 이미 flush된 HFile을 그 자리에서 고치지 않는다. delete도 실제 삭제가 아니라 tombstone이라는 새 cell로 기록된다. 나중에 compaction이 여러 HFile을 병합하면서 오래된 version과 안전해진 tombstone을 정리한다.

## Compaction은 청소이면서 비용이다

Flush가 반복되면 Store마다 HFile이 많아진다. 파일이 많아지면 읽기 때 확인해야 할 후보도 많아진다. 그래서 HBase는 compaction으로 여러 HFile을 더 적은 수의 HFile로 합친다.

Minor compaction은 일부 작은 StoreFile을 묶어 읽기 후보 수를 줄인다. Major compaction은 Store의 파일들을 더 크게 정리하면서 삭제 마커와 오래된 version 정리까지 더 적극적으로 수행할 수 있다.

하지만 compaction은 공짜가 아니다. 기존 HFile을 읽고 새 HFile을 쓴다. HDFS와 디스크 대역폭을 사용하고, compaction이 밀리면 읽기 지연과 쓰기 backpressure가 생길 수 있다.

## 운영자가 실제로 보는 신호

<table class="hbase-compare-table">
  <thead>
    <tr>
      <th>신호</th>
      <th>의미</th>
      <th>확인할 것</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>특정 RegionServer만 바쁨</td>
      <td>row key hotspotting 가능성</td>
      <td>row key prefix, salt, region 분포, request skew</td>
    </tr>
    <tr>
      <td>flush가 너무 잦음</td>
      <td>MemStore 압박 또는 Region/CF 수 과다</td>
      <td>MemStore size, Region 수, Column Family 수</td>
    </tr>
    <tr>
      <td>읽기 p99가 흔들림</td>
      <td>HFile 수 증가, cache miss, compaction 영향</td>
      <td>BlockCache hit ratio, StoreFile 수, compaction queue</td>
    </tr>
    <tr>
      <td>디스크 사용량 증가</td>
      <td>compaction 중복 공간 또는 tombstone 누적</td>
      <td>major compaction, TTL, version 정책</td>
    </tr>
    <tr>
      <td>Region 이동이 잦음</td>
      <td>split, balancing, 장애 복구 영향</td>
      <td>HMaster log, Region-in-transition, RegionServer 상태</td>
    </tr>
  </tbody>
</table>

HBase 성능 문제는 보통 하나의 설정값으로 끝나지 않는다. row key 설계, Region 분포, Column Family 수, MemStore, BlockCache, HFile 수, compaction이 함께 얽힌다.

## 한 문장으로 정리하면

HBase는 HDFS의 안정적인 분산 파일 저장 위에 RegionServer, WAL, MemStore, HFile, BlockCache를 얹어 row key 기반의 랜덤 읽기/쓰기를 만든다.

WAL은 방금 쓴 값을 잃지 않게 붙잡고, MemStore는 그 값을 잠시 따뜻하게 정렬해 둔다. HFile은 식은 기록처럼 HDFS에 남고, compaction은 흩어진 기록을 다시 읽기 좋게 모은다. 그래서 HBase를 이해한다는 것은 단순히 “HDFS 위의 NoSQL”을 외우는 것이 아니라, 메모리와 파일, row key와 Region, 빠른 쓰기와 나중의 정리 비용이 어떻게 균형을 이루는지 보는 일이다.

## 참고한 자료

- [Apache HBase Architecture](https://hbase.apache.org/docs/architecture/)
- [Apache HBase Regions](https://hbase.apache.org/docs/architecture/regions/)
- [Apache HBase Reference Guide](https://hbase.apache.org/book.html)
- [Apache Hadoop HDFS Architecture](https://hadoop.apache.org/docs/r3.3.6/hadoop-project-dist/hadoop-hdfs/HdfsDesign.html)
