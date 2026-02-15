/* ---------- 数据 ---------- */
const GIST_ID = "216037f52ce40fd1b08deda7e22495a0";
let GITHUB_TOKEN = localStorage.getItem("gistToken");
if (!GITHUB_TOKEN) {
  GITHUB_TOKEN = prompt("Enter Github Gist Token:");
  if (GITHUB_TOKEN) {
    localStorage.setItem("gistToken", GITHUB_TOKEN);
  }
}
const GIST_FILE = "task-data.json";
let cloudEnabled = true;          // 是否启用云同步
let lastSyncTime = null;          // 最近一次同步时间（LA）
let saveTimer = null;             // debounce timer

let data = JSON.parse(localStorage.getItem("taskData")) || {
  points: 0,
  tasks: [],
  costs: [],
  logs: []
};

function save() {
  localStorage.setItem("taskData", JSON.stringify(data));
  render();              // 立刻更新 UI

  if (!cloudEnabled) return;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveToGist();
  }, 200); // 200ms debounce
}

/* ---------- 任务 ---------- */
function addTask() {
  if (!taskTitle.value.trim()) {
    alert("请输入任务标题");
    return;
  }

  const points = Number(taskPoints.value);
  if (!Number.isInteger(points) || points < 1 || points > 100) {
    alert("任务积分必须是 1-100 之间的整数");
    return;
  }

  data.tasks.push({
    id: Date.now(),
    type: document.querySelector('input[name="taskType"]:checked')?.value,
    title: taskTitle.value,
    points: points,
    completed: false,
    repeatable: taskRepeatable.checked
  });

  taskTitle.value = "";
  taskPoints.value = "1";
  taskRepeatable.checked = false;

  save();
}

function toggleTask(id) {
  let t = data.tasks.find(t => t.id === id);

  if (!t.repeatable && t.completed) return;

  t.completed = true;
  data.points += t.points;
  t.completedAt = getLAISODate();

  data.logs.push({
    type: "task",
    title: t.title,
    points: t.points,
    time: t.completedAt
  });
  save();
}

function deleteTask(id) {
  data.tasks = data.tasks.filter(t => t.id !== id);
  save();
}

function getTodayStats() {
  const today = getLATodayKey();
  let earned = 0;
  let spent = 0;

  data.logs.forEach(l => {
    if (l.time.slice(0, 10) === today) {
      if (l.type === "task") earned += l.points;
      else if (l.type === "cost") spent += l.points;
    }
  });

  return { earned, spent };
}

/* ---------- 消耗项 ---------- */
function addCost() {
  if (!costTitle.value.trim()) {
    alert("请输入消耗项标题");
    return;
  }

  const points = Number(costPoints.value);
  if (!Number.isInteger(points) || points < 1 || points > 1000) {
    alert("消耗积分必须是 1-1000 之间的整数");
    return;
  }

  data.costs.push({
    id: Date.now(),
    title: costTitle.value.trim(),
    points: points
  });

  costTitle.value = "";
  costPoints.value = "1";

  save();
}

function useCost(id) {
  let c = data.costs.find(c => c.id === id);
  if (data.points >= c.points) {
    data.points -= c.points;
    data.logs.push({
      type: "cost",
      title: c.title,
      points: c.points,
      time: getLAISODate()
    });
    save();
  } else {
    alert("积分不足");
  }
}

function deleteCost(id) {
  data.costs = data.costs.filter(c => c.id !== id);
  save();
}

/* ---------- 每日/周重置（LA 时区） ---------- */
function getLAString() {
  return new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

const LAST_DATE_PLACEHOLDER = "xxxx-xx-xx"; // 新浏览器/首次打开时 lastDateLA 的占位值

function resetIfNeeded() {
  console.log("检查每日/周重置... resetIfNeeded()");

  const todayKey = getLATodayKey();
  const lastKey = localStorage.getItem("lastDateLA") || LAST_DATE_PLACEHOLDER;
  console.log("todayKey:", todayKey);
  console.log("lastKey:", lastKey);

  // 新浏览器或首次打开：没有真实“上次日期”，只记下今天，不重置任务（保留从 Gist 同步的 completed 状态）
  if (lastKey === LAST_DATE_PLACEHOLDER) {
    localStorage.setItem("lastDateLA", todayKey);
    return;
  }

  if (todayKey !== lastKey) {
    // 重置每日
    data.tasks.forEach(t => {
      if (t.type === "daily") t.completed = false;
    });
    console.log("已重置每日任务");

    const prevWeek = getLAISOWeekNumber(lastKey);
    const nowWeek = getLAISOWeekNumber(todayKey);

    if (prevWeek !== nowWeek) {
      data.tasks.forEach(t => {
        if (t.type === "weekly") t.completed = false;
      });
      console.log("已重置每周任务");
    }

    localStorage.setItem("lastDateLA", todayKey);
    save();
  }
}

function getLAISOWeekNumber(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  let day = date.getUTCDay();
  if (day === 0) day = 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

function getLATodayKey() {
  return getLADateKeyForDate(new Date());
}

/** 返回任意 Date 在 LA 时区下的日期键 YYYY-MM-DD */
function getLADateKeyForDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;

  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

function getLAISODate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);

  const v = type => parts.find(p => p.type === type).value;

  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}`;
}

function getLADisplayTime() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles"
  });
}

function startClock() {
  function tick() {
    currentTime.innerText =
      `当前时间（LA）：${getLADisplayTime()}`;
  }
  tick(); // 立即显示一次
  setInterval(tick, 1000);
}

function manualResetDaily() {
  if (!confirm("确定要重置【所有每日任务】吗？")) return;

  data.tasks.forEach(t => {
    if (t.type === "daily") t.completed = false;
  });

  localStorage.setItem("lastDateLA", getLATodayKey());
  save();
}

function manualResetWeekly() {
  if (!confirm("确定要重置【所有每周任务】吗？")) return;

  data.tasks.forEach(t => {
    if (t.type === "weekly") t.completed = false;
  });

  save();
}

/* ---------- 渲染 ---------- */
function render() {
  totalPoints.innerText = data.points;

  storageHint.innerText = cloudEnabled
    ? "云同步启用中"
    : "本地存储版本启用中";

  taskList.innerHTML = "";
  data.tasks
    .sort((a, b) => {
      // 先按类型排 daily 在前
      if (a.type !== b.type) {
        return a.type === "daily" ? -1 : 1;
      }
      // 再按 title 字母序
      return a.title.localeCompare(b.title);
    })
    .forEach(t => {
      let div = document.createElement("div");
      div.className = t.completed && !t.repeatable ? "task-completed" : "";
      div.innerHTML = `
        <div class="card-row">
          <div>
            [${t.type}]
            ${t.repeatable ? "🔁" : ""}
            <b>${t.title}</b> (${t.points}分)
            ${t.completed ? "✅" : ""}
          </div>
          <div class="card-actions">
            <button onclick="toggleTask(${t.id})">完成</button>
            <button onclick="deleteTask(${t.id})">删除</button>
          </div>
        </div>
      `;
      taskList.appendChild(div);
    });

  costList.innerHTML = "";
  data.costs
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach(c => {
      let div = document.createElement("div");
      div.innerHTML = `
        <div class="card-row">
          <div>
            <b>${c.title}</b>（${c.points}分）
          </div>
          <div class="card-actions">
            <button onclick="useCost(${c.id})">使用</button>
            <button onclick="deleteCost(${c.id})">删除</button>
          </div>
        </div>
      `;
      costList.appendChild(div);
    });

  costLog.innerHTML = "";
  const todayKey = getLATodayKey();
  const minDateKey = getLADateKeyForDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)); // 最近三天（含今天）
  data.logs
    .filter(l => l.type === "cost" && l.time.slice(0, 10) >= minDateKey && l.time.slice(0, 10) <= todayKey)
    .forEach(l => {
      let li = document.createElement("li");
      const displayTime = new Date(l.time).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles"
      });
      li.innerText = `${displayTime} - ${l.title} (-${l.points})`;
      costLog.appendChild(li);
    });

  todayCompleted.innerHTML = "";
  const today = getLATodayKey();
  data.logs
    .forEach(l => {
      if (l.type === "task" && l.time.slice(0, 10) === today) {
        const li = document.createElement("li");
        li.innerText = `${l.title} (+${l.points})`;
        todayCompleted.appendChild(li);
      }
    });

  const stats = getTodayStats();
  todayStats.innerText =
    `今日获得：+${stats.earned} | 今日消耗：-${stats.spent}`;

  lastSync.innerText = lastSyncTime
    ? `最近同步时间（LA）：${lastSyncTime}`
    : "尚未同步";
}

function updateLastSync() {
  lastSyncTime = getLAString();
  localStorage.setItem("lastSyncTime", lastSyncTime);
  render();
}

/* ---------- Cloud Saving ---------- */
async function loadFromGist() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`
      }
    });

    if (!res.ok) throw new Error("Token invalid");

    const gist = await res.json();
    const content = gist.files[GIST_FILE].content;

    data = JSON.parse(content);
    localStorage.setItem("taskData", JSON.stringify(data));

    cloudEnabled = true;
    updateLastSync();

  } catch (e) {
    console.warn("云同步不可用，启用本地存储", e);
    cloudEnabled = false;
  }
}

async function saveToGist() {
  if (!cloudEnabled) return;
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          [GIST_FILE]: {
            content: JSON.stringify(data, null, 2)
          }
        }
      })
    });

    if (!res.ok) throw new Error("Sync failed");

    updateLastSync();

  } catch (e) {
    console.error("云同步失败，切换到本地模式", e);
    cloudEnabled = false;
    render();
  }
}

(async function init() {
  try {
    await loadFromGist();
  } catch (e) {
    console.warn("使用本地数据");
  }
  resetIfNeeded();
  lastSyncTime = localStorage.getItem("lastSyncTime");
  render();
  startClock();

  // 每分钟用 LA 的“今天”再检查一次，避免页面不刷新导致隔天未重置
  setInterval(resetIfNeeded, 60 * 1000);
})();
