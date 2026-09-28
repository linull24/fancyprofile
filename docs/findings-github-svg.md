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
| SMIL `<animate>` | ✅ | 0.23% 像素持续变化（细环动画） |
| 文档内 `<style>` + `@keyframes` | ✅ | 0.44% 像素持续变化 |
| `<mask>` | ✅ | 太阳的横向切割条正常 |
| `href` vs `xlink:href` | 等价 | 05 与 06 像素差完全同值 |

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

## 待验证

- **主题适配**：`prefers-color-scheme` 在 `<img>` SVG 里跟的是操作系统/浏览器主题，
  不是 GitHub 的主题切换。深浅色大概率仍要靠 README 侧的 `<picture>` + 独立文件。
- **体积**：`05-feimage.svg` 是 132kB（800×400 的 PNG 转 base64 后）。README 里放多张会有
  加载成本，需要压：降低位移场分辨率（位移场是低频的，本来也不需要全分辨率）、
  或用调色板 PNG。
- **CDN 缓存**：raw 有 CDN 缓存，动画在客户端跑不受影响，但更新后生效有延迟。
