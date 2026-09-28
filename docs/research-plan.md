# GitHub README SVG 生成 — 源码研究计划

> 记录于 2026-09-28 · 计划阅读日 2026-09-29
> 目标：为 fancyprofile 的 synthwave renderer 收敛出工程参考与理论边界

## 三个研究问题

1. shader 的哪些语义能自然映射为 `SVG filter graph`
2. animation 在 GitHub README 中到底能保留到什么程度
3. 怎样构造一个真正工程化的 `scene/IR → SVG → optimize → Action → README` 管线

## 主研究对象

### 1. svg/svgo — 22.7k stars
<https://github.com/svg/svgo>

SVG pipeline 的基础设施，不是 shader 项目。但如果最后要生成复杂 README SVG，它基本绕不开：
AST、优化、属性重写、`defs/filter/path` 保留规则都值得看。

### 2. lowlighter/metrics — 17.0k stars
<https://github.com/lowlighter/metrics>

最值得研究的 GitHub README SVG 工程。47 个插件、335 个选项，能从 GitHub 数据生成
SVG / Markdown / PDF / JSON。

重点不是它的视觉，而是这条链路：

```text
data acquisition → plugin IR → rendering → GitHub Action → README asset
```

这就是以后 synthwave renderer 的工程参考。

### 3. paperjs/paper.js — 15.1k stars
<https://github.com/paperjs/paper.js>

如果最终 synthwave 画面需要 procedural geometry（山脉、透视网格、曲线、polygon/path
generation），这比自己手搓 SVG path 更值得参考。成熟的 vector graphics scripting 系统。

### 4. svgdotjs/svg.js — 11.8k stars
<https://github.com/svgdotjs/svg.js>

成熟的 SVG manipulation / animation 抽象。适合研究我们自己的 IR 最终应该如何落到
SVG DOM，而不是直接字符串拼 XML。

### 5. Platane/snk — 6.1k stars
<https://github.com/Platane/snk>

GitHub README **animated SVG deployment** 最值得看的项目之一。真的生成 animated SVG，
支持 dark/light `<picture>`、GitHub Actions、GIF/SVG 双 backend。

要研究的是它如何保证生成物能稳定显示在 GitHub，而不是蛇本身。

### 6. yoshi389111/github-profile-3d-contrib — 1.7k stars
<https://github.com/yoshi389111/github-profile-3d-contrib>

同样是成熟的 `GitHub data → procedural SVG → scheduled Action → profile README` 案例，
且已有 animated SVG 输出。比那些几十 star 的 README demo 更值得参考。

### 7. shuding/liquid-glass — 约 1.1k stars
<https://github.com/shuding/liquid-glass>

本名单里**和 shader→SVG 最直接相关**的项目。它明确就是 “Liquid Glass shader with SVG”，
技术来源指向 `shuding/svg-shaders`。

重点看 displacement map 如何被编码进 SVG filter。

## 例外：shuding/svg-shaders

虽然不是高 star 项目，但仍然要读——它是 `liquid-glass` 明确引用的**上游技术原型**，
不是随机小 repo。应该作为「论文 / 原型代码」读，而不是作为「社区验证项目」读。

核心做法正中我们的问题：

```text
fragment-like function
      ↓
sample UV displacement
      ↓
encode dx/dy as RG texture
      ↓
feImage
      ↓
feDisplacementMap
```

<https://github.com/shuding/svg-shaders>

## 阅读顺序（2026-09-29）

```text
shuding/svg-shaders
        ↓
shuding/liquid-glass
        ↓
SVG.js
        ↓
SVGO
        ↓
Platane/snk
        ↓
lowlighter/metrics
        ↓
github-profile-3d-contrib

Paper.js 作为 procedural geometry 支线
```

## 已排除（前一版名单）

`animated-github-profile` / `readme-aura` / `git-invader` / `webgl-in-svg` / `shadertoy-svg`

理由：规模太小，不该作为主研究对象，最多当边角案例。

---

*Stars 为 2026-09 记录值，会漂移。*
