(() => {
  const B = window.BODA;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  let lang = "es";
  try {
    lang = localStorage.getItem("lang") || (navigator.language.startsWith("es") ? "es" : "en");
  } catch {}

  const L = (v) => (v == null ? "" : typeof v === "string" ? v : v[lang]);
  const t = (k) => B.t[lang][k] ?? k;
  const fmt = (d, o) => new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", o).format(d);
  const listJoin = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + (lang === "es" ? " y " : " & ") + a.at(-1));

  // Personal link: ?i=TOKEN (remembered so a guest can come back without it).
  const params = new URLSearchParams(location.search);
  let token = params.get("i") || "";
  try {
    if (token) localStorage.setItem("rsvp_i", token);
    else token = localStorage.getItem("rsvp_i") || "";
  } catch {}

  let party = null; // { invitation, guests: [...], replied, bus, song, contact, message }
  let partyState = token && B.rsvpEndpoint ? "loading" : "none";

  // ---------- render ----------
  function render() {
    document.documentElement.lang = lang;
    $("#lang").textContent = lang === "es" ? "EN" : "ES";
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));

    const [a, b] = B.names;
    $("#names").innerHTML = `${esc(a)} <em>&amp;</em> ${esc(b)}`;
    $("#names-foot").innerHTML = `${esc(a)} <em>&amp;</em> ${esc(b)}`;

    const date = B.date ? new Date(B.date) : null;
    $("#when").textContent = date
      ? `${fmt(date, { day: "numeric", month: "long", year: "numeric" })} · ${B.venue.town}`
      : L(B.dateText);
    const days = date ? Math.ceil((date - Date.now()) / 864e5) : 0;
    $("#countdown").textContent = days > 0 ? t("countdown").replace("{n}", days) : "";

    $("#story").innerHTML = B.story
      .map((s) => `<li class="reveal"><span class="year">${esc(s.year)}</span><h3>${esc(L(s.title))}</h3><p>${esc(L(s.text))}</p></li>`)
      .join("");

    $("#timeline").innerHTML = B.schedule
      .map((e) => `<li class="reveal"><time>${esc(e.time)}</time><div><h3>${esc(L(e.title))}</h3><p>${esc(L(e.text))}</p></div></li>`)
      .join("");

    const mapUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${L(p.name)}, ${p.town}`)}`;
    $("#cards").innerHTML = B.info
      .map((c) => {
        const place = c.map && B[c.map];
        return `<article class="card reveal"><p class="tag">${esc(L(c.tag))}</p><h3>${esc(L(c.title))}</h3>
          ${place ? `<p class="place">${esc(L(place.name))} · ${esc(place.town)}</p>` : ""}
          <p>${esc(L(c.text))}</p>
          ${place ? `<a class="link" href="${mapUrl(place)}" target="_blank" rel="noopener">${esc(t("open_map"))} →</a>` : ""}</article>`;
      })
      .join("");

    $("#deadline").textContent = B.rsvpDeadline
      ? t("rsvp_deadline").replace("{d}", fmt(new Date(B.rsvpDeadline), { day: "numeric", month: "long" }))
      : "";

    $("#regalo").hidden = !B.iban;
    $("#iban").textContent = B.iban;
    $("#iban-holder").textContent = B.ibanHolder;

    for (const [id, url, key] of [["#album", B.albumUrl, "photos_cta"], ["#playlist", B.playlistUrl, "music_cta"]]) {
      const el = $(id);
      el.classList.toggle("off", !url);
      url ? (el.href = url) : el.removeAttribute("href");
      el.textContent = url ? `${t(key)} →` : t("soon");
    }

    renderRsvp();
    observe();
  }

  function renderRsvp() {
    const form = $("#rsvp-form");
    const intro = $("#rsvp-intro");
    const note = $("#rsvp-note");
    const box = $("#party");
    note.hidden = true;

    if (partyState === "loading") {
      intro.textContent = t("rsvp_loading");
      $("#generic").hidden = true;
      box.innerHTML = "";
      form.classList.add("busy");
      return;
    }
    form.classList.remove("busy");

    if (partyState === "ok") {
      const first = party.guests.map((g) => g.name.split(" ")[0]).filter(Boolean);
      $("#rsvp-title").textContent = t("rsvp_hello").replace("{names}", listJoin(first));
      intro.textContent = t("rsvp_intro");
      $("#generic").hidden = true;
      // keep what the guest has typed when the language changes
      const current = readGuests();
      box.innerHTML = "";
      party.guests.forEach((g, i) => {
        const c = current[i] || {};
        const node = $("#guest-tpl").content.firstElementChild.cloneNode(true);
        $$("[data-i18n]", node).forEach((el) => (el.textContent = t(el.dataset.i18n)));
        $$("[data-i18n-ph]", node).forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
        node.dataset.row = g.row;
        $(".g-name", node).value = c.name ?? g.name;
        $(".g-name", node).placeholder = t("p_name");
        $(".g-menu", node).value = c.menu ?? (["Adulto", "Niño", "Bebé"].includes(g.menu) ? g.menu : "Adulto");
        $(".g-allergies", node).value = c.allergies ?? g.allergies ?? "";
        const att = c.attending ?? (g.status === "Confirmado" ? "yes" : g.status === "No viene" ? "no" : "yes");
        $$("input[type=radio]", node).forEach((r) => {
          r.name = `att_${i}`;
          r.checked = r.value === att;
        });
        box.appendChild(node);
      });
      if (party.replied) {
        note.hidden = false;
        note.textContent = t("f_already").replace("{d}", fmt(new Date(party.replied), { day: "numeric", month: "long" }));
        $("#send").textContent = t("f_update");
      }
    } else {
      intro.textContent = partyState === "bad" ? t("rsvp_badlink") : t("rsvp_intro_generic");
      box.innerHTML = "";
      $("#generic").hidden = false;
    }
    syncVisibility();
  }

  function readGuests() {
    return $$("#party .guest").map((n) => ({
      row: +n.dataset.row,
      name: $(".g-name", n).value.trim(),
      attending: ($("input[type=radio]:checked", n) || {}).value || "yes",
      menu: $(".g-menu", n).value,
      allergies: $(".g-allergies", n).value.trim(),
    }));
  }

  function syncVisibility() {
    const form = $("#rsvp-form");
    let anyYes;
    if (partyState === "ok") {
      $$("#party .guest").forEach((n) => {
        const yes = ($("input[type=radio]:checked", n) || {}).value !== "no";
        n.classList.toggle("declined", !yes);
      });
      anyYes = readGuests().some((g) => g.attending === "yes");
    } else {
      anyYes = form.g_attending.value === "yes";
      $("#generic .if-yes").hidden = !anyYes;
    }
    $(".if-any-yes", form).hidden = !anyYes;
  }

  let io;
  function observe() {
    io ??= new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { threshold: 0.12 }
    );
    $$(".reveal:not(.in)").forEach((el) => io.observe(el));
  }

  // ---------- data ----------
  async function loadParty() {
    try {
      const res = await fetch(`${B.rsvpEndpoint}?i=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!data.ok || !data.guests?.length) throw new Error("not found");
      party = data;
      partyState = "ok";
      const f = $("#rsvp-form");
      if (data.bus) f.bus.value = data.bus;
      for (const k of ["song", "contact", "message"]) if (data[k]) f[k].value = data[k];
    } catch {
      partyState = "bad";
      try {
        localStorage.removeItem("rsvp_i");
      } catch {}
    }
    renderRsvp();
  }

  // ---------- interactions ----------
  $("#lang").addEventListener("click", () => {
    lang = lang === "es" ? "en" : "es";
    try {
      localStorage.setItem("lang", lang);
    } catch {}
    render();
  });

  const form = $("#rsvp-form");
  const status = $("#status");
  form.addEventListener("input", syncVisibility);
  form.addEventListener("change", syncVisibility);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.className = "status";
    const payload = {
      i: partyState === "ok" ? token : "",
      lang,
      bus: form.bus.value,
      song: form.song.value.trim(),
      contact: form.contact.value.trim(),
      message: form.message.value.trim(),
    };
    let declinedAll;
    if (partyState === "ok") {
      payload.guests = readGuests();
      declinedAll = payload.guests.every((g) => g.attending === "no");
    } else {
      const name = form.g_name.value.trim();
      if (!name) {
        form.g_name.focus();
        return;
      }
      payload.generic = {
        name,
        attending: form.g_attending.value,
        count: Math.max(1, Math.min(8, +form.g_count.value || 1)),
        allergies: form.g_allergies.value.trim(),
      };
      declinedAll = payload.generic.attending === "no";
    }
    if (declinedAll) payload.bus = "none";

    if (!B.rsvpEndpoint) {
      status.textContent = t("f_demo");
      console.log("RSVP payload (demo)", payload);
      return;
    }
    const btn = $("#send");
    btn.disabled = true;
    btn.textContent = t("f_sending");
    try {
      // text/plain avoids a CORS preflight, which Apps Script can't answer
      const res = await fetch(B.rsvpEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "error");
      status.textContent = t(declinedAll ? "f_sorry" : "f_thanks");
      status.classList.add("ok");
      if (party) party.replied = new Date().toISOString();
    } catch {
      status.className = "status err";
      status.textContent = t("f_error");
    }
    btn.disabled = false;
    btn.textContent = t(party?.replied ? "f_update" : "f_send");
  });

  $("#copy").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(B.iban.replace(/\s/g, ""));
      e.target.textContent = t("copied");
      setTimeout(() => (e.target.textContent = t("copy")), 1600);
    } catch {}
  });

  render();
  if (partyState === "loading") loadParty();
})();
