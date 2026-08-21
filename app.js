/* ===== Community Reporter - page logic (vanilla JS) =====
   All pages share this file; it reads data-page from <body> and runs
   the right initialiser. Data comes from window.Store (js/store.js). */

const $ = (sel, el = document) => el.querySelector(sel);

/** Escape user text before injecting it into HTML (prevents XSS). */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? String(iso || '') : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const statusClass = (s) => (s === 'Fixed' ? 'fixed' : 'pending');

const pinIcon =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" style="flex:none" aria-hidden="true">' +
  '<path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" fill="currentColor"/>' +
  '<circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>';

const placeholderPhoto =
  '<div class="card-photo card-photo-empty"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z" fill="rgba(255,255,255,.85)"/>' +
  '<circle cx="12" cy="9" r="2.5" fill="#35546f"/></svg></div>';

/* ---------------- shared navigation ---------------- */
function renderNav(me) {
  const box = $('#nav-actions');
  if (!box) return;
  if (me) {
    box.innerHTML =
      `<span class="nav-user">Hi, ${esc(me.name.split(' ')[0])}</span>` +
      '<button class="btn btn-outline btn-small" id="logout-btn" type="button">Log out</button>';
    $('#logout-btn').addEventListener('click', () => {
      Store.logout();
      location.href = 'index.html';
    });
  } else {
    box.innerHTML =
      '<a class="btn btn-outline btn-small" href="login.html">Log in</a>' +
      '<a class="btn btn-primary btn-small" href="signup.html">Sign up</a>';
  }
}

/* ---------------- home page (feed) ---------------- */
function initHome() {
  const cat = $('#category');
  const st = $('#status');
  Store.CATEGORIES.forEach((c) => cat.insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`));
  Store.STATUSES.forEach((s) => st.insertAdjacentHTML('beforeend', `<option>${esc(s)}</option>`));

  const s = Store.stats();
  $('#stats').innerHTML = [
    [s.total, 'Total reports'],
    [s.Pending, 'Pending'],
    [s.Fixed, 'Fixed'],
  ]
    .map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`)
    .join('');

  const grid = $('#report-grid');
  const q = $('#q');

  function load() {
    const reports = Store.list({ q: q.value.trim(), category: cat.value, status: st.value });
    $('#empty').classList.toggle('hidden', reports.length > 0);
    grid.innerHTML = reports
      .map(
        (r) => `
      <a class="card" href="issue.html?id=${r.id}">
        ${r.photoUrl ? `<div class="card-photo" style="background-image:url('${esc(r.photoUrl)}')"></div>` : placeholderPhoto}
        <div class="card-body">
          <div class="badges">
            <span class="chip">${esc(r.category)}</span>
            <span class="badge ${statusClass(r.status)}">${esc(r.status)}</span>
          </div>
          <h3>${esc(r.title)}</h3>
          <p class="card-loc">${pinIcon} ${esc(r.location)}</p>
          <p class="card-meta">Reported by ${esc(r.reporterName)} · ${fmtDate(r.createdAt)}</p>
        </div>
      </a>`
      )
      .join('');
  }

  let t;
  q.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(load, 200);
  });
  cat.addEventListener('change', load);
  st.addEventListener('change', load);
  load();
}

/* ---------------- sign up page ---------------- */
function initSignup() {
  $('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = e.target.elements;
    const err = $('#signup-error');
    err.textContent = '';

    if (el['password'].value !== el['confirm'].value) {
      err.textContent = 'Passwords do not match.';
      return;
    }
    try {
      await Store.register({
        name: el['name'].value,
        email: el['email'].value,
        password: el['password'].value,
      });
      location.href = 'index.html';
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

/* ---------------- log in page ---------------- */
function initLogin() {
  const next = new URLSearchParams(location.search).get('next') || 'index.html';
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = e.target.elements;
    const err = $('#login-error');
    err.textContent = '';
    try {
      await Store.login({ email: el['email'].value, password: el['password'].value });
      location.href = next;
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

/* ---------------- new report page ---------------- */
function initReportForm(me) {
  if (!me) {
    location.href = 'login.html?next=report.html';
    return;
  }
  const form = $('#report-form');
  const photo = $('#photo-input');
  const preview = $('#photo-preview');

  photo.addEventListener('change', () => {
    const file = photo.files[0];
    if (!file) {
      preview.classList.add('hidden');
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = form.elements;
    const btn = $('#submit-btn');
    const err = $('#form-error');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const file = el['photo'].files[0];
      const photoUrl = file ? await Store.fileToDataURL(file) : null;
      const id = Store.create({
        title: el['title'].value,
        category: el['category'].value,
        location: el['location'].value,
        description: el['description'].value,
        photoUrl,
      });
      location.href = `issue.html?id=${id}`;
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Submit report';
    }
  });
}

/* ---------------- issue detail page ---------------- */
function initIssue(me) {
  const id = new URLSearchParams(location.search).get('id');
  const wrap = $('#detail');
  const r = id ? Store.get(id) : null;

  if (!r) {
    wrap.innerHTML = '<p class="empty">Report not found. <a href="index.html">Back to reports</a></p>';
    return;
  }

  const mine = me && me.id === r.userId;
  const isFixed = r.status === 'Fixed';

  wrap.innerHTML = `
    <a class="back-link" href="index.html">&larr; All reports</a>
    <article class="detail-card">
      ${r.photoUrl ? `<img class="detail-photo" src="${esc(r.photoUrl)}" alt="Photo of the reported issue">` : ''}
      <div class="detail-body">
        <div class="badges">
          <span class="chip">${esc(r.category)}</span>
          <span class="badge ${statusClass(r.status)}">${esc(r.status)}</span>
        </div>
        <h1>${esc(r.title)}</h1>
        <p class="detail-loc">${pinIcon} ${esc(r.location)}</p>
        <p class="detail-meta">Reported by ${esc(r.reporterName)} · ${fmtDate(r.createdAt)}</p>

        <div class="tracker" aria-label="Progress tracker">
          <div class="step done"><span class="dot"></span>Reported</div>
          <div class="line"></div>
          <div class="step ${isFixed ? 'done' : 'current'}"><span class="dot"></span>Pending</div>
          <div class="line"></div>
          <div class="step ${isFixed ? 'done' : ''}"><span class="dot"></span>Fixed</div>
        </div>

        <p class="detail-desc">${esc(r.description)}</p>

        ${
          mine
            ? `<div class="controls">
            <div class="status-row">
              <button class="btn btn-primary btn-small" id="toggle-status" type="button">
                ${isFixed ? 'Reopen (mark Pending)' : 'Mark as Fixed'}
              </button>
              <button class="btn btn-danger btn-small" id="delete-btn" type="button">Delete report</button>
            </div>
            <p class="form-hint">You reported this issue, so you can update its status or delete it.</p>
          </div>`
            : ''
        }
      </div>
    </article>`;

  if (!mine) return;

  $('#toggle-status').addEventListener('click', () => {
    try {
      Store.update(id, { status: isFixed ? 'Pending' : 'Fixed' });
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  });

  $('#delete-btn').addEventListener('click', () => {
    if (!confirm('Delete this report permanently?')) return;
    try {
      Store.remove(id);
      location.href = 'index.html';
    } catch (e) {
      alert(e.message);
    }
  });
}

/* ---------------- boot ---------------- */
(async () => {
  await Store.ready; // seed demo data on first visit
  const me = Store.me();
  renderNav(me);
  const page = document.body.dataset.page;
  try {
    if (page === 'home') initHome(me);
    else if (page === 'signup') initSignup(me);
    else if (page === 'login') initLogin(me);
    else if (page === 'report') initReportForm(me);
    else if (page === 'issue') initIssue(me);
  } catch (e) {
    console.error(e);
  }
})();
