const API = "";

function qs(sel) { return document.querySelector(sel); }
function esc(s) { return (s ?? "").toString(); }

function getToken() { return localStorage.getItem("token"); }
function setToken(t) { if (t) localStorage.setItem("token", t); else localStorage.removeItem("token"); }

async function apiFetch(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(opts.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(API + path, { ...opts, headers });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = data?.error || data?.message || (typeof data === "string" ? data : "Request failed");
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function setFlash(el, msg, ok = true) {
  if (!el) return;
  el.textContent = msg || "";
  el.className = "flash " + (msg ? (ok ? "ok" : "err") : "");
}

function renderAuthState() {
  const el = qs("#authState");
  if (!el) return;
  el.textContent = getToken() ? "Logged in" : "Logged out";
}

async function handleAuth() {
  const loginForm = qs("#loginForm");
  const signupForm = qs("#signupForm");
  const logoutBtn = qs("#logoutBtn");
  const flash = qs("#authFlash");

  renderAuthState();

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      setToken(null);
      renderAuthState();
      setFlash(flash, "Logged out.", true);
      // If on a protected page, go back to login.
      if (location.pathname !== "/login.html") location.href = "/login.html";
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setFlash(flash, "", true);
      const email = qs("#loginEmail").value;
      const password = qs("#loginPassword").value;
      try {
        const data = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setToken(data.token);
        renderAuthState();
        setFlash(flash, "Logged in.", true);
        if (location.pathname === "/login.html" || location.pathname === "/" || location.pathname === "/index.html") {
          location.href = "/chat.html";
        }
      } catch (err) {
        setFlash(flash, err.message, false);
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setFlash(flash, "", true);
      const email = qs("#signupEmail").value;
      const password = qs("#signupPassword").value;
      try {
        await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
        const data = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setToken(data.token);
        renderAuthState();
        setFlash(flash, "Account created & logged in.", true);
        if (location.pathname === "/login.html" || location.pathname === "/" || location.pathname === "/index.html") {
          location.href = "/chat.html";
        }
      } catch (err) {
        setFlash(flash, err.message, false);
      }
    });
  }
}

function addMessage(role, text, sources) {
  const box = qs("#messages");
  if (!box) return;
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  box.appendChild(div);
  if (sources && sources.length) {
    const s = document.createElement("div");
    s.className = "sources";
    s.textContent = "Sources: " + sources.join(", ");
    box.appendChild(s);
  }
  box.scrollTop = box.scrollHeight;
}

async function handleChat() {
  const form = qs("#chatForm");
  const input = qs("#chatInput");
  const sendBtn = qs("#sendBtn");
  const flash = qs("#chatFlash");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setFlash(flash, "", true);
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    addMessage("user", q);
    sendBtn.disabled = true;
    try {
      const data = await apiFetch("/api/ask", { method: "POST", body: JSON.stringify({ question: q }) });
      addMessage("assistant", data.answer, data.sources || []);
      const kpi = qs("#kpi");
      if (kpi) kpi.innerHTML = `<span class="pill">confidence: ${esc(data.confidence)}</span>`;
    } catch (err) {
      setFlash(flash, err.message, false);
    } finally {
      sendBtn.disabled = false;
    }
  });

  const histBtn = qs("#historyBtn");
  if (histBtn) {
    histBtn.addEventListener("click", async () => {
      setFlash(flash, "", true);
      try {
        const data = await apiFetch("/api/ask/history");
        const items = data.items || [];
        const box = qs("#history");
        if (box) {
          box.innerHTML = items.map(it => `<div class="muted"><div><b>Q:</b> ${esc(it.question)}</div><div><b>A:</b> ${esc(it.answer)}</div></div><hr style="border:0;border-top:1px solid var(--border);margin:10px 0">`).join("") || "<div class='muted'>No history yet.</div>";
        }
      } catch (err) {
        setFlash(flash, err.message, false);
      }
    });
  }
}

async function handleInject() {
  const form = qs("#injectForm");
  if (!form) return;
  const flash = qs("#injectFlash");
  const btn = qs("#injectBtn");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setFlash(flash, "", true);
    const files = qs("#files").files;
    if (!files || !files.length) {
      setFlash(flash, "Pick at least one .md file.", false);
      return;
    }
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    btn.disabled = true;
    try {
      const data = await apiFetch("/api/docs/upload", { method: "POST", body: fd });
      setFlash(flash, `Inserted=${data.inserted}, skipped=${data.skipped} (totalChunks=${data.totalChunks})`, true);
    } catch (err) {
      setFlash(flash, err.message, false);
    } finally {
      btn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await handleAuth();
  await handleChat();
  await handleInject();
});
