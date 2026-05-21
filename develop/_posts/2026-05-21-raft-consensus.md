---
layout: post
title: Raft 합의 알고리즘은 어떻게 하나의 순서를 만드는가
description: >
  Raft의 leader election, term, replicated log, commit index, log matching, snapshot, joint consensus를 분산 상태 머신 관점에서 정리합니다.
tags: [algorithm, distributed-system, raft, consensus]
sitemap: false
---

# Raft 합의 알고리즘은 어떻게 하나의 순서를 만드는가

분산 시스템에서 가장 어려운 일은 여러 노드가 동시에 존재한다는 사실 자체가 아니다.

진짜 어려운 일은, 서로 다른 노드가 서로 다른 순간에 서로 다른 현실을 본다는 것이다. 어떤 노드는 패킷을 늦게 받고, 어떤 노드는 잠시 멈추고, 어떤 노드는 네트워크에서 떨어져 나간다. 그런데도 시스템은 클라이언트에게 하나의 상태처럼 보여야 한다.

여기서 Raft가 다루는 실패는 악의적인 노드가 거짓말을 하는 Byzantine fault가 아니다. 노드가 멈췄다가 복구되거나, 메시지가 늦거나, 네트워크가 갈라지는 non-Byzantine 환경을 전제로 한다.

Raft는 이 문제를 이렇게 바꿔서 푼다.

> 모든 노드가 같은 명령을 같은 순서로 적용하게 만들자.

결국 Raft의 중심은 리더 선출 자체가 아니다. 리더는 수단이다. 핵심은 `replicated log`, 즉 여러 노드에 같은 순서의 로그를 만들고, 그중 어디까지를 확정된 사실로 볼지 정하는 일이다.

<style>
.raft-visual {
  --raft-panel: rgba(255, 250, 242, .075);
  --raft-panel-strong: rgba(255, 250, 242, .12);
  --raft-line: rgba(255, 250, 242, .18);
  --raft-ink: #fffaf2;
  --raft-muted: rgba(255, 250, 242, .68);
  --raft-blue: #8fb4d9;
  --raft-gold: #d8b16f;
  --raft-green: #8fbf9b;
  --raft-red: #d98989;
}

.raft-visual .raft-strip,
.raft-visual .raft-lanes,
.raft-visual .raft-election,
.raft-visual .raft-quorum,
.raft-visual .raft-safety {
  display: grid;
  gap: .65rem;
}

.raft-visual .raft-strip {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.raft-visual .raft-step,
.raft-visual .raft-card,
.raft-visual .raft-node,
.raft-visual .raft-log,
.raft-visual .raft-note {
  border: 1px solid var(--raft-line);
  border-radius: 6px;
  background: var(--raft-panel);
}

.raft-visual .raft-step {
  position: relative;
  min-width: 0;
  padding: .58rem .62rem;
}

.raft-visual .raft-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.raft-visual .raft-step b,
.raft-visual .raft-card b,
.raft-visual .raft-node b,
.raft-visual .raft-log b,
.raft-visual .raft-note b {
  display: block;
  color: var(--raft-ink);
}

.raft-visual .raft-step b {
  font-size: .66rem;
}

.raft-visual .raft-step span,
.raft-visual .raft-card span,
.raft-visual .raft-node span,
.raft-visual .raft-log span,
.raft-visual .raft-note span {
  display: block;
  margin-top: .14rem;
  color: var(--raft-muted);
  font-size: .62rem;
  line-height: 1.45;
}

.raft-visual .raft-lanes {
  grid-template-columns: .82fr 1.12fr 1.06fr;
  align-items: stretch;
}

.raft-visual .raft-card {
  min-width: 0;
  padding: .72rem;
}

.raft-visual .raft-card-title {
  margin-bottom: .5rem;
  font-size: .74rem;
}

.raft-visual .raft-election {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.raft-visual .raft-node {
  min-width: 0;
  padding: .54rem;
  text-align: center;
}

.raft-visual .raft-node[data-role="leader"] {
  border-color: rgba(216, 177, 111, .48);
  background: rgba(216, 177, 111, .14);
}

.raft-visual .raft-node[data-role="candidate"] {
  border-color: rgba(143, 180, 217, .46);
  background: rgba(143, 180, 217, .12);
}

.raft-visual .raft-node[data-role="follower"] {
  border-color: rgba(143, 191, 155, .36);
}

.raft-visual .raft-node b {
  font-size: .7rem;
}

.raft-visual .raft-log {
  min-width: 0;
  padding: .62rem;
}

.raft-visual .raft-log-row {
  display: grid;
  grid-template-columns: 4.4rem repeat(5, minmax(0, 1fr));
  gap: .32rem;
  align-items: center;
}

.raft-visual .raft-log-row + .raft-log-row {
  margin-top: .38rem;
}

.raft-visual .raft-log-label {
  color: var(--raft-muted);
  font-size: .64rem;
}

.raft-visual .raft-entry {
  min-width: 0;
  padding: .34rem .18rem;
  border: 1px solid rgba(255, 250, 242, .15);
  border-radius: 5px;
  color: var(--raft-ink);
  background: rgba(8, 10, 17, .26);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .62rem;
  line-height: 1.25;
  text-align: center;
}

.raft-visual .raft-entry[data-state="committed"] {
  border-color: rgba(143, 191, 155, .5);
  background: rgba(143, 191, 155, .16);
}

.raft-visual .raft-entry[data-state="candidate"] {
  border-color: rgba(216, 177, 111, .48);
  background: rgba(216, 177, 111, .14);
}

.raft-visual .raft-entry[data-state="conflict"] {
  border-color: rgba(217, 137, 137, .46);
  background: rgba(217, 137, 137, .14);
}

.raft-visual .raft-quorum {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.raft-visual .raft-quorum .raft-node {
  min-height: 4rem;
}

.raft-visual .raft-node[data-side="minority"] {
  border-color: rgba(217, 137, 137, .45);
  background: rgba(217, 137, 137, .1);
}

.raft-visual .raft-node[data-side="majority"] {
  border-color: rgba(143, 191, 155, .48);
  background: rgba(143, 191, 155, .12);
}

.raft-visual .raft-safety {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.raft-visual .raft-note {
  min-width: 0;
  padding: .58rem .62rem;
}

.raft-visual .raft-note b {
  font-size: .66rem;
}

.raft-visual code {
  color: var(--raft-ink);
  background: rgba(8, 10, 17, .28);
}

@media screen and (max-width: 56rem) {
  .raft-visual .raft-strip,
  .raft-visual .raft-lanes,
  .raft-visual .raft-election,
  .raft-visual .raft-quorum,
  .raft-visual .raft-safety {
    grid-template-columns: 1fr;
  }

  .raft-visual .raft-step:not(:last-child)::after {
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

  .raft-visual .raft-log-row {
    grid-template-columns: 1fr;
  }
}
</style>

<div class="gc-visual raft-visual" role="img" aria-label="Raft가 클라이언트 명령을 리더 로그, 팔로워 복제, 과반수 커밋, 상태 머신 적용 순서로 처리하는 흐름도">
  <div class="gc-visual__header">
    <strong>Raft의 기본 흐름</strong>
    <span>리더는 명령의 순서를 정하고, 과반수에 복제된 로그만 상태 머신에 적용한다.</span>
  </div>
  <div class="raft-strip">
    <div class="raft-step"><b>Client</b><span>명령을 보낸다</span></div>
    <div class="raft-step"><b>Leader</b><span>자기 로그에 append</span></div>
    <div class="raft-step"><b>AppendEntries</b><span>팔로워에게 복제</span></div>
    <div class="raft-step"><b>Majority</b><span>과반수 저장 확인</span></div>
    <div class="raft-step"><b>Commit</b><span>확정된 로그가 됨</span></div>
    <div class="raft-step"><b>State Machine</b><span>같은 순서로 적용</span></div>
  </div>
  <div class="raft-lanes">
    <div class="raft-card">
      <b class="raft-card-title">역할</b>
      <div class="raft-election">
        <div class="raft-node" data-role="leader"><b>Leader</b><span>쓰기와 복제를 지휘</span></div>
        <div class="raft-node" data-role="follower"><b>Follower</b><span>리더를 따라감</span></div>
        <div class="raft-node" data-role="candidate"><b>Candidate</b><span>선거 중인 노드</span></div>
      </div>
    </div>
    <div class="raft-card">
      <b class="raft-card-title">로그 복제</b>
      <div class="raft-log">
        <div class="raft-log-row">
          <span class="raft-log-label">Leader</span>
          <span class="raft-entry" data-state="committed">1/T1</span>
          <span class="raft-entry" data-state="committed">2/T1</span>
          <span class="raft-entry" data-state="committed">3/T2</span>
          <span class="raft-entry" data-state="candidate">4/T3</span>
          <span class="raft-entry" data-state="candidate">5/T3</span>
        </div>
        <div class="raft-log-row">
          <span class="raft-log-label">Follower</span>
          <span class="raft-entry" data-state="committed">1/T1</span>
          <span class="raft-entry" data-state="committed">2/T1</span>
          <span class="raft-entry" data-state="committed">3/T2</span>
          <span class="raft-entry" data-state="conflict">4/T2</span>
          <span class="raft-entry" data-state="conflict">5/T2</span>
        </div>
      </div>
      <span>같은 index와 term이 맞을 때만 뒤 로그를 이어 붙인다. 어긋난 suffix는 리더의 로그로 덮어쓴다.</span>
    </div>
    <div class="raft-card">
      <b class="raft-card-title">과반수</b>
      <div class="raft-quorum">
        <div class="raft-node" data-side="minority"><b>A</b><span>고립</span></div>
        <div class="raft-node" data-side="minority"><b>B</b><span>고립</span></div>
        <div class="raft-node" data-side="majority"><b>C</b><span>투표</span></div>
        <div class="raft-node" data-side="majority"><b>D</b><span>투표</span></div>
        <div class="raft-node" data-side="majority"><b>E</b><span>투표</span></div>
      </div>
      <span>5대 중 3대가 모인 쪽만 새 리더를 만들고 커밋을 진행할 수 있다.</span>
    </div>
  </div>
</div>

## 문제는 상태가 아니라 순서다

다음 세 명령을 생각해보자.

```text
SET x = 10
SET y = 20
DEL x
```

모든 노드가 이 명령을 같은 순서로 적용하면 최종 상태는 같다. 반대로 명령이 하나라도 다른 순서로 적용되면, 각 노드는 서로 다른 상태에 도착할 수 있다.

그래서 consensus의 목표는 단순히 “값 하나에 동의한다”에서 끝나지 않는다. 실제 시스템에서는 명령의 긴 흐름에 대해 동의해야 한다. Raft는 이 흐름을 로그로 표현한다.

```text
index 1: SET x = 10
index 2: SET y = 20
index 3: DEL x
```

각 노드는 deterministic state machine을 가지고, 로그에 확정된 명령을 순서대로 적용한다. 같은 입력 순서를 넣으면 같은 결과가 나온다는 전제 위에서, Raft는 “어떤 로그가 진짜인가”를 정한다.

## 리더는 순서를 정하기 위한 장치다

여러 노드가 동시에 쓰기를 받으면 명령 순서가 충돌한다. A는 `SET x=10`을 먼저 봤고, B는 `SET x=20`을 먼저 봤다면 어느 쪽이 앞인지 정해야 한다.

Raft는 이 문제를 단순하게 만든다.

> 쓰기는 리더만 받는다.

리더는 클라이언트 명령을 자신의 로그 끝에 붙인다. 그리고 팔로워에게 같은 entry를 같은 index에 붙이라고 보낸다. 이 single writer 구조 덕분에 로그의 순서를 정하는 중심이 하나로 모인다.

물론 리더도 실패할 수 있다. 그래서 Raft에는 세 가지 역할이 있다.

- `Follower`: 평소 상태다. 리더의 heartbeat와 `AppendEntries`를 기다린다.
- `Candidate`: 일정 시간 리더 소식이 없을 때 선거에 나선다.
- `Leader`: 클라이언트 쓰기를 받고 로그 복제를 지휘한다.

## Term은 리더의 시대 번호다

Raft에서 `term`은 선거 epoch에 가깝다. term은 단조 증가하고, 노드는 더 큰 term을 보면 자신이 알고 있던 낡은 리더십을 내려놓는다.

```text
Term 7의 리더가 있음
새 선거가 시작되어 Term 8이 됨
Term 7 리더가 뒤늦게 메시지를 보내도 낡은 메시지로 취급됨
```

이 규칙은 오래된 리더가 새 클러스터를 덮어쓰지 못하게 만든다. 네트워크가 잠깐 갈라졌다가 다시 붙었을 때, 예전 리더는 더 큰 term을 보고 follower로 내려간다.

## Leader election은 과반수와 로그 최신성으로 결정된다

Follower는 리더의 heartbeat를 받지 못하면 election timeout 이후 candidate가 된다. Candidate는 term을 올리고, 자신에게 투표한 뒤, 다른 노드에게 `RequestVote` RPC를 보낸다.

리더가 되려면 과반수 표가 필요하다.

```text
3-node cluster: 2표 필요
5-node cluster: 3표 필요
7-node cluster: 4표 필요
```

과반수가 중요한 이유는 임의의 두 과반수가 반드시 겹치기 때문이다. 이 겹치는 노드가 “이전에 어떤 로그가 커밋되었는지”를 새 리더 선출 과정에 가져온다.

투표에는 한 가지 더 중요한 조건이 있다. Voter는 candidate의 로그가 자기 로그보다 적어도 최신이어야 투표한다. 최신성은 마지막 로그 entry의 term을 먼저 비교하고, term이 같으면 마지막 index를 비교한다.

이 규칙이 없다면 오래된 로그만 가진 노드가 리더가 되어 이미 커밋된 로그를 잃어버릴 수 있다. Raft는 투표 단계에서부터 그런 리더가 선출되지 않도록 막는다.

Election timeout은 보통 랜덤하게 흩어진다. 모든 follower가 동시에 candidate가 되면 표가 갈라질 수 있기 때문이다. 랜덤 timeout은 한 노드가 먼저 선거를 시작하고 heartbeat를 보내 다른 노드의 선거를 멈추게 만든다.

## Log replication은 prefix를 맞추는 작업이다

리더가 명령을 받으면 먼저 자기 로그에 entry를 붙인다.

```text
Leader log
1/T1  2/T1  3/T2  4/T3
```

그 다음 팔로워에게 `AppendEntries`를 보낸다. 이 RPC에는 새 entry만 들어가는 것이 아니라, 바로 앞 entry의 index와 term도 함께 들어간다.

```text
AppendEntries
  prevLogIndex = 3
  prevLogTerm  = T2
  entries      = [4/T3]
```

Follower는 자기 로그의 `3/T2`가 실제로 맞는지 확인한다. 맞으면 `4/T3`을 이어 붙인다. 맞지 않으면 거절한다.

이 검사가 Log Matching Property의 핵심이다.

> 두 로그가 같은 index와 같은 term의 entry를 가지고 있다면, 그 이전 로그도 동일하다.

만약 follower의 뒤쪽 로그가 leader와 다르면, leader는 follower의 conflicting suffix를 지우고 자신의 suffix를 다시 복제한다.

```text
Leader
1/T1  2/T1  3/T2  4/T3  5/T3

Follower before repair
1/T1  2/T1  3/T2  4/T2  5/T2

Follower after repair
1/T1  2/T1  3/T2  4/T3  5/T3
```

여기서 지워지는 entry는 아직 커밋되지 않은 로그다. Raft에서 진짜 상태는 “어떤 노드에 적혀 있느냐”가 아니라 “과반수가 안전하게 보유하고 커밋되었느냐”로 결정된다.

## Replicated와 committed는 다르다

로그가 어떤 follower에 복제되었다고 해서 바로 확정되는 것은 아니다.

- `replicated`: 일부 노드에 복사되었다.
- `committed`: 과반수가 저장했고, 상태 머신에 적용해도 안전하다.

리더는 각 follower가 어디까지 복제했는지 추적한다. 특정 entry가 과반수에 저장되면 commit index를 앞으로 밀 수 있다. 그 뒤 리더와 follower는 commit index까지의 entry를 state machine에 적용한다.

다만 Raft에는 섬세한 안전 규칙이 하나 있다.

리더는 “현재 term의 entry”에 대해서만 과반수 복제 여부를 세어 직접 커밋할 수 있다. 예전 term의 entry는 새 리더가 현재 term의 entry를 커밋하면서 함께 커밋된 것으로 따라온다.

이 규칙은 오래된 term의 로그가 애매하게 복제된 상태에서 새 리더가 생겼을 때, 커밋 여부를 잘못 판단하는 일을 막는다.

## 네트워크가 갈라지면 과반수 쪽만 앞으로 간다

5대 클러스터에서 리더 A가 B와 함께 고립되고, C, D, E가 서로 통신할 수 있다고 해보자.

```text
Partition 1: A, B       -> 2대, 과반수 없음
Partition 2: C, D, E    -> 3대, 과반수 있음
```

A가 예전 리더였더라도 A는 새 로그를 커밋할 수 없다. 과반수 응답을 받을 수 없기 때문이다.

반대로 C, D, E 쪽은 timeout 이후 새 선거를 열고 새 리더를 뽑을 수 있다. 이후 네트워크가 회복되면 A는 더 큰 term을 보고 follower가 된다. A와 B에 남아 있던 미커밋 로그는 새 리더의 로그에 맞게 정리된다.

이것이 Raft가 split brain을 다루는 기본 감각이다.

> 동시에 두 리더가 보일 수는 있어도, 동시에 두 리더가 서로 다른 값을 커밋할 수는 없다.

## Safety는 몇 가지 불변식으로 버틴다

Raft 논문은 안전성을 몇 가지 속성으로 정리한다. 이름은 딱딱하지만, 의미는 실무적으로 중요하다.

<div class="gc-visual raft-visual" role="img" aria-label="Raft safety properties 요약">
  <div class="gc-visual__header">
    <strong>Raft safety properties</strong>
    <span>선거, 로그, 상태 머신 적용 시점이 서로 맞물려 커밋된 명령을 잃지 않게 한다.</span>
  </div>
  <div class="raft-safety">
    <div class="raft-note"><b>Election Safety</b><span>한 term에는 최대 한 명의 leader만 선출된다.</span></div>
    <div class="raft-note"><b>Leader Append-Only</b><span>leader는 자기 로그를 덮어쓰지 않고 끝에 append만 한다.</span></div>
    <div class="raft-note"><b>Log Matching</b><span>같은 index와 term이면 그 이전 prefix도 같다.</span></div>
    <div class="raft-note"><b>Leader Completeness</b><span>커밋된 entry는 이후 leader의 로그에 남는다.</span></div>
    <div class="raft-note"><b>State Machine Safety</b><span>같은 index에는 서로 다른 명령이 적용되지 않는다.</span></div>
  </div>
</div>

이 속성들이 함께 있어야 “모든 healthy node가 같은 명령을 같은 순서로 적용한다”는 목표가 유지된다.

## 읽기에서도 리더 확인이 필요하다

쓰기의 경우 리더가 로그를 과반수에 복제하므로 순서가 분명하다. 읽기는 조금 더 조심해야 한다.

리더처럼 보이는 노드가 사실은 이미 폐위된 옛 리더일 수 있기 때문이다. 이 노드가 로컬 상태만 읽어 응답하면 stale read가 생길 수 있다.

그래서 선형화 가능한 read를 보장하려면 리더가 자신이 여전히 리더인지 확인해야 한다. 구현에 따라 현재 term의 no-op entry를 먼저 커밋하거나, read 전에 과반수 heartbeat를 확인하는 방식이 쓰인다. 일부 시스템은 leader lease로 읽기를 빠르게 만들지만, 이 경우에는 clock skew와 timeout 설정을 더 신중하게 봐야 한다.

클라이언트가 요청을 보낸 뒤 응답을 받기 전에 리더가 죽으면, 클라이언트는 같은 명령을 다시 보낼 수 있다. 이때 중복 실행까지 막아 exactly-once처럼 보이게 하려면 Raft 로그만으로는 부족하고, 클라이언트 요청 ID나 serial number를 상태 머신 쪽에서 함께 관리해야 한다.

## Snapshot은 오래된 로그를 접는 방식이다

Raft 로그는 계속 늘어난다. 모든 명령을 영원히 보관하면 디스크도 커지고, 재시작이나 follower catch-up도 느려진다.

그래서 실제 구현은 snapshot을 만든다.

```text
log 1..1000000 적용 완료
현재 state를 snapshot으로 저장
snapshot lastIncludedIndex = 1000000
그 이전 로그는 버림
```

느린 follower가 너무 뒤처져서 리더가 더 이상 필요한 옛 로그를 가지고 있지 않다면, 리더는 로그 entry 대신 snapshot을 보낸다. Follower는 snapshot을 설치하고, 그 이후의 로그부터 다시 따라온다.

Snapshot은 합의의 의미를 바꾸지 않는다. 단지 이미 확정되어 상태에 반영된 오래된 로그를 더 압축된 형태로 접어두는 것이다.

## Joint consensus는 멤버십 변경의 안전장치다

클러스터를 3대에서 5대로 늘리는 일도 단순하지 않다. 잘못 바꾸면 옛 구성과 새 구성이 각각 자기 과반수를 만들 수 있다.

Raft의 joint consensus는 전환 구간에서 old configuration과 new configuration의 과반수가 겹치도록 만든다.

```text
Cold: A, B, C
Cnew: A, B, C, D, E

전환 중에는 Cold의 과반수와 Cnew의 과반수를 모두 만족해야 함
```

이 겹침 덕분에 멤버십 변경 중에도 서로 독립적인 두 개의 현실이 생기지 않는다.

## 운영에서는 알고리즘보다 시간 감각이 어렵다

Raft는 clock에 전적으로 의존하는 알고리즘은 아니다. 안전성은 term, vote, log matching, majority quorum에서 나온다. 하지만 운영의 안정성은 timeout과 지연 시간에 크게 흔들린다.

대표적인 문제는 이렇다.

- `GC pause`: 리더가 오래 멈추면 follower가 리더 장애로 오해하고 선거를 시작할 수 있다.
- `slow fsync`: 로그를 안정 저장소에 쓰는 시간이 늘면 commit latency가 늘어난다.
- `network jitter`: heartbeat가 늦어져 불필요한 election이 발생할 수 있다.
- `majority placement`: 과반수 노드가 먼 리전에 흩어지면 write latency가 RTT를 따라 커진다.
- `Multi-Raft imbalance`: shard나 region마다 Raft group을 운영하면 특정 노드에 leader가 몰릴 수 있다.

etcd 같은 실제 시스템에서 Raft commit latency는 네트워크 RTT와 디스크 sync 시간의 영향을 강하게 받는다. Raft가 논리적으로 단순해 보여도, 운영에서는 네트워크와 디스크가 합의의 체감 속도를 만든다.

## 한 문장으로 정리하면

Raft는 분산 환경에서 하나의 리더를 뽑는 알고리즘이 아니라, 과반수 quorum과 replicated log를 이용해 모든 노드가 같은 명령 순서를 공유하도록 만드는 strongly consistent distributed state machine protocol이다.

리더는 그 순서를 정하기 위한 장치이고, term은 낡은 리더십을 밀어내는 시간표이며, commit index는 어디까지가 확정된 현실인지 가리키는 표시다.

따뜻한 커피가 식어가듯, 분산 시스템의 각 노드는 조금씩 다른 시간을 지난다. Raft는 그 다른 시간들 사이에 하나의 로그를 놓고, 모두가 같은 줄을 읽게 만든다.

## 참고한 자료

- [The Raft Consensus Algorithm](https://raft.github.io/)
- [In Search of an Understandable Consensus Algorithm, Extended Version](https://raft.github.io/raft.pdf)
- [etcd Performance](https://etcd.io/docs/v3.7/op-guide/performance/)
