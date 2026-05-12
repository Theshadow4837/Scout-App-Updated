import { useState, useEffect, useRef } from "react";

// ─── Local REST API (json-server at localhost:3001, user: Programming) ────────
const API = "http://localhost:3001";
const USERNAME = "Programming";

async function apiReq(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Build query string from a filters object
function qs(filters) {
  const p = new URLSearchParams(filters).toString();
  return p ? `?${p}` : "";
}

async function fbSelect(col, filters = {}) {
  return apiReq("GET", `/${col}${qs(filters)}`);
}
async function fbInsert(col, row) {
  // Check if record already exists; if so PATCH, otherwise POST
  if (row.id) {
    try {
      await apiReq("GET", `/${col}/${row.id}`);
      await apiReq("PATCH", `/${col}/${row.id}`, row);
      return row;
    } catch {
      const created = await apiReq("POST", `/${col}`, row);
      return created;
    }
  }
  return apiReq("POST", `/${col}`, row);
}
async function fbUpdate(col, filters, patch) {
  const rows = await fbSelect(col, filters);
  await Promise.all(rows.map(r => apiReq("PATCH", `/${col}/${r.id}`, patch)));
  return rows[0] ? { ...rows[0], ...patch } : null;
}
async function fbDelete(col, filters) {
  const rows = await fbSelect(col, filters);
  await Promise.all(rows.map(r => apiReq("DELETE", `/${col}/${r.id}`)));
}
async function fbDeleteById(col, id) {
  await apiReq("DELETE", `/${col}/${id}`);
}

// ─── IndexedDB ───────────────────────────────────────────────────────────────
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("frc_scout", 3);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      ["users","teams","memberships","forms","submissions","session","messages","announcements"].forEach(s => {
        if (!db.objectStoreNames.contains(s))
          db.createObjectStore(s, { keyPath: s === "session" ? "key" : "id" });
      });
      if (!db.objectStoreNames.contains("pending"))
        db.createObjectStore("pending", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
async function idbGet(store, key) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = rej; });
}
async function idbPut(store, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(val); tx.oncomplete = res; tx.onerror = rej; });
}
async function idbAll(store) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = rej; });
}
async function idbDel(store, key) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).delete(key); tx.oncomplete = res; tx.onerror = rej; });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid    = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const hash   = pw => { let h = 0; for (const c of pw) { h = ((h << 5) - h) + c.charCodeAt(0); h |= 0; } return h.toString(16); };
const genPwd = () => { const c = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join(""); };
const tsNow  = () => new Date().toISOString();
const fmtTs  = ts => { const d = new Date(ts); const now = new Date(); const diff = now - d; if (diff < 60000) return "just now"; if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`; return d.toLocaleDateString(); };

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = { bg0:"#07090f", bg1:"#0c1120", bg2:"#111827", border:"#1e2d45", accent:"#38bdf8", orange:"#fb923c", green:"#4ade80", red:"#f87171", muted:"#64748b", text:"#e2e8f0", dim:"#94a3b8", purple:"#a78bfa" };
const MO = "'Roboto Mono',monospace";
const sx = {
  page:  { fontFamily:MO, background:C.bg0, color:C.text, minHeight:"100vh", display:"flex", flexDirection:"column" },
  hdr:   { background:C.bg1, borderBottom:`1px solid ${C.border}`, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:54, flexShrink:0 },
  logo:  { display:"flex", alignItems:"center", gap:10, fontWeight:700, fontSize:17, color:C.accent, letterSpacing:3 },
  main:  { flex:1, overflowY:"auto", padding:24 },
  card:  { background:C.bg1, border:`1px solid ${C.border}`, borderRadius:10, padding:24, marginBottom:16 },
  ct:    { fontSize:11, fontWeight:700, color:C.accent, letterSpacing:3, textTransform:"uppercase", marginBottom:16 },
  inp:   { background:C.bg0, border:`1px solid ${C.border}`, color:C.text, padding:"10px 14px", borderRadius:6, width:"100%", fontFamily:MO, fontSize:13, boxSizing:"border-box", outline:"none", marginBottom:10 },
  btn:   (c = C.accent) => ({ background:"transparent", border:`1px solid ${c}`, color:c, padding:"10px 20px", borderRadius:6, cursor:"pointer", fontFamily:MO, fontSize:12, letterSpacing:1, width:"100%" }),
  sm:    (c = C.accent) => ({ background:"transparent", border:`1px solid ${c}`, color:c, padding:"5px 12px", borderRadius:4, cursor:"pointer", fontFamily:MO, fontSize:11, letterSpacing:1 }),
  lbl:   { fontSize:11, color:C.muted, letterSpacing:2, textTransform:"uppercase", marginBottom:4, display:"block" },
  err:   { color:C.red, fontSize:12, marginBottom:8 },
  ok:    { color:C.green, fontSize:12, marginBottom:8 },
  tag:   (c) => ({ background:c+"22", border:`1px solid ${c}44`, color:c, padding:"2px 8px", borderRadius:4, fontSize:10, letterSpacing:1, display:"inline-block" }),
  nb:    (on) => ({ background:on?C.bg2:"transparent", border:on?`1px solid ${C.accent}`:"1px solid transparent", color:on?C.accent:C.muted, padding:"6px 14px", borderRadius:6, cursor:"pointer", fontFamily:MO, fontSize:11, letterSpacing:1 }),
  hr:    { borderTop:`1px solid ${C.border}`, margin:"14px 0" },
  sc:    { background:C.bg0, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", textAlign:"center" },
  ob:    (c) => ({ background:c+"18", borderBottom:`1px solid ${c}`, color:c, padding:"5px 20px", fontSize:11, letterSpacing:2, textAlign:"center", textTransform:"uppercase" }),
};
const RC = { owner:C.orange, admin:C.accent, member:C.muted };

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user,    setUser]    = useState(null);
  const [team,    setTeam]    = useState(null);
  const [mem,     setMem]     = useState(null);
  const [tab,     setTab]     = useState("home");
  const [online,  setOnline]  = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const up = () => { setOnline(true); syncPending(); };
    const dn = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);

  useEffect(() => {
    (async () => {
      const sess = await idbGet("session", "current");
      if (sess?.user) {
        setUser(sess.user);
        if (sess.team && sess.mem) {
          // Re-fetch fresh membership from DB to get updated role
          try {
            const freshMem = await fbSelect("memberships", { team_id: sess.team.id, user_id: sess.user.id });
            if (freshMem.length) { setTeam(sess.team); setMem(freshMem[0]); }
            else { setTeam(sess.team); setMem(sess.mem); }
          } catch { setTeam(sess.team); setMem(sess.mem); }
        }
      }
      setBooting(false);
      checkPending();
    })();
  }, []);

  async function saveSession(u, t, m) { await idbPut("session", { key:"current", user:u, team:t||null, mem:m||null }); }
  async function checkPending() { const r = await idbAll("pending"); setPending(r.length); }
  async function syncPending() {
    const rows = await idbAll("pending");
    for (const row of rows) {
      try { await fbInsert("submissions", row.data); await idbDel("pending", row.id); } catch (_) {}
    }
    checkPending();
  }

  async function login(u)       { setUser(u); await saveSession(u, null, null); }
  async function joinTeam(t, m) { setTeam(t); setMem(m); setTab("home"); await saveSession(user, t, m); }
  async function logout()       { await saveSession(null, null, null); setUser(null); setTeam(null); setMem(null); setTab("home"); }

  // Called when role changes (e.g. promoted to admin/owner) to refresh mem in state + session
  async function refreshMem() {
    if (!user || !team) return;
    try {
      const rows = await fbSelect("memberships", { team_id: team.id, user_id: user.id });
      if (rows.length) { const m = rows[0]; setMem(m); await saveSession(user, team, m); }
    } catch {}
  }

  async function handleDeleteAccount() {
    if (!confirm("Delete your account? This cannot be undone.")) return;
    try {
      await fbDelete("memberships", { user_id: user.id });
      await fbDeleteById("users", user.id);
      await idbDel("users", user.id);
      logout();
    } catch { alert("Error deleting account."); }
  }

  async function handleDeleteTeam() {
    if (!confirm(`Delete team #${team?.number}? This will remove all members, forms, and submissions. Cannot be undone.`)) return;
    try {
      const forms = await fbSelect("forms", { team_id: team.id });
      for (const f of forms) {
        await fbDelete("submissions", { form_id: f.id });
        await fbDeleteById("forms", f.id);
      }
      await fbDelete("memberships", { team_id: team.id });
      await fbDelete("messages", { team_id: team.id });
      await fbDelete("announcements", { team_id: team.id });
      await fbDeleteById("teams", team.id);
      logout();
    } catch { alert("Error deleting team."); }
  }

  if (booting) return (
    <div style={{ ...sx.page, alignItems:"center", justifyContent:"center" }}>
      <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet"/>
      <div style={{ color:C.accent, letterSpacing:4, fontSize:13 }}>LOADING…</div>
    </div>
  );

  const role = mem?.role || "member";
  return (
    <div style={sx.page}>
      <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet"/>
      {!online && <div style={sx.ob(C.orange)}>⚠ OFFLINE — {pending} submission{pending !== 1 ? "s" : ""} queued</div>}
      {online && pending > 0 && <div style={sx.ob(C.green)}>↑ SYNCING {pending} QUEUED SUBMISSION{pending !== 1 ? "S" : ""}</div>}
      {user && team && <Header user={user} team={team} role={role} tab={tab} setTab={setTab} onLogout={logout}/>}
      <main style={sx.main}>
        {!user                          && <AuthScreen onLogin={login} online={online}/>}
        {user && !team                  && <TeamScreen user={user} onJoin={joinTeam} onLogout={logout} online={online}/>}
        {user && team && tab === "home"        && <HomeTab team={team} user={user} role={role} onDeleteAccount={handleDeleteAccount} onDeleteTeam={handleDeleteTeam}/>}
        {user && team && tab === "forms"       && <FormsTab team={team} user={user} role={role} online={online} onPending={checkPending}/>}
        {user && team && tab === "data"   && (role === "owner" || role === "admin") && <DataTab team={team} user={user} role={role}/>}
        {user && team && tab === "chat"        && <ChatTab team={team} user={user} role={role}/>}
        {user && team && tab === "announce"    && <AnnouncementsTab team={team} user={user} role={role}/>}
        {user && team && tab === "manage" && role === "owner" && <ManageTab team={team} user={user} onTeamUpdate={t => { setTeam(t); saveSession(user, t, mem); }} onRoleChange={refreshMem}/>}
      </main>
    </div>
  );
}

function Header({ user, team, role, tab, setTab, onLogout }) {
  const tabs = [
    { id:"home",     l:"HOME" },
    { id:"forms",    l:"FORMS" },
    { id:"chat",     l:"CHAT" },
    { id:"announce", l:"ANNOUNCE" },
    ...(role === "owner" || role === "admin" ? [{ id:"data",   l:"DATA" }]   : []),
    ...(role === "owner"                     ? [{ id:"manage", l:"MANAGE" }] : []),
  ];
  return (
    <header style={sx.hdr}>
      <div style={sx.logo}><span style={{ color:C.orange }}>⚡</span>FRC·SCOUT<span style={{ color:C.muted, fontSize:13, fontWeight:400 }}>#{team.number}</span></div>
      <nav style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{tabs.map(t => <button key={t.id} style={sx.nb(tab === t.id)} onClick={() => setTab(t.id)}>{t.l}</button>)}</nav>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={sx.tag(RC[role] || C.muted)}>{role.toUpperCase()}</span>
        <span style={{ fontSize:12, color:C.dim }}>{user.username}</span>
        <button style={sx.sm(C.red)} onClick={onLogout}>EXIT</button>
      </div>
    </header>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin, online }) {
  const [mode,     setMode]     = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err,      setErr]      = useState("");
  const [busy,     setBusy]     = useState(false);

  async function submit() {
    if (!username.trim() || !password.trim()) { setErr("All fields required."); return; }
    setBusy(true); setErr("");
    const ph = hash(password);
    try {
      if (mode === "signup") {
        const existing = await fbSelect("users", { username: username.trim() });
        if (existing.length) { setErr("Username already taken."); setBusy(false); return; }
        const nu = { id:uid(), username:username.trim(), password_hash:ph, created_at:tsNow() };
        const saved = await fbInsert("users", nu);
        await idbPut("users", saved);
        onLogin(saved);
      } else {
        let user;
        if (online) {
          const rows = await fbSelect("users", { username: username.trim() });
          if (!rows.length || rows[0].password_hash !== ph) { setErr("Invalid username or password."); setBusy(false); return; }
          user = rows[0]; await idbPut("users", user);
        } else {
          const all = await idbAll("users");
          user = all.find(u => u.username === username.trim() && u.password_hash === ph);
          if (!user) { setErr("Offline: no cached credentials found."); setBusy(false); return; }
        }
        onLogin(user);
      }
    } catch { setErr(online ? "Server error — check that json-server is running on port 3001." : "Offline and no cache found."); }
    setBusy(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, minHeight:"80vh" }}>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:42, marginBottom:6 }}>🤖</div>
        <div style={{ fontSize:26, fontWeight:700, color:C.accent, letterSpacing:5 }}>FRC<span style={{ color:C.orange }}>·</span>SCOUT</div>
        <div style={{ fontSize:11, color:C.muted, letterSpacing:3, marginTop:4 }}>FIELD SCOUTING PLATFORM</div>
      </div>
      <div style={{ ...sx.card, maxWidth:370, width:"100%" }}>
        <div style={{ display:"flex", gap:8, marginBottom:18 }}>
          {["login","signup"].map(m => <button key={m} style={{ ...sx.nb(mode === m), flex:1 }} onClick={() => { setMode(m); setErr(""); }}>{m === "login" ? "LOGIN" : "SIGN UP"}</button>)}
        </div>
        <label style={sx.lbl}>Username</label>
        <input style={sx.inp} value={username} onChange={e => setUsername(e.target.value)} placeholder="scouter42" onKeyDown={e => e.key === "Enter" && submit()}/>
        <label style={sx.lbl}>Password</label>
        <input style={sx.inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()}/>
        {err && <div style={sx.err}>{err}</div>}
        <button style={sx.btn(C.accent)} onClick={submit} disabled={busy}>{busy ? "…" : mode === "login" ? "LOGIN →" : "CREATE ACCOUNT →"}</button>
      </div>
    </div>
  );
}

// ─── Team Screen ──────────────────────────────────────────────────────────────
function TeamScreen({ user, onJoin, onLogout, online }) {
  const [mode,    setMode]    = useState(null);
  const [tNum,    setTNum]    = useState(""); const [tName, setTName] = useState("");
  const [jNum,    setJNum]    = useState(""); const [jPwd,  setJPwd]  = useState("");
  const [err,     setErr]     = useState(""); const [busy,  setBusy]  = useState(false);
  const [created, setCreated] = useState(null);

  async function createTeam() {
    if (!tNum.trim() || !tName.trim()) { setErr("Number and name required."); return; }
    setBusy(true); setErr("");
    try {
      const existing = await fbSelect("teams", { number: tNum.trim() });
      if (existing.length) { setErr("That team number already exists."); setBusy(false); return; }
      const pwd  = genPwd();
      const t    = { id:uid(), number:tNum.trim(), name:tName.trim(), password:pwd, owner_id:user.id, created_at:tsNow() };
      const saved  = await fbInsert("teams", t);
      const m    = { id:uid(), team_id:saved.id, user_id:user.id, username:user.username, role:"owner" };
      const savedM = await fbInsert("memberships", m);
      await idbPut("teams", saved); await idbPut("memberships", savedM);
      setCreated({ team:saved, mem:savedM });
    } catch { setErr("Error creating team — check connection."); }
    setBusy(false);
  }

  async function joinTeam() {
    if (!jNum.trim() || !jPwd.trim()) { setErr("Number and password required."); return; }
    setBusy(true); setErr("");
    try {
      const rows = await fbSelect("teams", { number: jNum.trim() });
      if (!rows.length) { setErr("Team not found."); setBusy(false); return; }
      const t = rows[0];
      if (t.password !== jPwd.trim().toUpperCase()) { setErr("Wrong password."); setBusy(false); return; }
      const existing = await fbSelect("memberships", { team_id:t.id, user_id:user.id });
      let m;
      if (existing.length) { m = existing[0]; }
      else { m = await fbInsert("memberships", { id:uid(), team_id:t.id, user_id:user.id, username:user.username, role:"member" }); }
      await idbPut("teams", t); await idbPut("memberships", m);
      onJoin(t, m);
    } catch { setErr("Error joining team."); }
    setBusy(false);
  }

  if (created) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, minHeight:"80vh" }}>
      <div style={{ ...sx.card, maxWidth:400, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
        <div style={{ ...sx.ct, textAlign:"center" }}>Team Created!</div>
        <div style={{ fontSize:14, marginBottom:8 }}>Team #{created.team.number} — {created.team.name}</div>
        <div style={{ background:C.bg0, border:`1px solid ${C.green}`, borderRadius:8, padding:20, margin:"16px 0" }}>
          <div style={{ fontSize:11, color:C.muted, letterSpacing:2, marginBottom:6 }}>JOIN PASSWORD</div>
          <div style={{ fontSize:30, fontWeight:700, color:C.green, letterSpacing:6 }}>{created.team.password}</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Share this with your scouters</div>
        </div>
        <button style={sx.btn(C.green)} onClick={() => onJoin(created.team, created.mem)}>ENTER TEAM HQ →</button>
      </div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, minHeight:"80vh" }}>
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:26, fontWeight:700, color:C.accent, letterSpacing:5 }}>FRC<span style={{ color:C.orange }}>·</span>SCOUT</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Logged in as <span style={{ color:C.accent }}>{user.username}</span></div>
      </div>
      <div style={{ ...sx.card, maxWidth:420, width:"100%" }}>
        <div style={sx.ct}>Join or Create a Team</div>
        {!mode && <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <button style={sx.btn(C.accent)}  onClick={() => setMode("create")}>➕ CREATE NEW TEAM</button>
          <button style={sx.btn(C.orange)}  onClick={() => setMode("join")}>🔗 JOIN EXISTING TEAM</button>
          <div style={sx.hr}/>
          <button style={sx.btn(C.red)}     onClick={onLogout}>LOGOUT</button>
        </div>}
        {mode === "create" && <>
          <button style={{ ...sx.sm(), marginBottom:14 }} onClick={() => { setMode(null); setErr(""); }}>← BACK</button>
          <label style={sx.lbl}>Team Number</label>
          <input style={sx.inp} placeholder="e.g. 4027" value={tNum} onChange={e => setTNum(e.target.value)}/>
          <label style={sx.lbl}>Team Name</label>
          <input style={sx.inp} placeholder="e.g. Tidal Force" value={tName} onChange={e => setTName(e.target.value)}/>
          {err && <div style={sx.err}>{err}</div>}
          <button style={sx.btn(C.green)} onClick={createTeam} disabled={busy}>{busy ? "CREATING…" : "CREATE TEAM →"}</button>
        </>}
        {mode === "join" && <>
          <button style={{ ...sx.sm(), marginBottom:14 }} onClick={() => { setMode(null); setErr(""); }}>← BACK</button>
          <label style={sx.lbl}>Team Number</label>
          <input style={sx.inp} placeholder="e.g. 4027" value={jNum} onChange={e => setJNum(e.target.value)}/>
          <label style={sx.lbl}>Team Password</label>
          <input style={sx.inp} placeholder="e.g. ABCD1234" value={jPwd} onChange={e => setJPwd(e.target.value.toUpperCase())}/>
          {err && <div style={sx.err}>{err}</div>}
          <button style={sx.btn(C.accent)} onClick={joinTeam} disabled={busy}>{busy ? "JOINING…" : "JOIN TEAM →"}</button>
        </>}
      </div>
    </div>
  );
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────
function HomeTab({ team, user, role, onDeleteAccount, onDeleteTeam }) {
  const [members, setMembers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fbSelect("memberships", { team_id: team.id });
        setMembers(rows);
        for (const m of rows) await idbPut("memberships", m);
      } catch {
        const c = await idbAll("memberships");
        setMembers(c.filter(m => m.team_id === team.id));
      }
      try {
        const anns = await fbSelect("announcements", { team_id: team.id });
        anns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setAnnouncements(anns.slice(0, 3));
      } catch {}
    })();
  }, []);

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      <div style={sx.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:3, marginBottom:4 }}>TEAM #{team.number}</div>
            <div style={{ fontSize:26, fontWeight:700, color:C.accent }}>{team.name}</div>
          </div>
          <span style={sx.tag(RC[role] || C.muted)}>{role.toUpperCase()}</span>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        <div style={sx.sc}><div style={{ fontSize:28, fontWeight:700, color:C.accent }}>{members.length}</div><div style={{ fontSize:11, color:C.muted, letterSpacing:2, textTransform:"uppercase" }}>Members</div></div>
        <div style={sx.sc}><div style={{ fontSize:18, fontWeight:700, color:RC[role] || C.muted }}>{role.toUpperCase()}</div><div style={{ fontSize:11, color:C.muted, letterSpacing:2, textTransform:"uppercase" }}>Your Role</div></div>
      </div>

      {/* Recent Announcements */}
      {announcements.length > 0 && (
        <div style={sx.card}>
          <div style={sx.ct}>📢 Recent Announcements</div>
          {announcements.map(a => (
            <div key={a.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span style={{ fontSize:12, fontWeight:700, color:C.orange }}>{a.title}</span>
                <span style={{ fontSize:10, color:C.muted }}>{fmtTs(a.created_at)}</span>
              </div>
              <div style={{ fontSize:12, color:C.dim }}>{a.body}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>— {a.author}</div>
            </div>
          ))}
        </div>
      )}

      <div style={sx.card}>
        <div style={sx.ct}>Roster</div>
        {members.length === 0 && <div style={{ color:C.muted, fontSize:13 }}>Loading roster…</div>}
        {members.map(m => (
          <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:C.bg2, border:`1px solid ${RC[m.role] || C.muted}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:RC[m.role] || C.muted }}>
              {m.username?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex:1, fontSize:13 }}>{m.username}</div>
            <span style={sx.tag(RC[m.role] || C.muted)}>{m.role?.toUpperCase()}</span>
          </div>
        ))}
      </div>

      {/* Danger Zone */}
      <div style={{ ...sx.card, border:`1px solid ${C.red}44` }}>
        <div style={{ ...sx.ct, color:C.red }}>Danger Zone</div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <button style={{ ...sx.btn(C.red), width:"auto", padding:"8px 16px" }} onClick={onDeleteAccount}>🗑 DELETE MY ACCOUNT</button>
          {role === "owner" && <button style={{ ...sx.btn(C.red), width:"auto", padding:"8px 16px" }} onClick={onDeleteTeam}>💥 DELETE TEAM</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Forms Tab ────────────────────────────────────────────────────────────────
function FormsTab({ team, user, role, online, onPending }) {
  const [forms,  setForms]  = useState([]);
  const [view,   setView]   = useState("list");
  const [active, setActive] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try { const r = await fbSelect("forms", { team_id: team.id }); setForms(r); for (const f of r) await idbPut("forms", f); }
    catch { const c = await idbAll("forms"); setForms(c.filter(f => f.team_id === team.id)); }
  }

  async function deleteForm(f, e) {
    e.stopPropagation();
    if (!confirm(`Delete form "${f.title}"? All submissions will also be deleted.`)) return;
    try {
      await fbDelete("submissions", { form_id: f.id });
      await fbDeleteById("forms", f.id);
      await idbDel("forms", f.id);
      setForms(fs => fs.filter(x => x.id !== f.id));
    } catch { alert("Error deleting form."); }
  }

  if (view === "create")         return <FormBuilder team={team} user={user} onSave={() => { setView("list"); load(); }} onCancel={() => setView("list")}/>;
  if (view === "fill" && active) return <FormFiller form={active} user={user} team={team} onDone={() => { setView("list"); onPending(); }} onCancel={() => setView("list")} online={online}/>;

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:2 }}>SCOUTING FORMS</div>
        {(role === "owner" || role === "admin") && <button style={{ ...sx.btn(C.accent), width:"auto", padding:"8px 16px" }} onClick={() => setView("create")}>+ CREATE FORM</button>}
      </div>
      {forms.length === 0 && <div style={{ ...sx.card, textAlign:"center", color:C.muted }}><div style={{ fontSize:32, marginBottom:8 }}>📋</div><div>{(role === "owner" || role === "admin") ? "No forms yet. Create one above." : "No forms yet. Ask an admin to create one."}</div></div>}
      {forms.map(f => (
        <div key={f.id} style={sx.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ cursor:"pointer", flex:1 }} onClick={() => { setActive(f); setView("fill"); }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>{f.title}</div>
              <div style={{ fontSize:11, color:C.muted }}>{f.questions?.length || 0} questions · by {f.created_by}</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={sx.sm()} onClick={() => { setActive(f); setView("fill"); }}>FILL →</button>
              {(role === "owner" || role === "admin") && <button style={sx.sm(C.red)} onClick={e => deleteForm(f, e)}>🗑</button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Form Builder ─────────────────────────────────────────────────────────────
const QTYPES = [{ id:"text",l:"Text Answer" },{ id:"number",l:"Number" },{ id:"scale",l:"Scale 1–10" },{ id:"select",l:"Multiple Choice" },{ id:"boolean",l:"Yes / No" },{ id:"draw",l:"Draw on Field" },{ id:"photo",l:"Take Photo" }];

function FormBuilder({ team, user, onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [qs,    setQs]    = useState([]);
  const [err,   setErr]   = useState(""); const [busy, setBusy] = useState(false);

  function addQ()         { setQs(q => [...q, { id:uid(), text:"", type:"text", required:false, options:[] }]); }
  function upd(i, k, v)  { setQs(q => q.map((x, j) => j === i ? { ...x, [k]:v } : x)); }
  function del(i)         { setQs(q => q.filter((_, j) => j !== i)); }
  function move(i, d)     { setQs(q => { const a = [...q], b = i + d; if (b < 0 || b >= a.length) return a; [a[i], a[b]] = [a[b], a[i]]; return a; }); }

  async function save() {
    if (!title.trim())                { setErr("Form title required.");       return; }
    if (!qs.length)                   { setErr("Add at least one question."); return; }
    if (qs.some(q => !q.text.trim())) { setErr("All questions need text.");   return; }
    setBusy(true); setErr("");
    const form = { id:uid(), team_id:team.id, title:title.trim(), questions:qs, created_by:user.username, created_at:tsNow() };
    try { const saved = await fbInsert("forms", form); await idbPut("forms", saved); onSave(); }
    catch { setErr("Error saving form."); }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button style={sx.sm()} onClick={onCancel}>← BACK</button>
        <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:2 }}>CREATE FORM</div>
      </div>
      <div style={sx.card}>
        <label style={sx.lbl}>Form Title</label>
        <input style={sx.inp} placeholder="e.g. Qual Match Scout" value={title} onChange={e => setTitle(e.target.value)}/>
      </div>
      {qs.map((q, i) => (
        <div key={q.id} style={sx.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ fontSize:12, color:C.accent, letterSpacing:2 }}>Q{i+1}</span>
              <button style={sx.sm(C.muted)} onClick={() => move(i, -1)}>↑</button>
              <button style={sx.sm(C.muted)} onClick={() => move(i, +1)}>↓</button>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:C.muted, cursor:"pointer" }}>
                <input type="checkbox" checked={q.required} onChange={e => upd(i, "required", e.target.checked)}/> Required
              </label>
              <button style={sx.sm(C.red)} onClick={() => del(i)}>✕</button>
            </div>
          </div>
          <label style={sx.lbl}>Question</label>
          <input style={sx.inp} placeholder="e.g. Game pieces scored?" value={q.text} onChange={e => upd(i, "text", e.target.value)}/>
          <label style={sx.lbl}>Answer Type</label>
          <select style={sx.inp} value={q.type} onChange={e => upd(i, "type", e.target.value)}>
            {QTYPES.map(t => <option key={t.id} value={t.id}>{t.l}</option>)}
          </select>
          {q.type === "select" && <>
            <label style={sx.lbl}>Options (one per line)</label>
            <textarea style={{ ...sx.inp, height:80, resize:"vertical" }} value={q.options?.join("\n") || ""} onChange={e => upd(i, "options", e.target.value.split("\n"))} placeholder={"Option A\nOption B\nOption C"}/>
          </>}
          {q.type === "draw" && <>
            <label style={sx.lbl}>Background image URL (optional)</label>
            <input style={sx.inp} placeholder="https://… or leave blank for default FRC field" value={q.imageUrl || ""} onChange={e => upd(i, "imageUrl", e.target.value)}/>
          </>}
        </div>
      ))}
      <button style={{ ...sx.btn(C.muted), marginBottom:12 }} onClick={addQ}>+ ADD QUESTION</button>
      {err && <div style={sx.err}>{err}</div>}
      <button style={sx.btn(C.green)} onClick={save} disabled={busy}>{busy ? "SAVING…" : "SAVE FORM →"}</button>
    </div>
  );
}

// ─── Form Filler ──────────────────────────────────────────────────────────────
function FormFiller({ form, user, team, onDone, onCancel, online }) {
  const [ans,  setAns]  = useState({});
  const [err,  setErr]  = useState(""); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function set(id, v) { setAns(a => ({ ...a, [id]:v })); }

  async function submit() {
    const missing = form.questions.filter(q => q.required && ans[q.id] == null && ans[q.id] !== 0 && ans[q.id] !== false);
    if (missing.length) { setErr(`Required: ${missing.map(q => q.text).join(", ")}`); return; }
    setBusy(true); setErr("");
    const sub = { id:uid(), form_id:form.id, team_id:team.id, submitted_by:user.username, user_id:user.id, answers:ans, created_at:tsNow() };
    try {
      if (online) {
        try { await fbInsert("submissions", sub); }
        catch { await idbPut("pending", { data:sub }); }
      } else {
        const db2 = await idbOpen();
        const tx = db2.transaction("pending", "readwrite");
        tx.objectStore("pending").add({ data:sub });
      }
      await idbPut("submissions", sub);
      setDone(true);
    } catch { setErr("Failed to save submission."); }
    setBusy(false);
  }

  if (done) return (
    <div style={{ maxWidth:600, margin:"0 auto" }}>
      <div style={{ ...sx.card, textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.green, marginBottom:8 }}>Submitted!</div>
        <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>{online ? "Saved to database." : "Saved offline — will sync when reconnected."}</div>
        <button style={sx.btn(C.accent)} onClick={onDone}>BACK TO FORMS</button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:700, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button style={sx.sm()} onClick={onCancel}>← BACK</button>
        <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:2 }}>{form.title}</div>
      </div>
      {form.questions.map((q, i) => (
        <div key={q.id} style={sx.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>{i+1}. {q.text}{q.required && <span style={{ color:C.red, marginLeft:4 }}>*</span>}</div>
          <QInput q={q} value={ans[q.id]} onChange={v => set(q.id, v)}/>
        </div>
      ))}
      {err && <div style={{ ...sx.err, marginBottom:12 }}>{err}</div>}
      <button style={sx.btn(C.green)} onClick={submit} disabled={busy}>{busy ? "SUBMITTING…" : "SUBMIT →"}</button>
    </div>
  );
}

// ─── Question Input ───────────────────────────────────────────────────────────
function QInput({ q, value, onChange }) {
  const cvRef   = useRef(null);
  const drawing = useRef(false);

  if (q.type === "text")    return <textarea style={{ ...sx.inp, height:80, resize:"vertical", marginBottom:0 }} value={value || ""} onChange={e => onChange(e.target.value)} placeholder="Type your answer…"/>;
  if (q.type === "number")  return <input style={{ ...sx.inp, marginBottom:0 }} type="number" value={value ?? ""} onChange={e => onChange(Number(e.target.value))} placeholder="Enter a number"/>;
  if (q.type === "boolean") return <div style={{ display:"flex", gap:10 }}>{["Yes","No"].map(o => <button key={o} style={{ ...sx.sm(value === o ? C.accent : C.muted), flex:1, padding:10 }} onClick={() => onChange(o)}>{o}</button>)}</div>;
  if (q.type === "scale")   return (
    <div>
      <input type="range" min={1} max={10} step={1} value={value || 5} onChange={e => onChange(Number(e.target.value))} style={{ width:"100%", accentColor:C.accent }}/>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.muted }}>
        <span>1 — Poor</span><span style={{ color:C.accent, fontWeight:700 }}>{value || 5}</span><span>10 — Excellent</span>
      </div>
    </div>
  );
  if (q.type === "select") {
    const opts = (q.options || []).filter(o => o.trim());
    return <div style={{ display:"flex", flexDirection:"column", gap:8 }}>{opts.map(o => <button key={o} style={{ ...sx.sm(value === o ? C.accent : C.muted), textAlign:"left", padding:"10px 14px" }} onClick={() => onChange(o)}>{o}</button>)}</div>;
  }
  if (q.type === "photo") return (
    <div>
      <input type="file" accept="image/*" capture="environment" style={{ display:"none" }} id={`ph-${q.id}`} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => onChange(r.result); r.readAsDataURL(f); }}/>
      <label htmlFor={`ph-${q.id}`} style={{ ...sx.sm(), display:"inline-block", cursor:"pointer", padding:"10px 16px" }}>📷 TAKE / CHOOSE PHOTO</label>
      {value && <img src={value} alt="preview" style={{ display:"block", marginTop:8, maxWidth:"100%", borderRadius:6, border:`1px solid ${C.border}` }}/>}
    </div>
  );
  if (q.type === "draw") {
    const getXY = e => { const r = cvRef.current.getBoundingClientRect(), sx2 = cvRef.current.width / r.width, sy = cvRef.current.height / r.height; return [((e.clientX || e.touches?.[0]?.clientX) - r.left) * sx2, ((e.clientY || e.touches?.[0]?.clientY) - r.top) * sy]; };
    const start = e => { drawing.current = true; const ctx = cvRef.current.getContext("2d"); const [x,y] = getXY(e); ctx.beginPath(); ctx.moveTo(x,y); };
    const draw  = e => { if (!drawing.current) return; e.preventDefault(); const ctx = cvRef.current.getContext("2d"); const [x,y] = getXY(e); ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineTo(x,y); ctx.stroke(); onChange(cvRef.current.toDataURL()); };
    const stop  = () => { drawing.current = false; };
    const clear = () => { const cv = cvRef.current, ctx = cv.getContext("2d"); ctx.clearRect(0,0,cv.width,cv.height); if (q.imageUrl) { const img = new Image(); img.crossOrigin = "anonymous"; img.src = q.imageUrl; img.onload = () => ctx.drawImage(img,0,0,cv.width,cv.height); } else drawField(ctx,cv.width,cv.height); onChange(null); };
    useEffect(() => { const cv = cvRef.current, ctx = cv.getContext("2d"); if (q.imageUrl) { const img = new Image(); img.crossOrigin = "anonymous"; img.src = q.imageUrl; img.onload = () => ctx.drawImage(img,0,0,cv.width,cv.height); } else drawField(ctx,cv.width,cv.height); }, []);
    return (
      <div>
        <canvas ref={cvRef} width={560} height={280} style={{ border:`1px solid ${C.border}`, borderRadius:6, cursor:"crosshair", width:"100%", touchAction:"none", display:"block" }}
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}/>
        <button style={{ ...sx.sm(C.red), marginTop:8 }} onClick={clear}>✕ CLEAR</button>
      </div>
    );
  }
  return null;
}

function drawField(ctx, w, h) {
  ctx.fillStyle = "#071020"; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = "#1e2d45"; ctx.lineWidth = 2; ctx.strokeRect(8,8,w-16,h-16);
  ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(w/2,8); ctx.lineTo(w/2,h-8); ctx.stroke();
  ctx.beginPath(); ctx.arc(w/2,h/2,36,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle = "#38bdf822"; ctx.fillRect(8,8,70,h-16); ctx.fillRect(w-78,8,70,h-16);
  ctx.fillStyle = "#64748b"; ctx.font = "10px monospace"; ctx.textAlign = "center";
  ctx.fillText("BLUE",43,h/2+4); ctx.fillText("RED",w-43,h/2+4);
  ctx.fillText("2025 FRC FIELD",w/2,h-14);
}

// ─── Data Tab ─────────────────────────────────────────────────────────────────
function DataTab({ team, user, role }) {
  const [forms,   setForms]   = useState([]);
  const [sel,     setSel]     = useState(null);
  const [subs,    setSubs]    = useState([]);
  const [detail,  setDetail]  = useState(null);
  const [search,  setSearch]  = useState("");
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    (async () => {
      try { const r = await fbSelect("forms", { team_id: team.id }); setForms(r); }
      catch { const c = await idbAll("forms"); setForms(c.filter(f => f.team_id === team.id)); }
    })();
  }, []);

  async function loadSubs(form) {
    setSel(form); setDetail(null); setSearch(""); setSearchQ("");
    try { const r = await fbSelect("submissions", { form_id: form.id }); setSubs(r); for (const s of r) await idbPut("submissions", s); }
    catch { const c = await idbAll("submissions"); setSubs(c.filter(s => s.form_id === form.id)); }
  }

  async function deleteSub(s, e) {
    e.stopPropagation();
    const canDelete = (role === "owner" || role === "admin") || s.user_id === user.id || s.submitted_by === user.username;
    if (!canDelete) { alert("You can only delete your own submissions."); return; }
    if (!confirm("Delete this submission?")) return;
    try {
      await fbDeleteById("submissions", s.id);
      await idbDel("submissions", s.id);
      setSubs(ss => ss.filter(x => x.id !== s.id));
    } catch { alert("Error deleting submission."); }
  }

  if (detail) return (
    <div style={{ maxWidth:700, margin:"0 auto" }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
        <button style={sx.sm()} onClick={() => setDetail(null)}>← BACK</button>
        <span style={{ fontSize:13, color:C.accent, letterSpacing:2 }}>SUBMISSION DETAIL</span>
      </div>
      <div style={sx.card}>
        <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>By <strong style={{ color:C.accent }}>{detail.submitted_by}</strong> · {new Date(detail.created_at).toLocaleString()}</div>
        {sel.questions.map(q => (
          <div key={q.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>{q.text}</div>
            {(q.type === "draw" || q.type === "photo")
              ? (detail.answers?.[q.id] ? <img src={detail.answers[q.id]} alt="ans" style={{ maxWidth:"100%", borderRadius:6, border:`1px solid ${C.border}` }}/> : <span style={{ color:C.muted }}>No image</span>)
              : <div style={{ fontSize:14 }}>{String(detail.answers?.[q.id] ?? "—")}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  if (!sel) return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:2, marginBottom:16 }}>SUBMISSION DATA</div>
      {forms.length === 0 && <div style={{ ...sx.card, textAlign:"center", color:C.muted }}>No forms created yet.</div>}
      {forms.map(f => (
        <div key={f.id} style={{ ...sx.card, cursor:"pointer" }} onClick={() => loadSubs(f)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div><div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>{f.title}</div><div style={{ fontSize:11, color:C.muted }}>{f.questions?.length || 0} questions</div></div>
            <button style={sx.sm()}>VIEW DATA →</button>
          </div>
        </div>
      ))}
    </div>
  );

  const analytics = buildAnalytics(sel, subs);
  const filtered  = subs.filter(s => {
    if (!search) return true;
    return Object.entries(s.answers || {}).some(([k, v]) => { if (searchQ && k !== searchQ) return false; return String(v).toLowerCase().includes(search.toLowerCase()); });
  });

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16 }}>
        <button style={sx.sm()} onClick={() => setSel(null)}>← BACK</button>
        <span style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:2 }}>{sel.title}</span>
        <span style={sx.tag(C.green)}>{subs.length} submissions</span>
      </div>
      <div style={sx.card}>
        <div style={sx.ct}>Analytics</div>
        {Object.keys(analytics).length === 0 && <div style={{ color:C.muted, fontSize:13 }}>No analysable data yet.</div>}
        <div style={{ display:"flex", flexWrap:"wrap", gap:12 }}>
          {Object.values(analytics).map((a, i) => (
            <div key={i} style={{ background:C.bg0, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px 16px", textAlign:"center", minWidth:150, flex:"1 1 150px" }}>
              <div style={{ fontSize:11, color:C.muted, letterSpacing:1, marginBottom:6, textAlign:"left" }}>{a.label}</div>
              {(a.type === "number" || a.type === "scale") && <><div style={{ fontSize:26, fontWeight:700, color:C.accent }}>{a.avg}</div><div style={{ fontSize:10, color:C.muted }}>avg · {a.min}–{a.max} · n={a.n}</div></>}
              {a.type === "dist" && Object.entries(a.counts).sort((x,y) => y[1]-x[1]).slice(0,4).map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:2 }}>
                  <span style={{ color:C.dim }}>{k}</span><span style={{ color:C.accent, fontWeight:700 }}>{Math.round(v/a.total*100)}%</span>
                </div>
              ))}
              {a.type === "text" && <div style={{ fontSize:20, fontWeight:700, color:C.accent }}>{a.n} <span style={{ fontSize:12, color:C.muted }}>responses</span></div>}
            </div>
          ))}
        </div>
      </div>
      <div style={sx.card}>
        <div style={sx.ct}>Search & Filter</div>
        <div style={{ display:"flex", gap:10 }}>
          <input style={{ ...sx.inp, flex:1, marginBottom:0 }} placeholder="Search answers…" value={search} onChange={e => setSearch(e.target.value)}/>
          <select style={{ ...sx.inp, marginBottom:0, width:"auto" }} value={searchQ} onChange={e => setSearchQ(e.target.value)}>
            <option value="">All questions</option>
            {sel.questions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
          </select>
        </div>
      </div>
      <div style={sx.card}>
        <div style={sx.ct}>Submissions ({filtered.length})</div>
        {filtered.length === 0 && <div style={{ color:C.muted, fontSize:13 }}>No results.</div>}
        {filtered.map(s => (
          <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:C.bg2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:C.accent, cursor:"pointer" }} onClick={() => setDetail(s)}>
              {s.submitted_by?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex:1, cursor:"pointer" }} onClick={() => setDetail(s)}>
              <div style={{ fontSize:13 }}>{s.submitted_by}</div>
              <div style={{ fontSize:11, color:C.muted }}>{new Date(s.created_at).toLocaleString()}</div>
            </div>
            <div style={{ fontSize:11, color:C.muted, maxWidth:220, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", cursor:"pointer" }} onClick={() => setDetail(s)}>
              {sel.questions.slice(0,3).map(q => (
                <span key={q.id} style={{ marginRight:10 }}><span style={{ color:C.dim }}>{q.text.slice(0,10)}…:</span> <span style={{ color:C.accent }}>{String(s.answers?.[q.id] ?? "—").slice(0,10)}</span></span>
              ))}
            </div>
            {((role === "owner" || role === "admin") || s.user_id === user.id || s.submitted_by === user.username) &&
              <button style={sx.sm(C.red)} onClick={e => deleteSub(s, e)}>🗑</button>
            }
            <span style={{ color:C.muted, cursor:"pointer" }} onClick={() => setDetail(s)}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildAnalytics(form, subs) {
  const out = {};
  (form?.questions || []).forEach(q => {
    const vals = subs.map(s => s.answers?.[q.id]).filter(v => v != null && v !== "");
    if (!vals.length) return;
    if (q.type === "number" || q.type === "scale") {
      const nums = vals.map(Number).filter(n => !isNaN(n));
      out[q.id] = { type:q.type, label:q.text, min:Math.min(...nums), max:Math.max(...nums), avg:(nums.reduce((a,b) => a+b,0)/nums.length).toFixed(1), n:nums.length };
    } else if (q.type === "select" || q.type === "boolean") {
      const counts = {}; vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      out[q.id] = { type:"dist", label:q.text, counts, total:vals.length };
    } else if (q.type === "text") {
      out[q.id] = { type:"text", label:q.text, n:vals.length };
    }
  });
  return out;
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────────
function ChatTab({ team, user, role }) {
  const [chatMode, setChatMode] = useState("team"); // "team" | "admin" | "dm"
  const [members,  setMembers]  = useState([]);
  const [dmTarget, setDmTarget] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState("");
  const [busy,     setBusy]     = useState(false);
  const bottomRef = useRef(null);

  const isPrivileged = role === "owner" || role === "admin";

  useEffect(() => {
    fbSelect("memberships", { team_id: team.id }).then(setMembers).catch(() => {});
  }, []);

  useEffect(() => {
    loadMessages();
  }, [chatMode, dmTarget]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  async function loadMessages() {
    setMessages([]);
    try {
      let rows;
      if (chatMode === "team") {
        rows = await fbSelect("messages", { team_id: team.id, channel: "team" });
      } else if (chatMode === "admin") {
        rows = await fbSelect("messages", { team_id: team.id, channel: "admin" });
      } else if (chatMode === "dm" && dmTarget) {
        const all = await fbSelect("messages", { team_id: team.id, channel: "dm" });
        rows = all.filter(m =>
          (m.from_username === user.username && m.to_username === dmTarget.username) ||
          (m.from_username === dmTarget.username && m.to_username === user.username)
        );
      } else { rows = []; }
      rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setMessages(rows);
    } catch {}
  }

  async function sendMessage() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const msg = {
        id: uid(),
        team_id: team.id,
        channel: chatMode === "dm" ? "dm" : chatMode,
        from_username: user.username,
        from_user_id: user.id,
        to_username: chatMode === "dm" ? dmTarget?.username : null,
        body: text.trim(),
        created_at: tsNow(),
      };
      await fbInsert("messages", msg);
      setText("");
      setMessages(ms => [...ms, msg]);
    } catch {}
    setBusy(false);
  }

  const otherMembers = members.filter(m => m.user_id !== user.id && m.username !== user.username);

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      {/* Channel selector */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <button style={sx.nb(chatMode === "team")} onClick={() => { setChatMode("team"); setDmTarget(null); }}>💬 TEAM CHAT</button>
        {isPrivileged && <button style={sx.nb(chatMode === "admin")} onClick={() => { setChatMode("admin"); setDmTarget(null); }}>🔒 ADMIN CHAT</button>}
        <button style={sx.nb(chatMode === "dm" && !!dmTarget)} onClick={() => setChatMode("dm")}>📨 DIRECT MESSAGE</button>
      </div>

      {/* DM target picker */}
      {chatMode === "dm" && !dmTarget && (
        <div style={sx.card}>
          <div style={sx.ct}>Choose someone to message</div>
          {otherMembers.length === 0 && <div style={{ color:C.muted, fontSize:13 }}>No other members to message.</div>}
          {otherMembers.map(m => (
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer" }} onClick={() => setDmTarget(m)}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:C.bg2, border:`1px solid ${RC[m.role]||C.muted}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:RC[m.role]||C.muted }}>{m.username?.[0]?.toUpperCase()}</div>
              <div style={{ flex:1, fontSize:13 }}>{m.username}</div>
              <span style={sx.tag(RC[m.role]||C.muted)}>{m.role?.toUpperCase()}</span>
              <span style={{ color:C.accent }}>MESSAGE →</span>
            </div>
          ))}
        </div>
      )}

      {/* Chat window */}
      {(chatMode !== "dm" || dmTarget) && (
        <div style={sx.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={sx.ct} style={{ marginBottom:0 }}>
              {chatMode === "team" && "💬 TEAM CHAT"}
              {chatMode === "admin" && "🔒 ADMIN CHAT"}
              {chatMode === "dm" && dmTarget && `📨 DM — ${dmTarget.username}`}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {chatMode === "dm" && dmTarget && <button style={sx.sm(C.muted)} onClick={() => setDmTarget(null)}>BACK</button>}
              <button style={sx.sm(C.muted)} onClick={loadMessages}>↻ REFRESH</button>
            </div>
          </div>
          {/* Messages */}
          <div style={{ minHeight:300, maxHeight:400, overflowY:"auto", display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
            {messages.length === 0 && <div style={{ color:C.muted, fontSize:13, textAlign:"center", marginTop:60 }}>No messages yet. Say something!</div>}
            {messages.map(m => {
              const isMe = m.from_username === user.username;
              return (
                <div key={m.id} style={{ display:"flex", flexDirection:isMe?"row-reverse":"row", alignItems:"flex-end", gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:C.bg2, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:C.accent, flexShrink:0 }}>
                    {m.from_username?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ maxWidth:"70%" }}>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:2, textAlign:isMe?"right":"left" }}>{m.from_username} · {fmtTs(m.created_at)}</div>
                    <div style={{ background:isMe?C.accent+"22":C.bg2, border:`1px solid ${isMe?C.accent:C.border}`, borderRadius:8, padding:"8px 12px", fontSize:13, color:C.text, wordBreak:"break-word" }}>
                      {m.body}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef}/>
          </div>
          {/* Input */}
          <div style={{ display:"flex", gap:8 }}>
            <input style={{ ...sx.inp, flex:1, marginBottom:0 }} placeholder="Type a message…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}/>
            <button style={{ ...sx.btn(C.accent), width:"auto", padding:"10px 20px" }} onClick={sendMessage} disabled={busy || !text.trim()}>SEND</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Announcements Tab ────────────────────────────────────────────────────────
function AnnouncementsTab({ team, user, role }) {
  const [announcements, setAnnouncements] = useState([]);
  const [title,  setTitle]  = useState("");
  const [body,   setBody]   = useState("");
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState("");
  const [showForm, setShowForm] = useState(false);

  const isPrivileged = role === "owner" || role === "admin";

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const rows = await fbSelect("announcements", { team_id: team.id });
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setAnnouncements(rows);
    } catch {}
  }

  async function post() {
    if (!title.trim() || !body.trim()) { setErr("Title and body required."); return; }
    setBusy(true); setErr("");
    try {
      const ann = { id:uid(), team_id:team.id, title:title.trim(), body:body.trim(), author:user.username, created_at:tsNow() };
      await fbInsert("announcements", ann);
      setAnnouncements(a => [ann, ...a]);
      setTitle(""); setBody(""); setShowForm(false);
    } catch { setErr("Error posting announcement."); }
    setBusy(false);
  }

  async function deleteAnn(a) {
    if (!confirm("Delete this announcement?")) return;
    try {
      await fbDeleteById("announcements", a.id);
      setAnnouncements(as => as.filter(x => x.id !== a.id));
    } catch { alert("Error deleting announcement."); }
  }

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:2 }}>📢 ANNOUNCEMENTS</div>
        {isPrivileged && <button style={{ ...sx.btn(C.orange), width:"auto", padding:"8px 16px" }} onClick={() => setShowForm(s => !s)}>{showForm ? "CANCEL" : "+ NEW ANNOUNCEMENT"}</button>}
      </div>

      {showForm && isPrivileged && (
        <div style={sx.card}>
          <div style={sx.ct}>Post Announcement</div>
          <label style={sx.lbl}>Title</label>
          <input style={sx.inp} placeholder="e.g. Practice this Saturday" value={title} onChange={e => setTitle(e.target.value)}/>
          <label style={sx.lbl}>Message</label>
          <textarea style={{ ...sx.inp, height:100, resize:"vertical" }} placeholder="Type your announcement…" value={body} onChange={e => setBody(e.target.value)}/>
          {err && <div style={sx.err}>{err}</div>}
          <button style={sx.btn(C.orange)} onClick={post} disabled={busy}>{busy ? "POSTING…" : "POST ANNOUNCEMENT →"}</button>
        </div>
      )}

      {announcements.length === 0 && (
        <div style={{ ...sx.card, textAlign:"center", color:C.muted }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📢</div>
          <div>No announcements yet.{isPrivileged ? " Post one above." : " Check back later."}</div>
        </div>
      )}
      {announcements.map(a => (
        <div key={a.id} style={{ ...sx.card, borderLeft:`3px solid ${C.orange}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.orange, marginBottom:6 }}>{a.title}</div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.6, marginBottom:8 }}>{a.body}</div>
              <div style={{ fontSize:11, color:C.muted }}>Posted by <span style={{ color:C.accent }}>{a.author}</span> · {fmtTs(a.created_at)}</div>
            </div>
            {isPrivileged && <button style={{ ...sx.sm(C.red), marginLeft:12, flexShrink:0 }} onClick={() => deleteAnn(a)}>🗑</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Manage Tab (Owner) ───────────────────────────────────────────────────────
function ManageTab({ team, user, onTeamUpdate, onRoleChange }) {
  const [members,  setMembers]  = useState([]);
  const [tName,    setTName]    = useState(team.name);
  const [editName, setEditName] = useState(false);
  const [msg,      setMsg]      = useState(""); const [err, setErr] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    try { const r = await fbSelect("memberships", { team_id: team.id }); setMembers(r); for (const m of r) await idbPut("memberships", m); }
    catch { const c = await idbAll("memberships"); setMembers(c.filter(m => m.team_id === team.id)); }
  }

  async function setRole(m, role) {
    try {
      await fbUpdate("memberships", { id:m.id }, { role });
      const u = { ...m, role };
      await idbPut("memberships", u);
      setMembers(ms => ms.map(x => x.id === m.id ? u : x));
      setMsg(`${m.username} is now ${role}.`); setErr("");
      // If this affects the current user's own session, refresh
      if (m.user_id === user.id) onRoleChange?.();
    } catch { setErr("Failed to update role."); }
  }

  async function transferOwnership(m) {
    if (!confirm(`Transfer ownership to ${m.username}? You will become an admin.`)) return;
    try {
      // Demote current owner to admin
      const myMem = members.find(x => x.user_id === user.id);
      if (myMem) { await fbUpdate("memberships", { id:myMem.id }, { role:"admin" }); }
      // Promote target to owner
      await fbUpdate("memberships", { id:m.id }, { role:"owner" });
      // Update team owner_id
      await fbUpdate("teams", { id:team.id }, { owner_id:m.user_id });
      setMsg(`${m.username} is now the owner. Reloading…`);
      setTimeout(() => window.location.reload(), 1500);
    } catch { setErr("Failed to transfer ownership."); }
  }

  async function kick(m) {
    if (!confirm(`Kick ${m.username}?`)) return;
    try { await fbDelete("memberships", { id:m.id }); await idbDel("memberships", m.id); setMembers(ms => ms.filter(x => x.id !== m.id)); setMsg(`${m.username} removed.`); setErr(""); }
    catch { setErr("Failed to kick member."); }
  }

  async function saveName() {
    try { await fbUpdate("teams", { id:team.id }, { name:tName }); const u = { ...team, name:tName }; await idbPut("teams", u); onTeamUpdate(u); setEditName(false); setMsg("Team name updated."); setErr(""); }
    catch { setErr("Failed to update name."); }
  }

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      <div style={{ fontSize:14, fontWeight:700, color:C.accent, letterSpacing:2, marginBottom:16 }}>TEAM MANAGEMENT</div>
      {msg && <div style={{ ...sx.ok, background:C.green+"18", padding:"8px 12px", borderRadius:6, border:`1px solid ${C.green}44`, marginBottom:12 }}>{msg}</div>}
      {err && <div style={{ ...sx.err, background:C.red+"18", padding:"8px 12px", borderRadius:6, border:`1px solid ${C.red}44`, marginBottom:12 }}>{err}</div>}
      <div style={sx.card}>
        <div style={sx.ct}>Team Info</div>
        {editName ? <>
          <label style={sx.lbl}>Team Name</label>
          <input style={sx.inp} value={tName} onChange={e => setTName(e.target.value)}/>
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ ...sx.btn(C.green), flex:1 }} onClick={saveName}>SAVE</button>
            <button style={{ ...sx.btn(C.red),   flex:1 }} onClick={() => { setEditName(false); setTName(team.name); }}>CANCEL</button>
          </div>
        </> : <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:14 }}>#{team.number} — {team.name}</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Join password: <span style={{ color:C.green, letterSpacing:4, fontWeight:700 }}>{team.password}</span></div>
            </div>
            <button style={sx.sm()} onClick={() => setEditName(true)}>EDIT NAME</button>
          </div>
        </>}
      </div>
      <div style={sx.card}>
        <div style={sx.ct}>Members</div>
        {members.map(m => (
          <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:C.bg2, border:`1px solid ${RC[m.role] || C.muted}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:RC[m.role] || C.muted }}>
              {m.username?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex:1, fontSize:13 }}>{m.username}</div>
            <span style={sx.tag(RC[m.role] || C.muted)}>{m.role?.toUpperCase()}</span>
            {m.user_id !== user.id && m.role !== "owner" && (
              <div style={{ display:"flex", gap:6 }}>
                {m.role === "member" && <button style={sx.sm(C.accent)} onClick={() => setRole(m,"admin")}>→ ADMIN</button>}
                {m.role === "admin"  && <button style={sx.sm(C.muted)}  onClick={() => setRole(m,"member")}>→ MEMBER</button>}
                <button style={sx.sm(C.orange)} onClick={() => transferOwnership(m)} title="Transfer ownership">👑</button>
                <button style={sx.sm(C.red)} onClick={() => kick(m)}>KICK</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
