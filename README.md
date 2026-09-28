# fancyprofile

给 GitHub profile README 用的 synthwave SVG 背景渲染器。

构建期纯 Node，**不需要浏览器**（上游 `lowlighter/metrics` 要靠 headless Chromium 量高度，
我们靠"位移场是 uv 的纯函数、画布尺寸构建期已知"避开了这一步）。运行时零依赖。

![night drive](scenes/night-drive.svg)

*`npm run scene` — 向前飞行的透视网格，SMIL 驱动，1.8s 无缝循环。*

## 场景

分层是设计要点，不是实现细节：

```text
天空 ─ 星星 ─ 月亮 ─ 山脊 ─ [ 地面：地板 + 网格 ]
                                  ↑ 只有这一层能挂 filter
```

**月亮、山脊、天空永远干净渲染。** 早期版本把 filter 套在整张画布上，结果是月亮必然跟着
一起扭曲。分层之后，扭曲才读得出它本来的物理含义——**地面平面的畸变**，而不是覆盖全图的镜头。

![baseline](experiments/01-baseline.svg)

![ground warp](experiments/05-feimage.svg)

## 工具层

`src/svg.mjs` 是一个薄的 SVG builder：不建树、不做渲染抽象，只保证两类**真实踩过的** bug
在类型上无法表达。

- **非法 path data** —— 山脊曾经因为路径以坐标对而非 moveto 开头，被浏览器**静默丢弃**，
  在每一帧里都不存在。而像素对比永远发现不了：所有帧都一样地没有山。
- **未转义的属性值**

属性名原样透传，必须按 SVG 的写法给（`stroke-width` 用 kebab，`viewBox` / `baseFrequency`
用 camel）。**不做命名转换——猜错是静默的。**

| 文件 | 职责 |
|---|---|
| `src/svg.mjs` | SVG builder：元素、路径、渐变、filter primitive |
| `src/scene.mjs` | 分层背景场景 + 位移 filter |
| `src/displacement.mjs` | shader 位移场 → RG 贴图 |
| `src/png.mjs` | 最小 RGBA8 PNG 编解码，只用内置 `zlib` |

### 位移管线

```text
fragment(uv) → dx, dy → R=dx/scale+0.5, G=dy/scale+0.5 → PNG → base64 data URI
                                                              ↓
                                                    feImage → feDisplacementMap
```

技术来自 `shuding/svg-shaders`（见 `docs/research-plan.md`），但搬到了构建期：
位移场是 uv 的纯函数，编码是算术，**整条链路不需要 canvas 也不需要浏览器**。

两个不能省的细节：`color-interpolation-filters="sRGB"`（默认的 linearRGB 会把编码好的
偏移量过一遍传递曲线），以及 `scale` 必须和编码时的归一化系数一致，且**以 filter 的
user space 为单位**——用地图像素算会让低分辨率的地图变成"位移更弱"而不是"更平滑"。

## GitHub 渲染边界（实测，非推测）

完整记录见 [`docs/findings-github-svg.md`](docs/findings-github-svg.md)。

- GitHub 对仓库内 SVG **不做净化**：逐字节原样返回，`image/svg+xml`。约束全在浏览器把
  SVG 当 `<img>` 加载时的 secure static mode
- 该模式下实测可用：filter primitive、**`feImage` 带 data: URI**（这套技术的命门）、
  SMIL `<animate>`、文档内 `<style>` + `@keyframes`、`<mask>`
- **不可用**：`backdrop-filter` —— 只能扭曲自己被画出来的样子，不能折射背后的内容

六个隔离变量的实验：

| # | 文件 | 验证的能力 |
|---|------|-----------|
| 01 | `01-baseline.svg` | 仓库内 SVG 能否被渲染（基线） |
| 02 | `02-smil.svg` | SMIL 声明式动画 |
| 03 | `03-css.svg` | 文档内 `<style>` + `@keyframes` |
| 04 | `04-turbulence.svg` | filter primitive（不含 `feImage`） |
| 05 | `05-feimage.svg` | `feImage` + `feDisplacementMap`，`href` |
| 06 | `06-feimage-xlink.svg` | 同上，`xlink:href` |

每个 filter 都只挂在地面层上——这既是场景的真实结构，也让实验更严格：六张图里月亮都是
干净的，所以 filter 坏掉表现为"地面不对"而不是"整张画不对"。

### svgo

`preset-default` 的五个危险插件没弄坏任何东西（我们没踩到触发条件），收益也接近零：
小文件 -23%，而真正的产物只有 **-1.3%**，因为绝大部分字节是 base64 位移场。
想拿它当净化器用的话 `removeScripts` **不在** preset 里，必须显式加。

## 构建

```sh
npm ci
npm run build      # 生成 experiments/ 六个 SVG
npm run verify     # 重建并校验与已提交的一致
```

`verify` 比的是**语义**不是字节：zlib 的 deflate 输出跨版本不稳定，CI 上（Node 24）和本地
（Node 26）的 base64 长度不同、解码后像素完全相同。所以它比 (a) 掩掉 payload 的 markup 和
(b) 解码后的位移场像素。比字节会在一个并不存在的差异上失败——第一版 CI 就是这么红的。

其余脚本都是**决策工具**，产物落在 `experiments/` 下且不入库（见 `.gitignore`）：

| 命令 | 用途 |
|---|---|
| `npm run look` | warp 强度梯度，用眼睛定 |
| `npm run compression` | 位移场分辨率/通道扫描 |
| `npm run probe` | 单竖线探针，直接量位移落点 |
| `npm run svgo` | 四个逐级关插件的 svgo 配置对比 |

`reference/` 是上游仓库的 shallow clone，已 gitignore。
