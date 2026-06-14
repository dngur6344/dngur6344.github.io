---
layout: post
title: 마르코프 체인은 어떻게 현재만 보고 미래를 계산하는가
description: >
  마르코프 성질, 전이확률행렬, n-step 전이, 정지분포, 수렴 조건, 흡수 상태와 가역성을 중심으로 마르코프 체인을 정리합니다.
tags: [math, probability, markov-chain, stochastic-process]
sitemap: false
---

# 마르코프 체인은 어떻게 현재만 보고 미래를 계산하는가

마르코프 체인은 어떤 시스템이 여러 상태 사이를 확률적으로 이동하는 과정을 다룬다. 날씨가 맑음에서 흐림으로 바뀌거나, 사용자가 홈 화면에서 상품 페이지로 이동하거나, 서버가 정상 상태에서 과부하 상태로 바뀌는 일을 하나의 상태 전이 시스템으로 보는 방식이다.

핵심은 단순하다.

```text
다음 상태의 분포는 과거 전체가 아니라 현재 상태에 의해 결정된다.
```

이 말은 과거가 아무 의미 없다는 뜻이 아니다. 과거의 정보가 현재 상태 안에 충분히 요약되어 있다면, 다음을 예측할 때는 현재 상태만 보면 된다는 뜻이다.

<style>
.markov-visual {
  --markov-bg: linear-gradient(135deg, rgba(50, 34, 25, .96), rgba(8, 12, 24, .97));
  --markov-panel: rgba(255, 250, 242, .075);
  --markov-line: rgba(255, 250, 242, .18);
  --markov-ink: #fffaf2;
  --markov-muted: rgba(255, 250, 242, .72);
  --markov-gold: #dfb976;
  --markov-blue: #92b9df;
  --markov-green: #93c7a3;
  --markov-red: #db8d8d;
  margin: 1.25rem 0 1.6rem;
  padding: .95rem;
  border: 1px solid rgba(255, 250, 242, .13);
  border-radius: 8px;
  color: var(--markov-ink);
  background: var(--markov-bg);
  box-shadow: 0 1rem 2.4rem rgba(8, 10, 17, .2);
}

.markov-title {
  margin: 0 0 .75rem;
  color: var(--markov-ink);
  font-size: .78rem;
  font-weight: 700;
}

.markov-grid,
.markov-flow,
.markov-state-map,
.markov-balance {
  display: grid;
  gap: .65rem;
}

.markov-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.markov-grid.three,
.markov-state-map {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.markov-flow.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.markov-card,
.markov-step,
.markov-state,
.markov-balance-row {
  min-width: 0;
  border: 1px solid var(--markov-line);
  border-radius: 6px;
  background: var(--markov-panel);
}

.markov-card,
.markov-state,
.markov-balance-row {
  padding: .72rem;
}

.markov-step {
  position: relative;
  padding: .62rem;
}

.markov-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.markov-visual b,
.markov-visual strong {
  display: block;
  color: var(--markov-ink);
  font-size: .68rem;
  line-height: 1.35;
}

.markov-visual span,
.markov-visual p {
  display: block;
  margin: .22rem 0 0;
  color: var(--markov-muted);
  font-size: .62rem;
  line-height: 1.45;
}

.markov-visual code {
  color: var(--markov-ink);
  background: rgba(8, 10, 17, .34);
}

.markov-state {
  text-align: center;
}

.markov-state b {
  margin: 0 auto .45rem;
  width: 2.35rem;
  height: 2.35rem;
  border: 1px solid rgba(223, 185, 118, .48);
  border-radius: 50%;
  background: rgba(223, 185, 118, .13);
  font-size: .84rem;
  line-height: 2.35rem;
}

.markov-state em {
  display: block;
  margin-top: .25rem;
  color: var(--markov-muted);
  font-style: normal;
  font-size: .58rem;
  line-height: 1.4;
}

.markov-balance {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.markov-balance-row {
  border-color: rgba(147, 199, 163, .3);
  background: rgba(147, 199, 163, .09);
}

.markov-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
  margin-top: .62rem;
}

.markov-chip {
  padding: .32rem .46rem;
  border: 1px solid rgba(223, 185, 118, .38);
  border-radius: 999px;
  color: var(--markov-ink);
  background: rgba(223, 185, 118, .12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .56rem;
}

.markov-chip[data-tone="blue"] {
  border-color: rgba(146, 185, 223, .42);
  background: rgba(146, 185, 223, .13);
}

.markov-chip[data-tone="green"] {
  border-color: rgba(147, 199, 163, .42);
  background: rgba(147, 199, 163, .13);
}

.markov-chip[data-tone="red"] {
  border-color: rgba(219, 141, 141, .42);
  background: rgba(219, 141, 141, .12);
}

.markov-table {
  width: 100%;
  border: 1px solid rgba(143, 94, 60, .32);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 250, 242, .94) !important;
  font-size: .88rem;
}

.markov-table th,
.markov-table td {
  border: 0;
  border-bottom: 1px solid rgba(143, 94, 60, .22);
  color: var(--coffee-ink) !important;
  vertical-align: top;
}

.markov-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
  font-weight: 700;
}

.markov-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .92) !important;
}

.markov-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .94) !important;
}

.markov-table tbody tr:last-child td {
  border-bottom: 0;
}

.markov-table td:first-child {
  color: #4d2d1e !important;
  font-weight: 700;
}

body.dark-mode .markov-table {
  background: rgba(9, 13, 22, .9) !important;
  border-color: rgba(231, 212, 189, .24) !important;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
}

body.dark-mode .markov-table th {
  color: #fff4e5 !important;
  background: rgba(244, 234, 220, .12) !important;
}

body.dark-mode .markov-table td {
  color: #ead8c3 !important;
  border-color: rgba(231, 212, 189, .18) !important;
}

body.dark-mode .markov-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .045) !important;
}

body.dark-mode .markov-table tbody tr:nth-child(even) td {
  background: rgba(255, 250, 242, .074) !important;
}

body.dark-mode .markov-table td:first-child {
  color: #f2c98c !important;
}

body.dark-mode .markov-table code {
  color: #fff4e5 !important;
  background: rgba(255, 250, 242, .08) !important;
}

@media (max-width: 760px) {
  .markov-grid.two,
  .markov-grid.three,
  .markov-flow.four,
  .markov-state-map,
  .markov-balance {
    grid-template-columns: 1fr;
  }

  .markov-step:not(:last-child)::after {
    content: "";
    display: none;
  }
}
</style>

<div class="markov-visual">
  <p class="markov-title">마르코프 체인의 기본 형태</p>
  <div class="markov-flow four">
    <div class="markov-step">
      <b>State</b>
      <span>시스템이 지금 놓인 상태다. 예: 맑음, 흐림, 비.</span>
    </div>
    <div class="markov-step">
      <b>Transition</b>
      <span>현재 상태에서 다음 상태로 이동할 확률이다.</span>
    </div>
    <div class="markov-step">
      <b>Matrix</b>
      <span>모든 전이 확률을 행렬 <code>P</code>에 모은다.</span>
    </div>
    <div class="markov-step">
      <b>Distribution</b>
      <span>시간이 흐를수록 상태 확률 벡터가 변한다.</span>
    </div>
  </div>
</div>

## 마르코프 성질

확률 과정 `X_0, X_1, X_2, ...`가 있을 때, 이 과정이 마르코프 체인이라는 말은 다음 조건을 만족한다는 뜻이다.

```text
P(X_{n+1} = j | X_n = i, X_{n-1}, ..., X_0)
=
P(X_{n+1} = j | X_n = i)
```

미래를 예측할 때 과거 전체를 다시 펼쳐 보지 않고, 현재 상태 `X_n`만 사용한다. 이 성질을 마르코프 성질이라고 한다.

주의할 점이 있다. 마르코프 성질은 "다음 상태가 현재 상태와 독립"이라는 뜻이 아니다. 오히려 다음 상태는 현재 상태에 강하게 의존한다. 다만 현재 상태를 알고 나면, 그 이전의 이력은 추가 정보를 주지 않는다는 뜻이다.

## 전이확률행렬

상태가 `A`, `B`, `C` 세 개라고 하자. 한 단계 뒤 어디로 갈지의 확률은 행렬로 표현할 수 있다.

```text
       next A  next B  next C
A      0.6     0.4     0.0
B      0.3     0.5     0.2
C      0.0     0.6     0.4
```

이 글에서는 행 벡터 관례를 사용한다. 즉, 현재 분포 `pi^(0)`를 왼쪽에 두고 오른쪽에 전이행렬 `P`를 곱한다.

```text
pi^(1) = pi^(0) P
pi^(2) = pi^(0) P^2
pi^(n) = pi^(0) P^n
```

행렬의 각 행은 현재 상태 하나를 의미한다. 어떤 상태에 있든 다음 단계에는 반드시 어딘가의 상태가 되어야 하므로, 각 행의 합은 1이어야 한다. 이런 행렬을 row-stochastic matrix라고 부른다.

<div class="markov-visual">
  <p class="markov-title">상태 전이 예시</p>
  <div class="markov-state-map">
    <div class="markov-state">
      <b>A</b>
      <span>A -> A: 0.6</span>
      <em>A -> B: 0.4</em>
    </div>
    <div class="markov-state">
      <b>B</b>
      <span>B -> A: 0.3</span>
      <em>B -> B: 0.5, B -> C: 0.2</em>
    </div>
    <div class="markov-state">
      <b>C</b>
      <span>C -> B: 0.6</span>
      <em>C -> C: 0.4</em>
    </div>
  </div>
</div>

## n-step 전이 계산

초기 상태가 반드시 `A`라고 하자.

```text
pi^(0) = [1, 0, 0]
```

한 단계 뒤에는 전이행렬의 첫 번째 행 그대로가 된다.

```text
pi^(1) = [1, 0, 0] P
       = [0.6, 0.4, 0.0]
```

두 단계 뒤에는 다시 한 번 `P`를 곱한다.

```text
pi^(2) = [0.6, 0.4, 0.0] P
       = [0.48, 0.44, 0.08]
```

이 값이 중요하다. Notion 원문에는 같은 예시의 두 단계 뒤 분포가 `[0.42, 0.44, 0.14]`로 적혀 있었지만, 행 벡터 관례와 위 전이행렬을 그대로 사용하면 올바른 값은 `[0.48, 0.44, 0.08]`이다.

## 정지분포와 수렴분포

정지분포는 전이 이후에도 변하지 않는 분포다.

```text
pi = pi P
sum(pi_i) = 1
pi_i >= 0
```

위 예시의 정지분포를 풀어보면 다음과 같다.

```text
pi = [0.36, 0.48, 0.16]
```

확인해보면 `pi P = pi`가 된다.

<div class="markov-visual">
  <p class="markov-title">정지분포의 의미</p>
  <div class="markov-balance">
    <div class="markov-balance-row">
      <b>A</b>
      <span>장기적으로 약 36%의 시간은 A에 있다.</span>
    </div>
    <div class="markov-balance-row">
      <b>B</b>
      <span>장기적으로 약 48%의 시간은 B에 있다.</span>
    </div>
    <div class="markov-balance-row">
      <b>C</b>
      <span>장기적으로 약 16%의 시간은 C에 있다.</span>
    </div>
  </div>
</div>

정지분포와 수렴분포는 비슷해 보이지만 구분해야 한다.

정지분포는 "이미 이 분포로 시작하면 한 단계 뒤에도 그대로"라는 대수적 조건이다. 반면 수렴분포는 "어떤 초기 상태에서 시작해도 시간이 충분히 지나면 그 분포로 가까워지는가"라는 극한 조건이다.

유한 상태 마르코프 체인에서는 다음처럼 정리할 수 있다.

<table class="markov-table">
  <thead>
    <tr>
      <th>조건</th>
      <th>의미</th>
      <th>결과</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>유한 상태</td>
      <td>상태 수가 유한하다.</td>
      <td>적어도 하나의 정지분포가 존재한다.</td>
    </tr>
    <tr>
      <td>불가약</td>
      <td>어떤 상태에서든 충분한 단계 뒤 다른 모든 상태로 갈 수 있다.</td>
      <td>유한 체인에서는 정지분포가 유일하다.</td>
    </tr>
    <tr>
      <td>비주기적</td>
      <td>특정 주기마다만 되돌아오는 구조가 아니다.</td>
      <td>불가약성과 함께 있으면 분포가 정지분포로 수렴한다.</td>
    </tr>
    <tr>
      <td>가산 무한 상태</td>
      <td>상태가 무한하지만 셀 수 있다.</td>
      <td>불가약, 비주기성만으로는 부족하고 positive recurrence 조건이 필요하다.</td>
    </tr>
  </tbody>
</table>

즉 "불가약 + 비주기적이면 항상 하나의 분포로 수렴한다"는 말은 유한 상태 체인에서는 안전하지만, 무한 상태 공간까지 일반화하려면 positive recurrence를 함께 확인해야 한다.

## 상태를 분류하는 말들

마르코프 체인을 읽다 보면 여러 성질이 나온다. 처음에는 아래 정도를 구분하면 충분하다.

<table class="markov-table">
  <thead>
    <tr>
      <th>개념</th>
      <th>뜻</th>
      <th>왜 중요한가</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>불가약</td>
      <td>모든 상태가 하나의 연결된 세계 안에 있다.</td>
      <td>장기 분포가 초기 상태에 덜 의존하게 된다.</td>
    </tr>
    <tr>
      <td>주기성</td>
      <td>어떤 상태로 돌아오는 시간이 특정 주기의 배수로만 가능하다.</td>
      <td>주기가 있으면 분포가 흔들리며 수렴하지 않을 수 있다.</td>
    </tr>
    <tr>
      <td>흡수 상태</td>
      <td>들어가면 빠져나오지 못하는 상태다.</td>
      <td>장기적으로 어디에 흡수되는지가 핵심 문제가 된다.</td>
    </tr>
    <tr>
      <td>재귀 상태</td>
      <td>언젠가 다시 돌아올 확률이 1인 상태다.</td>
      <td>무한 상태 체인에서 positive/null recurrence를 구분해야 한다.</td>
    </tr>
    <tr>
      <td>가역성</td>
      <td><code>pi_i P_ij = pi_j P_ji</code>를 만족한다.</td>
      <td>상세균형을 이용해 정지분포를 쉽게 검증할 수 있다.</td>
    </tr>
  </tbody>
</table>

## 흡수 마르코프 체인

흡수 상태가 있는 체인은 장기분포를 볼 때 조심해야 한다. 예를 들어 `종료`, `장애`, `결제 완료` 같은 상태는 한 번 들어가면 더 이상 빠져나오지 않는 상태로 모델링할 수 있다.

```text
P(absorb -> absorb) = 1
```

이런 체인에서는 "전체가 하나의 평형으로 섞인다"보다 "어느 흡수 상태에 도달할 확률이 얼마인가", "흡수되기까지 평균 몇 단계가 걸리는가"가 더 자연스러운 질문이다.

## 연속시간 마르코프 체인

Notion 원문에는 DTMC와 CTMC가 함께 언급되어 있다. 둘은 상태 전이의 철학은 같지만 시간 모델이 다르다.

<table class="markov-table">
  <thead>
    <tr>
      <th>구분</th>
      <th>시간</th>
      <th>핵심 객체</th>
      <th>정지 조건</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>DTMC</td>
      <td>0, 1, 2처럼 단계가 나뉜다.</td>
      <td>전이확률행렬 <code>P</code></td>
      <td><code>pi = pi P</code></td>
    </tr>
    <tr>
      <td>CTMC</td>
      <td>시간이 연속적으로 흐른다.</td>
      <td>전이율 행렬 또는 generator <code>Q</code></td>
      <td><code>pi Q = 0</code></td>
    </tr>
  </tbody>
</table>

CTMC에서는 "다음 단계로 갈 확률"보다 "얼마의 rate로 다른 상태로 점프하는가"가 중심이 된다. 예를 들어 서버 장애 모델에서 정상 상태가 평균적으로 100시간 유지되고, 복구 상태가 평균적으로 2시간 걸리는 식의 시간을 직접 다룰 수 있다.

## 어디에 쓰이는가

마르코프 체인은 단순한 수학 장난이 아니라, "현재 상태를 잘 정의하면 다음 흐름을 확률적으로 계산할 수 있다"는 틀이다.

<div class="markov-visual">
  <p class="markov-title">응용을 읽는 방식</p>
  <div class="markov-grid three">
    <div class="markov-card">
      <b>PageRank</b>
      <span>웹 페이지를 상태로 보고, 링크 클릭을 전이로 본다. 장기 방문 비율이 중요도 점수가 된다.</span>
    </div>
    <div class="markov-card">
      <b>HMM</b>
      <span>품사, 음성, 생물정보처럼 숨은 상태가 있고 관측값만 보이는 문제에 사용된다.</span>
    </div>
    <div class="markov-card">
      <b>MCMC</b>
      <span>원하는 분포를 정지분포로 갖는 체인을 만들어 복잡한 분포에서 샘플링한다.</span>
    </div>
    <div class="markov-card">
      <b>추천/세션</b>
      <span>사용자 행동을 페이지나 상품 상태의 이동으로 보고 다음 행동을 예측한다.</span>
    </div>
    <div class="markov-card">
      <b>시스템 신뢰성</b>
      <span>정상, 과부하, 장애, 복구 상태 사이의 이동을 확률적으로 분석한다.</span>
    </div>
    <div class="markov-card">
      <b>대기행렬</b>
      <span>요청 수, 큐 길이, 서버 상태가 시간에 따라 어떻게 변하는지 모델링한다.</span>
    </div>
  </div>
</div>

PageRank는 특히 좋은 예다. 웹 페이지를 그래프의 노드로 두고, 사용자가 링크를 따라 무작위로 이동한다고 보면 하나의 마르코프 체인이 된다. 장기적으로 어떤 페이지에 오래 머무는지가 그 페이지의 중요도와 연결된다. 실제 PageRank에는 dangling node와 spider trap 문제를 피하기 위한 teleportation이 들어가는데, 이 역시 체인이 잘 섞이도록 만드는 장치로 이해할 수 있다.

## 글을 읽을 때의 기준

마르코프 체인 문서를 볼 때는 아래 질문을 순서대로 던지면 덜 헷갈린다.

```text
1. 상태는 무엇인가?
2. 시간은 discrete인가, continuous인가?
3. 전이확률행렬 P 또는 generator Q는 어떻게 정의되는가?
4. 행 기준인가, 열 기준인가?
5. 정지분포를 묻는가, 수렴분포를 묻는가?
6. 불가약성, 비주기성, 흡수 상태는 어떻게 되는가?
```

특히 4번이 중요하다. 어떤 책은 행 벡터를 쓰고 `pi P`를 계산한다. 어떤 책은 열 벡터를 쓰고 `P pi`를 계산한다. 둘 중 어느 쪽이든 수학적으로는 가능하지만, 한 글 안에서는 관례를 섞으면 계산이 틀어진다.

## 정리

마르코프 체인은 복잡한 이력을 현재 상태 하나로 접어 넣는 모델이다. 상태 정의가 잘 되어 있으면, 다음 상태는 전이확률행렬로 계산할 수 있고, 여러 단계를 지나면 `P^n`이 시스템의 장기 행동을 보여준다.

다만 장기적으로 안정된 분포가 생기는지는 조건을 봐야 한다. 유한 상태에서 불가약이고 비주기적인 체인은 유일한 정지분포로 수렴한다. 흡수 상태가 있거나 주기성이 있거나 무한 상태 공간이라면 이야기가 달라질 수 있다.

그래서 마르코프 체인의 핵심은 "현재만 본다"가 아니라, "미래를 계산하기에 충분한 현재 상태를 어떻게 정의할 것인가"에 있다.

## 참고한 자료

- [MIT OpenCourseWare, Lecture 16: Markov Chains I](https://ocw.mit.edu/courses/6-041-probabilistic-systems-analysis-and-applied-probability-fall-2010/resources/lecture-16-markov-chains-i/)
- [CMU Math, Markov Chains: The Stationary Distribution](https://www.math.cmu.edu/~gautam/c/2025-326/notes/markov2-stationary.html)
- [ProbabilityCourse.com, Stationary and Limiting Distributions for DTMC](https://www.probabilitycourse.com/chapter11/11_2_6_stationary_and_limiting_distributions.php)
- [ProbabilityCourse.com, Stationary and Limiting Distributions for CTMC](https://www.probabilitycourse.com/chapter11/11_3_2_stationary_and_limiting_distributions.php)
- [Stanford CME 323, PageRank lecture notes](https://stanford.edu/~rezab/classes/cme323/S15/notes/lec7.pdf)
