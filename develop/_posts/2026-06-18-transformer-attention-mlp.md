---
layout: post
title: Transformer는 어떻게 문맥을 계산하는가
description: >
  DNN, CNN, RNN에서 Transformer로 이어지는 흐름과 self-attention, multi-head attention, MLP/FFN, positional encoding을 수식과 직관으로 정리합니다.
tags: [ai, transformer, attention, neural-network, deep-learning, llm]
sitemap: false
---

# Transformer는 어떻게 문맥을 계산하는가

Transformer를 처음 보면 이상한 이름들이 한꺼번에 나온다. Token, embedding, query, key, value, attention, multi-head, MLP, residual, layer norm. 이름만 따라가면 커피가 식기도 전에 길을 잃기 쉽다.

하지만 안쪽의 큰 흐름은 차분하다.

```text
토큰을 벡터로 바꾼다.
각 토큰이 다른 토큰을 얼마나 참고할지 계산한다.
참고한 정보를 섞어 문맥이 반영된 벡터를 만든다.
그 벡터를 MLP로 다시 해석하고 다음 층으로 보낸다.
```

<style>
.transformer-visual {
  --tx-bg: linear-gradient(135deg, rgba(54, 34, 24, .96), rgba(8, 11, 25, .98));
  --tx-panel: rgba(255, 250, 242, .078);
  --tx-panel-strong: rgba(255, 250, 242, .13);
  --tx-line: rgba(255, 250, 242, .18);
  --tx-ink: #fffaf2;
  --tx-muted: rgba(255, 250, 242, .72);
  --tx-gold: #dfb976;
  --tx-blue: #96bfe6;
  --tx-green: #97cfa8;
  --tx-red: #e29a9a;
  --tx-violet: #b8a4ed;
  margin: 1.25rem 0 1.65rem;
  padding: .95rem;
  border: 1px solid rgba(255, 250, 242, .14);
  border-radius: 8px;
  color: var(--tx-ink);
  background: var(--tx-bg);
  box-shadow: 0 1rem 2.4rem rgba(8, 10, 17, .22);
}

.transformer-title {
  margin: 0 0 .75rem;
  color: var(--tx-ink);
  font-size: .78rem;
  font-weight: 700;
}

.transformer-grid,
.transformer-flow,
.transformer-stack,
.transformer-matrix,
.transformer-token-row,
.transformer-table-wrap {
  display: grid;
  gap: .65rem;
}

.transformer-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.transformer-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.transformer-flow.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.transformer-stack {
  grid-template-columns: .95fr 1.1fr .95fr;
  align-items: stretch;
}

.transformer-card,
.transformer-step,
.transformer-block,
.transformer-token,
.transformer-weight,
.transformer-chip {
  min-width: 0;
  border: 1px solid var(--tx-line);
  border-radius: 6px;
  background: var(--tx-panel);
}

.transformer-card,
.transformer-block {
  padding: .72rem;
}

.transformer-step {
  position: relative;
  padding: .62rem;
}

.transformer-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.transformer-visual b,
.transformer-visual strong {
  display: block;
  color: var(--tx-ink);
  font-size: .68rem;
  line-height: 1.35;
}

.transformer-visual span,
.transformer-visual p {
  display: block;
  margin: .22rem 0 0;
  color: var(--tx-muted);
  font-size: .62rem;
  line-height: 1.45;
}

.transformer-visual code {
  color: var(--tx-ink);
  background: rgba(255, 250, 242, .1);
}

.transformer-token-row {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.transformer-token {
  padding: .55rem .45rem;
  text-align: center;
}

.transformer-token em {
  display: block;
  color: var(--tx-gold);
  font-style: normal;
  font-size: .62rem;
}

.transformer-matrix {
  grid-template-columns: 1fr 1.15fr 1fr;
  align-items: center;
}

.transformer-weight {
  padding: .55rem;
}

.transformer-bar {
  height: .42rem;
  margin-top: .3rem;
  border-radius: 999px;
  background: rgba(255, 250, 242, .13);
  overflow: hidden;
}

.transformer-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--tx-gold), var(--tx-blue));
}

.transformer-chip {
  display: inline-block;
  margin: .14rem .12rem 0 0;
  padding: .25rem .38rem;
  color: var(--tx-ink);
  font-size: .58rem;
  line-height: 1.25;
}

.transformer-block.attn {
  border-color: rgba(150, 191, 230, .42);
}

.transformer-block.mlp {
  border-color: rgba(223, 185, 118, .42);
}

.transformer-block.norm {
  border-color: rgba(151, 207, 168, .38);
}

.transformer-table {
  width: 100%;
  margin: .15rem 0 0;
  border-collapse: collapse;
  color: var(--tx-ink);
  background: rgba(255, 250, 242, .035);
  font-size: .66rem;
  line-height: 1.45;
}

.transformer-table th,
.transformer-table td {
  border: 1px solid rgba(255, 250, 242, .16);
  padding: .56rem .6rem;
  color: var(--tx-ink);
  background: rgba(255, 250, 242, .055);
  vertical-align: top;
}

.transformer-table th {
  color: #19130f;
  background: rgba(223, 185, 118, .82);
  font-weight: 700;
}

.transformer-table tr:nth-child(even) td {
  background: rgba(255, 250, 242, .085);
}

.transformer-table td:first-child {
  color: var(--tx-gold);
  font-weight: 700;
}

html[data-mode="dark"] .transformer-table th,
html[data-theme="dark"] .transformer-table th,
body.dark-mode .transformer-table th {
  color: #19130f;
}

@media (max-width: 760px) {
  .transformer-grid.two,
  .transformer-grid.three,
  .transformer-flow.four,
  .transformer-stack,
  .transformer-matrix,
  .transformer-token-row {
    grid-template-columns: 1fr;
  }

  .transformer-step:not(:last-child)::after {
    content: "↓";
    right: 50%;
    top: auto;
    bottom: -.6rem;
    transform: translate(50%, 50%);
  }
}
</style>

## 먼저 신경망은 무엇을 학습하나

딥러닝 모델을 아주 건조하게 말하면, 파라미터를 가진 함수다.

```text
예측값 = f_theta(x)
theta = 학습으로 바뀌는 모든 숫자
```

완전연결층이라면 `W`, `b`가 파라미터다. CNN이라면 필터 안의 숫자도 파라미터고, Transformer라면 embedding table, `W_Q`, `W_K`, `W_V`, MLP의 가중치들이 모두 파라미터다. 학습은 손실 `L(theta)`를 줄이도록 이 숫자들을 조금씩 바꾸는 과정이다.

```text
h = sigma(xW + b)
theta <- theta - eta * grad_theta L(theta)
```

여기서 중요한 점은 입력 데이터 자체가 파라미터는 아니라는 것이다. 모델은 데이터를 보고, 그 데이터를 더 잘 설명하는 내부 숫자들을 업데이트한다. 실무적으로는 “경사하강으로 업데이트되는 값들 전부”를 파라미터라고 보면 된다.

<div class="transformer-visual">
  <p class="transformer-title">신경망 계열이 데이터를 다루는 방식</p>
  <div class="transformer-flow four">
    <div class="transformer-step">
      <strong>DNN / MLP</strong>
      <span>벡터 전체를 선형 변환과 비선형 함수로 처리한다.</span>
    </div>
    <div class="transformer-step">
      <strong>CNN</strong>
      <span>근처 픽셀/토큰의 지역 패턴을 필터로 훑는다.</span>
    </div>
    <div class="transformer-step">
      <strong>RNN</strong>
      <span>시퀀스를 왼쪽에서 오른쪽으로 읽으며 상태에 압축한다.</span>
    </div>
    <div class="transformer-step">
      <strong>Transformer</strong>
      <span>각 토큰이 다른 토큰을 직접 조회하며 문맥을 만든다.</span>
    </div>
  </div>
</div>

## CNN과 RNN을 거쳐 Transformer로

Transformer가 갑자기 하늘에서 떨어진 구조는 아니다. 기존 신경망의 장점과 한계를 보면 왜 attention이 중심으로 올라왔는지 보인다.

### DNN / MLP

MLP는 벡터를 받아 여러 층의 선형 변환과 비선형 함수를 통과시킨다.

```text
h_1 = sigma(xW_1 + b_1)
h_2 = sigma(h_1W_2 + b_2)
```

이 구조는 강력하지만 입력의 구조를 별도로 가정하지 않는다. 이미지의 2차원 공간 구조나 문장의 순서를 처음부터 잘 살려 주지는 않는다. 모든 것을 벡터로 펼쳐서 처리하면 표현력은 있지만, 데이터가 가진 자연스러운 구조를 활용하기 어렵다.

### CNN

CNN은 이미지처럼 공간 구조가 있는 데이터에 잘 맞는다. 핵심은 두 가지다.

```text
local receptive field: 가까운 영역만 본다.
weight sharing: 같은 필터를 여러 위치에 반복 적용한다.
```

합성곱층의 계산은 보통 다음처럼 볼 수 있다. 실제 딥러닝 프레임워크의 convolution layer는 엄밀한 수학적 convolution이라기보다 cross-correlation 형태로 구현되는 경우가 많지만, 학습되는 필터 관점에서는 같은 패턴 감지기로 이해해도 충분하다.

```text
y[i, j, k] = b[k] + sum_u sum_v sum_c W[u, v, c, k] * x[i+u, j+v, c]
```

CNN은 “어디에 있든 비슷한 지역 패턴은 같은 필터로 찾는다”는 강한 귀납 편향을 가진다. 그래서 이미지에서는 오래 강력했다. 다만 멀리 떨어진 요소 사이의 관계를 직접 계산하려면 층을 깊게 쌓거나 별도 구조가 필요하다.

### RNN

RNN은 순서가 있는 데이터를 한 토큰씩 읽는다.

```text
h_t = phi(W_x x_t + W_h h_{t-1} + b)
```

여기서 `h_t`는 지금까지 읽은 정보를 담은 상태다. 구조가 직관적이고 효율적이지만, 긴 문맥에서는 과거 전체를 하나의 상태에 계속 압축해야 한다. LSTM/GRU는 이 문제를 완화하려고 게이트를 도입했지만, 기본적으로 순차 계산이라는 성격은 남는다.

이 차이는 기억을 저장하는 방식으로도 볼 수 있다. RNN은 과거를 하나의 상태에 압축하는 쪽에 가깝고, Transformer attention은 과거 토큰의 정보를 직접 조회하는 쪽에 가깝다. 둘 중 어느 하나가 항상 정답이라기보다, 과거 정보를 어느 해상도로 저장하고 어떻게 검색할지가 핵심이다.

## Transformer의 핵심 전환

Transformer의 핵심은 recurrent state를 중심에 두지 않는다는 점이다. 각 토큰은 한 번에 다른 토큰들을 바라보고, 필요한 정보를 가중합으로 가져온다.

Transformer 원 논문의 표현을 빌리면, attention 함수는 query와 key-value 쌍들을 받아 output을 만든다. output은 value들의 가중합이고, 각 value에 주는 weight는 query와 key의 compatibility로 계산된다.

한 토큰이 다른 토큰을 읽는 흐름은 다음과 같다.

<div class="transformer-visual">
  <p class="transformer-title">Self-attention 한 층의 직관</p>
  <div class="transformer-token-row">
    <div class="transformer-token"><em>토큰 1</em><strong>고양이</strong></div>
    <div class="transformer-token"><em>토큰 2</em><strong>생선을</strong></div>
    <div class="transformer-token"><em>토큰 3</em><strong>조용히</strong></div>
    <div class="transformer-token"><em>토큰 4</em><strong>먹었다</strong></div>
  </div>
  <div class="transformer-matrix">
    <div class="transformer-block attn">
      <strong>Query</strong>
      <span>`먹었다`가 지금 알고 싶은 것</span>
      <span>누가 먹었지? 무엇을 먹었지?</span>
    </div>
    <div>
      <div class="transformer-weight">
        <strong>고양이 0.36</strong>
        <span>주어 후보로 강하게 참고</span>
        <div class="transformer-bar"><i style="width:36%"></i></div>
      </div>
      <div class="transformer-weight">
        <strong>생선을 0.44</strong>
        <span>목적어 후보로 가장 강하게 참고</span>
        <div class="transformer-bar"><i style="width:44%"></i></div>
      </div>
      <div class="transformer-weight">
        <strong>조용히 0.12</strong>
        <span>행동 방식으로 약하게 참고</span>
        <div class="transformer-bar"><i style="width:12%"></i></div>
      </div>
      <div class="transformer-weight">
        <strong>먹었다 0.08</strong>
        <span>자기 자신도 조금 참고</span>
        <div class="transformer-bar"><i style="width:8%"></i></div>
      </div>
    </div>
    <div class="transformer-block mlp">
      <strong>Weighted sum of Values</strong>
      <span>`먹었다`의 새 표현은 주변 토큰 정보가 섞인 문맥 벡터가 된다.</span>
      <span class="transformer-chip">행동</span>
      <span class="transformer-chip">주어</span>
      <span class="transformer-chip">목적어</span>
      <span class="transformer-chip">어조</span>
    </div>
  </div>
</div>

여기서 주의할 점이 있다. 이 그림의 숫자는 이해를 위한 예시다. 실제 모델에서는 head와 layer마다 attention weight가 다르고, 그 weight가 사람이 붙인 문법 규칙처럼 깔끔하게 해석된다고 보장할 수는 없다. 그래도 “토큰이 다른 토큰의 정보를 동적으로 가져온다”는 큰 직관은 맞다.

## Q, K, V는 무엇인가

입력 토큰 벡터들을 행렬 `X`라고 하자. 시퀀스 길이가 `n`, hidden dimension이 `d_model`이면 다음처럼 둘 수 있다.

```text
X in R^(n x d_model)
Q = X W_Q
K = X W_K
V = X W_V
```

각 토큰은 같은 원본 벡터에서 세 가지 역할의 벡터를 만든다.

<table class="transformer-table">
  <thead>
    <tr>
      <th>벡터</th>
      <th>역할</th>
      <th>직관</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Query</td>
      <td>현재 토큰이 찾고 싶은 정보의 방향</td>
      <td>나는 지금 무엇을 물어보고 있나?</td>
    </tr>
    <tr>
      <td>Key</td>
      <td>각 토큰이 자신을 찾을 수 있게 내거는 색인</td>
      <td>나는 어떤 질문에 잘 맞는 정보인가?</td>
    </tr>
    <tr>
      <td>Value</td>
      <td>실제로 전달되는 정보 벡터</td>
      <td>나를 참고한다면 어떤 내용을 가져갈 것인가?</td>
    </tr>
  </tbody>
</table>

attention의 전체 식은 다음과 같다.

```text
Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) V
```

계산은 네 단계로 읽으면 된다.

```text
1. QK^T: 각 토큰의 query와 모든 토큰의 key를 내적한다.
2. / sqrt(d_k): 내적 값이 너무 커져 softmax가 뾰족해지는 것을 완화한다.
3. softmax: 참고 비중을 확률분포처럼 만든다.
4. * V: value들을 그 비중대로 가중합한다.
```

Q/K는 “얼마나 볼지”를 정하고 V는 “무엇을 가져올지”를 담당한다. 그래서 attention은 정보를 섞는 라우팅 시스템에 가깝다.

## Multi-head attention은 왜 필요한가

하나의 attention만 있으면 모든 관계를 한 가지 관점으로 봐야 한다. 문장 안에는 여러 관계가 동시에 있다. 주어-동사 관계, 수식어 관계, 지시어 관계, 문장 부호의 역할, 장거리 의존성 같은 것들이 서로 다른 방식으로 중요해진다.

Multi-head attention은 같은 입력을 여러 projection 공간으로 보내고, 각 head가 다른 attention을 계산하게 한다.

```text
head_i = Attention(XW_Q_i, XW_K_i, XW_V_i)
MultiHead(X) = Concat(head_1, ..., head_h) W_O
```

각 head가 반드시 사람이 이름 붙일 수 있는 역할 하나를 맡는다고 단정하면 위험하다. 그러나 여러 head가 서로 다른 부분공간에서 관계를 계산하기 때문에, 하나의 attention보다 다양한 상호작용을 표현할 수 있다.

## 위치 정보가 없으면 순서를 모른다

self-attention만 보면 토큰 집합을 한꺼번에 비교한다. 그래서 별도 위치 정보가 없으면 순서가 바뀌어도 구조적으로 구분하기 어렵다. Transformer 원 논문은 sinusoidal positional encoding을 embedding에 더했다. 이후 모델들은 learned positional embedding, relative position, RoPE 같은 여러 방식을 쓴다.

핵심은 하나다.

```text
토큰의 의미 벡터 + 위치 신호 = 순서를 가진 토큰 표현
```

“나는 어떤 단어인가”와 “나는 어디에 있는가”를 같이 넣어야 문장 구조를 계산할 수 있다.

## MLP는 attention 뒤에서 무엇을 하나

Transformer block 안에는 attention만 있는 것이 아니다. attention 뒤에는 position-wise feed-forward network, 흔히 MLP 또는 FFN이라 부르는 부분이 있다.

```text
FFN(x) = W_2 sigma(W_1 x + b_1) + b_2
```

Transformer 원 논문에서는 ReLU를 썼고, 이후 많은 모델은 GELU 같은 활성 함수를 사용한다. 일반적으로 `d_model`보다 큰 `d_ff`로 확장했다가 다시 줄인다.

```text
d_model -> d_ff -> d_model
예: 768 -> 3072 -> 768
```

중요한 구분은 이것이다.

```text
Attention: 토큰 사이의 정보를 섞는다.
MLP/FFN: 각 토큰 벡터를 독립적으로 비선형 변환한다.
```

MLP는 토큰 간 통신을 직접 하지는 않는다. 그 일은 attention이 맡는다. 대신 attention이 모아 온 문맥 벡터를 더 복잡한 feature 공간으로 보내고, 비선형 변환을 거쳐 다음 층이 쓰기 좋은 표현으로 바꾼다.

<div class="transformer-visual">
  <p class="transformer-title">Transformer block의 반복 구조</p>
  <div class="transformer-stack">
    <div class="transformer-block">
      <strong>입력 표현</strong>
      <span>token embedding + position</span>
      <span class="transformer-chip">x</span>
    </div>
    <div class="transformer-grid two">
      <div class="transformer-block attn">
        <strong>Multi-head attention</strong>
        <span>토큰 간 정보를 주고받는다.</span>
      </div>
      <div class="transformer-block norm">
        <strong>Add & Norm</strong>
        <span>residual connection과 normalization으로 깊은 층을 안정화한다.</span>
      </div>
      <div class="transformer-block mlp">
        <strong>MLP / FFN</strong>
        <span>각 토큰의 문맥 벡터를 비선형 변환한다.</span>
      </div>
      <div class="transformer-block norm">
        <strong>Add & Norm</strong>
        <span>다음 block으로 넘길 표현을 정돈한다.</span>
      </div>
    </div>
    <div class="transformer-block">
      <strong>출력 표현</strong>
      <span>더 깊은 문맥이 반영된 token state</span>
      <span class="transformer-chip">x'</span>
    </div>
  </div>
</div>

여기서 residual connection은 입력을 바로 더해 주는 길이다. 깊은 모델에서 매 층이 표현을 완전히 갈아엎는 것이 아니라, 기존 표현 위에 필요한 변화량을 더하게 만든다. Layer normalization은 값의 스케일을 정돈해 학습을 안정적으로 만든다.

## Encoder, decoder, decoder-only

Transformer는 처음에는 machine translation을 위한 encoder-decoder 구조로 제안되었다.

<table class="transformer-table">
  <thead>
    <tr>
      <th>구조</th>
      <th>attention 방식</th>
      <th>대표 사용</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Encoder</td>
      <td>입력 전체를 양방향으로 본다.</td>
      <td>BERT 계열, 분류, 검색용 임베딩</td>
    </tr>
    <tr>
      <td>Decoder</td>
      <td>미래 토큰을 보지 못하게 causal mask를 쓴다.</td>
      <td>GPT 계열, 다음 토큰 생성</td>
    </tr>
    <tr>
      <td>Encoder-Decoder</td>
      <td>encoder 입력을 decoder가 cross-attention으로 참고한다.</td>
      <td>번역, 요약, 입력-출력 변환</td>
    </tr>
  </tbody>
</table>

LLM이 다음 토큰을 생성할 때는 보통 decoder-only 구조를 쓴다. 현재까지의 토큰만 보고 다음 토큰 분포를 만든다.

```text
hidden state -> vocabulary logits -> softmax -> next token distribution
```

여기서도 중요한 구분이 있다. embedding table이나 `W_Q`, `W_K`, `W_V` 같은 파라미터는 학습 후 추론 중에는 고정되어 있다. 그러나 각 토큰의 최종 표현과 attention weight는 입력 문맥에 따라 매번 달라진다. 즉 초기 임베딩은 고정된 테이블에서 시작하지만, 레이어를 지난 문맥 표현은 동적으로 바뀐다.

## CNN, RNN, Transformer를 같은 지도 위에 놓기

세 구조는 서로를 단순히 대체했다기보다, 데이터의 어떤 구조를 먼저 믿을 것인가가 다르다.

<div class="transformer-visual">
  <p class="transformer-title">구조별 귀납 편향과 비용</p>
  <div class="transformer-table-wrap">
    <table class="transformer-table">
      <thead>
        <tr>
          <th>구조</th>
          <th>먼저 믿는 것</th>
          <th>강점</th>
          <th>주의점</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>DNN / MLP</td>
          <td>충분한 파라미터와 비선형 변환</td>
          <td>일반적인 함수 근사에 강하다.</td>
          <td>입력 구조를 직접 활용하는 편향은 약하다.</td>
        </tr>
        <tr>
          <td>CNN</td>
          <td>지역성, 가중치 공유, 위치 이동에 대한 견고함</td>
          <td>이미지와 격자형 데이터에서 효율적이다.</td>
          <td>멀리 떨어진 요소 관계는 직접 보기 어렵다.</td>
        </tr>
        <tr>
          <td>RNN / LSTM</td>
          <td>순서대로 읽으며 상태에 기억을 누적</td>
          <td>streaming 처리와 순차 구조에 자연스럽다.</td>
          <td>긴 과거를 하나의 상태에 압축해야 하고 병렬화가 어렵다.</td>
        </tr>
        <tr>
          <td>Transformer</td>
          <td>토큰 간 직접 조회와 동적 가중합</td>
          <td>장거리 관계를 직접 모델링하고 병렬화가 좋다.</td>
          <td>일반 self-attention은 시퀀스 길이에 대해 대략 O(n^2) 비용이 든다.</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

Transformer가 강력한 이유는 “모든 문제에서 CNN/RNN보다 항상 낫다”가 아니다. 핵심은 token들이 서로를 직접 조회하면서 문맥 표현을 동적으로 만든다는 점이다. 대신 긴 시퀀스에서는 attention matrix가 커진다. 그래서 efficient attention, sparse attention, linear attention, recurrent memory, memory caching 같은 연구들이 계속 이어진다.

## 한 층을 실제 계산처럼 따라가기

문장 `고양이 생선을 먹었다`를 아주 작게 벡터화했다고 생각해 보자.

```text
X = [x_고양이, x_생선을, x_먹었다]
Q = XW_Q
K = XW_K
V = XW_V
```

`먹었다` 위치의 query를 `q_먹었다`라고 하면, 이 query는 모든 key와 내적된다.

```text
s = [
  q_먹었다 · k_고양이,
  q_먹었다 · k_생선을,
  q_먹었다 · k_먹었다
]
```

그 다음 softmax를 거친다.

```text
alpha = softmax(s / sqrt(d_k))
```

마지막으로 value를 섞는다.

```text
z_먹었다 =
  alpha_1 * v_고양이 +
  alpha_2 * v_생선을 +
  alpha_3 * v_먹었다
```

이 `z_먹었다`는 더 이상 단순히 “먹었다”라는 토큰의 정적 벡터가 아니다. “고양이가 생선을 먹었다”라는 문맥이 반영된 벡터다. 다음 block으로 넘어가면 이 과정이 다시 반복되고, 더 추상적인 관계가 쌓인다.

## 오해하기 쉬운 부분

첫째, attention weight가 곧 완전한 설명은 아니다. 특정 head의 weight가 어떤 토큰을 많이 본다고 해서, 모델의 최종 판단 이유가 그 토큰 하나라고 단정할 수는 없다. 여러 head, 여러 layer, MLP, residual path가 함께 작동한다.

둘째, MLP의 뉴런 하나가 항상 사람이 읽을 수 있는 feature 하나를 담당한다고 보면 위험하다. 어떤 뉴런이나 방향이 특정 feature와 강하게 상관될 수는 있지만, 실제 표현은 대개 여러 차원에 분산되어 있다.

셋째, positional encoding이 “순서를 학습한다”는 말은 조금 조심해야 한다. 위치 신호를 넣어 주면 attention이 위치까지 포함한 관계를 계산할 수 있게 된다. 위치 정보를 어떤 방식으로 넣을지는 모델마다 다르다.

넷째, Transformer는 recurrence와 convolution을 기본 골격에서 제거했지만, 현대 모델 생태계에서는 CNN, RNN, attention, memory가 다시 섞이고 있다. 특히 vision transformer는 이미지를 patch sequence로 바꿔 attention을 적용하고, 반대로 일부 언어 모델 연구는 recurrent memory나 state-space 계열을 다시 탐색한다.

## 정리

Transformer를 한 문장으로 정리하면 이렇다.

```text
각 토큰이 문맥 속의 다른 토큰들을 직접 조회해 새 표현을 만들고,
그 표현을 MLP로 다시 해석하는 block을 깊게 쌓은 모델.
```

DNN은 벡터를 비선형 함수로 바꿨고, CNN은 지역 패턴을 효율적으로 찾았고, RNN은 순서를 상태에 누적했다. Transformer는 여기서 한 걸음 옮겨 “지금 이 토큰이 어떤 토큰을 참고해야 하는가”를 매 입력마다 다시 계산한다.

그래서 같은 단어라도 문맥이 바뀌면 다른 벡터가 된다. 커피잔 옆에 놓인 “별”과 천문학 문서 속의 “별”은 같은 글자일 수 있지만, 모델 안에서는 서로 다른 밤하늘을 지나간다.

## 검증하며 보정한 점

- Transformer의 self-attention 수식과 encoder-decoder 구조는 Vaswani et al.의 원 논문을 기준으로 확인했다.
- attention 자체의 계보는 Bahdanau, Cho, Bengio의 neural machine translation 논문에서 제안된 alignment/attention 아이디어와 함께 보는 것이 정확하다.
- CNN 설명은 LeCun et al.의 LeNet/문서 인식 논문을 기준으로, 지역 수용영역과 가중치 공유 중심으로 정리했다.
- RNN의 장기 의존성 문제와 LSTM의 위치는 Hochreiter & Schmidhuber의 논문을 기준으로 확인했다.
- MLP 뉴런을 “특정 feature detector”로 단정하는 표현은 분산 표현 관점에서 완화했다.
- “embedding은 고정이지만 문맥 표현은 동적”이라는 설명은 추론 시 학습 파라미터는 고정되고, activation/attention weight는 입력에 따라 달라진다는 식으로 보정했다.

## 참고 자료

- Vaswani et al., [Attention Is All You Need](https://arxiv.org/abs/1706.03762), 2017.
- Bahdanau, Cho, Bengio, [Neural Machine Translation by Jointly Learning to Align and Translate](https://arxiv.org/abs/1409.0473), 2014.
- LeCun et al., [Gradient-Based Learning Applied to Document Recognition](https://ieeexplore.ieee.org/document/726791), 1998.
- Hochreiter, Schmidhuber, [Long Short-Term Memory](https://direct.mit.edu/neco/article/9/8/1735/6109/Long-Short-Term-Memory), 1997.
- Rumelhart, Hinton, Williams, [Learning representations by back-propagating errors](https://www.nature.com/articles/323533a0), 1986.
- Hendrycks, Gimpel, [Gaussian Error Linear Units (GELUs)](https://arxiv.org/abs/1606.08415), 2016.
- Dosovitskiy et al., [An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale](https://arxiv.org/abs/2010.11929), 2020.
- Behrouz et al., [Memory Caching: RNNs with Growing Memory](https://arxiv.org/abs/2602.24281), 2026.
