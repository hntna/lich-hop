/* Trợ lý Lịch họp — bản web đọc-only. Dữ liệu: snapshot.json.enc (AES-256-GCM, PBKDF2). */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const b642buf = (b64) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
};

async function deriveKey(pw, saltB64, iter) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b642buf(saltB64), iterations: iter, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

async function decryptEnv(env, pw) {
  const key = await deriveKey(pw, env.salt, env.iter);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b642buf(env.iv) }, key, b642buf(env.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ---------------- trạng thái ---------------- */
const state = {
  data: null, pw: null, week: "this", tab: "week",
  visible: new Set(), workdaysOnly: true, hideEmpty: true,
  findSel: new Set(), findResult: null,
};

const COLORS = ["#d71920", "#1a73c7", "#1c8a43", "#8e44ad", "#e67e22", "#16a085",
  "#d35400", "#2c3e91", "#c2185b", "#00838f", "#6d4c41", "#546e7a"];
function colorOf(username) {
  const p = (state.data.people || []).find((x) => x.username === username);
  return p && p.color ? p.color : COLORS[(username || "").length % COLORS.length];
}

/* ---------------- cửa + tải dữ liệu ---------------- */
async function tryUnlock(pw, remember) {
  $("#gateErr").textContent = "Đang tải…";
  try {
    const res = await fetch("data/snapshot.json.enc?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("không tải được dữ liệu (HTTP " + res.status + ")");
    const env = await res.json();
    state.data = await decryptEnv(env, pw);
    state.pw = pw;
    if (remember) sessionStorage.setItem("mpweb_pw", pw);
    (state.data.people || []).forEach((p) => state.visible.add(p.username));
    $("#gate").style.display = "none";
    $("#topbar").style.display = "flex";
    $("#tabs").style.display = "flex";
    renderAll();
  } catch (e) {
    $("#gateErr").textContent = "Sai mật khẩu hoặc dữ liệu lỗi — thử lại. (" + (e.message || e) + ")";
  }
}

$("#gateGo").addEventListener("click", () => tryUnlock($("#gatePw").value, $("#gateRemember").checked));
$("#gatePw").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#gateGo").click(); });
$("#reload").addEventListener("click", () => { sessionStorage.removeItem("mpweb_pw"); location.reload(); });

(function boot() {
  const saved = sessionStorage.getItem("mpweb_pw");
  if (saved) { $("#gatePw").value = saved; tryUnlock(saved, true); }
})();

/* ---------------- khung chung ---------------- */
$$("#tabs button").forEach((b) => b.addEventListener("click", () => {
  state.tab = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $("#viewWeek").style.display = state.tab === "week" ? "" : "none";
  $("#viewFind").style.display = state.tab === "find" ? "" : "none";
  renderAll();
}));
$("#wkThis").addEventListener("click", () => { state.week = "this"; renderAll(); });
$("#wkNext").addEventListener("click", () => { state.week = "next"; renderAll(); });
$("#fWorkdays").addEventListener("change", (e) => { state.workdaysOnly = e.target.checked; renderWeek(); });
$("#fHideEmpty").addEventListener("change", (e) => { state.hideEmpty = e.target.checked; renderWeek(); });

function renderAll() {
  const miss = state.data.missing || [];
  $("#missBox").innerHTML = miss.length
    ? `<div class="notice">⚠ Lịch chưa lấy được cho: ${esc(miss.join(", "))} — trong app nội bộ, tra cứu xong những người này rồi bấm <b>Lên GitHub</b> để đẩy lại.</div>`
    : "";
  const wk = state.data.weeks[state.week] || state.data.weeks.this;
  $("#weekLabel").textContent = wk.label;
  $("#wkThis").classList.toggle("on", state.week === "this");
  $("#wkNext").classList.toggle("on", state.week === "next");
  $("#updatedAt").textContent = "Cập nhật " + (state.data.generated_at || "");
  if (state.tab === "week") { renderWeekChips(); renderWeek(); }
  else { renderFindChips(); renderFind(); }
}

/* ---------------- Lịch tuần ---------------- */
function renderWeekChips() {
  const box = $("#weekChips");
  box.innerHTML = "";
  (state.data.people || []).forEach((p) => {
    const c = document.createElement("span");
    c.className = "chip" + (state.visible.has(p.username) ? "" : " off");
    c.innerHTML = `<span class="dot" style="background:${colorOf(p.username)}"></span>${esc(p.name)} <span style="color:var(--muted)">@${esc(p.username)}</span>`;
    c.addEventListener("click", () => {
      state.visible.has(p.username) ? state.visible.delete(p.username) : state.visible.add(p.username);
      renderAll();
    });
    box.appendChild(c);
  });
  const mini = document.createElement("span");
  mini.className = "mini";
  mini.innerHTML = `<button id="allOn">👁 Chọn hết</button><button id="allOff">Bỏ hết</button>`;
  box.appendChild(mini);
  $("#allOn").addEventListener("click", () => { (state.data.people || []).forEach((p) => state.visible.add(p.username)); renderAll(); });
  $("#allOff").addEventListener("click", () => { state.visible.clear(); renderAll(); });
}

function dayCols() {
  const wk = state.data.weeks[state.week];
  const dows = wk.dates.map((d) => new Date(d + "T00:00:00").getDay()); // 0=CN
  const idx = state.workdaysOnly ? wk.dates.map((d, i) => [d, dows[i]]).filter(([, w]) => w >= 1 && w <= 5).map(([d]) => d) : wk.dates;
  return idx;
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function fmtDay(d) {
  const dt = new Date(d + "T00:00:00");
  return `${WD[dt.getDay()]} · ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

function renderWeek() {
  const grid = $("#weekGrid");
  const days = dayCols();
  const people = (state.data.people || []).filter((p) => state.visible.has(p.username));
  if (!people.length) { grid.innerHTML = `<div class="empty">Không có ai đang hiển thị — bấm tên ở trên để chọn.</div>`; return; }

  const schedules = state.data.schedules || {};
  const shown = people.map((p) => ({
    p, meetings: (schedules[p.username] || {})[state.week] || [],
  }));
  if (state.hideEmpty) {
    const filtered = shown.map((x) => ({ ...x, meetings: x.meetings.filter((m) => days.includes(m.date)) }));
    if (!filtered.some((x) => x.meetings.length)) {
      grid.innerHTML = `<div class="empty">Không ai có lịch họp trong khoảng đang xem.</div>`;
      return;
    }
  }

  // dải giờ hiển thị
  let lo = 7 * 60, hi = 20 * 60;
  shown.forEach((x) => x.meetings.forEach((m) => {
    if (days.includes(m.date)) { lo = Math.min(lo, m.start_min); hi = Math.max(hi, m.end_min); }
  }));
  lo = Math.max(0, Math.floor(lo / 60) * 60);
  hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
  const span = hi - lo;

  let html = `<div class="grid-wrap"><div class="grid" style="grid-template-columns:170px repeat(${days.length}, minmax(140px, 1fr))">`;
  html += `<div class="g-head"><b>Thành phần</b></div>`;
  days.forEach((d) => { html += `<div class="g-head"><b>${fmtDay(d)}</b></div>`; });

  shown.forEach(({ p, meetings }) => {
    html += `<div class="g-person"><div class="nm"><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colorOf(p.username)};margin-right:5px"></span>${esc(p.name)}</div><div class="un">@${esc(p.username)} · ${esc((p.title || "").slice(0, 40))}</div></div>`;
    days.forEach((d) => {
      const ms = meetings.filter((m) => m.date === d).sort((a, b) => a.start_min - b.start_min);
      html += `<div class="g-day">`;
      for (let h = lo; h <= hi; h += 120) {
        const top = ((h - lo) / span) * 100;
        html += `<span class="hour" style="top:${top}%">${String(Math.floor(h / 60)).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}</span>`;
      }
      // chồng lấn: tách cột
      const groups = [];
      ms.forEach((m) => {
        const g = groups.find((g) => m.start_min < g.end && m.end_min > g.start);
        if (g) { g.items.push(m); g.start = Math.min(g.start, m.start_min); g.end = Math.max(g.end, m.end_min); }
        else groups.push({ start: m.start_min, end: m.end_min, items: [m] });
      });
      groups.forEach((g) => {
        const n = g.items.length;
        g.items.forEach((m, i) => {
          const top = ((m.start_min - lo) / span) * 100;
          const h = Math.max(4, ((m.end_min - m.start_min) / span) * 100);
          html += `<div class="evt ${m.pending ? "pending" : ""}" data-uid="${esc(p.username)}" data-mi="${ms.indexOf(m)}"
            style="top:${top}%;height:${h}%;background:${colorOf(p.username)};left:${2 + (i * 96) / n}%;right:${2 + ((n - 1 - i) * 96) / n}%">
            <b>${m.start}–${m.end}</b>${esc((m.title || "").slice(0, 60))}</div>`;
        });
      });
      html += `</div>`;
    });
  });
  html += `</div></div>`;
  grid.innerHTML = html;
  $$("#weekGrid .evt").forEach((el) => el.addEventListener("click", () => {
    const uid = el.dataset.uid, mi = +el.dataset.mi;
    const ms = [...(((schedules[uid] || {})[state.week]) || [])].sort((a, b) => a.start_min - b.start_min);
    if (ms[mi]) openModal(ms[mi]);
  }));
}

/* ---------------- modal chi tiết ---------------- */
function openModal(m) {
  const codes = state.data.room_codes || {};
  const vc = (m.vc_rooms || []).map((r) => `${r}${codes[r] ? ` <code>${esc(codes[r])}</code>` : ""}`).join(", ");
  $("#modalBox").innerHTML = `
    <button class="close" id="mClose">✕</button>
    <h3>${esc(m.title)}</h3>
    <div class="kv"><b>Thời gian</b> ${fmtDay(m.date)} · ${m.start}–${m.end}</div>
    <div class="kv"><b>Trạng thái</b> <span class="badge ${m.pending ? "pend" : ""}">${esc(m.status)}</span></div>
    <div class="kv"><b>Chủ trì</b> ${esc(m.chair || "—")}</div>
    <div class="kv"><b>Địa điểm</b> ${esc(m.location || "—")}</div>
    <div class="kv"><b>CTV chuẩn bị</b> ${esc(m.preparers || "—")}</div>
    <div class="kv"><b>Cầu TH</b> ${vc ? `<span class="badge">📺 ${vc}</span>` : `<span class="badge nvc">Không có CTH</span>`}</div>
    <div class="kv"><b>Thành phần</b> ${esc(m.participants || "—")}</div>
    <div class="kv"><b>Người liên hệ</b> ${esc(m.contact || "—")}</div>`;
  $("#modal").style.display = "flex";
  $("#mClose").addEventListener("click", () => $("#modal").style.display = "none");
}
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").style.display = "none"; });

/* ---------------- Tìm khung giờ ---------------- */
function renderFindChips() {
  const box = $("#findChips");
  box.innerHTML = "";
  (state.data.people || []).forEach((p) => {
    const c = document.createElement("label");
    c.className = "chip" + (state.findSel.has(p.username) ? "" : " off");
    c.innerHTML = `<input type="checkbox" ${state.findSel.has(p.username) ? "checked" : ""}>
      <span class="dot" style="background:${colorOf(p.username)}"></span>${esc(p.name)} <span style="color:var(--muted)">@${esc(p.username)}</span>`;
    c.querySelector("input").addEventListener("change", (e) => {
      e.target.checked ? state.findSel.add(p.username) : state.findSel.delete(p.username);
      c.classList.toggle("off", !e.target.checked);
    });
    box.appendChild(c);
  });
  const mini = document.createElement("span");
  mini.className = "mini";
  mini.innerHTML = `<button id="fAll">Chọn hết</button><button id="fNone">Bỏ hết</button>`;
  box.appendChild(mini);
  $("#fAll").addEventListener("click", () => { (state.data.people || []).forEach((p) => state.findSel.add(p.username)); renderFindChips(); });
  $("#fNone").addEventListener("click", () => { state.findSel.clear(); renderFindChips(); });
  const cfg = state.data.config || {};
  if (!$("#fRoom").value && cfg.room_filter) $("#fRoom").value = cfg.room_filter;
  if ($("#fMin").value === "60" && cfg.min_minutes) $("#fMin").value = cfg.min_minutes;
}

const toMin = (hm) => { const [h, m] = (hm || "0:0").split(":").map(Number); return h * 60 + m; };
function subtract(free, busy) {
  let out = free;
  for (const [bs, be] of busy) {
    const next = [];
    for (const [s, e] of out) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, bs]);   // phần trước cuộc họp bận
      if (be < e) next.push([be, e]);   // phần sau (bug cũ: dùng max(bs,s) → cắt sai)
    }
    out = next;
  }
  return out.filter(([s, e]) => e - s > 0);
}

function renderFind() {
  const out = $("#findOut");
  if (!state.findResult) return;
  const res = state.findResult;
  let html = res.note ? `<div class="notice">${esc(res.note)}</div>` : "";
  if (!res.days || !res.days.length) {
    out.innerHTML = html + `<div class="empty">Không tìm thấy khung giờ nào phù hợp.</div>`;
    return;
  }
  res.days.forEach((d) => {
    html += `<div class="day-block"><h3>${fmtDay(d.date)}</h3>`;
    d.slots.forEach((s) => {
      html += `<div class="slot"><span class="t">${s.start} – ${s.end}</span><span class="t" style="color:var(--muted);font-weight:400">${Math.round((s.end_min - s.start_min) / 6) / 10}g</span><span class="rooms">`;
      s.rooms.forEach((r) => { html += `<span class="room ${r.vc ? "vc" : ""}">${r.vc ? "📺" : "🚪"} ${esc(r.name)}${r.code ? ` <code>${esc(r.code)}</code>` : ""}</span>`; });
      html += `</span></div>`;
    });
    html += `</div>`;
  });
  out.innerHTML = html;
}

$("#findBtn").addEventListener("click", () => {
  const cfg = state.data.config || {};
  const min = Math.max(15, +$("#fMin").value || 60);
  const vcOnly = $("#fVc").checked, chairOnly = $("#fChair").checked;
  const rf = ($("#fRoom").value || "").trim().toLowerCase();
  const sel = Array.from(state.findSel);
  if (!sel.length) { $("#findOut").innerHTML = `<div class="notice">Chưa chọn thành phần nào.</div>`; state.findResult = { note: "" }; return; }

  const wk = state.data.weeks[state.week];
  const windows = (cfg.work_windows || [["08:00", "12:00"], ["13:30", "17:30"]]).map(([a, b]) => [toMin(a), toMin(b)]);
  const searchDows = new Set(cfg.search_days || [1, 2, 3, 4, 5]);
  const todayIso = new Date().toLocaleDateString("sv"); // YYYY-MM-DD theo giờ máy
  const days = wk.dates.filter((d) => searchDows.has(new Date(d + "T00:00:00").getDay()) && d >= todayIso);

  const schedules = state.data.schedules || {};
  const people = (state.data.people || []).filter((p) => sel.includes(p.username));
  let roomsAll = Object.entries((state.data.rooms || {})[state.week] || {});
  if (rf) roomsAll = roomsAll.filter(([name]) => name.toLowerCase().includes(rf));
  if (vcOnly) {
    const vcSet = new Set(state.data.vc_rooms || []);
    roomsAll = roomsAll.filter(([name]) => vcSet.has(name));
  }

  // phòng bị cuộc họp ĐÃ DUYỆT chiếm (rà chéo — dữ liệu phòng trống bot có thể cũ)
  const roomBusy = {};
  Object.values(schedules).forEach((wks) => {
    (wks[state.week] || []).forEach((m) => {
      if (!m.approved || !m.location) return;
      const rm = (state.data.rooms || {})[state.week] || {};
      const hit = Object.keys(rm).find((n) => m.location.includes(n) || n.includes(m.location));
      if (hit) (roomBusy[m.date] = roomBusy[m.date] || {})[hit] = (roomBusy[m.date][hit] || []).concat([[m.start_min, m.end_min]]);
    });
  });

  const outDays = [];
  for (const date of days) {
    // bận của từng người — CHỈ cuộc họp ĐÃ DUYỆT chặn (khớp app; pending không chặn)
    let free = windows.slice();
    for (const p of people) {
      const ms = ((schedules[p.username] || {})[state.week]) || [];
      const busy = ms.filter((m) => m.date === date && m.approved && (!chairOnly || (m.chair || "") === p.name))
        .map((m) => [m.start_min, m.end_min]);
      free = subtract(free, busy);
      if (!free.length) break;
    }
    if (!free.length) continue;
    // giao với phòng trống (đã trừ khung cuộc họp đã duyệt chiếm phòng đó)
    const slots = [];
    for (const [name, perDate] of roomsAll) {
      let ivs = perDate[date] || [];
      const rb = (roomBusy[date] || {})[name];
      if (rb && rb.length) ivs = subtract(ivs, rb);
      for (const [rs, re] of ivs) {
        for (const [fs, fe] of free) {
          const s = Math.max(rs, fs), e = Math.min(re, fe);
          if (e - s >= min) slots.push({ s, e, name, vc: (state.data.vc_rooms || []).includes(name) });
        }
      }
    }
    // gộp các khung giao nhau thành khung LỚN NHẤT (khớp app): chỉ giữ interval
    // tối đại; phòng liệt kê = phòng trống TRỌN khung đó
    const merged = [];
    slots.sort((a, b) => a.s - b.s || a.e - b.e);
    for (const x of slots) {
      const last = merged[merged.length - 1];
      if (last && x.s <= last.e) last.e = Math.max(last.e, x.e);
      else merged.push({ s: x.s, e: x.e });
    }
    const daySlots = merged
      .map((iv) => {
        const seen = new Set();
        const rooms = [];
        slots.forEach((x) => {
          if (x.s <= iv.s && x.e >= iv.e && !seen.has(x.name)) {
            seen.add(x.name);
            rooms.push({ name: x.name, vc: x.vc });
          }
        });
        rooms.sort((a, b) => (b.vc - a.vc) || a.name.localeCompare(b.name));
        return {
          start: `${String(Math.floor(iv.s / 60)).padStart(2, "0")}:${String(iv.s % 60).padStart(2, "0")}`,
          end: `${String(Math.floor(iv.e / 60)).padStart(2, "0")}:${String(iv.e % 60).padStart(2, "0")}`,
          start_min: iv.s, end_min: iv.e, rooms,
        };
      })
      .filter((x) => x.rooms.length);   // bỏ khung không phòng nào trọn khung
    if (daySlots.length) outDays.push({ date, slots: daySlots });
  }
  state.findResult = { days: outDays };
  if ((state.data.rooms_error || []).includes(state.week)) {
    state.findResult.note = "⚠ Chưa có dữ liệu phòng trống cho tuần đang xem — trong app nội bộ bấm Lên GitHub sau khi app đã tải xong phòng để cập nhật.";
  }
  renderFind();
});
