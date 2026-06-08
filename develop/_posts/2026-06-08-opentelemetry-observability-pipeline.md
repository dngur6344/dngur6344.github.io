---
layout: post
title: OpenTelemetry는 관측성의 어디를 표준화하는가
description: >
  OpenTelemetry의 API, SDK, Collector, OTLP, Resource, Sampling, Agent/Gateway 배포 패턴을 중심으로 관측성 파이프라인을 정리합니다.
tags: [monitoring, observability, opentelemetry, tracing, collector]
sitemap: false
---

# OpenTelemetry는 관측성의 어디를 표준화하는가

모니터링 도구를 붙이다 보면 어느 순간 데이터가 도구에 묶인다.

trace는 APM 제품의 agent가 만들고, metric은 다른 exporter가 만들고, log는 또 다른 수집기가 가져간다. 이름도 다르고, attribute도 다르고, 전송 프로토콜도 다르다. 나중에 backend를 바꾸려 하면 애플리케이션 곳곳에 묶인 설정과 계측 코드가 발목을 잡는다.

OpenTelemetry는 이 지점을 표준화하려는 프로젝트다. 관측성 backend 자체가 아니라, telemetry data를 만들고, 전파하고, 수집하고, 내보내는 공통 언어에 가깝다.

```text
OpenTelemetry = instrumentation + data model + protocol + collector
```

{% include observability-post-style.html %}

<div class="obs-visual">
  <p class="obs-title">OpenTelemetry가 맡는 구간</p>
  <div class="obs-flow">
    <div class="obs-step">
      <b>Application</b>
      <span>Java Agent, SDK, library instrumentation이 telemetry를 만든다.</span>
    </div>
    <div class="obs-step">
      <b>API / SDK</b>
      <span>trace, metric, log를 같은 개념과 attribute로 표현한다.</span>
    </div>
    <div class="obs-step">
      <b>OTLP</b>
      <span>gRPC 또는 HTTP와 protobuf 기반으로 데이터를 보낸다.</span>
    </div>
    <div class="obs-step">
      <b>Collector</b>
      <span>receiver, processor, exporter pipeline으로 데이터를 다듬는다.</span>
    </div>
    <div class="obs-step">
      <b>Backend</b>
      <span>Tempo, Jaeger, Prometheus, Loki, vendor APM 등이 저장과 시각화를 맡는다.</span>
    </div>
  </div>
</div>

## OpenTelemetry는 backend가 아니다

공식 문서는 OpenTelemetry를 observability framework and toolkit이라고 설명한다. telemetry data의 generation, export, collection을 돕지만, observability backend 자체는 아니다. 저장과 시각화는 의도적으로 다른 도구에게 맡긴다.

이 구분이 중요하다.

- Pinpoint는 Agent, Collector, 저장소, UI를 함께 가진 APM이다.
- Loki는 로그 저장과 조회를 맡는 backend다.
- OpenTelemetry는 이들 앞단에서 telemetry를 표준 형식으로 만들고 흘려보내는 계층이다.

그래서 OpenTelemetry를 도입한다고 해서 대시보드가 자동으로 생기지는 않는다. 대신 trace, metric, log를 여러 backend로 보낼 수 있는 공통 파이프라인이 생긴다.

## Signal: traces, metrics, logs, baggage

OpenTelemetry를 처음 볼 때는 세 가지 signal만 기억하기 쉽다.

```text
traces
metrics
logs
```

하지만 개념적으로는 baggage도 중요하다. baggage는 서비스 경계를 넘어 함께 전파되는 key-value context다. 모든 데이터가 backend로 저장되는 관측성 signal이라고 보기는 조심스럽지만, trace/log/metric에 붙을 문맥을 이동시키는 역할을 한다.

<table class="obs-table">
  <thead>
    <tr>
      <th>Signal</th>
      <th>무엇을 말하는가</th>
      <th>주로 묻는 질문</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Trace</td>
      <td>하나의 요청이 여러 서비스와 내부 작업을 지나간 경로다.</td>
      <td>이 요청은 어디에서 느려졌는가?</td>
    </tr>
    <tr>
      <td>Metric</td>
      <td>시간에 따라 집계되는 숫자다. latency, error rate, CPU, queue length 등이 여기에 가깝다.</td>
      <td>시스템 상태가 언제부터 나빠졌는가?</td>
    </tr>
    <tr>
      <td>Log</td>
      <td>특정 시점에 애플리케이션이 남긴 사건 기록이다.</td>
      <td>그 순간 실제로 어떤 메시지와 예외가 남았는가?</td>
    </tr>
    <tr>
      <td>Baggage</td>
      <td>서비스 경계를 넘어 전파되는 key-value context다.</td>
      <td>이 요청에 붙은 공통 문맥을 다음 서비스에서도 볼 수 있는가?</td>
    </tr>
  </tbody>
</table>

Trace 안에서는 span이 기본 단위다. 하나의 HTTP 요청, DB query, message publish, 내부 작업 하나가 span이 될 수 있다. span들은 trace id를 공유하고, parent-child 관계로 이어진다.

## Java와 Spring에서는 어떻게 붙는가

Java 애플리케이션에서는 크게 두 가지 접근이 있다.

하나는 zero-code instrumentation이다. OpenTelemetry Java Agent를 JVM 옵션으로 붙이면, 지원되는 라이브러리와 프레임워크에 대해 자동 계측이 들어간다.

```bash
java \
  -javaagent:/path/to/opentelemetry-javaagent.jar \
  -Dotel.service.name=order-api \
  -jar app.jar
```

환경 변수로도 설정할 수 있다.

```bash
export JAVA_TOOL_OPTIONS="-javaagent:/path/to/opentelemetry-javaagent.jar"
export OTEL_SERVICE_NAME="order-api"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318"
java -jar app.jar
```

다른 하나는 code-based instrumentation이다. 애플리케이션 코드에서 OpenTelemetry API를 직접 사용해 span, metric, attribute를 기록한다. 자동 계측이 놓치는 비즈니스 구간을 표시하거나, 더 의미 있는 attribute를 붙이고 싶을 때 쓴다.

Spring Boot에서는 Java Agent가 가장 직접적인 출발점인 경우가 많다. 다만 native image, agent 충돌, Spring 설정 파일 기반 관리가 중요하다면 Spring Boot starter 방식도 검토할 수 있다. 핵심은 둘 중 무엇을 쓰든 `service.name`과 resource attribute를 명시적으로 정하는 것이다.

## Resource는 telemetry의 주소다

OpenTelemetry에서 resource는 telemetry를 만든 주체를 설명한다. 예를 들어 `service.name`, `service.namespace`, `deployment.environment.name`, `k8s.namespace.name`, `k8s.cluster.name` 같은 값이 여기에 들어간다.

공식 문서는 `service.name`을 명시적으로 설정할 것을 권장한다. 설정하지 않으면 SDK가 `unknown_service` 같은 기본값을 넣을 수 있다. backend에서 수많은 `unknown_service`를 보면, 이미 관측성의 첫 단추가 풀린 것이다.

<div class="obs-visual">
  <p class="obs-title">Resource attribute가 붙는 자리</p>
  <div class="obs-grid three">
    <div class="obs-card">
      <b>Service identity</b>
      <span><code>service.name</code>, <code>service.namespace</code>, <code>service.version</code>은 backend에서 서비스를 구분하는 가장 기본적인 값이다.</span>
    </div>
    <div class="obs-card">
      <b>Runtime identity</b>
      <span>host, process, container, Kubernetes 관련 attribute는 어디서 실행됐는지를 알려준다.</span>
    </div>
    <div class="obs-card">
      <b>Deployment context</b>
      <span>환경, region, cluster 값은 장애 범위를 좁히는 데 도움을 준다.</span>
    </div>
  </div>
</div>

좋은 resource 설계는 backend를 바꿔도 오래 남는다. 반대로 여기서 이름이 흔들리면 trace, metric, log를 서로 연결하는 일이 계속 어려워진다.

## Collector는 작은 telemetry 라우터다

OpenTelemetry Collector는 telemetry를 받아서, 처리하고, 내보내는 독립 프로세스다.

Collector 설정은 보통 네 덩어리로 읽는다.

- `receivers`: 데이터를 받는다. 예: OTLP, Prometheus, Kafka, Fluent Forward.
- `processors`: 데이터를 가공한다. 예: batch, memory_limiter, attributes, tail_sampling.
- `exporters`: 데이터를 보낸다. 예: OTLP, Prometheus Remote Write, Loki OTLP HTTP, debug.
- `service.pipelines`: 어떤 receiver, processor, exporter를 실제로 연결할지 정한다.

중요한 점은 component를 정의하는 것만으로는 활성화되지 않는다는 것이다. 공식 문서도 receiver는 `service` 섹션의 pipeline에 추가되어야 활성화된다고 설명한다.

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  otlp:
    endpoint: tempo:4317

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp]
```

## Agent pattern과 Gateway pattern

Collector 배포는 크게 두 가지로 시작할 수 있다.

<div class="obs-visual">
  <p class="obs-title">Collector 배포 패턴</p>
  <div class="obs-grid two">
    <div class="obs-card">
      <b>Agent pattern</b>
      <span>애플리케이션 옆, 또는 같은 노드의 sidecar/DaemonSet으로 Collector를 둔다. 로컬로 telemetry를 받아 전처리한 뒤 backend로 보낸다.</span>
      <div class="obs-chip-row">
        <span class="obs-chip" data-tone="green">sidecar</span>
        <span class="obs-chip" data-tone="green">DaemonSet</span>
        <span class="obs-chip" data-tone="green">local buffer</span>
      </div>
    </div>
    <div class="obs-card">
      <b>Gateway pattern</b>
      <span>서비스들이 중앙 Collector endpoint로 telemetry를 보낸다. 클러스터, 리전, 데이터센터 단위의 공통 관문으로 운영한다.</span>
      <div class="obs-chip-row">
        <span class="obs-chip" data-tone="blue">central endpoint</span>
        <span class="obs-chip" data-tone="blue">policy</span>
        <span class="obs-chip" data-tone="blue">routing</span>
      </div>
    </div>
  </div>
</div>

Agent pattern은 애플리케이션과 가까워 장애 격리와 로컬 전처리에 유리하다. Gateway pattern은 정책과 exporter 설정을 중앙에서 관리하기 쉽다. 실제 운영에서는 Agent-to-Gateway처럼 둘을 섞는 경우도 많다.

tail sampling을 gateway에서 하고 싶다면 한 가지를 더 봐야 한다. tail sampling은 trace 전체 또는 대부분의 span을 본 뒤 sampling 여부를 정한다. 따라서 같은 trace의 span들이 같은 Collector로 모여야 한다. OpenTelemetry 공식 gateway 문서도 이런 경우 trace ID 또는 service-name aware load balancing을 언급한다.

## Sampling은 비용과 정보의 균형이다

모든 trace를 저장하는 것은 가장 단순하지만 가장 비싸다. 그래서 sampling을 설계한다.

Head sampling은 trace 초반에 결정을 내린다. 단순하고 효율적이지만, 나중에 오류가 났는지, 전체 latency가 어땠는지 보고 결정할 수 없다.

Tail sampling은 trace가 끝난 뒤 전체 span을 보고 결정한다. 오류 trace를 항상 남기거나, latency가 긴 trace를 더 많이 남기는 식의 정책을 만들 수 있다. 대신 stateful하고 운영 비용이 크다.

<table class="obs-table">
  <thead>
    <tr>
      <th>방식</th>
      <th>장점</th>
      <th>주의할 점</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Head sampling</td>
      <td>단순하고 빠르며 애플리케이션 또는 Collector pipeline 초반에서 결정할 수 있다.</td>
      <td>전체 trace 내용을 보고 판단할 수 없어 오류 trace를 놓칠 수 있다.</td>
    </tr>
    <tr>
      <td>Tail sampling</td>
      <td>오류, latency, attribute 조건을 보고 더 의미 있는 trace를 남길 수 있다.</td>
      <td>span을 모아야 하므로 stateful하고, 같은 trace가 같은 sampling 지점으로 모이도록 설계해야 한다.</td>
    </tr>
  </tbody>
</table>

## Pinpoint, Loki와 함께 보면

세 도구를 같이 놓으면 역할이 선명해진다.

<table class="obs-table">
  <thead>
    <tr>
      <th>도구</th>
      <th>주된 역할</th>
      <th>질문</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Pinpoint</td>
      <td>Java Agent 중심의 완성형 APM</td>
      <td>이 요청은 어떤 서비스와 메서드에서 느려졌는가?</td>
    </tr>
    <tr>
      <td>Loki</td>
      <td>라벨 기반 로그 저장과 LogQL 조회</td>
      <td>그 시점에 어떤 로그와 예외가 남았는가?</td>
    </tr>
    <tr>
      <td>OpenTelemetry</td>
      <td>telemetry 생성, 전파, 수집, export의 표준 계층</td>
      <td>도구에 묶이지 않는 방식으로 trace, metric, log를 어떻게 흘려보낼 것인가?</td>
    </tr>
  </tbody>
</table>

OpenTelemetry는 Pinpoint나 Loki를 단순히 대체하지 않는다. 오히려 시스템이 커질수록 이들 사이의 언어를 맞추는 층이 된다. trace id를 로그에 함께 남기고, Loki에서 해당 trace id를 찾고, trace backend에서 전체 요청을 따라가는 식의 연결이 가능해진다.

## 운영 체크리스트

OpenTelemetry를 도입할 때는 아래 항목부터 고정한다.

- `service.name`을 반드시 명시한다. `unknown_service`가 생기면 나중에 정리가 어렵다.
- resource attribute 이름을 조직 표준으로 정한다.
- 자동 계측과 수동 계측의 경계를 정한다. 자동 계측은 넓게, 수동 계측은 비즈니스 의미가 있는 구간에만 둔다.
- Collector pipeline에서 component 정의와 pipeline 활성화를 구분한다.
- OTLP gRPC 4317과 HTTP 4318을 혼동하지 않는다.
- sampling 정책을 비용 절감만으로 정하지 않는다. 장애 분석에 필요한 trace를 남겨야 한다.
- PII나 token 같은 민감정보가 attribute, baggage, log body로 흘러가지 않게 필터링한다.
- backend별 제한을 확인한다. 같은 OTel 데이터라도 Loki, Prometheus, trace backend가 받아들이는 label/attribute/cardinality 모델은 다르다.

OpenTelemetry는 별을 직접 보여주는 망원경이라기보다, 별빛을 같은 언어로 모으는 관측 장치에 가깝다. 어디에 저장하고 어떻게 볼지는 다른 도구가 맡는다. 대신 한 번 정돈된 telemetry pipeline은 backend가 바뀌어도 오래 남는다.

## 참고한 자료

- [OpenTelemetry: What is OpenTelemetry?](https://opentelemetry.io/docs/what-is-opentelemetry/)
- [OpenTelemetry Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
- [OpenTelemetry OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [OpenTelemetry Java Agent Getting Started](https://opentelemetry.io/docs/zero-code/java/agent/getting-started/)
- [OpenTelemetry Sampling](https://opentelemetry.io/docs/concepts/sampling/)
- [OpenTelemetry Resources](https://opentelemetry.io/docs/concepts/resources/)
- [OpenTelemetry Collector Agent Pattern](https://opentelemetry.io/docs/collector/deploy/agent/)
- [OpenTelemetry Collector Gateway Pattern](https://opentelemetry.io/docs/collector/deploy/gateway/)
