# 日期相关函数结构与 LA 时区分析

## 1. 日期函数结构总览

所有“当前时刻”均来自 **浏览器** 的 `new Date()`（即用户设备时间对应的 UTC 时间戳），再通过 `Intl` 按 **America/Los_Angeles** 解释成年/月/日/时/分/秒。  
**结论：部署在非 LA 的 GitHub 服务器不会影响日期逻辑**——页面是静态的，日期计算全部在用户浏览器里执行。

---

## 2. 各函数签名与用途

| 函数 | 输入 | 输出 | 用途 |
|------|------|------|------|
| `getLAString()` | 无 | `string`（LA 的 `toLocaleString("en-US")`） | 同步时间等展示、`lastSyncTime` |
| `getLATodayKey()` | 无 | `"YYYY-MM-DD"`（LA 的“今天”） | 判断是否跨天、今日统计、日志按日过滤 |
| `getLAISODate()` | 无 | `"YYYY-MM-DDTHH:mm:ss"`（LA 的当前时刻） | 写入 `logs[].time`、`completedAt` |
| `getLADisplayTime()` | 无 | `string`（LA 时间展示） | 页头“当前时间（LA）” |
| `getLAISOWeekNumber(dateKey)` | `"YYYY-MM-DD"` | `number`（ISO 周序号） | 判断是否跨周、每周任务重置 |
| `resetIfNeeded()` | 无 | 无（副作用：可能重置任务并写 `lastDateLA`） | 每日/周自动重置入口 |

---

## 3. 数据流与依赖关系

```
new Date()  (浏览器当前 UTC 时刻)
    │
    ├─► getLATodayKey()        → "YYYY-MM-DD"  ─┬─► localStorage["lastDateLA"]
    │                                            ├─► getTodayStats() / 今日已完成 / 消耗记录按日
    │                                            └─► resetIfNeeded() 里与 lastKey 比较
    │
    ├─► getLAISODate()         → "YYYY-MM-DDTHH:mm:ss"  → data.logs[].time
    │
    ├─► getLAString()          → 同步时间文案
    └─► getLADisplayTime()     → 页头时钟

getLAISOWeekNumber(dateKey)  仅用 dateKey 的 YYYY/MM/DD 做纯日期计算（UTC 日序），
                            不涉及时区；用于比较 lastKey 与 todayKey 是否同一周。
```

- **lastDateLA**：上次执行 `resetIfNeeded()` 时写入的 LA “当天”的 `YYYY-MM-DD`，用于跨天/跨周判断。
- **logs[].time**：用 `getLAISODate()` 写入，格式为 LA 的日期时间字符串（注意不是标准 ISO 8601，无 `Z`），前端展示时再用 `timeZone: "America/Los_Angeles"` 格式化。

---

## 4. 部署在非 LA 服务器、用户为 LA 时区是否会出问题？

**不会。** 原因简要归纳：

1. **静态部署**：GitHub Pages / 任意服务器只提供 `index.html`、`css/main.css`、`js/main.js`，不做任何日期计算。
2. **执行环境在用户浏览器**：  
   `new Date()` 是用户设备当前时刻；  
   `Intl.DateTimeFormat(..., { timeZone: "America/Los_Angeles" }).formatToParts(new Date())` 在用户浏览器里把这一时刻转成 LA 的年/月/日等。  
   与服务器所在时区无关。
3. **Gist 里存的 `task-data.json`** 只有 `points/tasks/costs/logs`，没有“服务器时间”；  
   `lastDateLA` 存在用户本机 `localStorage`，也不在服务器。

因此：**只要用户在自己浏览器里打开页面，看到的“今天”和“是否跨天/跨周”都是以 LA 为准的，与部署在哪个时区的服务器无关。**

---

## 5. “隔天没有重置”的可能原因与对应改动

更可能的原因是：**`resetIfNeeded()` 只在页面加载时（init）执行一次**。  
若用户一直不关闭、不刷新页面，从 LA 的“昨天”一直开到“今天”，期间没有再次执行 `resetIfNeeded()`，就不会在 LA 跨天时自动重置每日任务。

**已在 `js/main.js` 中做的改动：**

- 在 `init()` 里增加 **每分钟执行一次 `resetIfNeeded()`**（`setInterval(resetIfNeeded, 60 * 1000)`）。  
这样即使用户不刷新页面，只要标签页开着，过了 LA 的 0 点后，最迟约 1 分钟内会检测到 `todayKey !== lastKey` 并执行每日（以及若跨周则每周）重置。

若仍出现“隔天没重置”，可再排查：

- **多设备/多浏览器**：`lastDateLA` 在各自设备的 `localStorage`，不会随 Gist 同步；若在 A 设备过夜、第二天在 B 设备打开，B 的 `lastDateLA` 可能是旧的，一般会在第一次 `resetIfNeeded()` 时纠正。
- **云同步覆盖**：若 `loadFromGist()` 在 `resetIfNeeded()` 之后又覆盖了 `data`（当前逻辑是先 load 再 reset，所以不会），或将来调整了初始化顺序，需要保证“先拉云数据，再按 LA 日期做重置，再写回 lastDateLA”。

把上述日期函数结构和 LA 逻辑整理成文档，便于以后排查和扩展。
