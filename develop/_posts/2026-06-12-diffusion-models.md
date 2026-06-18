---
layout: post
title: Diffusion 모델은 어떻게 노이즈에서 이미지를 꺼낼까
description: >
  DDPM의 정방향/역방향 과정, 노이즈 예측 손실, score 관점, classifier-free guidance, AE/VAE, Latent Diffusion의 역할을 정리합니다.
tags: [ai, diffusion, stable-diffusion, vae, generative-ai]
sitemap: false
---

# Diffusion 모델은 어떻게 노이즈에서 이미지를 꺼낼까

Diffusion 모델을 한 문장으로 줄이면 이렇다.

```text
데이터를 일부러 노이즈로 흩뜨린 뒤,
그 흩어진 길을 거꾸로 따라오는 방법을 학습하는 생성 모델.
```

이미지 생성 결과만 보면 마법처럼 느껴지지만, 안쪽의 학습 신호는 의외로 단정하다. 깨끗한 이미지에 우리가 직접 가우시안 노이즈를 섞고, 모델에게 "지금 섞인 노이즈가 무엇인지 맞혀보라"고 시킨다. 이 일을 충분히 잘하게 되면, 모델은 순수한 노이즈에서 시작해서 조금씩 자연스러운 이미지 쪽으로 이동하는 길을 만들 수 있다.

이 글은 Notion의 Diffusion, 이미지 분포, Stable Diffusion, AE/VAE/Latent 관련 문서들을 하나로 묶어 정리한 글이다. 직관은 포근하게 잡되, 수식과 용어는 가능한 정확하게 두었다.

<style>
.diffusion-visual {
  --diff-bg: linear-gradient(135deg, rgba(50, 34, 25, .96), rgba(8, 12, 24, .97));
  --diff-panel: rgba(255, 250, 242, .075);
  --diff-panel-strong: rgba(255, 250, 242, .13);
  --diff-line: rgba(255, 250, 242, .18);
  --diff-ink: #fffaf2;
  --diff-muted: rgba(255, 250, 242, .72);
  --diff-gold: #dfb976;
  --diff-blue: #92b9df;
  --diff-green: #93c7a3;
  --diff-red: #db8d8d;
  margin: 1.25rem 0 1.6rem;
  padding: .95rem;
  border: 1px solid rgba(255, 250, 242, .13);
  border-radius: 8px;
  color: var(--diff-ink);
  background: var(--diff-bg);
  box-shadow: 0 1rem 2.4rem rgba(8, 10, 17, .2);
}

.diffusion-title {
  margin: 0 0 .75rem;
  color: var(--diff-ink);
  font-size: .78rem;
  font-weight: 700;
}

.diffusion-grid,
.diffusion-flow,
.diffusion-lanes,
.diffusion-stack,
.diffusion-tensor,
.diffusion-field {
  display: grid;
  gap: .65rem;
}

.diffusion-grid.two,
.diffusion-lanes {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.diffusion-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.diffusion-flow.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.diffusion-flow.five {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.diffusion-stack {
  grid-template-columns: .9fr 1.15fr .9fr;
  align-items: stretch;
}

.diffusion-card,
.diffusion-step,
.diffusion-lane,
.diffusion-tensor-cell,
.diffusion-field-cell {
  min-width: 0;
  border: 1px solid var(--diff-line);
  border-radius: 6px;
  background: var(--diff-panel);
}

.diffusion-card,
.diffusion-lane,
.diffusion-tensor-cell {
  padding: .72rem;
}

.diffusion-step {
  position: relative;
  padding: .62rem;
}

.diffusion-step:not(:last-child)::after {
  content: "->";
  position: absolute;
  right: -.49rem;
  top: 50%;
  color: rgba(255, 250, 242, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .66rem;
  transform: translate(50%, -50%);
}

.diffusion-visual b,
.diffusion-visual strong {
  display: block;
  color: var(--diff-ink);
  font-size: .68rem;
  line-height: 1.35;
}

.diffusion-visual span,
.diffusion-visual p {
  display: block;
  margin: .22rem 0 0;
  color: var(--diff-muted);
  font-size: .62rem;
  line-height: 1.45;
}

.diffusion-visual code {
  color: var(--diff-ink);
  background: rgba(8, 10, 17, .34);
}

.diffusion-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
  margin-top: .62rem;
}

.diffusion-pill {
  padding: .32rem .46rem;
  border: 1px solid rgba(223, 185, 118, .38);
  border-radius: 999px;
  color: var(--diff-ink);
  background: rgba(223, 185, 118, .12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .56rem;
}

.diffusion-pill[data-tone="blue"] {
  border-color: rgba(146, 185, 223, .42);
  background: rgba(146, 185, 223, .13);
}

.diffusion-pill[data-tone="green"] {
  border-color: rgba(147, 199, 163, .42);
  background: rgba(147, 199, 163, .13);
}

.diffusion-pill[data-tone="red"] {
  border-color: rgba(219, 141, 141, .42);
  background: rgba(219, 141, 141, .12);
}

.diffusion-field {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.diffusion-field-cell {
  padding: .45rem .35rem;
  color: var(--diff-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .72rem;
  text-align: center;
}

.diffusion-field-cell.hot {
  color: var(--diff-ink);
  border-color: rgba(223, 185, 118, .55);
  background: rgba(223, 185, 118, .16);
}

.diffusion-tensor {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.diffusion-tensor-cell {
  min-height: 4.2rem;
  background:
    linear-gradient(135deg, rgba(255, 250, 242, .08), rgba(255, 250, 242, .025)),
    repeating-linear-gradient(0deg, transparent 0, transparent .72rem, rgba(255, 250, 242, .05) .73rem),
    repeating-linear-gradient(90deg, transparent 0, transparent .72rem, rgba(255, 250, 242, .05) .73rem);
}

.diffusion-table {
  width: 100%;
  border: 1px solid rgba(143, 94, 60, .32);
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 250, 242, .94) !important;
  font-size: .88rem;
}

.diffusion-table th,
.diffusion-table td {
  border: 0;
  border-bottom: 1px solid rgba(143, 94, 60, .22);
  color: var(--coffee-ink) !important;
  vertical-align: top;
}

.diffusion-table th {
  background: rgba(47, 33, 24, .92) !important;
  color: #fffaf2 !important;
  font-weight: 700;
}

.diffusion-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .92) !important;
}

.diffusion-table tbody tr:nth-child(even) td {
  background: rgba(247, 236, 222, .94) !important;
}

.diffusion-table tbody tr:last-child td {
  border-bottom: 0;
}

.diffusion-table td:first-child {
  color: #4d2d1e !important;
  font-weight: 700;
}

body.dark-mode .diffusion-table {
  background: rgba(9, 13, 22, .9) !important;
  border-color: rgba(231, 212, 189, .24) !important;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, .22) !important;
}

body.dark-mode .diffusion-table th {
  color: #fff4e5 !important;
  background: rgba(244, 234, 220, .12) !important;
}

body.dark-mode .diffusion-table td {
  color: #ead8c3 !important;
  border-color: rgba(231, 212, 189, .18) !important;
}

body.dark-mode .diffusion-table tbody tr:nth-child(odd) td {
  background: rgba(255, 250, 242, .045) !important;
}

body.dark-mode .diffusion-table tbody tr:nth-child(even) td {
  background: rgba(255, 250, 242, .074) !important;
}

body.dark-mode .diffusion-table td:first-child {
  color: #f2c98c !important;
}

body.dark-mode .diffusion-table code {
  color: #fff4e5 !important;
  background: rgba(255, 250, 242, .08) !important;
}

@media (max-width: 760px) {
  .diffusion-grid.two,
  .diffusion-grid.three,
  .diffusion-flow.four,
  .diffusion-flow.five,
  .diffusion-lanes,
  .diffusion-stack,
  .diffusion-tensor {
    grid-template-columns: 1fr;
  }

  .diffusion-step:not(:last-child)::after {
    content: "";
    display: none;
  }
}
</style>

<div class="diffusion-visual">
  <p class="diffusion-title">Diffusion 전체 지도</p>
  <div class="diffusion-lanes">
    <div class="diffusion-lane">
      <b>Forward process</b>
      <span>깨끗한 데이터 <code>x0</code>에 단계별로 가우시안 노이즈를 더한다. 마지막에는 거의 표준정규 노이즈에 가까워진다.</span>
      <div class="diffusion-pill-row">
        <span class="diffusion-pill">x0</span>
        <span class="diffusion-pill">x_t</span>
        <span class="diffusion-pill">x_T ~ N(0, I)</span>
      </div>
    </div>
    <div class="diffusion-lane">
      <b>Reverse process</b>
      <span>모델이 예측한 노이즈 또는 score를 이용해 <code>x_T</code>에서 <code>x0</code>처럼 보이는 새 샘플로 되돌아간다.</span>
      <div class="diffusion-pill-row">
        <span class="diffusion-pill" data-tone="blue">noise</span>
        <span class="diffusion-pill" data-tone="blue">denoise</span>
        <span class="diffusion-pill" data-tone="blue">sample</span>
      </div>
    </div>
  </div>
</div>

## 데이터 분포는 의미 라벨이 아니다

Diffusion에서 말하는 `p_data(x)`는 "이 이미지는 고양이다" 같은 라벨 분포가 아니다. `x`는 픽셀 값 또는 latent 값으로 이루어진 좌표다. 그러니까 `p_data(x)`는 이미지 공간에서 자연스러운 이미지들이 어디에 많이 모여 있는지를 나타내는 확률 밀도다.

자연 이미지는 전체 픽셀 공간에 고르게 퍼져 있지 않다. 하늘은 하늘다운 색과 질감의 규칙이 있고, 얼굴은 얼굴다운 대칭과 구조가 있으며, 책상 위 사물들은 서로 그럴듯한 위치 관계를 가진다. 이런 통계적 구조 때문에 데이터는 거대한 좌표 공간 안의 일부 영역, 흔히 말하는 데이터 매니폴드 근처에 몰린다.

라벨은 필수가 아니다. 라벨이나 텍스트 조건이 없어도 모델은 데이터가 자주 나타나는 구조를 배울 수 있다. 다만 텍스트 조건을 주면 `p(x)`가 아니라 `p(x | text)`처럼 조건에 맞는 부분 분포를 따라가도록 안내할 수 있다.

<div class="diffusion-visual">
  <p class="diffusion-title">Score field의 직관</p>
  <div class="diffusion-stack">
    <div class="diffusion-card">
      <b>Low density</b>
      <span>무작위 픽셀이나 노이즈처럼 데이터셋에서 거의 보지 못한 영역이다.</span>
    </div>
    <div>
      <div class="diffusion-field">
        <div class="diffusion-field-cell">↘</div>
        <div class="diffusion-field-cell">↓</div>
        <div class="diffusion-field-cell">↙</div>
        <div class="diffusion-field-cell">↙</div>
        <div class="diffusion-field-cell">←</div>
        <div class="diffusion-field-cell">→</div>
        <div class="diffusion-field-cell hot">high</div>
        <div class="diffusion-field-cell hot">density</div>
        <div class="diffusion-field-cell">←</div>
        <div class="diffusion-field-cell">↙</div>
        <div class="diffusion-field-cell">↗</div>
        <div class="diffusion-field-cell hot">data</div>
        <div class="diffusion-field-cell hot">manifold</div>
        <div class="diffusion-field-cell">←</div>
        <div class="diffusion-field-cell">↖</div>
      </div>
    </div>
    <div class="diffusion-card">
      <b>Score</b>
      <span><code>gradient log p_t(x)</code>는 이 노이즈 수준에서 더 그럴듯한 쪽을 가리키는 벡터장에 가깝다.</span>
    </div>
  </div>
</div>

## 정방향 과정: 이미지를 일부러 흐리게 만든다

DDPM 계열의 기본 정방향 과정은 마르코프 체인으로 표현한다.

```text
q(x_t | x_{t-1}) = N(sqrt(1 - beta_t) x_{t-1}, beta_t I)
```

여기서 `beta_t`는 t번째 단계에서 노이즈를 얼마나 더할지 정하는 스케줄이다. 보통 한 번에 이미지를 망가뜨리지 않고, 작은 노이즈를 여러 단계에 걸쳐 누적한다.

실제 학습에서는 매번 `x0 -> x1 -> ... -> x_t`를 순서대로 계산하지 않아도 된다. 누적값을 쓰면 임의의 t에 대해 바로 `x_t`를 만들 수 있다.

```text
alpha_t = 1 - beta_t
alpha_bar_t = alpha_1 * alpha_2 * ... * alpha_t

x_t = sqrt(alpha_bar_t) x0 + sqrt(1 - alpha_bar_t) epsilon
epsilon ~ N(0, I)
```

이 식이 중요하다. 깨끗한 이미지 `x0`, 임의의 시간 `t`, 우리가 뽑은 노이즈 `epsilon`만 있으면 노이즈 낀 입력 `x_t`를 만들 수 있다. 그리고 우리가 어떤 노이즈를 섞었는지도 정확히 알고 있다.

## 학습: 모델은 원본 이미지가 아니라 노이즈를 맞힌다

Diffusion 모델의 가장 흔한 학습 목표는 `epsilon prediction`이다.

```text
loss = E[ || epsilon - epsilon_theta(x_t, t, condition) ||^2 ]
```

모델 입력은 노이즈가 섞인 `x_t`, 노이즈 수준 `t`, 선택적으로 텍스트나 클래스 같은 조건이다. 출력은 `x_t`에 섞였던 노이즈의 예측값이다.

겉으로는 정답이 있는 회귀 문제처럼 보인다. 하지만 정답 `epsilon`은 사람이 라벨링한 값이 아니라, 학습 과정에서 우리가 직접 만든 값이다. 그래서 Diffusion은 보통 비지도 생성 모델의 범주에 놓이지만, 구현되는 학습 신호는 자기지도 denoising objective라고 보는 편이 더 정확하다.

<div class="diffusion-visual">
  <p class="diffusion-title">학습 루프</p>
  <div class="diffusion-flow four">
    <div class="diffusion-step">
      <b>1. sample</b>
      <span>데이터 <code>x0</code>, 시간 <code>t</code>, 노이즈 <code>epsilon</code>을 뽑는다.</span>
    </div>
    <div class="diffusion-step">
      <b>2. corrupt</b>
      <span><code>x_t</code>를 닫힌 형태 식으로 만든다.</span>
    </div>
    <div class="diffusion-step">
      <b>3. predict</b>
      <span>U-Net이 <code>epsilon_theta(x_t, t)</code>를 예측한다.</span>
    </div>
    <div class="diffusion-step">
      <b>4. update</b>
      <span>진짜 노이즈와 예측 노이즈의 MSE를 줄인다.</span>
    </div>
  </div>
</div>

이 손실이 좋은 이유는 명확하다. 원본 이미지를 직접 회귀하는 것보다, 각 노이즈 수준에서 "무엇을 빼야 자연스러운 데이터 쪽으로 가까워지는지"를 배우게 된다.

## Score 관점: 노이즈 예측은 방향을 배운다

Diffusion을 더 깊게 보면 score-based generative modeling과 연결된다. score는 확률밀도의 로그 기울기다.

```text
score(x_t, t) = gradient_x log p_t(x_t)
```

직관적으로 score는 현재 위치에서 확률밀도가 커지는 방향을 가리킨다. DDPM의 노이즈 예측 모델은 일정한 스케일 변환을 거치면 이 score와 같은 정보를 담는다.

```text
score(x_t, t) is approximately
- epsilon_theta(x_t, t) / sqrt(1 - alpha_bar_t)
```

따라서 샘플링은 "노이즈에서 시작해 score field를 따라 데이터 밀도가 높은 쪽으로 이동하는 수치적분"으로 볼 수 있다. 원본 한 장을 복구하는 것이 아니라, 학습 데이터 분포와 비슷한 새 샘플을 만들어내는 과정이다.

## 역방향 과정: 노이즈에서 새 이미지를 샘플링한다

학습이 끝나면 생성은 반대로 진행한다.

```text
x_T ~ N(0, I)

for t = T, ..., 1:
  epsilon_pred = epsilon_theta(x_t, t, condition)
  x_{t-1} = denoise_step(x_t, epsilon_pred, t)
```

DDPM은 역방향 과정을 확률적으로 샘플링한다. 각 단계에서 평균 방향으로 denoise하면서도 약간의 가우시안 변동을 남긴다. 이 변동은 다양성을 만드는 데 도움을 준다.

DDIM은 같은 학습 목표를 유지하면서 비마르코프적 경로를 구성해 더 적은 단계로 샘플링할 수 있게 했다. 이후 DPM-Solver, UniPC, Euler, Heun 같은 sampler들은 역방향 과정을 수치적으로 더 효율적으로 적분하려는 시도들이다. 중요한 점은 sampler가 바뀌어도 모델이 배운 핵심은 여전히 "각 노이즈 수준에서 무엇을 제거해야 하는가"라는 것이다.

## 텍스트 조건과 classifier-free guidance

텍스트-이미지 모델에서는 U-Net이 이미지 또는 latent 특징만 보지 않는다. 텍스트 인코더가 만든 토큰 임베딩을 cross-attention으로 넣어준다.

```text
Q = image or latent features
K, V = text token embeddings
```

이렇게 하면 모델은 `p(x)`가 아니라 `p(x | text)`에 가까운 방향으로 denoise한다.

Classifier-free guidance는 조건부 예측과 무조건부 예측을 함께 사용해 조건의 힘을 조절한다.

```text
epsilon_hat =
  epsilon_uncond + guidance_scale * (epsilon_cond - epsilon_uncond)
```

`guidance_scale`을 키우면 프롬프트를 더 세게 따르는 경향이 생긴다. 대신 너무 크면 색이 과해지거나 구도가 경직되거나 세부가 깨질 수 있다. 실무에서 CFG는 "프롬프트 충실도와 다양성 사이의 손잡이"라고 이해하면 편하다.

<div class="diffusion-visual">
  <p class="diffusion-title">텍스트 조건이 들어가는 자리</p>
  <div class="diffusion-flow five">
    <div class="diffusion-step">
      <b>Prompt</b>
      <span>사용자가 원하는 장면을 텍스트로 쓴다.</span>
    </div>
    <div class="diffusion-step">
      <b>Text encoder</b>
      <span>문장을 토큰 임베딩으로 바꾼다.</span>
    </div>
    <div class="diffusion-step">
      <b>Cross-attention</b>
      <span>U-Net의 이미지 특징이 텍스트 토큰을 참조한다.</span>
    </div>
    <div class="diffusion-step">
      <b>CFG</b>
      <span>조건부 방향과 무조건부 방향의 차이를 키운다.</span>
    </div>
    <div class="diffusion-step">
      <b>Sample</b>
      <span>조건에 맞는 데이터 분포 쪽으로 이동한다.</span>
    </div>
  </div>
</div>

## AutoEncoder부터 잡고 가기

Latent Diffusion을 이해하려면 먼저 AutoEncoder를 짚는 편이 좋다. AutoEncoder는 입력을 한 번 압축했다가 다시 복원하는 신경망이다.

```text
x -> Encoder -> z -> Decoder -> x_hat
```

여기서 `x`는 원본 이미지, `z`는 latent representation, `x_hat`은 복원 이미지다. 기본 AutoEncoder의 손실은 보통 입력과 최종 출력의 차이로 잡는다.

```text
L_recon = || x - x_hat ||^2
```

중요한 점은 latent를 기준으로 encoder와 decoder의 중간 레이어를 대칭 비교하지 않는다는 것이다. 손실은 최종 복원 결과와 원본 사이에서 계산되고, 그 오차가 decoder를 거쳐 latent, 다시 encoder 쪽으로 역전파된다. Notion의 AutoEncoder 역전파 문서에서 정리한 것처럼, latent는 비교 대상이라기보다 gradient가 지나가는 병목 통로에 가깝다.

<div class="diffusion-visual">
  <p class="diffusion-title">AutoEncoder 학습 흐름</p>
  <div class="diffusion-flow five">
    <div class="diffusion-step">
      <b>Input</b>
      <span>원본 이미지 <code>x</code>가 들어온다.</span>
    </div>
    <div class="diffusion-step">
      <b>Encoder</b>
      <span>복원에 필요한 정보를 압축해 <code>z</code>를 만든다.</span>
    </div>
    <div class="diffusion-step">
      <b>Bottleneck</b>
      <span>모든 픽셀을 그대로 외우지 못하게 정보 통로를 좁힌다.</span>
    </div>
    <div class="diffusion-step">
      <b>Decoder</b>
      <span><code>z</code>에서 다시 <code>x_hat</code>을 복원한다.</span>
    </div>
    <div class="diffusion-step">
      <b>Loss</b>
      <span><code>x</code>와 <code>x_hat</code>의 차이가 전체 네트워크로 역전파된다.</span>
    </div>
  </div>
</div>

AutoEncoder가 하는 일은 단순한 압축 파일 만들기와 다르다. 좋은 encoder는 복원에 필요한 형태, 색감, 질감, 구도 같은 정보를 작은 표현에 담아야 한다. 좋은 decoder는 그 작은 표현에서 다시 눈에 자연스러운 이미지를 펼쳐야 한다.

다만 기본 AE에는 생성 모델로서의 약점이 있다. `z = E(x)`가 결정론적 점이기 때문에, latent 공간의 아무 지점이나 골라 decoder에 넣었을 때 자연스러운 이미지가 나온다는 보장이 약하다. 훈련 데이터가 지나간 지점 근처에서는 복원이 되지만, 그 사이 공간이나 바깥 공간이 매끄럽게 정돈되어 있지 않을 수 있다.

## AE와 VAE는 무엇이 다른가

VAE는 AutoEncoder처럼 encoder와 decoder를 갖지만, latent를 하나의 점이 아니라 분포로 다룬다.

```text
AE:
  z = E(x)

VAE:
  q_phi(z | x) = N(mu_phi(x), diag(sigma_phi(x)^2))
  z = mu + sigma * epsilon
  epsilon ~ N(0, I)
```

VAE encoder는 입력 이미지 하나에 대해 `mu`와 `sigma`를 예측한다. `mu`는 그 이미지가 latent 공간에서 있을 법한 중심이고, `sigma`는 그 주변에서 허용되는 변동 폭이다. 그 다음 reparameterization trick으로 `z`를 샘플링한다. 이렇게 해야 샘플링이 들어가도 gradient가 encoder 쪽으로 흘러갈 수 있다.

학습 목표는 복원 품질과 latent 정규화를 함께 본다.

```text
ELBO = E_q[log p_theta(x | z)]
       - KL(q_phi(z | x) || p(z))

loss = reconstruction loss + KL regularization
```

`p(z)`는 보통 표준정규분포 `N(0, I)`로 둔다. KL 항은 encoder가 만든 `q_phi(z | x)`가 이 prior에서 너무 멀어지지 않게 붙잡는다. 그래서 VAE의 latent 공간은 AE보다 샘플링하기 쉬운 형태로 정돈된다.

<table class="diffusion-table">
  <thead>
    <tr>
      <th>구분</th>
      <th>AE</th>
      <th>VAE</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>latent 형태</td>
      <td>입력마다 하나의 결정론적 벡터 <code>z</code></td>
      <td>입력마다 <code>mu</code>, <code>sigma</code>로 표현되는 분포</td>
    </tr>
    <tr>
      <td>학습 목표</td>
      <td>주로 복원 오차를 줄인다.</td>
      <td>복원 오차와 KL 정규화를 함께 최적화한다.</td>
    </tr>
    <tr>
      <td>생성 관점</td>
      <td>latent 공간 샘플링이 자연스럽다는 보장이 약하다.</td>
      <td>prior에서 샘플링해 decoder로 생성하기 쉬운 공간을 만든다.</td>
    </tr>
    <tr>
      <td>주의점</td>
      <td>복원은 선명할 수 있지만 latent 공간이 듬성듬성할 수 있다.</td>
      <td>KL을 강하게 걸면 latent가 정보를 덜 담거나 복원이 흐려질 수 있다.</td>
    </tr>
  </tbody>
</table>

그래서 "VAE가 AE보다 항상 복원을 더 잘한다"라고 말하면 부정확하다. VAE는 복원만 최적화하는 모델이 아니라, 복원과 생성 가능한 latent 공간 사이의 균형을 맞추는 모델이다. Latent Diffusion에서 VAE가 중요한 이유도 이 균형 때문이다. diffusion이 다룰 latent가 너무 임의적인 모양이면 가우시안 노이즈 스케줄과 잘 맞지 않고, decoder가 복원할 수 있는 의미 있는 공간 안에서 denoise가 진행되어야 한다.

## Stable Diffusion은 왜 latent에서 diffusion을 하는가

픽셀 공간에서 diffusion을 돌리면 계산량이 크다. 512 x 512 RGB 이미지는 786,432개의 숫자를 가진다. 이를 매 denoise step마다 U-Net으로 처리하면 학습과 추론 모두 비싸진다.

Latent Diffusion의 핵심은 이미지를 먼저 더 작은 latent로 압축하고, diffusion은 그 latent 공간에서 수행하는 것이다.

<div class="diffusion-visual">
  <p class="diffusion-title">Latent Diffusion 흐름</p>
  <div class="diffusion-flow five">
    <div class="diffusion-step">
      <b>Image</b>
      <span><code>512 x 512 x 3</code> 같은 픽셀 공간의 이미지다.</span>
    </div>
    <div class="diffusion-step">
      <b>VAE encoder</b>
      <span>이미지를 압축된 latent 분포로 보낸다.</span>
    </div>
    <div class="diffusion-step">
      <b>Latent</b>
      <span>예: SD v1 계열에서는 흔히 <code>64 x 64 x 4</code> 텐서로 다룬다.</span>
    </div>
    <div class="diffusion-step">
      <b>U-Net</b>
      <span>픽셀이 아니라 latent에 노이즈를 더하고 제거한다.</span>
    </div>
    <div class="diffusion-step">
      <b>VAE decoder</b>
      <span>denoise된 latent를 다시 이미지로 복원한다.</span>
    </div>
  </div>
</div>

Latent는 단순한 썸네일이 아니다. 공간 구조는 유지하지만, 각 값은 RGB처럼 사람이 바로 읽을 수 있는 색이 아니다. VAE가 학습한 압축 표현이고, 여러 시각적 특징이 얽혀 있다.

예를 들어 Stable Diffusion v1 계열처럼 `512 x 512 x 3` 이미지가 `64 x 64 x 4` latent로 내려간다고 하자. 공간적으로는 대략 8배 다운샘플된 격자처럼 볼 수 있다. 하지만 latent의 한 칸이 원본의 정확한 8 x 8 패치를 독립적으로 뜻한다고 단정하면 곤란하다. convolution과 attention, decoder의 receptive field 때문에 주변 정보와 함께 해석된다.

<div class="diffusion-visual">
  <p class="diffusion-title">Latent tensor를 읽는 법</p>
  <div class="diffusion-grid two">
    <div class="diffusion-card">
      <b>공간 위치</b>
      <span><code>64 x 64</code> 격자는 이미지의 거친 위치 정보를 보존한다. 왼쪽 위 latent 값은 대체로 이미지 왼쪽 위 영역과 관련된다.</span>
    </div>
    <div class="diffusion-card">
      <b>채널 값</b>
      <span><code>4</code>개 채널은 RGB가 아니다. 형태, 색, 질감, 조명 같은 특징이 섞인 학습된 표현이다.</span>
    </div>
  </div>
  <div class="diffusion-tensor" style="margin-top: .7rem;">
    <div class="diffusion-tensor-cell">
      <b>Channel 0</b>
      <span>-1.24, 0.43, ...</span>
    </div>
    <div class="diffusion-tensor-cell">
      <b>Channel 1</b>
      <span>0.12, -0.88, ...</span>
    </div>
    <div class="diffusion-tensor-cell">
      <b>Channel 2</b>
      <span>1.03, 0.35, ...</span>
    </div>
    <div class="diffusion-tensor-cell">
      <b>Channel 3</b>
      <span>-0.41, 1.76, ...</span>
    </div>
  </div>
</div>

여기서 `-1.24`, `0.43` 같은 부동소수점 값은 "이 위치의 어떤 학습된 feature가 어느 방향과 강도로 활성화되었는가"에 가깝다. 값의 부호와 크기가 의미는 있지만, 사람이 "이 값은 눈", "이 채널은 조명"처럼 직접 이름 붙일 수 있는 축은 아니다. 이런 표현은 대부분 entangled representation이다.

## VAE는 latent를 하나의 점이 아니라 분포로 본다

VAE의 인코더는 보통 입력 이미지 `x`를 받아 latent `z` 하나를 바로 내놓지 않는다. 대신 approximate posterior의 파라미터를 낸다.

```text
q_phi(z | x) = N(mu_phi(x), diag(sigma_phi(x)^2))
z = mu + sigma * epsilon
epsilon ~ N(0, I)
```

이때 `mu`는 입력 이미지가 latent 공간에서 있을 법한 중심이고, `sigma`는 그 주변의 불확실성 또는 허용되는 변동 폭이다. 학습은 reconstruction term과 KL term으로 구성된 ELBO를 최적화한다.

```text
ELBO =
  reconstruction quality
  - KL(q_phi(z | x) || p(z))

p(z) is usually N(0, I)
```

정확히 말하면 VAE가 "알 수 없는 실제 posterior를 직접 구한다"기보다, 다루기 쉬운 분포 `q_phi(z | x)`로 근사하고 그 하한을 최적화한다. 이 점은 오래된 VAE 설명에서 자주 흐려지는 부분이다.

데이터셋 전체로 보면 latent 분포는 각 샘플의 가우시안 posterior가 모인 aggregated posterior다.

```text
q_phi(z) ~= average_i q_phi(z | x_i)
```

평균과 분산은 이 분포의 중심과 스케일을 요약한다. 다만 평균과 분산만으로 복잡한 다봉 분포의 모든 구조를 알 수는 없다. 그래도 latent가 표준정규에 맞게 잘 정규화되어 있는지, 특정 차원이 거의 쓰이지 않는지, diffusion noise schedule과 스케일이 맞는지는 점검할 수 있다.

Diffusers의 `AutoencoderKL`도 `scaling_factor`를 가진다. Stable Diffusion 계열에서 자주 보이는 `0.18215` 같은 값은 latent를 diffusion 모델에 넣기 전 단위 분산에 가깝게 맞추기 위한 스케일이다. 이 값은 모든 VAE에 보편적인 상수가 아니라 모델과 학습 설정에 묶인 구현 세부사항이다.

## Stable Diffusion에서 VAE가 실제로 맡는 일

Stable Diffusion의 VAE를 "그림을 작게 줄이는 모듈" 정도로만 보면 부족하다. VAE는 diffusion이 일할 좌표계를 미리 만든다. 이 좌표계가 좋아야 U-Net이 노이즈를 더하고 빼는 일이 쉬워진다.

<div class="diffusion-visual">
  <p class="diffusion-title">VAE와 Diffusion의 역할 분담</p>
  <div class="diffusion-grid three">
    <div class="diffusion-card">
      <b>1. 압축</b>
      <span>픽셀 공간의 중복을 줄여 작은 latent tensor로 보낸다. 계산량을 낮추는 첫 번째 이유다.</span>
    </div>
    <div class="diffusion-card">
      <b>2. 정규화</b>
      <span>latent가 너무 제멋대로 흩어지지 않게 prior와 스케일을 맞춘다. 노이즈 스케줄과 궁합이 중요하다.</span>
    </div>
    <div class="diffusion-card">
      <b>3. 복원</b>
      <span>denoise가 끝난 latent를 다시 이미지로 펼친다. 색감, 선명도, 질감 일부는 VAE 품질의 영향을 받는다.</span>
    </div>
  </div>
</div>

훈련 과정을 분리해서 보면 더 선명하다.

```text
1. Autoencoder/VAE를 먼저 학습한다.
   x -> E(x) -> z -> D(z) -> x_hat

2. 학습된 encoder/decoder를 고정하거나 재사용한다.
   z0 = E(x)

3. diffusion U-Net은 pixel이 아니라 z0에 노이즈를 섞고 제거하는 법을 배운다.
   z_t = sqrt(alpha_bar_t) z0 + sqrt(1 - alpha_bar_t) epsilon
```

추론할 때는 반대다. 처음부터 이미지를 압축하지 않는다. 표준정규에 가까운 latent noise에서 시작한다.

```text
z_T ~ N(0, I)
z_T -> z_{T-1} -> ... -> z_0
image = Decoder(z_0)
```

여기서 decoder는 "아무 latent나 이미지로 바꾸는 마술 상자"가 아니다. 자신이 학습한 latent 공간 근처의 표현을 가장 잘 복원한다. 그래서 diffusion U-Net은 decoder가 이해할 수 있는 latent manifold 근처로 샘플을 이동시켜야 한다.

Latent Diffusion 논문은 이 지점을 "복잡도 감소와 디테일 보존 사이의 균형"으로 본다. 너무 강하게 압축하면 U-Net은 빨라지지만 디테일이 사라진다. 너무 약하게 압축하면 픽셀 diffusion과 비용 차이가 줄어든다. Stable Diffusion 계열에서 VAE가 이미지의 약 8배 downsampling latent를 쓰는 것도 이 균형점의 한 예다.

## latent의 평균과 분산으로 무엇을 알 수 있나

VAE encoder가 각 이미지마다 `mu_i`, `sigma_i`를 낸다면, 데이터셋 전체 latent 분포는 개별 posterior들의 평균적인 혼합으로 볼 수 있다.

```text
q_phi(z) ~= (1 / N) sum_i q_phi(z | x_i)
```

이때 전체 평균과 공분산은 다음처럼 요약할 수 있다.

```text
m = mean_i(mu_i)
Sigma = mean_i(diag(sigma_i^2) + mu_i mu_i^T) - m m^T
```

이 식은 "샘플을 여러 번 뽑아 봐야만 분포를 알 수 있다"는 뜻이 아니다. `q_phi(z | x)`를 대각 가우시안으로 둔 VAE에서는 encoder가 낸 `mu`, `sigma`만으로 1차/2차 모멘트를 계산할 수 있다.

다만 평균과 분산이 분포의 모든 것을 말해 주는 것은 아니다. 데이터셋 전체의 aggregated posterior는 복잡한 혼합분포일 수 있다. 평균과 공분산은 중심, 스케일, 축별 사용량, collapse 여부를 보는 데 유용하지만, 여러 모드가 어떻게 갈라지는지까지 완전히 설명하지는 못한다.

실무적으로는 다음을 점검할 수 있다.

<table class="diffusion-table">
  <thead>
    <tr>
      <th>점검 항목</th>
      <th>의미</th>
      <th>주의할 점</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>평균이 0 근처인가</td>
      <td>latent가 prior 중심에서 크게 밀려나지 않았는지 본다.</td>
      <td>0에 가깝다고 항상 좋은 생성 품질을 보장하지는 않는다.</td>
    </tr>
    <tr>
      <td>분산이 적절한가</td>
      <td>diffusion noise schedule과 latent 스케일이 잘 맞는지 본다.</td>
      <td>모델마다 scaling factor가 다르므로 상수를 일반화하면 안 된다.</td>
    </tr>
    <tr>
      <td>어떤 차원이 거의 안 쓰이는가</td>
      <td>posterior collapse나 정보 사용 부족을 의심할 수 있다.</td>
      <td>일부 차원이 조용하다고 곧바로 오류는 아니다. 모델 설계와 함께 봐야 한다.</td>
    </tr>
    <tr>
      <td>축들이 강하게 상관되는가</td>
      <td>latent feature가 얽혀 있는 정도를 볼 수 있다.</td>
      <td>entangled representation은 자연스러운 현상이며, 해석 가능한 축을 보장하지 않는다.</td>
    </tr>
  </tbody>
</table>

## 모델 변형은 어디가 다른가

Diffusion 계열 이름이 많지만, 처음에는 아래처럼 구분하면 충분하다.

<table class="diffusion-table">
  <thead>
    <tr>
      <th>계열</th>
      <th>핵심 차이</th>
      <th>읽는 관점</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>DDPM</td>
      <td>정방향 가우시안 노이즈 과정과 학습된 역방향 마르코프 체인을 둔다.</td>
      <td>가장 기본이 되는 denoising probabilistic model.</td>
    </tr>
    <tr>
      <td>DDIM</td>
      <td>같은 학습 목표를 유지하면서 더 빠른 비마르코프 샘플링 경로를 만든다.</td>
      <td>샘플링 step 수를 줄이는 관점.</td>
    </tr>
    <tr>
      <td>Score/SDE</td>
      <td>노이즈 추가와 제거를 연속 시간 SDE/ODE로 일반화한다.</td>
      <td>score field를 수치적분하는 관점.</td>
    </tr>
    <tr>
      <td>Latent Diffusion</td>
      <td>픽셀 대신 VAE latent 공간에서 diffusion을 수행한다.</td>
      <td>계산량을 줄이고 고해상도 생성을 현실화하는 관점.</td>
    </tr>
    <tr>
      <td>Consistency / LCM</td>
      <td>여러 단계의 denoise 경로를 적은 step으로 근사하거나 증류한다.</td>
      <td>실시간성, 저 step 생성의 관점.</td>
    </tr>
  </tbody>
</table>

## 다른 생성 모델과 비교하면

<table class="diffusion-table">
  <thead>
    <tr>
      <th>모델</th>
      <th>강점</th>
      <th>약점</th>
      <th>Diffusion과의 관계</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>GAN</td>
      <td>한 번의 forward로 샘플을 만들 수 있어 빠르다.</td>
      <td>적대적 학습이 불안정하고 mode collapse 위험이 있다.</td>
      <td>Diffusion은 보통 더 안정적으로 학습되지만, 여러 step 샘플링 비용이 있다.</td>
    </tr>
    <tr>
      <td>VAE</td>
      <td>ELBO 기반 확률 모델이고 latent sampling이 자연스럽다.</td>
      <td>단독 생성에서는 결과가 흐릿해지기 쉽다.</td>
      <td>Latent Diffusion에서는 VAE가 압축기와 복원기로 쓰인다.</td>
    </tr>
    <tr>
      <td>Autoregressive</td>
      <td>토큰 순서의 likelihood를 직접 모델링하기 좋다.</td>
      <td>긴 시퀀스에서는 순차 생성 비용이 커진다.</td>
      <td>Diffusion은 step 수가 병목이고, AR은 token 길이가 병목이다.</td>
    </tr>
    <tr>
      <td>Normalizing Flow</td>
      <td>가역 변환으로 정확한 likelihood 계산이 가능하다.</td>
      <td>가역성 제약 때문에 아키텍처 설계가 제한된다.</td>
      <td>Diffusion은 명시적 likelihood보다 샘플 품질과 유연성 쪽으로 강하다.</td>
    </tr>
  </tbody>
</table>

## 헷갈리기 쉬운 표현들

### "Stable Diffusion은 비지도 학습인가?"

문제 범주로는 비지도 생성 모델이라고 말할 수 있다. 외부 라벨 없이 이미지 데이터의 분포를 모델링할 수 있기 때문이다. 하지만 학습 구현은 자기지도에 가깝다. 우리가 직접 만든 노이즈 `epsilon`을 정답으로 삼아 예측하게 하므로, "라벨이 전혀 없는 순수 무감독 최적화"처럼 이해하면 조금 어긋난다.

### "모델은 원본 이미지를 복원하는가?"

학습 중에는 `x0`에서 만든 `x_t`를 보고 노이즈를 맞힌다. 하지만 생성 시 목표는 특정 학습 이미지를 되살리는 것이 아니다. 순수 노이즈에서 출발해 데이터 분포의 고밀도 영역으로 이동하고, 그 결과 학습 데이터와 통계적으로 비슷한 새 샘플을 만든다.

### "latent 채널은 사람이 읽을 수 있는 의미 축인가?"

대체로 아니다. latent 값은 공간적 위치와 어느 정도 대응하지만, 각 채널이 RGB처럼 명시적인 의미를 갖지는 않는다. 어떤 방향이 조명, 스타일, 나이, 표정 같은 속성과 상관될 수는 있지만, 이는 분석이나 조작으로 찾아낸 방향이지 모델이 처음부터 사람이 읽기 좋게 이름 붙인 축은 아니다.

### "VAE는 정확한 데이터 밀도를 구하는가?"

정확한 marginal likelihood는 보통 직접 계산하기 어렵다. VAE는 variational lower bound를 최적화해 근사 inference와 generation을 가능하게 만든다. 따라서 "intractable density를 직접 구한다"보다 "intractable posterior/lower bound 문제를 다룰 수 있게 만든다"가 더 정확하다.

### "AE/VAE의 파라미터는 latent 값 자체인가?"

아니다. `x`, `z`, `mu`, `sigma`, `x_hat`은 forward pass에서 계산되는 데이터 또는 activation이다. 학습되는 파라미터는 encoder와 decoder 안의 weight, bias, convolution kernel 같은 값들이다. `mu`와 `sigma`는 encoder 파라미터가 직접 저장한 상수가 아니라, 입력 `x`와 현재 파라미터로 계산한 출력이다.

### "latent의 한 칸은 원본 8 x 8 픽셀을 정확히 뜻하는가?"

공간 해상도가 8배 줄어든 모델에서는 대략적인 위치 대응이 있다. 하지만 한 latent cell이 원본의 독립적인 8 x 8 패치를 그대로 뜻한다고 보면 안 된다. convolution, attention, decoder의 receptive field 때문에 주변 latent와 함께 해석된다. 위치 대응은 있지만, 의미 대응은 분산되어 있다.

## 한 번에 정리하기

Diffusion 모델은 노이즈를 더하는 쉬운 과정을 먼저 정하고, 그 반대 방향을 학습한다. 모델은 원본 이미지를 외우는 대신, 각 노이즈 수준에서 데이터 밀도가 높아지는 방향을 배운다. 그래서 샘플링은 순수한 노이즈가 학습된 score field를 따라 자연 이미지의 매니폴드 쪽으로 이동하는 과정으로 볼 수 있다.

Stable Diffusion은 이 과정을 픽셀 공간이 아니라 VAE latent 공간에서 수행한다. VAE는 이미지를 더 작은 연속 latent로 압축하고, U-Net은 그 latent에서 노이즈를 예측하며, decoder는 마지막 latent를 다시 이미지로 펼친다. 덕분에 고해상도 이미지를 훨씬 적은 계산량으로 생성할 수 있다.

결국 Diffusion을 이해하는 핵심은 세 가지다.

```text
1. forward process: 우리가 데이터를 노이즈로 망가뜨린다.
2. denoising objective: 모델은 섞인 노이즈 또는 score를 배운다.
3. reverse sampling: 배운 방향장을 따라 노이즈에서 새 샘플을 꺼낸다.
```

밤하늘이 처음에는 검은 면처럼 보이다가 눈이 적응하면 별자리의 구조가 드러나는 것처럼, diffusion도 처음에는 무작위 노이즈에서 시작한다. 다만 그 별자리를 상상으로 그리는 것이 아니라, 데이터가 남긴 확률적 방향을 따라 한 단계씩 찾아간다.

## 참고한 자료

- Notion: [Diffusion](https://app.notion.com/p/27ccf77c663380729937dbe792741379)
- Notion: [Diffusion & Latent](https://app.notion.com/p/2d5cf77c6633808c90a0c2bee6e58923)
- Notion: [VAE(Variational Auto-Encoder)](https://app.notion.com/p/2a2cf77c66338046a850e869c7a32a88)
- Notion: [VAE 인코더와 디코더](https://app.notion.com/p/29ecf77c663380b991a8f57c90c067de)
- Notion: [propagation에서 손실을 구하기 위한 비교는 어떻게 하는가?](https://app.notion.com/p/2a5cf77c6633807a9039f73f1f5c69ea)
- [Autoencoders, Minimum Description Length and Helmholtz Free Energy](https://proceedings.neurips.cc/paper/1993/hash/9e3cfc48eccf81a0d57663e129aef3cb-Abstract.html)
- [Reducing the Dimensionality of Data with Neural Networks](https://www.science.org/doi/10.1126/science.1127647)
- [Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239)
- [Denoising Diffusion Implicit Models](https://arxiv.org/abs/2010.02502)
- [Score-Based Generative Modeling through Stochastic Differential Equations](https://arxiv.org/abs/2011.13456)
- [High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752)
- [Auto-Encoding Variational Bayes](https://arxiv.org/abs/1312.6114)
- [Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598)
- [Consistency Models](https://arxiv.org/abs/2303.01469)
- [Latent Consistency Models: Synthesizing High-Resolution Images with Few-Step Inference](https://arxiv.org/abs/2310.04378)
- [Hugging Face Diffusers AutoencoderKL documentation](https://huggingface.co/docs/diffusers/en/api/models/autoencoderkl)
