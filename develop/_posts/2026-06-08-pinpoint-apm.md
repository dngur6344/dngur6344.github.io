---
layout: post
title: Pinpoint는 무엇을 보여주는 APM인가
description: >
  Pinpoint의 Agent, Collector, HBase, Pinot, Web UI가 어떤 역할을 하는지, Java Agent가 분산 트랜잭션을 어떻게 추적하는지 정리합니다.
tags: [monitoring, observability, pinpoint, apm, tracing]
sitemap: false
---

# Pinpoint는 무엇을 보여주는 APM인가

분산 시스템에서 장애를 만났을 때 가장 먼저 흐려지는 것은 경계다.

요청은 분명 하나였는데, 그 요청은 API 서버를 지나고, 내부 HTTP 호출을 지나고, 메시지 큐와 데이터베이스를 지나며 여러 조각으로 흩어진다. 로그만으로 따라가려면 각 서비스의 시간, 요청 ID, 스레드, 예외를 하나씩 맞춰야 한다.

Pinpoint는 이 흩어진 요청을 하나의 흐름으로 다시 묶어 보여주는 APM이다. 로그 저장소도 아니고, OpenTelemetry 같은 표준 계측 규격도 아니다. 애플리케이션에 붙는 Agent, 데이터를 받는 Collector, 저장소, 그리고 UI를 함께 갖춘 완성형 Application Performance Management 도구에 가깝다.

{% include observability-post-style.html %}

<div class="obs-visual">
  <p class="obs-title">Pinpoint가 바라보는 요청의 흐름</p>
  <div class="obs-flow">
    <div class="obs-step">
      <b>Client</b>
      <span>하나의 사용자 요청이 들어온다.</span>
    </div>
    <div class="obs-step">
      <b>App A + Agent</b>
      <span>root span을 만들고 다음 호출에 trace 정보를 심는다.</span>
    </div>
    <div class="obs-step">
      <b>App B + Agent</b>
      <span>전달받은 값을 부모로 삼아 child span을 만든다.</span>
    </div>
    <div class="obs-step">
      <b>Collector</b>
      <span>Agent가 보낸 span, stat, metadata를 수집한다.</span>
    </div>
    <div class="obs-step">
      <b>Web UI</b>
      <span>ServerMap, CallStack, Inspector로 요청을 다시 그린다.</span>
    </div>
  </div>
</div>

## Pinpoint의 위치

Pinpoint를 한 문장으로 줄이면 이렇게 말할 수 있다.

```text
Pinpoint = Java Agent 중심의 분산 트랜잭션 추적 APM
```

공식 README도 Pinpoint를 대규모 분산 시스템을 위한 APM으로 설명한다. Java, PHP, Python 애플리케이션을 지원하고, Google Dapper에서 영감을 받은 분산 트랜잭션 추적 모델을 사용한다. 특히 Java 환경에서는 `-javaagent`로 애플리케이션에 붙어 코드 수정 없이 요청 흐름을 수집하는 것이 핵심이다.

Pinpoint가 제공하는 가치는 주로 네 가지다.

- ServerMap으로 서비스 간 호출 관계를 본다.
- Scatter나 Heatmap으로 느린 요청과 오류 요청을 찾는다.
- CallStack으로 한 요청의 내부 호출 순서를 본다.
- Inspector로 JVM, thread, CPU, memory, GC 같은 애플리케이션 상태를 본다.

그래서 Pinpoint는 “어떤 서비스가 느린가”에서 멈추지 않고, “그 요청 안에서 어떤 메서드와 외부 호출이 시간을 썼는가”까지 내려가려는 도구다.

## 전체 구조

Pinpoint는 단일 바이너리 하나로 끝나는 도구가 아니다. 공식 설치 문서 기준으로 핵심 구성요소는 HBase, Pinot, Collector, Web, Agent다.

<div class="obs-visual">
  <p class="obs-title">Pinpoint 구성요소</p>
  <div class="obs-route">
    <div class="obs-lane">
      <b>Application Layer</b>
      <span>Java 애플리케이션에 Pinpoint Agent가 붙는다. Agent는 요청, RPC, DB 호출, Redis, Kafka 같은 라이브러리 호출 지점에서 trace 데이터를 만든다.</span>
      <div class="obs-chip-row">
        <span class="obs-chip">-javaagent</span>
        <span class="obs-chip" data-tone="blue">agentId</span>
        <span class="obs-chip" data-tone="blue">applicationName</span>
      </div>
    </div>
    <div class="obs-lane">
      <b>Collection Layer</b>
      <span>Collector가 Agent의 span, stat, metadata를 받는다. gRPC 기준으로 agent, stat, span 수신 포트가 나뉜다.</span>
      <div class="obs-chip-row">
        <span class="obs-chip" data-tone="green">Collector</span>
        <span class="obs-chip" data-tone="green">gRPC</span>
      </div>
    </div>
    <div class="obs-lane">
      <b>Storage & UI Layer</b>
      <span>HBase는 trace와 index의 중심 저장소다. Pinot는 metric과 신규 분석 기능의 축이고, Web UI가 이 둘을 읽어 화면을 만든다.</span>
      <div class="obs-chip-row">
        <span class="obs-chip" data-tone="red">HBase</span>
        <span class="obs-chip" data-tone="red">Pinot</span>
        <span class="obs-chip" data-tone="red">Web</span>
      </div>
    </div>
  </div>
</div>

각 구성요소의 역할은 다음처럼 나눠서 보는 편이 안전하다.

<table class="obs-table">
  <thead>
    <tr>
      <th>구성요소</th>
      <th>역할</th>
      <th>주의할 점</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Agent</td>
      <td>애플리케이션에 붙어 trace, span, metric, metadata를 만든다.</td>
      <td>bytecode instrumentation이므로 지원 라이브러리와 Agent 버전 호환성을 확인해야 한다.</td>
    </tr>
    <tr>
      <td>Collector</td>
      <td>Agent가 보낸 데이터를 받아 저장소로 넘긴다.</td>
      <td>트래픽이 커질수록 Collector 수평 확장, sampling, 저장소 부하를 함께 봐야 한다.</td>
    </tr>
    <tr>
      <td>HBase</td>
      <td>trace, call stack, trace index의 핵심 저장소다.</td>
      <td>TTL, region 분산, compaction, hotspot을 운영 항목으로 관리해야 한다.</td>
    </tr>
    <tr>
      <td>Pinot + Kafka</td>
      <td>metric data storage와 URI Statistics, System Metric, Error Analysis 같은 분석 기능의 축이다.</td>
      <td>Kafka는 core trace의 Agent-to-Collector 큐가 아니라 Pinot stream ingestion 쪽 의존성으로 보는 편이 정확하다.</td>
    </tr>
    <tr>
      <td>Zookeeper</td>
      <td>HBase 연결, Web-Collector-Agent 라우팅, 실시간 통신 조정에 관여한다.</td>
      <td>저장소 자체라기보다 운영 조정 계층에 가깝다.</td>
    </tr>
    <tr>
      <td>Web</td>
      <td>ServerMap, CallStack, Inspector, Scatter/Heatmap 같은 화면을 제공한다.</td>
      <td>Web UI의 응답성은 HBase와 Pinot 상태에 크게 영향을 받는다.</td>
    </tr>
  </tbody>
</table>

## Java Agent는 어떻게 끼어드는가

Pinpoint Java Agent는 JVM 시작 옵션에 붙는다.

```bash
java \
  -javaagent:/path/to/pinpoint-agent/pinpoint-bootstrap-3.1.0.jar \
  -Dpinpoint.agentId=order-api-1 \
  -Dpinpoint.applicationName=order-api \
  -jar app.jar
```

여기서 `agentId`는 개별 인스턴스를 구분하고, `applicationName`은 같은 서비스를 이루는 여러 인스턴스를 묶는다. 컨테이너 환경에서는 배포 때마다 `agentId`가 계속 새로 생기면 UI에 과거 인스턴스가 지저분하게 남을 수 있다. 공식 설치 문서도 이런 환경에서는 컨테이너 옵션을 함께 검토하라고 안내한다.

Agent가 애플리케이션 코드를 추적하는 방식은 bytecode instrumentation이다. 클래스가 로딩되는 시점에 Pinpoint가 관심 있는 메서드 주변에 interceptor를 넣고, 호출 전후에 필요한 데이터를 기록한다.

이 방식의 장점은 분명하다.

- 애플리케이션 코드를 거의 수정하지 않아도 된다.
- Spring MVC, WebFlux, JDBC, Redis, Kafka, HTTP Client 같은 라이브러리 호출을 자동으로 추적할 수 있다.
- 요청 하나의 내부 호출 관계를 CallStack으로 자세히 볼 수 있다.

하지만 공짜는 아니다. bytecode instrumentation은 애플리케이션 코드 실행 경로에 개입한다. 공식 기술 문서도 profiling 부분에 문제가 생기면 애플리케이션에 영향을 줄 수 있다고 설명한다. 그래서 운영 도입 전에는 지원 라이브러리, Agent 버전, sampling 설정, 성능 영향을 반드시 검증해야 한다.

## TraceId는 하나의 요청을 묶는 실이다

Pinpoint의 trace 모델에서 가장 중요한 단어는 `TransactionId`, `SpanId`, `ParentSpanId`다.

공식 문서 기준으로 Pinpoint의 `TraceId`는 이 세 값의 묶음이다. 여기서 `TransactionId`는 Dapper나 일반적인 tracing 문맥의 trace id에 가까운 값이고, `SpanId`와 `ParentSpanId`가 RPC 간 부모-자식 관계를 만든다.

<div class="obs-visual">
  <p class="obs-title">TransactionId와 Span 관계</p>
  <div class="obs-grid three">
    <div class="obs-card">
      <b>Root span</b>
      <span>사용자 요청이 처음 들어온 서비스에서 만들어진다. <code>ParentSpanId = -1</code>이면 root로 볼 수 있다.</span>
    </div>
    <div class="obs-card">
      <b>Child span</b>
      <span>다음 서비스로 RPC를 보낼 때 새 <code>SpanId</code>가 만들어지고, 이전 span이 parent가 된다.</span>
    </div>
    <div class="obs-card">
      <b>Transaction</b>
      <span>여러 span이 같은 <code>TransactionId</code>를 공유하면서 하나의 사용자 요청으로 묶인다.</span>
    </div>
  </div>
  <div class="obs-chip-row">
    <span class="obs-chip">TX_ID = order-api^time^seq</span>
    <span class="obs-chip" data-tone="blue">SPAN_ID = 10</span>
    <span class="obs-chip" data-tone="green">PARENT_SPAN_ID = -1</span>
  </div>
</div>

예를 들어 `order-api`가 `payment-api`를 호출하면 `order-api`의 Agent는 outbound 호출에 trace 정보를 넣는다. `payment-api`의 Agent는 그 정보를 읽고 같은 `TransactionId`를 가진 child span을 만든다. 이렇게 하면 UI에서는 “주문 요청 하나가 결제 서비스와 DB 호출에서 어디까지 갔는지”를 한 장의 call tree로 볼 수 있다.

## HBase와 Pinot를 구분해서 보자

Pinpoint 저장 구조에서 자주 헷갈리는 지점은 HBase, Kafka, Pinot의 관계다.

핵심 trace와 call stack은 HBase 축으로 이해하는 것이 맞다. Collector와 Web은 HBase를 trace 저장 백엔드로 사용하고, HBase schema에는 trace와 application trace index 성격의 테이블들이 있다.

반면 Pinot는 metric data storage에 가깝다. System Metric, URI Statistics, Error Analysis, New Inspector 같은 기능을 위해 Kafka stream ingestion과 Pinot table이 필요하다.

따라서 “Kafka가 Agent와 Collector 사이에서 모든 trace를 중계한다”고 이해하면 부정확하다. Agent는 Collector로 데이터를 보내고, Kafka는 주로 Pinot 기반 분석 기능을 위한 stream ingestion 축으로 설명하는 편이 공식 문서와 맞다.

## OpenTelemetry와의 관계

OpenTelemetry는 observability backend가 아니다. 공식 문서의 설명처럼 telemetry data를 생성, export, collection하기 위한 vendor-agnostic framework이자 toolkit이다. 저장과 시각화는 Jaeger, Prometheus, Loki, Tempo, 상용 APM 같은 다른 도구가 담당한다.

Pinpoint는 이와 다르다. Pinpoint는 자체 Agent, Collector, 저장소, Web UI를 가진 APM이다.

다만 둘이 완전히 단절된 것도 아니다. Pinpoint v3.1.0 공식 릴리스에는 OpenTelemetry Metric Collection이 들어갔다. 그래서 현재 기준으로는 “Pinpoint는 OTel과 관계가 없다”고 쓰기보다, “Pinpoint는 OTel 표준 계측 계층과 성격이 다르며, v3.1.0 릴리스에서 명확히 강조된 연결점은 OTLP metric 수집이다”라고 쓰는 편이 정확하다. 반대로 Pinpoint를 일반적인 OTLP trace/log backend처럼 설명하는 것은 조심해야 한다.

## 언제 Pinpoint가 잘 맞는가

Pinpoint는 이런 상황에서 특히 잘 맞는다.

- Java/Spring 기반 서비스가 많다.
- 분산 요청의 call stack과 병목 지점을 UI에서 바로 보고 싶다.
- 코드 수정 없이 APM을 빠르게 붙이고 싶다.
- 서비스 간 topology, active thread, scatter chart, inspector를 한 화면에서 보고 싶다.

반대로 이런 경우에는 도입 전에 더 신중해야 한다.

- 이미 OpenTelemetry 중심으로 표준화된 telemetry pipeline이 있다.
- 여러 언어와 여러 backend로 이식 가능한 계측 표준이 더 중요하다.
- HBase, Pinot, Kafka까지 운영할 여력이 부족하다.
- Agent의 bytecode instrumentation 리스크를 받아들이기 어렵다.

## 운영 체크리스트

Pinpoint를 운영에 올릴 때는 기능보다 먼저 아래 항목을 봐야 한다.

- Agent와 Collector 버전을 맞춘다. 공식 README 기준 `3.1.x` Agent는 `3.1.x` Collector와 맞춰야 한다.
- Pinpoint v3.1.x README 기준 Collector, Web, Batch는 Java 17이 필요하고, Agent는 Java 8부터 25까지를 지원한다.
- HBase는 2.x, Pinot는 1.3.0 호환 기준을 먼저 확인한다.
- Agent sampling을 정한다. 전수 수집은 네트워크, Collector, HBase, Pinot 비용을 빠르게 키운다.
- HBase TTL과 compaction, region 분산, hotspot을 모니터링한다.
- Pinot/Kafka가 필요한 기능과 필요 없는 기능을 구분한다.
- 컨테이너 환경에서는 `agentId` 전략을 정한다.
- 장애 시 Agent를 제거하거나 비활성화하는 rollback 절차를 준비한다.

Pinpoint는 조용히 지나가는 요청에 작은 표식을 남긴다. 그 표식들이 Collector와 저장소를 지나 UI에 모이면, 시스템은 더 이상 검은 상자가 아니다. 다만 그만큼 운영해야 할 구성요소도 늘어난다. Pinpoint를 선택한다는 것은 편한 APM 화면뿐 아니라, 그 화면을 만드는 trace 저장소와 Agent 생태계까지 함께 책임진다는 뜻이다.

## 참고한 자료

- [Pinpoint 공식 GitHub](https://github.com/pinpoint-apm/pinpoint)
- [Pinpoint Installation Guide](https://pinpoint-apm.gitbook.io/pinpoint/getting-started/installation)
- [Pinpoint Tech Details](https://pinpoint-apm.gitbook.io/pinpoint/want-a-quick-tour/techdetail)
- [Pinpoint v3.1.0 Release](https://github.com/pinpoint-apm/pinpoint/releases/tag/v3.1.0)
- [OpenTelemetry: What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/)
