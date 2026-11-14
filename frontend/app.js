/* ==========================================================================
   EMMA BUSINESS : script unique

   Sommaire
   1. Éléments partagés (adresse de l'API, échappement HTML, token de panier)
   2. Page boutique  (index.html)
   3. Page détails   (details.html)
   4. Page dashboard (dashboard.html)

   Chaque page ne démarre que si elle reconnaît sa propre structure HTML :
   on peut donc inclure ce fichier partout avec <script src="app.js"></script>
   ========================================================================== */


/* ---------- 1. Éléments partagés ---------- */

// Adresse de l'API Django : à modifier ici si tu changes de port
const API_BASE = location.port=== '5500' ? 'http://127.0.0.1:8000/api' : '/api';

// Protège le texte venant de l'API avant de l'insérer dans du HTML
function esc(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => map[c]);
}

// Token du panier invité, conservé dans le navigateur (partagé boutique + détails)
function getCartToken() {
  let t = localStorage.getItem('shop_cart_token');
  if (!t) {
    t = (crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));
    localStorage.setItem('shop_cart_token', t);
  }
  return t;
}

// Année du pied de page (si la page en possède un)
['year', 'sfYear'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.textContent = new Date().getFullYear();
});


/* ---------- 2. Page boutique (index.html) ---------- */
(function shopPage() {
  if (!document.getElementById('grid')) return;

  function apiBase() {
    return API_BASE.replace(/\/$/, '');
  }

  const CART_TOKEN = getCartToken();

  let allCategories = [];
  let debounceTimer = null;
  function debouncedLoad() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadProducts, 300);
  }

  async function loadCategories() {
    const res = await fetch(apiBase() + '/categories/');
    const data = await res.json();
    allCategories = data.results || data;
    const sel = document.getElementById('categorySelect');
    sel.innerHTML = '<option value="">Toutes les catégories</option>' +
      allCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  async function loadProducts() {
    const search = document.getElementById('searchInput').value;
    const category = document.getElementById('categorySelect').value;
    const params = new URLSearchParams({ is_active: 'true' });
    if (search) params.set('search', search);
    if (category) params.set('category', category);

    const res = await fetch(apiBase() + '/products/?' + params.toString());
    const data = await res.json();
    const products = data.results || data;

    const grid = document.getElementById('grid');
    const empty = document.getElementById('emptyState');
    if (products.length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = products.map(p => `
      <div class="card" style="cursor:pointer" onclick="location.href='details.html?id=${p.id}'">
        <div class="thumb">${p.image ? `<img src="${esc(p.image)}">` : 'Pas d image'}${p.video ? '<span class="vbadge">▶ Video</span>' : ''}</div>
        <h3>${esc(p.name)}</h3>
        <div class="cat">${esc(p.category_name || 'Sans catégorie')}</div>
        <div class="price">${p.price} FCFA</div>
        <div class="stock">${p.stock > 0 ? p.stock + ' en stock' : 'Rupture de stock'}</div>
        <button ${p.stock <= 0 ? 'disabled' : ''} onclick="event.stopPropagation(); addToCart(${p.id})">
          ${p.stock <= 0 ? 'Indisponible' : 'Ajouter au panier'}
        </button>
      </div>
    `).join('');
  }

  async function addToCart(productId) {
    const res = await fetch(apiBase() + `/cart/${CART_TOKEN}/items/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: productId, quantity: 1 })
    });
    if (res.ok) {
      const cart = await res.json();
      renderCart(cart);
      openCart();
    } else {
      alert('Erreur : ' + await res.text());
    }
  }

  async function refreshCart() {
    const res = await fetch(apiBase() + `/cart/${CART_TOKEN}/`);
    const cart = await res.json();
    renderCart(cart);
  }

  function renderCart(cart) {
    document.getElementById('cartCount').textContent = cart.items.reduce((s, i) => s + i.quantity, 0);
    document.getElementById('cartTotal').textContent = parseFloat(cart.total).toFixed(2) + ' FCFA';

    const body = document.getElementById('cartBody');
    if (cart.items.length === 0) {
      body.innerHTML = '<p style="color:#767268;text-align:center;margin-top:40px;">Votre panier est vide.</p>';
      return;
    }
    body.innerHTML = cart.items.map(item => `
      <div class="cart-item">
        <div class="thumb">${item.product_detail.image ? `<img src="${esc(item.product_detail.image)}">` : ''}</div>
        <div class="info">
          <div class="name">${esc(item.product_detail.name)}</div>
          <div class="unit">${item.product_detail.price} FCFA / unité</div>
          <div class="qty-controls">
            <button onclick="updateQty(${item.product}, ${item.quantity - 1})">-</button>
            <span>${item.quantity}</span>
            <button onclick="updateQty(${item.product}, ${item.quantity + 1})">+</button>
            <button class="remove" onclick="updateQty(${item.product}, 0)">Retirer</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  async function updateQty(productId, quantity) {
    const res = await fetch(apiBase() + `/cart/${CART_TOKEN}/items/${productId}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity })
    });
    if (res.ok) renderCart(await res.json());
  }

  async function checkout() {
    const guest_name = document.getElementById('guestName').value.trim();
    const guest_email = document.getElementById('guestEmail').value.trim();
    const guest_phone = document.getElementById('guestPhone').value.trim();
    const guest_address = document.getElementById('guestAddress').value.trim();
    const msgEl = document.getElementById('cartMsg');
    const btn = document.getElementById('checkoutBtn');
    if (btn.disabled) return;
    if (!guest_name || !guest_email || !guest_phone || !guest_address) {
      msgEl.className = 'msg error';
      msgEl.textContent = 'Veuillez remplir tous les champs.';
      return;
    }

    msgEl.className = 'msg';
    btn.disabled = true;
    btn.textContent = 'Envoi en cours...';
    let res, data;
    try {
      res = await fetch(apiBase() + `/cart/${CART_TOKEN}/checkout/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_name, guest_email, guest_phone, guest_address })
      });
      data = await res.json();
    } catch (e) {
      msgEl.className = 'msg error';
      msgEl.textContent = 'Connexion impossible. Reessayez dans un instant.';
      btn.disabled = false;
      btn.textContent = 'Valider la commande';
      return;
    }
    btn.disabled = false;
    btn.textContent = 'Valider la commande';
    if (res.ok) {
      document.getElementById('cartBody').innerHTML = `
        <div class="confirmation">
          <div class="check">✅</div>
          <h3>Merci ${esc(guest_name)} !</h3>
          <p>Ta commande a bien été enregistrée. Votre colis vous sera livrer en moins de 24h a l'adresse que vous avez indiquez dans le formulaire</p>
          <p><strong>${parseFloat(data.total).toFixed(2)} FCFA</strong></p>
        </div>`;
      document.getElementById('cartFooter').classList.add('hidden');
      document.getElementById('cartCount').textContent = '0';
      loadProducts(); // pour rafraîchir les stocks affichés
    } else {
      msgEl.className = 'msg error';
      msgEl.textContent = data.detail || 'Erreur lors de la commande.';
      refreshCart(); // pour rafraîchir les stocks affichés
    }
  }

  function openCart() {
    document.getElementById('cartFooter').classList.remove('hidden');
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('cartDrawer').classList.add('open');
    refreshCart();
  }
  function closeCart() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('cartDrawer').classList.remove('open');
  }

  // Init
  loadCategories();
  loadProducts();
  refreshCart();

  if (location.hash === '#panier') openCart();

  // Les attributs onclick="..." du HTML ont besoin de fonctions globales
  Object.assign(window, { debouncedLoad, loadProducts, addToCart, updateQty, checkout, openCart, closeCart });
})();


/* ---------- 3. Page détails (details.html) ---------- */
(function detailsPage() {
  if (!document.getElementById('similar')) return;

  const CART_TOKEN = getCartToken();

  const productId = new URLSearchParams(location.search).get('id');
  let product = null;
  let qty = 1;

  function notFound(message) {
    return '<div class="notfound"><h1>Oups</h1><p>' + message + '</p><a href="index.html">← Retour à la boutique</a></div>';
  }

  function setCartCount(cart) {
    document.getElementById('cartCount').textContent = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  }

  async function loadCartCount() {
    try {
      const res = await fetch(API_BASE + '/cart/' + CART_TOKEN + '/');
      setCartCount(await res.json());
    } catch (e) { /* le compteur reste à 0 */ }
  }

  async function loadProduct() {
    const box = document.getElementById('content');
    if (!productId) { box.innerHTML = notFound('Aucun produit sélectionné.'); return; }
    try {
      const res = await fetch(API_BASE + '/products/' + encodeURIComponent(productId) + '/');
      if (res.status === 404) { box.innerHTML = notFound('Ce produit n\'existe pas.'); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      product = await res.json();
    } catch (e) {
      box.innerHTML = notFound('Impossible de joindre l\'API. Le serveur Django est-il lancé ?');
      return;
    }
    renderProduct();
    loadSimilar();
  }

  function renderProduct() {
    const p = product;
    const available = p.is_active && p.stock > 0;
    const category = p.category_name || 'Sans catégorie';
    let status = 'En stock (' + p.stock + ' disponible' + (p.stock > 1 ? 's' : '') + ')';
    if (!p.is_active) status = 'Produit indisponible';
    else if (p.stock <= 0) status = 'Rupture de stock';

    document.title = p.name + ' — Emma Business';

    const imageHtml = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">'
      : "<span>Pas d'image</span>";
    const videoHtml = p.video
      ? '<video class="pvideo" controls preload="metadata" playsinline src="' + esc(p.video) + '"></video>' : '';
    const date = new Date(p.created_at).toLocaleDateString('fr-FR');
    const desc = esc(p.description) || 'Aucune description pour ce produit.';

    document.getElementById('content').innerHTML =
      '<nav class="crumbs"><a href="index.html">Boutique</a> › <span>' + esc(category) + '</span> › <span>' + esc(p.name) + '</span></nav>' +
      '<div class="detail">' +
      '<div class="gallery"><div class="media">' + imageHtml + '</div>' + videoHtml + '</div>' +
      '<div class="info">' +
      '<span class="tag">' + esc(category) + '</span>' +
      '<h1>' + esc(p.name) + '</h1>' +
      '<div class="price">' + Number(p.price).toFixed(2) + ' FCFA</div>' +
      '<div class="stockline ' + (available ? 'ok' : 'no') + '">' + status + '</div>' +
      '<p class="desc">' + desc + '</p>' +
      '<div class="buy">' +
      '<div class="qty"><button id="qMinus" aria-label="Moins">−</button><span id="qVal">1</span><button id="qPlus" aria-label="Plus">+</button></div>' +
      '<button id="addBtn" class="primary">Ajouter au panier</button>' +
      '</div>' +
      '<div id="msg" class="msg"></div>' +
      '<dl class="meta">' +
      '<div><dt>Catégorie</dt><dd>' + esc(category) + '</dd></div>' +
      '<div><dt>Ajouté le</dt><dd>' + date + '</dd></div>' +
      '</dl>' +
      '</div>' +
      '</div>';

    const minus = document.getElementById('qMinus');
    const plus = document.getElementById('qPlus');
    const addBtn = document.getElementById('addBtn');

    if (!available) {
      minus.disabled = true; plus.disabled = true; addBtn.disabled = true;
      addBtn.textContent = 'Indisponible';
      return;
    }
    minus.onclick = () => changeQty(-1);
    plus.onclick = () => changeQty(1);
    addBtn.onclick = addToCart;
  }

  function changeQty(delta) {
    qty = Math.min(product.stock, Math.max(1, qty + delta));
    document.getElementById('qVal').textContent = qty;
  }

  function showMsg(html, ok) {
    const el = document.getElementById('msg');
    el.className = 'msg ' + (ok ? 'ok' : 'err');
    el.innerHTML = html;
  }

  async function addToCart() {
    const btn = document.getElementById('addBtn');
    btn.disabled = true;
    try {
      const res = await fetch(API_BASE + '/cart/' + CART_TOKEN + '/items/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: product.id, quantity: qty })
      });
      if (!res.ok) throw new Error('http ' + res.status);
      setCartCount(await res.json());
      showMsg('✓ Ajouté au panier. <a href="index.html#panier">Voir mon panier</a>', true);
    } catch (e) {
      showMsg('Impossible d\'ajouter au panier pour le moment.', false);
    } finally {
      btn.disabled = false;
    }
  }

  async function loadSimilar() {
    if (!product.category) return;
    try {
      const res = await fetch(API_BASE + '/products/?is_active=true&category=' + product.category);
      const data = await res.json();
      const list = (data.results || data).filter(p => p.id !== product.id).slice(0, 4);
      if (!list.length) return;
      const cards = list.map(p =>
        '<a class="sim" href="details.html?id=' + p.id + '">' +
        '<div class="sim-img">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '') + '</div>' +
        '<div class="sim-name">' + esc(p.name) + '</div>' +
        '<div class="sim-price">' + Number(p.price).toFixed(2) + ' FCFA</div>' +
        '</a>'
      ).join('');
      document.getElementById('similar').innerHTML = '<h2>Dans la même catégorie</h2><div class="sim-grid">' + cards + '</div>';
    } catch (e) { /* pas de produits similaires, ce n'est pas grave */ }
  }

  loadCartCount();
  loadProduct();
})();


/* ---------- 4. Page dashboard (dashboard.html) ---------- */
(function dashboardPage() {
  if (!document.body.classList.contains('page-dashboard')) return;

  const PAGE_SIZE = 10;
  const MAX_VIDEO_MB = 50;
  const STATUS_LABEL = { pending: 'En attente', paid: 'Payée', cancelled: 'Annulée' };

  let ACCESS = localStorage.getItem('dash_access');
  let REFRESH = localStorage.getItem('dash_refresh');
  let me = null;
  let categories = [];
  let lowStock = 5;
  let catsOpen = false;
  let ordersById = {};
  let totalPages = 1;
  let seq = 0;
  const state = { view: 'overview', cat: '', page: 1, search: '', active: '', status: '' };

  const $ = id => document.getElementById(id);
  const money = n => Number(n || 0).toFixed(2) + ' FCFA';
  const fmtDate = d => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

  /* ---------- Utilitaires ---------- */
  let toastTimer;
  function toast(msg, isError) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'd-toast' + (isError ? ' d-err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  async function api(path, opts = {}) {
    opts.headers = Object.assign({}, opts.headers);
    if (ACCESS) opts.headers.Authorization = 'Bearer ' + ACCESS;
    if (opts.body && !(opts.body instanceof FormData)) opts.headers['Content-Type'] = 'application/json';
    let res = await fetch(API_BASE + path, opts);
    if (res.status === 401 && REFRESH) {
      const r = await fetch(API_BASE + '/auth/login/refresh/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: REFRESH })
      });
      if (r.ok) {
        ACCESS = (await r.json()).access;
        localStorage.setItem('dash_access', ACCESS);
        opts.headers.Authorization = 'Bearer ' + ACCESS;
        res = await fetch(API_BASE + path, opts);
      } else {
        logout();
      }
    }
    return res;
  }

  async function errMsg(res) {
    try {
      const d = await res.json();
      if (d.detail) return d.detail;
      return Object.entries(d).map(([k, v]) => k + ' : ' + [].concat(v).join(' ')).join(' — ');
    } catch (e) {
      return 'Erreur ' + res.status;
    }
  }

  function formError(id, msg) {
    const el = $(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  /* ---------- Connexion ---------- */
  function showLogin(msg) {
    $('app').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    const m = $('lgMsg');
    if (msg) { m.textContent = msg; m.classList.remove('hidden'); } else { m.classList.add('hidden'); }
  }

  function clearTokens() {
    ACCESS = null; REFRESH = null;
    localStorage.removeItem('dash_access');
    localStorage.removeItem('dash_refresh');
  }

  function logout() { clearTokens(); me = null; showLogin(); }

  async function login() {
    const username = $('lgUser').value.trim();
    const password = $('lgPass').value;
    try {
      const res = await fetch(API_BASE + '/auth/login/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
      });
      if (!res.ok) { showLogin('Identifiants invalides.'); return; }
      const d = await res.json();
      ACCESS = d.access; REFRESH = d.refresh;
      localStorage.setItem('dash_access', ACCESS);
      localStorage.setItem('dash_refresh', REFRESH);
      $('lgPass').value = '';
      await start();
    } catch (e) {
      showLogin("Impossible de joindre l'API. Le serveur Django est-il lancé ?");
    }
  }

  async function start() {
    if (!ACCESS) { showLogin(); return; }
    try {
      const res = await api('/auth/me/');
      if (!res.ok) { showLogin(); return; }
      me = await res.json();
    } catch (e) {
      showLogin("Impossible de joindre l'API. Le serveur Django est-il lancé ?");
      return;
    }
    if (!me.is_staff) {
      clearTokens();
      showLogin("Ce compte n'a pas les droits d'administration (« staff »).");
      return;
    }
    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('meName').textContent = me.username;
    await Promise.all([loadCategories(), refreshCounts()]);
    render();
  }

  /* ---------- Données de la barre latérale ---------- */
  async function loadCategories() {
    const res = await fetch(API_BASE + '/categories/');
    const d = await res.json();
    categories = d.results || d;
    renderNav();
  }

  async function refreshCounts() {
    try {
      const [p, o] = await Promise.all([api('/products/?page_size=1'), api('/orders/?status=pending&page_size=1')]);
      if (p.ok) $('cntProducts').textContent = (await p.json()).count;
      if (o.ok) {
        const n = (await o.json()).count;
        const el = $('cntPending');
        el.textContent = n;
        el.classList.toggle('hidden', !n);
      }
    } catch (e) { /* les compteurs restent tels quels */ }
  }

  function renderNav() {
    document.querySelectorAll('.d-nav-item[data-view]').forEach(b => {
      const isProducts = b.dataset.view === 'products';
      b.classList.toggle('active', b.dataset.view === state.view && (!isProducts || state.cat === ''));
    });
    $('catToggle').classList.toggle('active', state.view === 'products' && state.cat !== '');
    $('catToggle').classList.toggle('open', catsOpen);
    $('catList').classList.toggle('hidden', !catsOpen);
    $('catList').innerHTML = categories.map(c =>
      `<button class="d-sub-item${state.view === 'products' && String(state.cat) === String(c.id) ? ' active' : ''}" data-action="nav" data-view="products" data-cat="${c.id}">` +
      `<span>${esc(c.name)}</span><span class="d-count">${c.products_count}</span></button>`
    ).join('') + '<button class="d-sub-add" data-action="cat-new">+ Nouvelle catégorie</button>';
  }

  /* ---------- Affichage des écrans ---------- */
  function render() {
    renderNav();
    const title = $('viewTitle');
    const actions = $('viewActions');
    if (state.view === 'overview') {
      title.textContent = 'Tableau de bord';
      actions.innerHTML = '';
      renderOverview();
    } else if (state.view === 'products') {
      const cat = categories.find(c => String(c.id) === String(state.cat));
      title.textContent = cat ? cat.name : 'Tous les produits';
      actions.innerHTML =
        (cat ? '<button class="d-btn d-ghost" data-action="cat-edit">Renommer</button>' +
          '<button class="d-btn d-danger-ghost" data-action="cat-delete">Supprimer la catégorie</button>' : '') +
        '<button class="d-btn d-primary" data-action="product-new">+ Ajouter un produit</button>';
      renderProductsShell();
    } else {
      title.textContent = 'Commandes';
      actions.innerHTML = '';
      renderOrdersShell();
    }
  }

  async function afterChange() {
    await Promise.all([loadCategories(), refreshCounts()]);
    render();
  }

  /* ----- Tableau de bord ----- */
  async function renderOverview() {
    const v = $('view');
    v.innerHTML = '<div class="d-empty">Chargement…</div>';
    const my = ++seq;
    const res = await api('/dashboard/stats/');
    if (my !== seq) return;
    if (!res.ok) { v.innerHTML = '<div class="d-empty">' + esc(await errMsg(res)) + '</div>'; return; }
    const s = await res.json();
    lowStock = s.low_stock_threshold;
    const by = s.orders_by_status;
    v.innerHTML = `
      <div class="d-stats">
        <div class="d-stat"><span>Produits</span><strong>${s.products}</strong><small>${s.active_products} visibles en boutique</small></div>
        <div class="d-stat"><span>Catégories</span><strong>${s.categories}</strong></div>
        <div class="d-stat"><span>Commandes</span><strong>${s.orders}</strong><small>${by.pending} en attente</small></div>
        <div class="d-stat"><span>Chiffre d'affaires (payé)</span><strong>${money(s.revenue)}</strong><small>${money(s.pending_amount)} en attente</small></div>
      </div>
      <div class="d-grid2">
        <section class="d-panel"><h3>Commandes par statut</h3>
          ${Object.keys(STATUS_LABEL).map(k =>
      `<button class="d-row" data-action="nav" data-view="orders" data-status="${k}"><span class="d-badge ${k}">${STATUS_LABEL[k]}</span><strong>${by[k]}</strong></button>`
    ).join('')}
        </section>
        <section class="d-panel"><h3>Stock faible (${s.low_stock_threshold} ou moins)</h3>
          ${s.low_stock.length ? s.low_stock.map(p =>
      `<button class="d-row" data-action="product-edit" data-id="${p.id}"><span>${esc(p.name)}<small>${esc(p.category_name || 'Sans catégorie')}</small></span><strong class="${p.stock === 0 ? 'd-low' : ''}">${p.stock === 0 ? 'Rupture' : p.stock}</strong></button>`
    ).join('') : '<p class="d-muted">Aucun produit en stock faible.</p>'}
        </section>
      </div>
      <section class="d-panel"><h3>Dernières commandes</h3>
        ${s.recent_orders.length ? ordersTable(s.recent_orders) : '<p class="d-muted">Aucune commande pour le moment.</p>'}
      </section>`;
  }

  /* ----- Produits ----- */
  function renderProductsShell() {
    $('view').innerHTML = `
      <div class="d-toolbar">
        <input id="fSearch" class="d-input" placeholder="Rechercher un produit…" value="${esc(state.search)}">
        <select id="fActive" class="d-input" data-change="filter-active">
          <option value="">Tous les états</option><option value="true">Visibles</option><option value="false">Masqués</option>
        </select>
      </div>
      <div id="tableBox"></div>`;
    $('fActive').value = state.active;
    loadProducts();
  }

  async function loadProducts() {
    const box = $('tableBox');
    box.innerHTML = '<div class="d-empty">Chargement…</div>';
    const q = new URLSearchParams({ page: state.page, page_size: PAGE_SIZE });
    if (state.cat) q.set('category', state.cat);
    if (state.search) q.set('search', state.search);
    if (state.active) q.set('is_active', state.active);
    const my = ++seq;
    const res = await api('/products/?' + q.toString());
    if (my !== seq) return;
    if (res.status === 404 && state.page > 1) { state.page = 1; return loadProducts(); }
    if (!res.ok) { box.innerHTML = '<div class="d-empty">' + esc(await errMsg(res)) + '</div>'; return; }
    const d = await res.json();
    totalPages = Math.max(1, Math.ceil(d.count / PAGE_SIZE));
    if (!d.results.length) { box.innerHTML = '<div class="d-empty">Aucun produit.</div>'; return; }
    box.innerHTML = `<div class="d-tablewrap"><table class="d-table">
      <thead><tr><th></th><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>Boutique</th><th></th></tr></thead>
      <tbody>${d.results.map(p => `<tr>
        <td><div class="d-thumb">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}</div></td>
        <td><strong>${esc(p.name)}</strong>${p.video ? '<small>▶ Video</small>' : ''}</td>
        <td>${esc(p.category_name || '—')}</td>
        <td>${money(p.price)}</td>
        <td class="${p.stock <= lowStock ? 'd-low' : ''}">${p.stock === 0 ? 'Rupture' : p.stock}</td>
        <td><button class="d-badge ${p.is_active ? 'on' : 'off'}" data-action="toggle-active" data-id="${p.id}" data-active="${p.is_active}" title="Cliquer pour changer">${p.is_active ? 'Visible' : 'Masqué'}</button></td>
        <td class="d-actions">
          <button class="d-btn d-ghost d-sm" data-action="product-edit" data-id="${p.id}">Modifier</button>
          <button class="d-btn d-danger-ghost d-sm" data-action="product-delete" data-id="${p.id}" data-name="${esc(p.name)}">Supprimer</button>
        </td></tr>`).join('')}</tbody></table></div>` + pager(d.count);
  }

  function pager(count) {
    return `<div class="d-pager"><span>${count} résultat${count > 1 ? 's' : ''}</span><div>
      <button class="d-btn d-ghost d-sm" data-action="page" data-dir="-1" ${state.page <= 1 ? 'disabled' : ''}>← Précédent</button>
      <span>Page ${state.page} / ${totalPages}</span>
      <button class="d-btn d-ghost d-sm" data-action="page" data-dir="1" ${state.page >= totalPages ? 'disabled' : ''}>Suivant →</button>
    </div></div>`;
  }

  function productForm(p) {
    const isEdit = !!p;
    p = p || { name: '', price: '', stock: 0, description: '', category: state.cat || '', is_active: true };
    openModal(`
      <h3>${isEdit ? 'Modifier le produit' : 'Ajouter un produit'}</h3>
      <div class="d-form">
        <div class="d-field d-span2"><label class="d-label">Nom</label><input id="pfName" class="d-input" value="${esc(p.name)}"></div>
        <div class="d-field"><label class="d-label">Prix (FCFA)</label><input id="pfPrice" class="d-input" type="number" step="0.01" min="0" value="${esc(p.price)}"></div>
        <div class="d-field"><label class="d-label">Stock</label><input id="pfStock" class="d-input" type="number" min="0" value="${esc(p.stock)}"></div>
        <div class="d-field d-span2"><label class="d-label">Catégorie</label>
          <select id="pfCat" class="d-input"><option value="">— Aucune —</option>${categories.map(c =>
      `<option value="${c.id}" ${String(c.id) === String(p.category) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="d-field d-span2"><label class="d-label">Description</label><textarea id="pfDesc" class="d-input" rows="4">${esc(p.description)}</textarea></div>
        <div class="d-field d-span2"><label class="d-label">Image ${isEdit && p.image ? "(laisser vide pour garder l'image actuelle)" : ''}</label><input id="pfImage" class="d-input" type="file" accept="image/*"></div>
        <div class="d-field d-span2"><label class="d-label">Vidéo courte (mp4 ou webm, ${MAX_VIDEO_MB} Mo max)</label><input id="pfVideo" class="d-input" type="file" accept="video/mp4,video/webm">
           ${isEdit && p.video ? '<label class="d-check"><input id="pfVideoClear" type="checkbox"> Supprimer la vidéo actuelle</label>' : ''}</div>
        <label class="d-check d-span2"><input id="pfActive" type="checkbox" ${p.is_active ? 'checked' : ''}> Visible dans la boutique</label>
      </div>
      <div id="pfMsg" class="d-alert hidden"></div>
      <div class="d-modal-actions">
        <button class="d-btn d-ghost" data-action="close-modal">Annuler</button>
        <button class="d-btn d-primary" data-action="product-save" data-id="${isEdit ? p.id : ''}">Enregistrer</button>
      </div>`);
  }

  async function productSave(id) {
    const name = $('pfName').value.trim();
    const price = $('pfPrice').value;
    if (!name || price === '') { formError('pfMsg', 'Le nom et le prix sont obligatoires.'); return; }
    const fd = new FormData();
    fd.append('name', name);
    fd.append('price', price);
    fd.append('stock', $('pfStock').value || 0);
    fd.append('category', $('pfCat').value);
    fd.append('description', $('pfDesc').value);
    fd.append('is_active', $('pfActive').checked ? 'true' : 'false');
    const file = $('pfImage').files[0];
    if (file) fd.append('image', file);
    const video = $('pfVideo').files[0];
    if (video) {
      if (video.size > MAX_VIDEO_MB * 1024 * 1024) {
        formError('pfMsg', 'La vidéo est trop lourde (' + (video.size / 1048576).toFixed(1) + ' Mo). Maximum : ' + MAX_VIDEO_MB + ' Mo.');
        return;
      }
      fd.append('video', video);
    } else if ($('pfVideoClear') && $('pfVideoClear').checked) {
      fd.append('video', '');
    }
    const saveBtn = document.querySelector('#modalBox [data-action="product-save"]');
    saveBtn.disabled = true; saveBtn.textContent = 'Envoi en cours…';
    const res = await api(id ? '/products/' + id + '/' : '/products/', { method: id ? 'PATCH' : 'POST', body: fd });
    if (!res.ok) { saveBtn.disabled = false; saveBtn.textContent = 'Enregistrer'; formError('pfMsg', await errMsg(res)); return; }
    closeModal();
    toast(id ? 'Produit mis à jour.' : 'Produit ajouté.');
    await afterChange();
  }

  /* ----- Catégories ----- */
  function categoryForm(c) {
    openModal(`
      <h3>${c ? 'Renommer la catégorie' : 'Nouvelle catégorie'}</h3>
      <div class="d-form">
        <div class="d-field d-span2"><label class="d-label">Nom</label><input id="cfName" class="d-input" value="${esc(c ? c.name : '')}"></div>
        <div class="d-field d-span2"><label class="d-label">Description (optionnel)</label><textarea id="cfDesc" class="d-input" rows="3">${esc(c ? c.description : '')}</textarea></div>
      </div>
      <div id="cfMsg" class="d-alert hidden"></div>
      <div class="d-modal-actions">
        <button class="d-btn d-ghost" data-action="close-modal">Annuler</button>
        <button class="d-btn d-primary" data-action="cat-save" data-id="${c ? c.id : ''}">Enregistrer</button>
      </div>`);
  }

  async function catSave(id) {
    const name = $('cfName').value.trim();
    if (!name) { formError('cfMsg', 'Le nom est obligatoire.'); return; }
    const res = await api(id ? '/categories/' + id + '/' : '/categories/', {
      method: id ? 'PATCH' : 'POST', body: JSON.stringify({ name, description: $('cfDesc').value })
    });
    if (!res.ok) { formError('cfMsg', await errMsg(res)); return; }
    const saved = await res.json();
    closeModal();
    toast(id ? 'Catégorie mise à jour.' : 'Catégorie créée.');
    if (!id) { state.view = 'products'; state.cat = String(saved.id); state.page = 1; state.search = ''; state.active = ''; catsOpen = true; }
    await afterChange();
  }

  /* ----- Commandes ----- */
  function statusSelect(o) {
    return `<select class="d-input d-status ${o.status}" data-change="order-status" data-id="${o.id}">` +
      Object.keys(STATUS_LABEL).map(k => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${STATUS_LABEL[k]}</option>`).join('') + '</select>';
  }

  function ordersTable(list) {
    list.forEach(o => { ordersById[o.id] = o; });
    return `<div class="d-tablewrap"><table class="d-table">
      <thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Total</th><th>Statut</th><th></th></tr></thead>
      <tbody>${list.map(o => `<tr>
        <td>#${o.id}</td>
        <td>${esc(o.guest_name || 'Invité')}<small>${esc(o.guest_phone)}</small><small>${esc(o.guest_email)}</small></td>
        <td>${fmtDate(o.created_at)}</td>
        <td>${money(o.total)}</td>
        <td>${statusSelect(o)}</td>
        <td class="d-actions"><button class="d-btn d-ghost d-sm" data-action="order-open" data-id="${o.id}">Détails</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function renderOrdersShell() {
    const tabs = [['', 'Toutes'], ['pending', 'En attente'], ['paid', 'Payées'], ['cancelled', 'Annulées']];
    $('view').innerHTML = `
      <div class="d-toolbar">
        <div class="d-tabs">${tabs.map(t => `<button class="d-tab${state.status === t[0] ? ' active' : ''}" data-action="order-tab" data-status="${t[0]}">${t[1]}</button>`).join('')}</div>
        <input id="fSearch" class="d-input" placeholder="Rechercher un client (nom, téléphone ou email)…" value="${esc(state.search)}">
      </div>
      <div id="tableBox"></div>`;
    loadOrders();
  }

  async function loadOrders() {
    const box = $('tableBox');
    box.innerHTML = '<div class="d-empty">Chargement…</div>';
    const q = new URLSearchParams({ page: state.page, page_size: PAGE_SIZE });
    if (state.status) q.set('status', state.status);
    if (state.search) q.set('search', state.search);
    const my = ++seq;
    const res = await api('/orders/?' + q.toString());
    if (my !== seq) return;
    if (res.status === 404 && state.page > 1) { state.page = 1; return loadOrders(); }
    if (!res.ok) { box.innerHTML = '<div class="d-empty">' + esc(await errMsg(res)) + '</div>'; return; }
    const d = await res.json();
    totalPages = Math.max(1, Math.ceil(d.count / PAGE_SIZE));
    if (!d.results.length) { box.innerHTML = '<div class="d-empty">Aucune commande.</div>'; return; }
    box.innerHTML = ordersTable(d.results) + pager(d.count);
  }

  function orderModal(o) {
    openModal(`
      <h3>Commande #${o.id}</h3>
      <div class="d-meta">
        <div><span>Client</span><strong>${esc(o.guest_name || 'Invité')}</strong></div>
        <div><span>Email</span><strong>${esc(o.guest_email || '—')}</strong></div>
        <div><span>Téléphone</span><strong>${esc(o.guest_phone || '-')}</strong></div>
        <div><span>Adresse</span><strong>${esc(o.guest_address || '-')}</strong></div>
        <div><span>Date</span><strong>${fmtDate(o.created_at)}</strong></div>
        <div><span>Statut</span>${statusSelect(o)}</div>
      </div>
      <div class="d-tablewrap"><table class="d-table">
        <thead><tr><th>Produit</th><th>Prix unitaire</th><th>Qté</th><th>Sous-total</th></tr></thead>
        <tbody>${o.items.map(i => `<tr><td>${esc(i.product_name)}</td><td>${money(i.unit_price)}</td><td>${i.quantity}</td><td>${money(i.unit_price * i.quantity)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="d-total">Total<strong>${money(o.total)}</strong></div>
      <div class="d-modal-actions"><button class="d-btn d-ghost" data-action="close-modal">Fermer</button></div>`);
  }

  /* ---------- Fenêtre modale ---------- */
  /* ---------- Changement de mot de passe ---------- */
  function passwordForm() {
    openModal(`
      <h3>Changer le mot de passe</h3>
      <div class="d-form">
        <div class="d-field d-span2"><label class="d-label">Mot de passe actuel</label><input id="pwOld" class="d-input" type="password" autocomplete="current-password"></div>
        <div class="d-field d-span2"><label class="d-label">Nouveau mot de passe (8 caractères minimum)</label><input id="pwNew" class="d-input" type="password" autocomplete="new-password"></div>
        <div class="d-field d-span2"><label class="d-label">Confirmer le nouveau mot de passe</label><input id="pwConfirm" class="d-input" type="password" autocomplete="new-password"></div>
      </div>
      <div id="pwMsg" class="d-alert hidden"></div>
      <div class="d-modal-actions">
        <button class="d-btn d-ghost" data-action="close-modal">Annuler</button>
        <button class="d-btn d-primary" data-action="password-save">Enregistrer</button>
      </div>`);
  }

  async function passwordSave() {
    const oldPw = $('pwOld').value;
    const newPw = $('pwNew').value;
    if (!oldPw || !newPw) { formError('pwMsg', 'Remplis le mot de passe actuel et le nouveau.'); return; }
    if (newPw.length < 8) { formError('pwMsg', 'Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (newPw !== $('pwConfirm').value) { formError('pwMsg', 'La confirmation ne correspond pas au nouveau mot de passe.'); return; }

    const btn = document.querySelector('#modalBox [data-action="password-save"]');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    let res;
    try {
      res = await api('/auth/change-password/', { method: 'POST', body: JSON.stringify({ old_password: oldPw, new_password: newPw }) });
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      formError('pwMsg', 'Connexion impossible. Réessaie dans un instant.');
      return;
    }
    if (!res.ok) {
      btn.disabled = false; btn.textContent = 'Enregistrer';
      formError('pwMsg', await errMsg(res));
      return;
    }
    closeModal();
    logout();   // les anciennes sessions sont invalidées : on se reconnecte avec le nouveau mot de passe
    toast('Mot de passe modifié. Connecte-toi avec le nouveau mot de passe.');
  }

  function openModal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); $('modalBox').innerHTML = ''; }
  const modalIsOpen = () => !$('modal').classList.contains('hidden');

  /* ---------- Actions (clics) ---------- */
  const actions = {
    login,
    logout,
    'close-modal': closeModal,
    nav(el) {
      state.view = el.dataset.view;
      state.cat = el.dataset.cat || '';
      state.status = el.dataset.status || '';
      state.page = 1; state.search = ''; state.active = '';
      if (state.cat) catsOpen = true;
      render();
    },
    'toggle-cats'() { catsOpen = !catsOpen; renderNav(); },
    page(el) {
      state.page += Number(el.dataset.dir);
      if (state.view === 'products') loadProducts(); else loadOrders();
    },
    'order-tab'(el) { state.status = el.dataset.status; state.page = 1; renderOrdersShell(); },
    'order-open'(el) { const o = ordersById[el.dataset.id]; if (o) orderModal(o); },
    'product-new'() { productForm(null); },
    async 'product-edit'(el) {
      const res = await api('/products/' + el.dataset.id + '/');
      if (res.ok) productForm(await res.json()); else toast(await errMsg(res), true);
    },
    'product-save'(el) { return productSave(el.dataset.id); },
    async 'product-delete'(el) {
      if (!confirm('Supprimer « ' + el.dataset.name + ' » ? Cette action est définitive.')) return;
      const res = await api('/products/' + el.dataset.id + '/', { method: 'DELETE' });
      if (res.ok || res.status === 204) { toast('Produit supprimé.'); await afterChange(); } else { toast(await errMsg(res), true); }
    },
    async 'toggle-active'(el) {
      const makeActive = el.dataset.active !== 'true';
      const res = await api('/products/' + el.dataset.id + '/', { method: 'PATCH', body: JSON.stringify({ is_active: makeActive }) });
      if (res.ok) { toast(makeActive ? 'Produit visible en boutique.' : 'Produit masqué de la boutique.'); loadProducts(); } else { toast(await errMsg(res), true); }
    },
    'cat-new'() { categoryForm(null); },
    'password-open'() { passwordForm(); },
    'password-save'() { return passwordSave(); },
    'cat-edit'() { categoryForm(categories.find(c => String(c.id) === String(state.cat))); },
    'cat-save'(el) { return catSave(el.dataset.id); },
    async 'cat-delete'() {
      const c = categories.find(x => String(x.id) === String(state.cat));
      if (!c) return;
      if (!confirm('Supprimer la catégorie « ' + c.name + ' » ?\nSes ' + c.products_count + " produit(s) ne seront pas supprimés, ils n'auront simplement plus de catégorie.")) return;
      const res = await api('/categories/' + c.id + '/', { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        toast('Catégorie supprimée.');
        state.cat = ''; state.page = 1;
        await afterChange();
      } else { toast(await errMsg(res), true); }
    }
  };

  const changes = {
    async 'order-status'(el) {
      const id = el.dataset.id;
      const res = await api('/orders/' + id + '/', { method: 'PATCH', body: JSON.stringify({ status: el.value }) });
      if (res.ok) {
        const o = await res.json();
        ordersById[o.id] = o;
        toast('Commande #' + o.id + ' : ' + STATUS_LABEL[o.status] + '.');
      } else {
        toast(await errMsg(res), true);
      }
      await afterChange();
      if (modalIsOpen() && ordersById[id]) orderModal(ordersById[id]);
    },
    'filter-active'(el) { state.active = el.value; state.page = 1; loadProducts(); }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'close-modal' && e.target !== el) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
  });
  let searchTimer;
  document.addEventListener('input', e => {
    if (e.target.id !== 'fSearch') return;
    state.search = e.target.value.trim();
    state.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (state.view === 'products') loadProducts(); else loadOrders(); }, 300);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && e.target.id === 'lgPass') login();
  });

  start();
})();
