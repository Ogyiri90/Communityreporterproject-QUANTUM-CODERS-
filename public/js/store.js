/**
 * store.js — data layer for Community Reporter.
 *
 * Everything (accounts, sessions, reports, photos) is stored in the browser's
 * localStorage, so the website runs with no server at all.
 * The whole app talks to storage ONLY through the functions exported
 * at the bottom (window.Store) — that keeps the data rules in one place.
 */
(function () {
  const DB_KEY = 'cr_db_v1';
  const CATEGORIES = ['Pothole', 'Faulty Streetlight', 'Waste & Sanitation', 'Water & Drainage', 'Other'];
  const STATUSES = ['Pending', 'Fixed'];

  /* ---------------- persistence ---------------- */
  function blankDb() {
    return { users: [], reports: [], sessionUserId: null, nextUserId: 1, nextReportId: 1 };
  }
  function storage() {
    try {
      return window.localStorage;
    } catch (e) {
      return null; // sandboxed iframes etc. — app still works for the session
    }
  }
  function load() {
    const ls = storage();
    if (!ls) return blankDb();
    try {
      const raw = ls.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* corrupted storage -> start fresh */
    }
    return blankDb();
  }
  function save() {
    const ls = storage();
    if (!ls) return;
    try {
      ls.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      throw new Error('Browser storage is full. Try smaller or fewer photos.');
    }
  }
  let db = load();

  /* ---------------- helpers ---------------- */
  async function hash(text) {
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cr::' + text));
        return 'sha256:' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {
      /* fall through */
    }
    // Simple fallback for very old browsers (demo only).
    let h1 = 5381;
    let h2 = 52711;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = (h1 * 33) ^ c;
      h2 = (h2 * 31) ^ c;
    }
    return 'djb2:' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  const cleanEmail = (email) => String(email || '').toLowerCase().trim();
  const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email };
  const currentUser = () => db.users.find((u) => u.id === db.sessionUserId) || null;
  const withReporter = (r) => {
    const u = db.users.find((x) => x.id === r.userId);
    return { ...r, reporterName: u ? u.name : 'Unknown' };
  };

  /* ---------------- demo data (first visit only) ---------------- */
  async function seedIfEmpty() {
    if (db.users.length) return;
    const pw = await hash('password123');
    const now = Date.now();
    const day = 86400000;

    const ama = { id: db.nextUserId++, name: 'Ama Serwaa', email: 'demo@example.com', hash: pw, createdAt: new Date(now - 9 * day).toISOString() };
    const kofi = { id: db.nextUserId++, name: 'Kofi Mensah', email: 'kofi@example.com', hash: pw, createdAt: new Date(now - 8 * day).toISOString() };
    db.users.push(ama, kofi);

    const mk = (daysAgo, userId, title, category, location, description, photoUrl, status) => ({
      id: db.nextReportId++,
      userId,
      title,
      category,
      location,
      description,
      photoUrl,
      status,
      createdAt: new Date(now - daysAgo * day).toISOString(),
      updatedAt: new Date(now - daysAgo * day).toISOString(),
    });

    db.reports.push(
      mk(5, ama.id, 'Deep pothole on Nsawam Road', 'Pothole', 'Nsawam Rd, near Lapaz junction',
        'A deep pothole has opened in the right lane heading towards Achimota. Several taxis have suffered burst tyres here, especially at night when it is hard to see.',
        'demo/pothole.jpg', 'Pending'),
      mk(4, kofi.id, 'Streetlight out for two weeks', 'Faulty Streetlight', 'Adjiringanor, East Legon',
        'The streetlight at the junction near the school has been off for two weeks. The whole stretch is pitch black at night and residents feel unsafe walking home.',
        'demo/streetlight.jpg', 'Pending'),
      mk(1, ama.id, 'Blocked drain on Kaneshie Market Road', 'Water & Drainage', 'Kaneshie Market Road',
        'The gutter was choked with silt and rubbish and flooded the pavement whenever it rained. City workers cleared it — water now drains properly.',
        'demo/drain.jpg', 'Fixed')
    );
    save();
  }

  /* ---------------- auth ---------------- */
  async function register({ name, email, password }) {
    name = String(name || '').trim();
    email = cleanEmail(email);
    if (!name || !email || !password) throw new Error('Name, email and password are required.');
    if (String(password).length < 6) throw new Error('Password must be at least 6 characters.');
    if (db.users.some((u) => u.email === email)) throw new Error('An account with that email already exists.');

    const user = { id: db.nextUserId++, name, email, hash: await hash(password), createdAt: new Date().toISOString() };
    db.users.push(user);
    db.sessionUserId = user.id; // sign in straight after sign up
    save();
    return publicUser(user);
  }

  async function login({ email, password }) {
    const u = db.users.find((x) => x.email === cleanEmail(email));
    if (!u || (await hash(password || '')) !== u.hash) throw new Error('Invalid email or password.');
    db.sessionUserId = u.id;
    save();
    return publicUser(u);
  }

  function logout() {
    db.sessionUserId = null;
    save();
  }

  /* ---------------- reports ---------------- */
  function stats() {
    return {
      total: db.reports.length,
      Pending: db.reports.filter((r) => r.status === 'Pending').length,
      Fixed: db.reports.filter((r) => r.status === 'Fixed').length,
    };
  }

  function list({ q = '', category = '', status = '' } = {}) {
    const needle = String(q).toLowerCase();
    return db.reports
      .filter((r) => !category || r.category === category)
      .filter((r) => !status || r.status === status)
      .filter(
        (r) =>
          !needle ||
          r.title.toLowerCase().includes(needle) ||
          r.description.toLowerCase().includes(needle) ||
          r.location.toLowerCase().includes(needle)
      )
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(withReporter);
  }

  function get(id) {
    const r = db.reports.find((x) => x.id === Number(id));
    return r ? withReporter(r) : null;
  }

  function create({ title, category, location, description, photoUrl }) {
    const u = currentUser();
    if (!u) throw new Error('You must be signed in.');
    title = String(title || '').trim();
    location = String(location || '').trim();
    description = String(description || '').trim();
    if (!title || !category || !location || !description)
      throw new Error('Title, category, location and description are required.');
    if (!CATEGORIES.includes(category)) throw new Error('Invalid category.');

    const now = new Date().toISOString();
    const report = {
      id: db.nextReportId++,
      userId: u.id,
      title,
      category,
      location,
      description,
      photoUrl: photoUrl || null, // every report starts life as Pending
      status: 'Pending',
      createdAt: now,
      updatedAt: now,
    };
    db.reports.push(report);
    save();
    return report.id;
  }

  function update(id, { status } = {}) {
    const u = currentUser();
    if (!u) throw new Error('You must be signed in.');
    const r = db.reports.find((x) => x.id === Number(id));
    if (!r) throw new Error('Report not found.');
    if (r.userId !== u.id) throw new Error('Only the person who reported this issue can update it.');
    if (!STATUSES.includes(status)) throw new Error('Invalid status.');
    r.status = status;
    r.updatedAt = new Date().toISOString();
    save();
  }

  function remove(id) {
    const u = currentUser();
    if (!u) throw new Error('You must be signed in.');
    const idx = db.reports.findIndex((x) => x.id === Number(id));
    if (idx === -1) throw new Error('Report not found.');
    if (db.reports[idx].userId !== u.id) throw new Error('Only the person who reported this issue can delete it.');
    db.reports.splice(idx, 1);
    save();
  }

  /* ---------------- photos ---------------- */
  /** Validate + shrink an image file into a data URL small enough for localStorage. */
  async function fileToDataURL(file) {
    if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Picture must be 5 MB or smaller.');
    const raw = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('Could not read the picture.'));
      fr.readAsDataURL(file);
    });
    try {
      return await downscale(raw);
    } catch (e) {
      return raw;
    }
  }
  function downscale(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        if (scale === 1) return resolve(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Could not process the picture.'));
      img.src = dataUrl;
    });
  }

  /** Wipe everything and restore the demo data. */
  async function resetDemo() {
    db = blankDb();
    save();
    await seedIfEmpty();
  }

  window.Store = {
    CATEGORIES,
    STATUSES,
    ready: seedIfEmpty(),
    me: () => publicUser(currentUser()),
    register,
    login,
    logout,
    stats,
    list,
    get,
    create,
    update,
    remove,
    fileToDataURL,
    resetDemo,
  };
})();
