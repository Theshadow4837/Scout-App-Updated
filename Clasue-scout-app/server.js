import express  from "express";
import cors     from "cors";
import fs       from "fs";
import path     from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app    = express();
const DB_FILE = path.join(__dirname, "db.json");
const PORT   = 5173;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ─── db.json helpers ──────────────────────────────────────────────────────────
const STORES = ["users","teams","memberships","forms","submissions","session",
                "announcements","scout_events","pit_scouts"];

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = Object.fromEntries(STORES.map(s => [s, s === "session" ? {} : []]));
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/:store  — get all rows, with optional ?key=val filters
app.get("/api/:store", (req, res) => {
  const db   = readDB();
  const store = req.params.store;
  if (!STORES.includes(store)) return res.status(404).json({ error: "Unknown store" });

  // session is a single object keyed by "key"
  if (store === "session") {
    const key = req.query.key;
    if (key) return res.json(db.session[key] ?? null);
    return res.json(Object.values(db.session));
  }

  let rows = db[store] || [];
  // filter by query params (e.g. ?team_id=xxx)
  for (const [k, v] of Object.entries(req.query)) {
    rows = rows.filter(r => String(r[k]) === String(v));
  }
  res.json(rows);
});

// GET /api/:store/:id  — get single row by id
app.get("/api/:store/:id", (req, res) => {
  const db = readDB();
  const store = req.params.store;
  if (!STORES.includes(store)) return res.status(404).json({ error: "Unknown store" });

  if (store === "session") return res.json(db.session[req.params.id] ?? null);

  const row = (db[store] || []).find(r => r.id === req.params.id);
  res.json(row ?? null);});

// POST /api/:store  — insert or upsert a row
app.post("/api/:store", (req, res) => {
  const db    = readDB();
  const store = req.params.store;
  if (!STORES.includes(store)) return res.status(404).json({ error: "Unknown store" });

  const row = req.body;

  if (store === "session") {
    db.session[row.key] = row;
    writeDB(db); return res.json(row);
  }

  if (!db[store]) db[store] = [];
  const idx = db[store].findIndex(r => r.id === row.id);
  if (idx >= 0) db[store][idx] = row;
  else          db[store].push(row);

  writeDB(db);
  res.json(row);
});

// PATCH /api/:store/:id  — partial update a single row by id
app.patch("/api/:store/:id", (req, res) => {
  const db    = readDB();
  const store = req.params.store;
  if (!STORES.includes(store)) return res.status(404).json({ error: "Unknown store" });

  const idx = (db[store] || []).findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });

  db[store][idx] = { ...db[store][idx], ...req.body };
  writeDB(db);
  res.json(db[store][idx]);
});

// DELETE /api/:store/:id  — delete a single row by id
app.delete("/api/:store/:id", (req, res) => {
  const db    = readDB();
  const store = req.params.store;
  if (!STORES.includes(store)) return res.status(404).json({ error: "Unknown store" });

  if (store === "session") {
    delete db.session[req.params.id];
    writeDB(db); return res.json({ ok: true });
  }

  db[store] = (db[store] || []).filter(r => r.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`FRC Scout DB server running on http://localhost:${PORT}`);
  console.log(`Data file: ${DB_FILE}`);
});
