# GitHub README SVG 渲染边界 — 实测

> 2026-09-28 · 方法：6 个各自隔离一个变量的 SVG 提交进本仓库，在 README 页面上实测
> 复现：`npm run build` 后推送，对照 `experiments/` 六张图

## 传输层：GitHub 不做任何净化

仓库内的 SVG 被**逐字节原样返回** —— 六个文件的 sha256 与本地完全相同，
`Content-Type: image/svg+xml`。feImage、feDisplacementMap、data: URI、`@keyframes`
全部原样送达。

所以约束不在服务端，而在浏览器把 SVG 当作 `<img>` 加载时进入的
**secure static mode**（脚本禁用、外部资源引用禁用）。

## 该模式下实测可用的能力

| 能力 | 结果 | 证据 |
|------|------|------|
| filter primitive（`feTurbulence` + `feDisplacementMap`） | ✅ | 13.1% 像素偏离基线，maxDelta 574 |
| `feImage` 带 data: URI + `feDisplacementMap` | ✅ | 16.7% 像素偏离基线，maxDelta 572 |
| SMIL `<animate>` | ✅ | 同一文件跨时间自比：每 1.2s 有 0.58% 像素变化，三个间隔稳定复现 |
| 文档内 `<style>` + `@keyframes` | ✅ | 同上方法：每 1.2s 有 ~14.8% 像素变化 |
| `<mask>` | ✅ | 太阳的横向切割条正常 |
| `href` vs `xlink:href` | 等价 | 05 与 06 像素差完全同值 |

### 动画那两行差点被错证

第一版结论用的是「02/03 相对 01 基线有像素差异」，那是**无效证据**：02 比 01 多一个 circle、
03 比 01 多一个 glow 圆，差异用「多画了个静态元素」就能完全解释，根本没证明在动。

正确的判据是**同一文件跨时间自比**，而且要跳过首次光栅化的稳定期（Chrome 会在加载后约 1s
再重绘一次，静态文件也会产生 ~2.9% 的一次性跳变）。

两个反例，都会让人误判：

- 每次新建 `Image` 再等**固定时长**采样 → 两次采样落在动画的同一相位，测量恒为 0
- 拿动画文件跟静态基线比 → 差异来自多出来的元素，与动画无关

补充：GitHub 页面实测（人眼）确认 02、03 在动，其余四个静止——与上表一致。

**最关键的一条：`feImage` 的 data: URI 会被加载。** 这是 `shuding/svg-shaders` 那套技术的命门
—— secure static mode 会拦外部资源引用，而 data: URI 算不算"外部"是浏览器实现相关的灰色地带。
实测放行。

失败模式很好认：如果 `feImage` 被拦，`feDisplacementMap` 拿不到 `in2`，primitives 被禁用，
**整张图会变成全黑**，而不是"没效果"。

## 明确不可用的

- **`backdrop-filter: url(#filter)`** —— `liquid-glass` 真正的手法，折射元素**背后**的内容。
  它需要 CSS 作用在活的 DOM 元素上，`<img>` 内的 SVG 拿不到 backdrop。
  README 里只能做 `in="SourceGraphic"` 的自过滤：**扭曲自己被画出来的样子，不能折射背后的东西**。
  这是「shader 语义 → filter graph」映射的第一个硬边界。
- **JS / 交互 / 鼠标跟随** —— 两个上游仓库的 `mouse` 参数在 README 场景下无意义。
- **外链资源** —— 图片、字体、外部 CSS 一律不加载。

## 对管线的含义

位移场是 uv 的纯函数，不依赖浏览器，所以整条链路可以离线预计算：

```text
fragment(uv) → dx, dy → RG 贴图 → PNG → base64 data URI → feImage
                                              ↓
                                    feDisplacementMap(scale)
```

`src/displacement.mjs` 就是这个。构建期算一次，产物是静态 SVG，运行时零依赖。

两个不能省的细节：`color-interpolation-filters="sRGB"`（默认的 linearRGB 会把编码好的偏移量
过一遍传递曲线，整个位移场被扭曲），以及 `scale` 必须等于编码时的归一化系数。

## svgo：危险清单是真的，但没踩到；收益也几乎为零

`preset-default` 里有五个插件对 filter/动画重的 SVG 不安全（`removeHiddenElems` 会删掉被
`<animate>` 之后抬起的 `opacity="0"` 基线；`convertShapeToPath`/`convertEllipseToCircle`/
`convertTransform` 完全没有 SMIL 检查；`cleanupNumericValues` 四舍五入会改变噪声图案）。

用四个逐级关插件的配置实测（`src/optimize-experiment.mjs`）：

- **没有一个配置弄坏任何文件**：无 dangling 引用、无元素丢失、四个配置渲染像素全等、
  动画在四个配置下都还活着
- 原因是我们没踩到条件：动画基线不是 `opacity="0"`，`convertShapeToPath` 默认不转 arc
- 精确复现了 `cleanupIds` 的 deopt：`03-css.svg` 因为含 `<style>` 而 id 未被重命名，其余五个被改名

**收益**：小文件 -23%，但真正的产物（05/06）只有 **-1.3%**——因为 98% 是 base64 位移场。

> 想拿 svgo 当 GitHub 净化器用的话：`removeScripts` **不在** preset 里，必须显式加。

## 位移场压缩：分辨率是唯一有效的杠杆

`src/compression-experiment.mjs`，以全分辨率 RGBA 为参考：

| 变体 | 地图 | 地图 kB | SVG kB | 与参考的像素差 |
|------|------|---------|--------|----------------|
| 参考 | 800×400 4ch | 117.4 | 126.0 | — |
| res | 400×200 4ch | 64.6 | 73.2 | 3.29% |
| res | 200×100 4ch | 28.9 | 37.5 | 3.93% |
| res | 100×50 4ch | 10.0 | 18.6 | 5.32% |
| res | 50×25 4ch | 3.1 | 11.7 | 7.44% |
| res | 25×13 4ch | 1.1 | 9.6 | 10.04% |
| 通道 | 800×400 **3ch** | 115.1 | 123.7 | 2.74% |

（markup 本身的底是 ~8kB，所以 SVG 总大小趋近于 8kB。百分比是旧场景下测的；新场景
markup 更小、位移场占比更高，绝对值会变，但结论——分辨率不改强度、通道方向不划算——不变。）

**通道方向砍掉。** RGB 只省 2.5% 字节，却引入 2.74% 的渲染差异——而两张 PNG 解码后
**逐字节相同**（`decodePNG` 比对，R/G/B/A 全零差异，scale 也相同）。差异纯粹来自 Chrome
对 RGB-PNG 与 RGBA-PNG 在 `feImage` 里的光栅化路径不同。不划算。

**分辨率方向是安全的，但不是「变糊」。** 直观上低分辨率版本像是「位移变弱」，实测不是：

- 用单竖线探针直接量落点（`src/displacement-probe.mjs`）：800×400 落点 108，
  25×13 落点 108，**六种分辨率完全一致**，理论值 109
- 放大 8 倍的差异图显示：均匀区域（天空渐变、太阳内部、地面）**逐像素纯黑**，
  差异全部集中在边缘——太阳轮廓、网格线、山脊、星点，网格线呈成对细线，
  这是亚像素位移的典型特征

像素差百分比之所以这么高，是因为这个画面全是 1.2px 细线：位移场在采样点之间被平滑后，
亚像素的位置变化会让整条线「不同」。指标对这个内容极度敏感，百分比会被放大。

### 两个坑（都是我自己踩的）

1. **单位**：`peak` 一开始是在**地图像素**里算的，但 `feDisplacementMap` 的 `scale` 作用在
   filter 的 user space。地图尺寸恰好等于画布尺寸时两者重合，一降分辨率就暴露成
   「位移被等比削弱」。修法是显式传 `userWidth`/`userHeight`。
2. **测量噪声**：Chrome 在 SVG 加载后约 1s 会再重绘一次，静态文件也会产生 ~2.9% 的
   一次性跳变。必须预热 2.5s 并要求连续两次采样一致，否则每个数字都被污染。

## 待验证

- **主题适配**：`prefers-color-scheme` 在 `<img>` SVG 里跟的是操作系统/浏览器主题，
  不是 GitHub 的主题切换。深浅色大概率仍要靠 README 侧的 `<picture>` + 独立文件。
- **取哪一档分辨率**：200×100（36.6kB）保守、100×50（18kB）激进。还没在真实
  README 尺寸下用眼睛定夺过——差异图说只有亚像素边缘偏移，但这个判断值得人眼复核一次。
- **CDN 缓存**：raw 有 CDN 缓存，动画在客户端跑不受影响，但更新后生效有延迟。
