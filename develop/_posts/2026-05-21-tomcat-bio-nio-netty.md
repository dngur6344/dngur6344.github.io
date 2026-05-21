---
layout: post
title: Tomcat BIO, NIO, Netty는 요청을 어떻게 흘려보낼까
description: >
  TCP 연결 수립부터 selector, epoll, worker thread, EventLoop, ChannelPipeline까지 Tomcat BIO/NIO와 Netty의 요청 처리 흐름을 비교합니다.
tags: [java, tomcat, netty, nio, epoll, network]
sitemap: false
---

# Tomcat BIO, NIO, Netty는 요청을 어떻게 흘려보낼까

서버가 요청을 받는다는 말은 생각보다 많은 층을 지나간다.

클라이언트의 패킷은 먼저 커널의 TCP 버퍼에 도착한다. 애플리케이션은 그 데이터를 그냥 받는 것이 아니라, `accept()`, `epoll_wait()`, `read()` 같은 경계를 지나 자기 메모리로 끌어온다. Tomcat BIO, Tomcat NIO, Netty의 차이는 이 경계를 누가 기다리고, 누가 읽고, 누가 애플리케이션 코드를 실행하느냐에서 갈린다.

<style>
.io-flow {
  --io-panel: rgba(255, 250, 242, .075);
  --io-line: rgba(255, 250, 242, .18);
}

.io-flow .io-flow-map,
.io-flow .io-flow-common,
.io-flow .io-flow-lanes,
.io-flow .io-flow-path {
  display: grid;
  gap: .62rem;
}

.io-flow .io-flow-common {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: stretch;
}

.io-flow .io-flow-lanes {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.io-flow .io-flow-step,
.io-flow .io-flow-card,
.io-flow .io-flow-note {
  border: 1px solid var(--io-line);
  border-radius: 6px;
  background: var(--io-panel);
}

.io-flow .io-flow-step {
  position: relative;
  min-width: 0;
  padding: .58rem .62rem;
}

.io-flow .io-flow-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .62);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .68rem;
  transform: translate(50%, -50%);
}

.io-flow .io-flow-step b,
.io-flow .io-flow-card-title,
.io-flow .io-flow-path b {
  display: block;
  color: #fffaf2;
}

.io-flow .io-flow-step b {
  font-size: .68rem;
}

.io-flow .io-flow-step span {
  display: block;
  margin-top: .12rem;
  color: rgba(255, 250, 242, .66);
  font-size: .62rem;
  line-height: 1.45;
}

.io-flow .io-flow-card {
  min-width: 0;
  padding: .7rem;
}

.io-flow .io-flow-card-title {
  display: block;
  margin-bottom: .55rem;
  font-size: .74rem;
}

.io-flow .io-flow-path {
  margin: 0;
  padding: 0;
  list-style: none;
}

.io-flow .io-flow-path li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: .48rem;
  align-items: start;
  min-width: 0;
  padding: .5rem .55rem;
  border: 1px solid rgba(255, 250, 242, .14);
  border-radius: 6px;
  background: rgba(8, 10, 17, .26);
}

.io-flow .io-flow-path li + li {
  margin-top: .42rem;
}

.io-flow .io-flow-path b {
  width: 1.35rem;
  height: 1.35rem;
  border: 1px solid rgba(255, 250, 242, .16);
  border-radius: 50%;
  color: #fffaf2;
  background: rgba(255, 250, 242, .08);
  font-size: .68rem;
  line-height: 1.35rem;
  text-align: center;
}

.io-flow .io-flow-path strong,
.io-flow .io-flow-path span {
  display: block;
}

.io-flow .io-flow-path strong {
  color: #fffaf2;
  font-size: .7rem;
}

.io-flow .io-flow-path span,
.io-flow .io-flow-note {
  color: rgba(255, 250, 242, .68);
  font-size: .64rem;
  line-height: 1.45;
}

.io-flow .io-flow-note {
  padding: .58rem .65rem;
}

.io-flow code {
  color: #fffaf2;
  background: rgba(8, 10, 17, .28);
}

.io-compare-table {
  width: 100%;
  border: 1px solid rgba(143, 94, 60, .32);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 250, 242, .88) !important;
  font-size: .88rem;
}

.io-compare-table th,
.io-compare-table td {
  border: 0;
  border-bottom: 1px solid rgba(143, 94, 60, .22);
  color: var(--coffee-ink) !important;
  vertical-align: top;
}

.io-compare-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
  font-weight: 700;
}

.io-compare-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .9) !important;
}

.io-compare-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .92) !important;
}

.io-compare-table tbody tr:last-child td {
  border-bottom: 0;
}

.io-compare-table td:first-child {
  color: #4d2d1e !important;
  font-weight: 700;
}

@media screen and (max-width: 56rem) {
  .io-flow .io-flow-common,
  .io-flow .io-flow-lanes {
    grid-template-columns: 1fr;
  }

  .io-flow .io-flow-step:not(:last-child)::after {
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

<div class="gc-visual io-flow" role="img" aria-label="Tomcat BIO, Tomcat NIO, Netty의 네트워크 요청 처리 흐름도">
  <div class="gc-visual__header">
    <strong>BIO, NIO, Netty 요청 흐름도</strong>
    <span>공통 경로는 같고, 차이는 accept 이후의 대기 방식과 실행 주체에서 생긴다.</span>
  </div>
  <div class="io-flow-map">
    <div class="io-flow-common">
      <div class="io-flow-step"><b>Client</b><span>TCP 연결 시도</span></div>
      <div class="io-flow-step"><b>Kernel</b><span>SYN queue와 accept queue</span></div>
      <div class="io-flow-step"><b>accept()</b><span>listen fd에서 accepted fd 획득</span></div>
      <div class="io-flow-step"><b>recv buffer</b><span>요청 바이트가 커널 버퍼에 쌓임</span></div>
      <div class="io-flow-step"><b>user buffer</b><span><code>read()</code>로 ByteBuffer/ByteBuf에 복사</span></div>
    </div>

    <div class="io-flow-lanes">
      <div class="io-flow-card">
        <span class="io-flow-card-title">Tomcat BIO</span>
        <ol class="io-flow-path">
          <li><b>1</b><span><strong>Acceptor</strong><span><code>accept()</code>로 연결을 가져온다.</span></span></li>
          <li><b>2</b><span><strong>Blocking worker</strong><span>연결 처리 스레드가 배정된다.</span></span></li>
          <li><b>3</b><span><strong>blocking read/write</strong><span><code>InputStream.read()</code>와 <code>OutputStream.write()</code>에서 직접 기다린다.</span></span></li>
          <li><b>4</b><span><strong>Servlet</strong><span>같은 worker가 HTTP 파싱과 Servlet/Spring MVC 실행까지 이어간다.</span></span></li>
        </ol>
      </div>
      <div class="io-flow-card">
        <span class="io-flow-card-title">Tomcat NIO</span>
        <ol class="io-flow-path">
          <li><b>1</b><span><strong>Acceptor</strong><span>accepted fd를 non-blocking <code>SocketChannel</code>로 만든다.</span></span></li>
          <li><b>2</b><span><strong>Poller + Selector</strong><span>많은 socket fd의 read/write readiness를 기다린다.</span></span></li>
          <li><b>3</b><span><strong>SocketProcessor</strong><span>준비된 key를 Executor worker 작업으로 넘긴다.</span></span></li>
          <li><b>4</b><span><strong>Worker</strong><span><code>SocketChannel.read()</code> 후 HTTP 파싱과 Servlet/Spring MVC를 실행한다.</span></span></li>
        </ol>
      </div>
      <div class="io-flow-card">
        <span class="io-flow-card-title">Netty</span>
        <ol class="io-flow-path">
          <li><b>1</b><span><strong>Boss EventLoop</strong><span>연결을 accept하고 Channel을 만든다.</span></span></li>
          <li><b>2</b><span><strong>Worker EventLoop</strong><span>Channel을 자기 selector/epoll에 등록한다.</span></span></li>
          <li><b>3</b><span><strong>read/write</strong><span>같은 EventLoop가 ByteBuf read/write를 처리한다.</span></span></li>
          <li><b>4</b><span><strong>ChannelPipeline</strong><span>decoder, handler, encoder 흐름을 같은 루프에서 실행한다.</span></span></li>
        </ol>
      </div>
    </div>

    <div class="io-flow-note">BIO는 연결 처리 스레드가 직접 기다린다. Tomcat NIO는 readiness 감지와 Servlet 실행을 Poller/Worker로 나눈다. Netty는 Channel 단위 작업을 EventLoop와 Pipeline 흐름으로 묶는다.</div>
  </div>
</div>

## 먼저 공통 경로부터

클라이언트가 서버에 연결할 때 서버 애플리케이션이 바로 fd를 받는 것은 아니다.

서버는 시작할 때 `socket()`을 만들고, `bind()`로 IP와 포트에 묶고, `listen()`으로 연결 대기 상태에 들어간다. 이때 생긴 fd가 `listen fd`다. 클라이언트가 TCP 3-way handshake를 시작하면 커널은 먼저 SYN 큐에서 상태를 관리한다. handshake가 끝난 연결은 accept 큐로 이동한다. 그다음 서버가 `accept()`를 호출하면 커널은 accept 큐에서 연결 하나를 꺼내고, 해당 클라이언트와 통신할 `accepted fd`를 반환한다.

정리하면 이렇다.

```text
socket() -> bind() -> listen()
                  |
                  v
              listen fd
                  |
client SYN -> SYN queue -> accept queue
                  |
              accept()
                  |
                  v
             accepted fd
```

커널이 Java 서버에게 fd를 던져주는 것이 아니다. Java 서버가 `accept()`를 호출해서 준비된 연결을 가져간다. 일반적인 NIO 서버라면 listen fd를 `Selector`에 등록해 accept 가능 이벤트를 볼 수도 있다. 다만 Tomcat NIO는 별도의 `Acceptor`가 연결을 받아 non-blocking `SocketChannel`로 만든 뒤 `Poller`에 등록하는 구조로 이해하는 편이 정확하다.

요청 데이터도 마찬가지다. 패킷은 NIC를 거쳐 커널 TCP receive buffer에 쌓인다. 애플리케이션은 `read()` 또는 `recv()` 계열 호출로 이 데이터를 유저 공간의 버퍼로 복사한다.

```text
NIC
  -> kernel TCP receive buffer
  -> read()/recv()
  -> ByteBuffer / ByteBuf
  -> HTTP parser
  -> Servlet or ChannelPipeline
```

`DirectByteBuffer`나 Netty의 direct `ByteBuf`를 쓰면 데이터는 JVM heap이 아니라 프로세스의 off-heap 영역으로 들어온다. Java 코드가 들고 다니는 것은 그 메모리를 가리키는 객체의 레퍼런스다. 이후 문자열, JSON, DTO로 만들면 필요에 따라 heap 객체로 다시 복사되거나 디코딩된다.

## Selector와 epoll은 어떤 관계인가

헷갈리기 쉬운 부분이 있다. `Selector`와 `epoll`은 서로 메시지를 주고받는 두 컴포넌트가 아니다.

Linux 기준으로 `Selector`는 `epoll`을 내부 구현으로 사용하는 Java 객체다. Java 코드는 `selector.select()`를 호출하지만, 그 아래에서는 OS별 구현체가 `epoll_wait()` 같은 시스템 콜로 내려간다.

```text
EventLoop or Poller thread
  -> java.nio.Selector
  -> epoll_wait()
  -> ready fd list
  -> SelectionKey readyOps
```

소켓을 등록할 때도 마찬가지다. Java의 `socketChannel.register(selector, OP_READ)`는 내부적으로 해당 fd를 epoll 관심 목록에 등록하는 쪽으로 이어진다. 이벤트가 생기면 epoll이 무언가를 Java로 밀어 보내는 것이 아니라, `selector.select()`를 호출한 스레드가 커널 안에서 잠들어 있다가 ready fd 목록을 받고 깨어난다. 그 결과를 Java 쪽에서 `SelectionKey`로 보게 된다.

그래서 더 정확한 표현은 이렇다.

> Selector는 epoll을 감싼 추상화이고, `select()`를 호출한 스레드가 `epoll_wait()`에서 잠든다. 이벤트가 생기면 그 스레드가 깨어나 ready key를 처리한다.

## Tomcat BIO: 연결이 스레드를 붙잡는다

Tomcat BIO는 이름 그대로 Blocking I/O 모델이다. 현대 Tomcat에서는 BIO HTTP connector가 더 이상 기본 선택지가 아니므로, 지금은 주로 역사적 비교 대상으로 보는 편이 정확하다.

BIO의 구조는 단순하다.

```text
Acceptor
  -> accept()
  -> socket handoff
  -> Worker thread
      -> InputStream.read()  // block
      -> parse HTTP
      -> Servlet / Spring MVC
      -> OutputStream.write() // block
```

읽을 데이터가 아직 없으면 worker는 `read()`에서 잠든다. 클라이언트가 느리거나 keep-alive 연결이 오래 유지되면 스레드가 유휴 상태로 묶일 수 있다. 이 모델의 장점은 이해하기 쉽다는 점이다. 단점도 바로 그 단순함에서 나온다. 동시 연결 수가 늘면 필요한 스레드 수와 메모리, 문맥 전환 비용이 같이 늘어난다.

BIO에서는 `InputStream`이 중요해 보이지만, 더 아래에는 커널 소켓과 fd가 있다. `InputStream.read()`는 개발자가 쓰기 쉬운 추상화이고, 실제 데이터는 커널 receive buffer에서 유저 공간 버퍼로 복사되어 올라온다.

## Tomcat NIO: Poller는 기다리고 Worker는 처리한다

Tomcat NIO는 연결과 요청 처리를 분리한다.

역할은 크게 셋이다.

- `Acceptor`: 새 연결을 `accept()`로 가져온다.
- `Poller`: `Selector`로 여러 socket fd의 readiness를 감시한다.
- `Worker`: `SocketProcessor` 실행 안에서 소켓 읽기, HTTP 파싱, Servlet/Spring MVC 처리를 맡는다.

흐름은 이렇다.

```text
Acceptor
  -> accept()
  -> SocketChannel non-blocking 설정
  -> Poller 등록 큐에 전달
  -> selector.wakeup()

Poller
  -> selector.select()
  -> OP_READ ready key 수집
  -> SocketProcessor를 Executor에 제출

Worker
  -> SocketChannel.read(ByteBuffer)
  -> HTTP parse
  -> FilterChain / DispatcherServlet
  -> Controller
  -> response write
```

Poller 스레드가 `select()`에서 블로킹된다고 해서 다른 소켓을 못 받는 것은 아니다. 이벤트가 없으니 잠들어 있을 뿐이다. 하나라도 준비된 fd가 생기면 `select()`가 깨어나고, 여러 fd가 동시에 준비되어 있으면 그 목록을 한 번에 받는다. Poller가 하는 일은 준비된 소켓을 찾아 worker에게 넘기는 일에 가깝기 때문에 비교적 가볍다.

병목은 보통 worker 쪽에서 생긴다. Spring MVC 컨트롤러 안에서 DB, Redis, 외부 API 호출이 오래 걸리면 worker thread가 오래 붙잡힌다. 네트워크 readiness 감지는 NIO로 효율화되었지만, 애플리케이션 처리는 여전히 worker pool의 처리량과 대기열에 영향을 받는다.

Tomcat NIO의 감각은 이렇게 잡으면 좋다.

```text
Poller : Selector = 1 : 1
Selector : socket fd = 1 : N
Worker : 요청 처리 작업 = pool : tasks
```

즉, Poller나 Selector를 소켓 수만큼 늘리는 구조가 아니다. Selector 하나가 많은 fd를 감시하고, 실제 무거운 처리는 worker pool이 가져간다.

## Netty: EventLoop가 읽고, pipeline이 흐른다

Netty도 여러 fd를 감시한다는 점에서는 NIO와 닮았다. 하지만 책임을 나누는 방식이 다르다.

Netty 서버는 보통 두 종류의 EventLoopGroup을 둔다.

- `bossGroup`: 서버 소켓의 accept를 담당한다.
- `workerGroup`: accepted Channel의 read/write와 handler 실행을 담당한다.

새 연결이 들어오면 boss EventLoop가 `accept()`로 Channel을 만들고, worker EventLoop 중 하나에 등록한다. 이후 그 Channel의 I/O 이벤트는 같은 EventLoop에서 처리된다.

```text
Boss EventLoop
  -> epoll_wait / select
  -> accept()
  -> child Channel 생성
  -> Worker EventLoop에 register

Worker EventLoop
  -> epoll_wait / select
  -> fd ready
  -> Channel 조회
  -> read(ByteBuf)
  -> pipeline.fireChannelRead()
  -> inbound handlers
  -> write / flush
  -> outbound handlers
```

Tomcat NIO에서는 Poller가 readiness를 보고 worker에게 넘긴다. Netty에서는 worker EventLoop가 readiness 감지, read/write, `ChannelPipeline` 실행까지 이어서 맡는다. 이 덕분에 한 Channel에 대해서는 스레드 어피니티가 강하게 유지되고, 핸들러 내부에서 불필요한 락을 줄이기 쉽다.

반대로 중요한 규칙도 생긴다.

> EventLoop 안에서 오래 막히면, 그 EventLoop가 담당하는 다른 Channel도 같이 늦어진다.

JDBC, 긴 파일 I/O, 외부 API 호출처럼 블로킹 가능한 작업은 EventLoop 밖의 별도 스레드풀로 오프로딩해야 한다. Netty가 빠른 이유는 모든 코드를 EventLoop에 올려도 된다는 뜻이 아니라, EventLoop가 짧고 예측 가능한 일을 빠르게 반복하도록 설계되었기 때문이다.

Linux에서는 Netty가 Java NIO Selector뿐 아니라 native epoll transport도 쓸 수 있다. 이 경우 Java `Selector` 추상화를 거치는 대신 Netty native transport가 epoll을 더 직접적으로 활용한다. 구조적으로는 여전히 EventLoop가 핵심이다.

## 세 모델을 나란히 놓으면

<table class="io-compare-table">
  <thead>
    <tr>
      <th>항목</th>
      <th>Tomcat BIO</th>
      <th>Tomcat NIO</th>
      <th>Netty</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>I/O 모델</td>
      <td>Blocking I/O</td>
      <td>Non-blocking I/O + Selector</td>
      <td>EventLoop 기반 non-blocking I/O</td>
    </tr>
    <tr>
      <td>연결 감지</td>
      <td>Acceptor가 `accept()`에서 블로킹</td>
      <td>Acceptor가 accept 후 Poller에 등록</td>
      <td>Boss EventLoop가 accept 후 worker EventLoop에 등록</td>
    </tr>
    <tr>
      <td>read/write</td>
      <td>Worker가 직접 블로킹 read/write</td>
      <td>Worker가 `SocketChannel.read()`와 Servlet 처리를 수행</td>
      <td>Worker EventLoop가 read/write와 pipeline 실행</td>
    </tr>
    <tr>
      <td>비즈니스 코드</td>
      <td>Worker thread</td>
      <td>Executor worker thread</td>
      <td>기본은 EventLoop, 블로킹 작업은 별도 executor로 분리</td>
    </tr>
    <tr>
      <td>스레드 감각</td>
      <td>연결이 스레드를 오래 점유하기 쉬움</td>
      <td>Poller는 소수, worker는 요청 처리량에 맞춤</td>
      <td>EventLoop는 보통 코어 수 근처, Channel은 여러 개씩 분산</td>
    </tr>
    <tr>
      <td>강한 지점</td>
      <td>단순한 구조</td>
      <td>Servlet/Spring MVC와 잘 맞는 균형형 구조</td>
      <td>비동기 파이프라인, 백프레셔, 버퍼 풀링</td>
    </tr>
    <tr>
      <td>주의할 지점</td>
      <td>keep-alive와 느린 클라이언트가 스레드를 잠식</td>
      <td>worker pool, accept queue, flush 패턴이 병목이 될 수 있음</td>
      <td>EventLoop에서 블로킹하면 같은 루프의 Channel이 같이 지연</td>
    </tr>
  </tbody>
</table>

## 요청 하나를 따라가 보면

Spring MVC를 얹은 Tomcat NIO를 기준으로 요청 하나를 따라가면 이렇게 된다.

```text
1. 클라이언트가 TCP 연결을 맺는다.
2. 커널 accept queue에 연결이 들어간다.
3. Tomcat Acceptor가 accept()로 accepted fd를 얻는다.
4. SocketChannel을 non-blocking으로 만들고 Poller에 등록한다.
5. 요청 바이트가 커널 receive buffer에 쌓인다.
6. Poller의 selector.select()가 깨어난다.
7. Poller가 OP_READ ready key를 보고 worker 작업을 만든다.
8. Worker가 SocketChannel.read(ByteBuffer)를 호출한다.
9. HTTP parser가 request를 만들고 Servlet pipeline으로 넘긴다.
10. FilterChain, DispatcherServlet, Controller가 실행된다.
11. 응답이 write되어 커널 send buffer로 내려간다.
```

같은 요청을 Netty로 보면 6번 이후가 달라진다.

```text
1. Boss EventLoop가 accept한다.
2. accepted Channel을 Worker EventLoop에 붙인다.
3. Worker EventLoop의 selector/epoll이 read ready를 받는다.
4. 같은 EventLoop가 read(ByteBuf)를 호출한다.
5. pipeline.fireChannelRead(ByteBuf)가 실행된다.
6. decoder, handler, encoder가 pipeline을 따라 흐른다.
7. write/flush가 outbound pipeline을 지나 커널 send buffer로 내려간다.
```

Tomcat NIO는 준비 감지와 애플리케이션 실행을 나누고, Netty는 한 EventLoop 안에서 최대한 이어서 처리한다. 이 차이가 두 모델의 성격을 만든다.

## 장애를 볼 때 어디를 봐야 할까

BIO에서 busy thread가 `maxThreads`에 붙어 있고 context switch가 많다면, 느린 클라이언트나 블로킹 I/O가 스레드를 잡아먹는 상황을 의심한다.

Tomcat NIO에서 worker는 한가한데 지연이 늘면 Poller에서 worker로 넘기는 큐, 작은 read/write, flush 남발, keep-alive 연결 수를 본다. 반대로 worker가 꽉 차 있으면 네트워크보다 애플리케이션 처리 시간이 문제일 가능성이 높다.

Netty에서 일부 EventLoop만 CPU 100%에 붙어 있으면 특정 Channel이나 handler가 한 루프를 과하게 잡고 있는지 본다. EventLoop 스택에 JDBC, Redis blocking call, 파일 I/O, 긴 CPU 작업이 보이면 별도 executor로 빼야 한다. 작은 `writeAndFlush()`가 너무 자주 발생하면 flush를 묶거나 write buffer watermark를 점검한다.

## 한 문장으로 정리하면

Tomcat BIO는 연결을 스레드가 직접 기다리는 모델이고, Tomcat NIO는 소수의 Poller가 많은 소켓의 준비 상태를 감시한 뒤 worker pool이 Servlet 요청을 처리하는 모델이다. Netty는 EventLoop가 readiness 감지, read/write, pipeline 실행을 하나의 흐름으로 묶는 모델이다.

셋은 모두 같은 커널 TCP 버퍼에서 시작한다. 다만 어디서 기다리고, 어디서 읽고, 어디서 애플리케이션 코드를 실행하느냐가 다르다. 그 차이가 동시 연결 수, 스레드 사용량, 백프레셔 방식, 장애의 모양을 바꾼다.
