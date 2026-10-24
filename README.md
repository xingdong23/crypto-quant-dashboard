# 加密量化实时看板

只读展示 Paper 双轨（EqualReb_4h / Hybrid_90/10）与 Accel 影子盘的净值、持仓、买卖点。  
**不修改** `paper/` 与 `rocket/shadow/` 交易逻辑；数据由导出脚本聚合为静态 `data.json`。

## 本地打开

必须用 HTTP 服务打开（浏览器直接 `file://` 会因 CORS 无法 `fetch`）：

```bash
cd /workspace/crypto-backtest/dashboard
python3 -m http.server 8080
```

浏览器访问：http://127.0.0.1:8080/

页面每 60 秒自动拉取 `./data.json`；若 `generated_at` / 源更新时间早于 20 分钟，会显示「数据陈旧」警告。

## 刷新数据

在仓库根目录或本目录执行导出（只读源文件，写出 `dashboard/data.json`）：

```bash
python3 /workspace/crypto-backtest/dashboard/export_dashboard.py
```

建议在每次 `paper_tick.py` / `shadow_tick.py` 跑完后由 **routine** 再调一次导出。  
本版**未**给 tick 脚本打 hook，以保持 paper / shadow 脚本字节级不变。

## 免费部署（静态站）

本目录可整夹拖到任意静态托管，无需 npm 构建：

| 平台 | 做法 |
|------|------|
| **Cloudflare Pages** | 连接 GitHub 仓库，构建命令留空，输出目录填 `dashboard`（或上传本文件夹） |
| **GitHub Pages** | 把 `dashboard/` 推到仓库的 `gh-pages` 分支或 `/docs`，Settings → Pages 指向该目录 |
| **Netlify Drop** | 打开 [https://app.netlify.com/drop](https://app.netlify.com/drop)，把整个 `dashboard` 文件夹拖进去即可 |

部署后访问站点即可看到看板。若要「准实时」：

1. 机器上 tick 跑完 → 执行 `export_dashboard.py`
2. 提交并推送更新后的 `data.json`（或用 CI / Cloudflare 定时拉文件）
3. 前端会自动刷新；无需重新构建

> 下一步：需你本人连接 GitHub（或选 Netlify Drop / Cloudflare 直传），本机器人不会代替你创建仓库或推送密钥。

## `data.json` 结构（schema_version = 1）

| 字段 | 说明 |
|------|------|
| `generated_at` | 导出时刻，UTC ISO（`…Z`） |
| `last_source_update_utc` | paper/accel state 中最新的 `updated_utc` |
| `meta` | 池名、策略名、初始资金等 |
| `kpi.equal / hybrid / accel` | 净值、累计/今日%、现金、风控文案 |
| `equity.*` | `{t, equity, cash, …}` 曲线点（UTC） |
| `positions.*` | 持仓表（含 CASH）；Accel 可用权益反推估市价 |
| `events` | paper 成交 + Accel 信号，按时间倒序 |
| `reports.paper / accel` | `last_report.md` 摘要 |

源文件缺失时导出仍 exit 0，对应数组为空、KPI 字段为 `null`。

## 目录一览

```
dashboard/
  index.html      # 页面
  app.js          # 逻辑 + Chart.js
  styles.css      # 深色移动端友好样式
  data.json       # 导出产物（可提交以便 Pages 展示）
  export_dashboard.py
  README.md
```

## 时区

账本与 CSV 一律 **UTC**。页面页眉同时标注 **Asia/Shanghai（上海）** 与 **America/Los_Angeles（洛杉矶）**。
