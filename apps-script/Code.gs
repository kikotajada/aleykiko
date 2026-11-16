/**
 * Backend for the RSVP on aleykiko.com.
 * Lives inside the "Boda A&K – master" Google Sheet (Extensiones → Apps Script).
 *
 * GET  ?q=texto      → names on the list that match (for the finder)
 * GET  ?i=KEY        → the whole invitation (all rows with the same "Invitación")
 * POST {i, guests, plusOne, bus, song, contact, message, lang} → saves the reply
 *
 * The sheet decides what each invitation sees:
 *   "Permite +1"       Sí → the form offers "Vendré con acompañante (+1)"
 *   "Ofrecer autobús"  No → the bus question is hidden (empty = Sí)
 * Run setup() once to add those columns (and the "Respuestas web" log tab).
 */

const SHEET = "Lista invitados";
const LOG = "Respuestas web";
const NEW_COLS = ["Permite +1", "Ofrecer autobús", "Canción", "Mensaje", "Respondido (web)"];
const MAX_RESULTS = 6;

// ---------- setup (run once from the editor) ----------
function setup() {
  const sh = sheet_();
  const head = headers_(sh);
  const missing = NEW_COLS.filter((c) => !(c in head));
  if (missing.length) {
    // insert right after "Notas" so the summary block on the right just shifts over
    const after = head["Notas"] + 1;
    sh.insertColumnsAfter(after, missing.length);
    sh.getRange(1, after + 1, 1, missing.length).setValues([missing]).setFontWeight("bold");
    const yesNo = SpreadsheetApp.newDataValidation().requireValueInList(["Sí", "No"], true).setAllowInvalid(false).build();
    const h2 = headers_(sh);
    const n = Math.max(sh.getMaxRows() - 1, 1);
    for (const c of ["Permite +1", "Ofrecer autobús"]) if (c in h2) sh.getRange(2, h2[c] + 1, n, 1).setDataValidation(yesNo);
  }
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(LOG)) {
    ss.insertSheet(LOG).appendRow(["Fecha", "Invitación", "Idioma", "Respuesta (JSON)"]).setFrozenRows(1);
  }
  PropertiesService.getScriptProperties().setProperty("SECRET", secret_());
  return "OK";
}

// ---------- web app ----------
function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.q != null) {
      // too many hits ("mar") → ask for the surname instead of listing half the family
      const r = search_(p.q);
      return json_({ ok: true, results: r.length > MAX_RESULTS ? [] : r, tooMany: r.length > MAX_RESULTS });
    }
    if (p.i) return json_(invitation_(p.i));
    // helper for you: ?links=1&admin=SECRET lists every invitation with its personal link
    if (p.links && p.admin === secret_()) return json_({ ok: true, links: links_() });
    return json_({ ok: false, error: "bad request" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    return json_(save_(d));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- read ----------
function search_(q) {
  const words = norm_(q).split(/\s+/).filter(Boolean);
  if (words.join("").length < 3) return [];
  const { rows, head } = data_();
  const out = [];
  rows.forEach((r) => {
    const inv = String(r[head["Invitación"]] || "").trim();
    const name = fullName_(r, head);
    if (!inv || !name) return;
    const w = norm_(name).split(/\s+/);
    if (words.every((q) => w.some((x) => x.startsWith(q)))) out.push({ name: displayName_(r, head), key: key_(inv) });
  });
  return out;
}

function invitation_(key, data) {
  const { rows, head } = data || data_();
  const inv = invByKey_(key, rows, head);
  if (!inv) return { ok: false };
  const mine = rows.map((r, i) => ({ r, row: i + 2 })).filter((x) => String(x.r[head["Invitación"]]).trim() === inv);
  const val = (r, c) => (c in head ? r[head[c]] : "");
  const yes = (v) => /^s[ií]$|^yes$|^true$/i.test(String(v).trim());
  const hasWebPlusOne = mine.some((x) => /\+1 \(web\)/.test(String(val(x.r, "Notas"))));
  const bus = mine.map((x) => String(val(x.r, "Ofrecer autobús")).trim()).find(Boolean);
  const first = mine[0].r;
  return {
    ok: true,
    invitation: inv,
    guests: mine.map((x) => ({
      row: x.row,
      name: displayName_(x.r, head),
      menu: val(x.r, "Adulto/Niño") || "Adulto",
      allergies: val(x.r, "Alergias / dieta") || "",
      status: val(x.r, "Estado RSVP") || "Pendiente",
    })),
    options: {
      plusOne: mine.some((x) => yes(val(x.r, "Permite +1"))) && !hasWebPlusOne,
      bus: bus ? yes(bus) : true,
    },
    replied: val(first, "Respondido (web)") || "",
    bus: busCode_(val(first, "Autobús")),
    contact: val(first, "Teléfono / contacto") || "",
    song: val(first, "Canción") || "",
    message: val(first, "Mensaje") || "",
  };
}

// ---------- write ----------
function save_(d) {
  const sh = sheet_();
  const data = data_();
  const { rows, head } = data;
  const inv = invByKey_(d.i, rows, head);
  if (!inv) return { ok: false, error: "invitation not found" };
  const current = invitation_(d.i, data);
  const allowed = new Set(current.guests.map((g) => g.row));
  const now = new Date();
  const set = (row, col, v) => col in head && sh.getRange(row, head[col] + 1).setValue(v);
  const busLabel = { none: "No", both: "Ida y vuelta", go: "Solo ida", back: "Solo vuelta" }[d.bus] || "";

  (d.guests || []).forEach((g) => {
    if (!allowed.has(g.row)) return;
    set(g.row, "Estado RSVP", g.attending === "no" ? "No viene" : "Confirmado");
    if (g.attending !== "no") {
      set(g.row, "Adulto/Niño", g.menu === "Bebé" ? "Niño" : g.menu);
      set(g.row, "Alergias / dieta", clean_(g.allergies) + (g.menu === "Bebé" ? " (bebé, sin menú)" : ""));
    }
    set(g.row, "Autobús", busLabel);
    set(g.row, "Teléfono / contacto", clean_(d.contact));
    set(g.row, "Canción", clean_(d.song));
    set(g.row, "Mensaje", clean_(d.message));
    set(g.row, "Respondido (web)", now);
  });

  if (d.plusOne && current.options.plusOne && clean_(d.plusOne.name)) {
    // new row right below the last row of this invitation, same group code
    const last = Math.max(...current.guests.map((g) => g.row));
    sh.insertRowAfter(last);
    const src = rows[last - 2];
    const r = last + 1;
    sh.getRange(last, 1, 1, sh.getLastColumn()).copyTo(sh.getRange(r, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    const parts = clean_(d.plusOne.name).split(/\s+/);
    set(r, "Invitación", inv);
    set(r, "Nombre", parts.shift());
    set(r, "Apellido", parts.join(" "));
    for (const c of ["Parte", "Relación", "Prioridad"]) if (c in head) set(r, c, src[head[c]]);
    set(r, "Rol", "Pareja / +1");
    set(r, "Estado RSVP", "Confirmado");
    set(r, "Adulto/Niño", d.plusOne.menu === "Bebé" ? "Niño" : d.plusOne.menu || "Adulto");
    set(r, "Alergias / dieta", clean_(d.plusOne.allergies));
    set(r, "Autobús", busLabel);
    set(r, "Notas", "+1 (web)");
    set(r, "Respondido (web)", now);
  }

  SpreadsheetApp.getActive().getSheetByName(LOG)?.appendRow([now, inv, d.lang || "", JSON.stringify(d)]);
  SpreadsheetApp.flush();
  const after = invitation_(d.i);
  return { ok: true, guests: after.guests, options: after.options };
}

// ---------- helpers ----------
function sheet_() {
  return SpreadsheetApp.getActive().getSheetByName(SHEET);
}
function headers_(sh) {
  const h = {};
  sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].forEach((v, i) => {
    const k = String(v).trim();
    if (k && !(k in h)) h[k] = i;
  });
  return h;
}
function data_() {
  const sh = sheet_();
  const head = headers_(sh);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues() : [];
  return { rows, head };
}
function fullName_(r, head) {
  return [r[head["Nombre"]], r[head["Apellido"]]].map((x) => String(x || "").trim()).join(" ").trim();
}
// "(mujer Juan)"-style notes in the surname column are not shown to guests
function displayName_(r, head) {
  const n = String(r[head["Nombre"]] || "").trim();
  const a = String(r[head["Apellido"]] || "").trim();
  return /^\(.*\)$/.test(a) ? n : [n, a].filter(Boolean).join(" ");
}
function norm_(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function clean_(s) {
  // plain text only: a leading = + - @ would be read as a formula, so prefix it with ' (keeps "+41…" intact)
  const t = String(s || "").slice(0, 500).trim();
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}
function busCode_(v) {
  return { "No": "none", "Ida y vuelta": "both", "Solo ida": "go", "Solo vuelta": "back" }[String(v).trim()] || "";
}
function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty("SECRET");
  if (!s) {
    s = Utilities.getUuid().replace(/-/g, "");
    props.setProperty("SECRET", s);
  }
  return s;
}
// opaque per-invitation key, so invitation codes (A-01, K-20…) can't be guessed from the site
function key_(inv) {
  const sig = Utilities.computeHmacSha256Signature(inv, secret_());
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, "").slice(0, 12);
}
function invByKey_(key, rows, head) {
  const seen = new Set();
  for (const r of rows) {
    const inv = String(r[head["Invitación"]] || "").trim();
    if (!inv || seen.has(inv)) continue;
    seen.add(inv);
    if (key_(inv) === key) return inv;
  }
  return null;
}
function links_() {
  const { rows, head } = data_();
  const out = {};
  rows.forEach((r) => {
    const inv = String(r[head["Invitación"]] || "").trim();
    if (inv && !out[inv]) out[inv] = { name: displayName_(r, head), url: "https://aleykiko.com/?i=" + key_(inv) };
  });
  return out;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
