# 成语故事 · 每天一个成语

给孩子的传统文化启蒙小站。每天推送一个成语，做成学习卡片：**成语、拼音、释义、出处、典故白话故事、例句、近义/反义词**，并支持朗读、收藏、标记、检索、历史回看。

- **纯静态、零构建**：只用原生 HTML / CSS / JavaScript，双击不行、用任意静态服务器即可。
- **完全离线**：内置成语数据集，不依赖任何外部 API，无 key、无广告、无追踪。
- **每日成语确定性轮转**：用 `YYYYMMDD` 哈希取模选取，**同一天所有访客一致，每天不同**。

## 目录结构

```
idiom-story/
├── index.html              # 页面
├── assets/
│   ├── css/style.css       # 样式（宣纸米白 + 朱红墨色，响应式）
│   └── js/app.js           # 交互逻辑（零依赖）
├── data/
│   ├── idioms.json         # 成语数据集（构建产物）
│   └── manifest.json       # 数据元信息（条数、首字母/类别分布）
├── scripts/
│   ├── build-dataset.js    # 构建脚本：精选层 + 开源库补充
│   └── premium-idioms.js   # 人工精选成语（含适合孩子的白话故事）
├── package.json
├── .gitignore
└── README.md
```

## 数据来源与构建

数据分两层：

1. **精选层（premium）**：`scripts/premium-idioms.js`，人工撰写，涵盖最脍炙人口的典故成语，
   每条都含**适合孩子的白话故事**、近义词、反义词、类别标签。**今日成语只从精选层选取**，保证故事质量。
2. **补充层（supplement）**：从开源项目 [`chinese-xinhua`](https://github.com/pwxcoo/chinese-xinhua)（MIT，含约 3 万条 `idiom.json`）中，
   按白名单筛选常见、适合孩子的成语补充，扩充检索与浏览的广度。

### 重新构建数据

```bash
# 1) （可选）下载开源库到缓存目录，用于补充层
mkdir -p scripts/.cache
curl -L -o scripts/.cache/xinhua_idiom.json \
  https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json

# 2) 构建 data/idioms.json
node scripts/build-dataset.js          # 精选 + 开源补充
node scripts/build-dataset.js --premium # 仅精选层（不依赖开源库，开箱即用）
```

> 若不下载开源库，脚本会**仅输出精选层**，同样开箱即用。想扩充数据，只需下载开源库后重跑，
> 或在 `scripts/premium-idioms.js` 里继续添加带故事的条目、在 `build-dataset.js` 的 `SUPPLEMENT_WHITELIST` 中增补成语。

## 本地预览

必须通过 HTTP 访问（`fetch` 读取 JSON，直接双击 `file://` 打开会被浏览器拦截）：

```bash
npm run serve        # 内置零依赖静态服务器 → http://localhost:8080
# 或
python3 -m http.server 8080
```

## 功能

- **今日成语主卡**：大字成语 + 拼音 + 释义，分区展示【出处】【典故故事】【例句】【近义/反义】。
- **朗读**：使用浏览器 `speechSynthesis` 朗读成语与故事，方便讲给孩子听。
- **换一个 / 收藏 / 认识了 / 待学习 / 复制**：个人数据存 `localStorage`，离线保留。
- **检索**：按类别 Tab、拼音首字母 A–Z 过滤，搜索框可搜成语 / 释义 / 故事。
- **收藏夹 & 历史回看**：查看收藏、认识、待学习清单，以及过去 30 天的每日成语。

## 部署到 GitHub Pages

本项目为纯静态站点，将仓库根目录作为 Pages 源即可：

1. 新建仓库并推送本目录全部文件。
2. 仓库 **Settings → Pages → Build and deployment**：Source 选 **Deploy from a branch**，
   Branch 选 `main`，目录选 `/ (root)`，保存。
3. 稍等片刻，Pages 会给出线上地址 `https://<用户名>.github.io/idiom-story/`。

> 完全离线、日期驱动，**默认无需 GitHub Actions**。如需生成每日快照，可自行添加 `schedule` 定时工作流，但非必需。

## 许可

代码 MIT。补充层成语数据来自开源项目 `chinese-xinhua`（MIT）。
