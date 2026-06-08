---
layout: post
title: Loki는 로그를 어떻게 싸게 저장하고 찾는가
description: >
  Loki의 label index, chunk 저장 구조, Distributor와 Ingester의 쓰기 경로, Query Frontend와 Querier의 읽기 경로, Spring Boot 로그 수집 방식을 정리합니다.
tags: [monitoring, observability, loki, logging, grafana]
sitemap: false
---

# Loki는 로그를 어떻게 싸게 저장하고 찾는가

로그는 늘 많다. 장애가 나면 더 많아지고, 필요한 로그는 그 많은 로그 사이에 아주 작게 숨어 있다.

Loki는 이 문제를 Elasticsearch류 검색 엔진과 다른 방식으로 푼다. 로그 본문 전체를 색인해서 모든 단어를 빠르게 찾는 모델이 아니라, 라벨과 시간으로 로그 stream을 좁히고, 압축된 chunk 안의 로그를 스캔하는 모델이다.

그래서 Loki를 이해할 때 가장 먼저 기억할 문장은 이것이다.

```text
Loki는 로그 본문 전체가 아니라, 로그의 라벨을 중심으로 색인한다.
```

{% include observability-post-style.html %}

<div class="obs-visual">
  <p class="obs-title">Loki의 기본 저장 모델</p>
  <div class="obs-grid two">
    <div class="obs-card">
      <b>Index</b>
      <span>특정 label set의 로그가 어느 chunk에 있는지 알려주는 목차다. Loki 2.8+에서는 TSDB index store가 권장된다.</span>
      <div class="obs-chip-row">
        <span class="obs-chip">service_name</span>
        <span class="obs-chip" data-tone="blue">namespace</span>
        <span class="obs-chip" data-tone="green">cluster</span>
      </div>
    </div>
    <div class="obs-card">
      <b>Chunk</b>
      <span>같은 label set을 가진 log stream의 실제 로그 라인을 시간 범위별로 묶은 압축 컨테이너다.</span>
      <div class="obs-chip-row">
        <span class="obs-chip" data-tone="red">timestamp</span>
        <span class="obs-chip">log line</span>
        <span class="obs-chip" data-tone="blue">structured metadata</span>
      </div>
    </div>
  </div>
</div>

## Loki는 무엇이 아닌가

Loki는 APM이 아니다. 요청 하나의 call stack을 보여주거나, 서비스 간 span 관계를 자동으로 그려주는 도구가 아니다. 그 역할은 Pinpoint, Tempo, Jaeger, 상용 APM, 또는 OpenTelemetry trace backend 쪽에 가깝다.

Loki는 로그 저장과 조회를 맡는다. Grafana를 UI로 붙이고, LogQL로 로그를 조회한다. 특히 Kubernetes처럼 많은 컨테이너가 stdout/stderr로 로그를 흘려보내는 환경에서 잘 맞는다.

Elasticsearch 계열과 비교하면 의도적인 포기가 있다. Loki는 모든 로그 본문을 색인하지 않는다. 대신 라벨 색인을 작게 유지하고, 로그 본문은 chunk로 저장한다. 이 덕분에 저장 비용과 색인 비용을 줄일 수 있지만, 쿼리할 때는 라벨과 시간 범위를 잘 좁혀야 한다.

## 쓰기 경로

Loki의 write path는 보통 다음 순서로 흐른다.

<div class="obs-visual">
  <p class="obs-title">로그가 Loki에 저장되는 길</p>
  <div class="obs-flow">
    <div class="obs-step">
      <b>Spring Boot</b>
      <span>stdout/stderr, JSON log, Logback appender, OTel logs 중 하나로 로그를 낸다.</span>
    </div>
    <div class="obs-step">
      <b>Collector</b>
      <span>Grafana Alloy, OTel Collector, Fluent Bit 등이 로그를 읽고 label을 붙인다.</span>
    </div>
    <div class="obs-step">
      <b>Distributor</b>
      <span>push 요청을 검증하고 stream을 어느 Ingester에 보낼지 정한다.</span>
    </div>
    <div class="obs-step">
      <b>Ingester</b>
      <span>stream별로 memory chunk를 쌓고 WAL로 미flush 데이터 손실을 줄인다.</span>
    </div>
    <div class="obs-step">
      <b>Object Storage</b>
      <span>index와 chunk를 저장한다. 운영 환경은 보통 object storage 기준으로 설계한다.</span>
    </div>
  </div>
</div>

Distributor는 들어온 로그의 timestamp, label, tenant 등을 검증한다. 그 뒤 label set 기준으로 stream을 계산하고, consistent hashing ring을 통해 Ingester를 고른다. 일반적인 운영 구성에서는 replication factor와 quorum write가 함께 쓰인다.

Ingester는 받은 로그를 즉시 object storage에 한 줄씩 쓰지 않는다. stream별로 memory chunk를 만들고, 일정 크기나 시간이 되면 flush한다. flush 전에 죽었을 때 데이터를 잃지 않도록 WAL을 쓴다.

여기서 중요한 점은 WAL이 영구 저장소의 주인공이 아니라는 것이다. WAL은 미flush chunk를 보호하는 복구 장치에 가깝고, 장기 저장은 chunk와 index를 가진 object storage가 맡는다.

## 읽기 경로

읽기는 쓰기보다 더 많은 최적화가 필요하다. 사용자는 Grafana에서 LogQL을 실행하고, Loki는 해당 쿼리를 시간 범위별, label set별로 잘게 나누어 처리한다.

<div class="obs-visual">
  <p class="obs-title">LogQL 쿼리가 결과가 되는 길</p>
  <div class="obs-flow">
    <div class="obs-step">
      <b>Grafana</b>
      <span>사용자가 LogQL과 시간 범위를 지정한다.</span>
    </div>
    <div class="obs-step">
      <b>Query Frontend</b>
      <span>쿼리를 분할하고 캐시, 재시도, 공정성 제어를 돕는다.</span>
    </div>
    <div class="obs-step">
      <b>Querier</b>
      <span>최근 데이터는 Ingester에서, 오래된 데이터는 index/chunk에서 읽는다.</span>
    </div>
    <div class="obs-step">
      <b>Merge</b>
      <span>여러 source의 결과를 시간순으로 합치고 중복을 제거한다.</span>
    </div>
    <div class="obs-step">
      <b>Result</b>
      <span>로그 라인이나 metric query 결과가 Grafana로 돌아간다.</span>
    </div>
  </div>
</div>

기본적인 LogQL은 label selector에서 시작한다.

```logql
{service_name="order-api", namespace="prod"} |= "ERROR"
```

JSON 로그라면 pipeline stage를 붙일 수 있다.

```logql
{service_name="order-api"} | json | status >= 500
```

여기서 오해하면 안 되는 점이 있다. Loki가 로그 본문을 색인하지 않는다고 해서 본문 검색이 불가능한 것은 아니다. 본문 검색은 가능하다. 다만 먼저 라벨과 시간으로 읽을 chunk를 줄이고, 그 chunk 안의 로그 라인을 스캔하는 방식이다. 그래서 좋은 LogQL은 항상 적절한 label selector와 좁은 시간 범위에서 시작한다.

## 라벨 설계가 거의 전부다

Loki 운영에서 가장 자주 문제가 되는 것은 라벨 카디널리티다.

라벨은 로그 source를 설명하는 낮은 카디널리티 값이어야 한다. 공식 문서도 라벨은 low-cardinality 값을 저장하기 위한 것이고, high-cardinality 데이터는 structured metadata를 쓰라고 안내한다.

<table class="obs-table">
  <thead>
    <tr>
      <th>값의 종류</th>
      <th>권장 위치</th>
      <th>이유</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>service_name</code>, <code>namespace</code>, <code>cluster</code>, <code>env</code></td>
      <td>Label</td>
      <td>로그 source를 안정적으로 좁히고, 값의 종류가 비교적 적다.</td>
    </tr>
    <tr>
      <td><code>deployment</code>, <code>container_name</code></td>
      <td>상황에 따라 Label</td>
      <td>운영 쿼리에서 자주 쓰이면 유용하지만, 값 증가 폭을 봐야 한다.</td>
    </tr>
    <tr>
      <td><code>traceId</code>, <code>requestId</code>, <code>userId</code>, <code>orderId</code></td>
      <td>본문 또는 Structured Metadata</td>
      <td>요청마다 값이 바뀌는 고카디널리티 값이라 index를 폭발시킬 수 있다.</td>
    </tr>
    <tr>
      <td><code>k8s.pod.name</code>, <code>service.instance.id</code></td>
      <td>신규 구성에서는 Structured Metadata 권장</td>
      <td>공식 문서도 high cardinality 가능성 때문에 새 사용자에게 기본 index label로 권장하지 않는다.</td>
    </tr>
  </tbody>
</table>

`traceId`를 라벨로 올리고 싶어지는 순간이 많다. 장애 상황에서 특정 요청을 바로 찾고 싶기 때문이다. 하지만 요청마다 다른 값을 라벨로 만들면 stream 수가 폭발한다. Loki는 작은 index로 비용을 줄이는 도구인데, 이런 라벨 설계는 그 장점을 스스로 버리는 셈이다.

더 나은 방식은 trace id를 JSON 필드나 structured metadata로 남기는 것이다. 조회할 때는 먼저 `{service_name="order-api"}`처럼 source를 좁힌 다음, `| json | trace_id="..."` 같은 pipeline으로 본문 또는 metadata를 필터링한다.

## Spring Boot 로그는 어떻게 보내는가

Spring Boot는 starters를 쓰면 기본적으로 Logback을 사용하고, 로그는 console output으로 나간다. 컨테이너와 Kubernetes 환경에서는 이 기본값이 오히려 좋은 출발점이다. 애플리케이션은 stdout/stderr로 로그를 내고, 노드나 Pod 옆의 수집기가 그 로그를 읽어 Loki로 보낸다.

운영 관점에서 권장 순서는 보통 이렇다.

1. `stdout/stderr -> Grafana Alloy -> Loki`
2. `stdout/stderr 또는 OTLP logs -> OpenTelemetry Collector -> Loki`
3. `Logback appender -> Loki 직접 push`

직접 push 방식은 빠른 PoC에는 편하다. 예를 들어 `loki-logback-appender` 같은 third-party appender를 쓰면 애플리케이션이 Loki push API로 바로 로그를 보낼 수 있다. 하지만 이 방식은 애플리케이션 요청 경로 근처에 네트워크 실패, queue 적체, retry, backpressure 문제가 붙는다. 운영에서는 timeout, buffer, drop 정책, 장애 격리를 반드시 정해야 한다.

OTel Collector를 거쳐 Loki로 보낼 때는 공식 Loki 문서의 OTLP HTTP 경로를 따르는 것이 좋다.

```yaml
exporters:
  otlphttp:
    endpoint: http://loki:3100/otlp

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp]
```

여기서 Collector 설정의 endpoint는 `http://loki:3100/otlp`다. Loki의 실제 로그 ingest API 경로는 그 아래의 `/otlp/v1/logs`이지만, Collector exporter 설정에 전체 경로를 직접 쓰는 식으로 혼동하지 않는 편이 안전하다.

## Promtail은 이제 과거 방식이다

과거 Loki 예제에는 Promtail이 자주 등장한다. 하지만 2026년 6월 8일 기준 공식 문서는 Promtail이 2026년 3월 2일 EOL이라고 명시한다. 상용 지원도 끝났고, 앞으로의 기능 개발은 Grafana Alloy에서 이루어진다.

따라서 새로 구성한다면 Promtail을 기본 선택지로 두지 않는 것이 맞다. 기존 Promtail 운영 환경은 Alloy 또는 다른 지원 클라이언트로 마이그레이션하는 계획을 세워야 한다.

## 운영 체크리스트

Loki를 운영할 때는 아래 항목을 먼저 정리한다.

- label은 적게 시작한다. 늘리는 것은 쉽지만, 줄이는 것은 운영 데이터와 대시보드에 영향을 준다.
- object storage를 기준으로 장기 저장을 설계한다. filesystem은 로컬 개발이나 작은 PoC에 가깝다.
- retention은 Compactor와 함께 설계한다. bucket lifecycle만 믿으면 Loki의 index와 chunk 관점에서 꼬일 수 있다.
- Java stack trace는 multiline 처리 없이는 여러 로그로 쪼개진다. Alloy `loki.process`의 multiline stage나 JSON logging 전략을 검토한다.
- 민감정보는 Loki로 보내기 전에 마스킹한다.
- 멀티테넌시를 쓰면 `X-Scope-OrgID` 처리와 tenant 격리를 명확히 한다.
- 대시보드 쿼리는 항상 label selector와 시간 범위를 좁힌다.
- 직접 appender 방식은 장애 격리, queue 크기, timeout, retry, drop 정책을 문서화한다.

Loki는 모든 로그를 기억하려는 도구가 아니다. 먼저 “어느 별자리에서 온 빛인가”를 라벨로 좁히고, 그 안에서 필요한 로그 라인을 천천히 읽는다. 이 방식은 단순해 보이지만, 대량 로그의 비용을 조용히 낮춘다. 대신 라벨 설계가 흐트러지면 그 단순함은 바로 깨진다.

## 참고한 자료

- [Grafana Loki Architecture](https://grafana.com/docs/loki/latest/get-started/architecture/)
- [Grafana Loki Labels](https://grafana.com/docs/loki/latest/get-started/labels/)
- [Grafana Loki OpenTelemetry ingestion](https://grafana.com/docs/loki/latest/send-data/otel/)
- [Grafana Loki Promtail agent](https://grafana.com/docs/loki/latest/send-data/promtail/)
- [Spring Boot Logging](https://docs.spring.io/spring-boot/reference/features/logging.html)
