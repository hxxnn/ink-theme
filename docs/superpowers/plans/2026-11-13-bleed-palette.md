# bleed-palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팔레트에서 고른 색이 클릭 지점에서 잉크처럼 번지며 화면을 바꾸게 하는, 의존성 없는 브라우저 라이브러리 `bleed-palette`.

**Architecture:** `shape.js`(시드 기반 순수 모양 계산)와 `bleed-palette.js`(View Transitions 실행기)를 `scripts/build.mjs`가 `dist/bleed-palette.js` 한 파일로 합친다. 실행기는 `document.startViewTransition(applyFn)`으로 이전/새 화면을 브라우저가 찍게 하고, 하나의 rAF 시계로 새 화면의 `clip-path: path()`와 가장자리 SVG 테두리를 함께 갱신한다.

**Tech Stack:** 순수 JS(빌드 의존성 없음), 테스트는 `node:test` + Playwright(Chromium, 이미 설치됨).

**Spec:** `docs/superpowers/specs/2026-11-13-ink-bleed-palette-design.md` (설계 문서에서 `InkBleed`는 모두 `BleedPalette`로 읽는다)

## Global Constraints

- 전역 이름 `window.BleedPalette`, 패키지 이름 `bleed-palette`
- 런타임 의존성 없음, 사용자 쪽 빌드 불필요 (`dist/bleed-palette.js`를 커밋)
- CSP `img-src 'self' data:`와 `style-src`(unsafe-inline 없음)에서 동작: blob: 금지, `<style>` 태그 금지, 스타일은 `adoptedStyleSheets`와 `element.style`로만 적용
- 라이선스: `LICENSE`는 MIT, `Copyright (c) 2026 hxxnn`. 원본 ink-bleed-theme-changer 코드는 복사하지 않는다
- 모션 줄이기(`prefers-reduced-motion: reduce`)이거나 `document.startViewTransition` 미지원이면 `applyFn`만 즉시 실행
- 번짐 중 `run`이 다시 불리면 이전 transition을 건너뛰고(skip) 새로 시작
- `applyFn`이 던진 예외는 정리 후 그대로 다시 던진다
- 기본 duration은 1.2초, 번짐은 마지막에 화면 전체를 덮고 `clip-path`를 제거하며 끝난다

## Review Focus

- `x`/`y`가 `NaN`, 문자열, 뷰포트 밖: 화면 중앙(또는 뷰포트 안으로 보정)에서 번진다 (Task 1, 2)
- `applyFn`이 Promise를 반환(비동기 색 적용): 끝난 뒤에 새 화면이 찍힌다 (Task 2)
- 짧은 간격으로 연속 호출(더블 클릭): 두 번 모두 resolve되고 최종 색은 마지막 호출의 색이다 (Task 2)
- 번짐 도중 창 크기 변경: 멈추거나 반쯤 덮인 채 남지 않고 resolve되며 최종 화면은 완전한 새 화면이다 (Task 2)
- `color` 생략 또는 잘못된 값(`"red"`, `"#12"`): 오류 없이 새 화면 배경에서 뽑은 색으로 대체한다 (Task 2)

---

### Task 1: 프로젝트 뼈대와 모양 계산 (`shape.js`)

**Files:**
- Create: `package.json` (`name: bleed-palette`, `type: commonjs`, scripts: `test`, `build`), `LICENSE`, `.gitignore`
- Create: `src/shape.js` (브라우저와 Node 양쪽에서 로드되는 UMD 스타일: 브라우저에서는 `window.BleedPalette = window.BleedPalette || {}`에 `_shape`로 붙고, Node에서는 `module.exports`)
- Test: `test/shape.test.js`

**Interfaces:**
- Produces:
  - `createShape(seed: number, view: {x: number, y: number, width: number, height: number}) -> Shape`
  - `Shape.at(t: number) -> {blob: [number, number][], drops: {x: number, y: number, r: number}[]}` (`t`는 0..1, 좌표는 뷰포트 CSS px)
  - `toPath(shape: {blob, drops}) -> string` (`blob`은 `M…L…Z`, 각 방울은 원을 근사한 `M…Z` 서브패스)
  - `mulberry32(seed: number) -> () => number` (0 이상 1 미만)

- [ ] **Step 1: 실패하는 테스트 작성** (`node:test`, 함수 import만 하고 구현은 없음)
  - `same seed gives identical paths`: 같은 `seed`·`view`·`t=0.5`로 `toPath(createShape(...).at(0.5))` 두 번이 같다
  - `different seeds differ`: seed 1과 2의 경로가 다르다
  - `t=0 is a tiny drop`: `view={x:500,y:300,width:1000,height:600}`에서 `blob`의 모든 점이 `(500,300)`에서 6px 이내
  - `mean radius grows with t`: `t=0.2, 0.5, 0.8`의 평균 반지름이 순증가
  - `covers the whole viewport at t=1`: 네 모서리 `(0,0)`, `(width,0)`, `(0,height)`, `(width,height)`가 `blob` 다각형 안에 있다 (테스트 안에서 ray casting 함수 작성). 시작점이 구석인 `view`(`x:0,y:0`)와 중앙인 `view` 둘 다
  - `all numbers are finite` (`NaN`/`Infinity` 없음), `blob`의 점 개수는 모든 `t`에서 같다 (프레임 사이 형태 변화가 부드럽도록)
  - `drops sit outside the blob front`: `t=0.5`에서 각 방울 중심이 `blob` 바깥
  - `x/y not finite falls back to the viewport center`: `createShape(1, {x:NaN,y:'a',width:800,height:400})`의 `at(0)`이 `(400,200)` 근처

- [ ] **Step 2: 실행해 실패 확인** — `node --test test/shape.test.js` → 모듈/함수 없음으로 FAIL

- [ ] **Step 3: `src/shape.js` 구현** — 각도 256개에서 `r(θ,t) = R(t) · (1 + 큰 덩어리 노이즈 + 방향 로브) + 촉수(가는 가시, 방향마다 길이가 다르고 끝이 좁음)`. 노이즈는 `mulberry32` 기반 자체 구현(주기 값 노이즈를 각도 방향으로 보간). `R(t)`는 `maxDist`(시작점에서 가장 먼 모서리까지 거리)에 대해 ease-out. 후반(`t > 0.55`)에 균일한 추가 반경을 더해 `t=1`에서 모든 각도의 반지름이 `maxDist`를 넘게 한다. 방울은 `0.1 < t < 0.9`에서 최대 12개, `blob` 바깥 가장자리 근처에 작은 원(반지름 1.5~6px)으로 둔다. `view.x/y`가 유한한 숫자가 아니면 중앙, 뷰포트 밖이면 뷰포트 안으로 clamp.

- [ ] **Step 4: 테스트 통과 확인** — `node --test test/shape.test.js` → 전부 PASS

- [ ] **Step 5: 커밋** — `git add . && git commit -m "feat: add seeded ink shape generator"`

---

### Task 2: 실행기 (`bleed-palette.js`)와 빌드

**Files:**
- Create: `src/bleed-palette.js`, `scripts/build.mjs`, `dist/bleed-palette.js`(빌드 산출물, 커밋)
- Create: `test/fixtures/basic.html`, `test/fixtures/csp.html`
- Test: `test/browser.test.mjs` (`node:test` + `createRequire`로 불러온 Playwright Chromium)

**Interfaces:**
- Consumes: Task 1의 `createShape`, `toPath` (빌드 때 같은 파일 안에 합쳐진다)
- Produces:
  - `BleedPalette.run(applyFn: () => void | Promise<void>, opts?: {x?: number, y?: number, color?: string, duration?: number, seed?: number, reducedMotion?: boolean}) -> Promise<void>`
  - `BleedPalette.supported: boolean`
  - `BleedPalette.pointFrom(source: MouseEvent | Element) -> {x: number, y: number}` (이벤트면 `clientX/Y`, 요소면 중심)
  - `scripts/build.mjs`: `src/shape.js`와 `src/bleed-palette.js`를 합쳐 `dist/bleed-palette.js`를 만든다. `npm run build`.

- [ ] **Step 1: 실패하는 브라우저 테스트 작성** (`basic.html`: `--bg` 변수를 `<html>`에 적용하는 `setBg(color)`, 본문 `background: var(--bg)`. 빌드된 `dist/bleed-palette.js` 로드)
  - `run applies the change and resolves`: `await BleedPalette.run(() => setBg('#00ff00'), {x:100,y:100,duration:300})` 후 `getComputedStyle(body).backgroundColor === 'rgb(0, 255, 0)'`
  - `mid-transition the new color is partially visible`: 번짐 중간에 `::view-transition-new(root)`의 `clip-path`가 `path(`로 시작하고, 완료 후 `<html>`에 `--bp-clip` 속성과 오버레이 SVG가 없다
  - `reduced motion applies instantly`: `page.emulateMedia({reducedMotion:'reduce'})` 상태에서 호출 직후(한 프레임 안에) 색이 바뀌어 있고 오버레이가 생기지 않는다
  - `unsupported browser applies instantly`: `addInitScript`로 `document.startViewTransition = undefined`, `BleedPalette.supported === false`이고 `run`이 `applyFn`을 실행하고 resolve
  - `second run skips the first`: 100ms 간격으로 `run`을 두 번(초록, 파랑) → 둘 다 resolve, 최종 색은 파랑
  - `applyFn rejection is rethrown and cleans up`: `run(() => { throw new Error('x') })`가 reject되고 오버레이가 남지 않는다
  - `async applyFn is awaited`: `applyFn`이 50ms 뒤 색을 바꾸는 Promise를 반환해도 최종 화면이 새 색
  - `invalid x/y and color do not throw`: `x:NaN`, `y:'a'`, `color:'red'`, 또 `color:'#12'`로 호출해도 resolve되고 최종 색이 맞다
  - `resize mid-run still completes`: 번짐 시작 100ms 뒤 `page.setViewportSize`로 크기를 바꿔도 resolve되고 최종 화면이 완전한 새 색(`clip-path` 제거됨)
  - `works under a strict CSP`: `csp.html`(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:">` + 외부 스크립트로 `dist` 로드)에서 `run` 후 CSP 위반 콘솔 오류가 0개이고 최종 색이 맞다

- [ ] **Step 2: 실행해 실패 확인** — `node --test test/browser.test.mjs` → `BleedPalette` 없음으로 FAIL

- [ ] **Step 3: `src/bleed-palette.js` 구현** (`run` 흐름은 설계 문서 "동작 설계" 그대로)
  - `adoptedStyleSheets`에 `::view-transition-old(root){animation:none}` `::view-transition-new(root){animation:none;clip-path:var(--bp-clip)}`와 `::view-transition-group(root)`, `::view-transition-image-pair(root)`의 기본 애니메이션 제거 규칙을 넣는다. `<style>` 태그는 쓰지 않는다.
  - `--bp-clip`은 `document.documentElement.style.setProperty`로 매 프레임 `path('…')` 값을 갱신한다. 끝나면 속성을 제거한다 (마지막에 새 화면 전체가 보이도록).
  - 가장자리 테두리: `position:fixed; inset:0; pointer-events:none` SVG 오버레이의 `<path>`에 같은 `toPath` 결과를 `stroke`로 그리고, `t`가 끝에 가까워질수록 투명해진다. 오버레이는 끝나면 제거.
  - `color` 해석: `/^#[0-9a-f]{6}$/i`가 아니면 무시하고, `<html>`의 `--ink-bleed-color`, 그것도 없으면 새 화면의 `body` 배경색에서 뽑는다 (어두운 배경이면 약간 밝게, 밝은 배경이면 약간 어둡게).
  - 연속 호출은 진행 중인 `ViewTransition.skipTransition()`과 rAF 루프를 정리한 뒤 새로 시작한다. `applyFn` 예외는 정리 후 rethrow.
  - 마지막 프레임에서 `--bp-clip`을 제거하므로, 도중 창 크기가 바뀌어도 완전한 새 화면으로 끝난다.
  - `scripts/build.mjs`: 두 파일을 합쳐 `dist/bleed-palette.js` 생성.

  구현 중 확인할 것: `::view-transition-new(root)`에서 `<html>`의 CSS 변수가 상속되는지는 Chromium에서 먼저 검증한다. 안 되면 `document.documentElement.animate(..., {pseudoElement})` 쪽으로 바꾼다.

- [ ] **Step 4: 빌드 후 테스트 통과 확인** — `npm run build && node --test test/browser.test.mjs` → 전부 PASS

- [ ] **Step 5: 커밋** — `git add . && git commit -m "feat: add view-transition runner with ink clip-path"`

---

### Task 3: 데모와 문서

**Files:**
- Create: `demo/index.html`, `README.md`
- Test: `test/demo.test.mjs`

**Interfaces:**
- Consumes: Task 2의 `BleedPalette.run`, `BleedPalette.pointFrom`

- [ ] **Step 1: 실패하는 테스트 작성** — `demo/index.html`을 Playwright로 열어서
  - `palette swatch click spreads ink and changes the theme`: 스와치를 클릭하고 `duration` 뒤 `getComputedStyle(body).backgroundColor`가 그 스와치의 `bg`와 같다
  - `glass toggle on keeps the page correct`: 유리/그라데이션 토글을 켠 채 같은 클릭 후에도 오류 없이 최종 색이 맞다
  - `page has no console errors`

- [ ] **Step 2: 실행해 실패 확인** — `node --test test/demo.test.mjs` → 파일 없음으로 FAIL

- [ ] **Step 3: 데모와 README 작성**
  - 데모: 팔레트 8색(`bg`/`accent`)과 유리·그라데이션·이미지 배경(data URL) 토글. `apply`는 CSS 변수를 `<html>`에 넣는 방식이고, 스와치 클릭 시 `BleedPalette.run(() => apply(p), {...BleedPalette.pointFrom(e), color: p.accent})`로 감싼다. 색 선택기 드래그(`input` 이벤트)는 일부러 감싸지 않고 바로 적용해 비교할 수 있게 한다.
  - README: 사용법(`<script src>` 한 줄, `run` 예시, 옵션 표), 지원 브라우저, "연속 입력에는 쓰지 않는다", CSP 주의, `--ink-bleed-color`, 라이선스 안내. 원본(ink-bleed-theme-changer)은 "영감"으로만 언급하고 코드 사용 아님을 명시한다.

- [ ] **Step 4: 전체 테스트 확인** — `npm test` → shape, browser, demo 테스트 전부 PASS

- [ ] **Step 5: 커밋** — `git add . && git commit -m "docs: add demo page and README"`
