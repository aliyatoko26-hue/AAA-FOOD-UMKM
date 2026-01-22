/* =========================================================
   AAA-FOOD-UMKM - app.js (RAPIH) - BAGIAN 1/3
   - Firestore realtime (onSnapshot)
   - Public UI (toko, produk, chip, search)
   - Cart + Buyer pakai localStorage
   - Admin Auth (login/logout + buka panel) + Settings adminPhone
   - ADMIN CRUD lengkap ada di BAGIAN 2 & 3 (akan menyusul)
   ========================================================= */

/* =========================
   FIREBASE IMPORTS (CDN)
   ========================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getFirestore,
  collection, doc,
  setDoc, updateDoc, deleteDoc,
  addDoc,
  writeBatch,
  onSnapshot,
  query, orderBy,
  where, getDocs
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

/* =========================
   FIREBASE CONFIG (PUNYA KAMU)
   ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyAClMaevpnm23nhhj4Gl1k8VGhpOn0hVSY",
  authDomain: "aaa-food-umkm.firebaseapp.com",
  projectId: "aaa-food-umkm",
  storageBucket: "aaa-food-umkm.firebasestorage.app",
  messagingSenderId: "580208707813",
  appId: "1:580208707813:web:9820a5aab34e01751a6c0c",
  measurementId: "G-76NXWLTN7L"
};

// init firebase
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

/* =========================
   HELPERS
   ========================= */
const $ = (id) => document.getElementById(id);

const fmtRupiah = (n) => new Intl.NumberFormat("id-ID").format(Number(n || 0));

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function waLink(phone, text) {
  const msg = encodeURIComponent(text || "");
  const p = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${p}?text=${msg}`;
}

// konversi link Google Drive share -> direct image
function driveToDirect(url) {
  const u = (url || "").trim();
  if (!u) return "";

  if (u.includes("lh3.googleusercontent.com/d/")) return u;
  if (u.includes("drive.google.com/thumbnail")) return u;
  if (u.includes("drive.google.com/uc?")) return u;

  const m1 = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  const m2 = u.match(/[?&]id=([^&]+)/);
  const fileId = (m1 && m1[1]) || (m2 && m2[1]) || "";
  if (!fileId) return u;

  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "T";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}

/* =========================
   LOCAL STORAGE
   ========================= */
const KEY_CART = "df_cart_v3";
const KEY_BUYER = "df_buyer_v3";

function loadJSONLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJSONLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureLocal() {
  try {
    if (!localStorage.getItem(KEY_CART)) saveJSONLocal(KEY_CART, []);
    if (!localStorage.getItem(KEY_BUYER)) saveJSONLocal(KEY_BUYER, { name: "", phone: "", address: "", note: "" });
  } catch (e) {
    console.warn("LocalStorage tidak tersedia:", e);
  }
}
ensureLocal();

/* =========================
   LIVE CACHE (DARI FIRESTORE REALTIME)
   ========================= */
let liveSettings = { adminPhone: "" }; // settings/main
let liveStores = [];                   // stores
let liveProducts = [];                 // products

/* =========================
   UI STATE
   ========================= */
let state = { activeStoreId: null, chip: "all", search: "" };
let adminState = { storeSearch: "", productSearch: "" };
let adminUser = null;

/* =========================
   FOOTER YEAR
   ========================= */
if ($("yearNow")) $("yearNow").textContent = new Date().getFullYear();

/* =========================
   SETTINGS
   ========================= */
function getAdminPhone() {
  return String(liveSettings?.adminPhone || "").replace(/\D/g, "");
}

function renderFooterWA() {
  const phone = getAdminPhone();
  const btn = $("btnFooterWA");
  if (!btn) return;

  btn.onclick = () => {
    if (!phone) return alert("Nomor WhatsApp admin belum diisi (settings/main).");
    window.open(waLink(phone, "Halo Admin, saya mau tanya soal produk/pesanan."), "_blank");
  };
}

/* =========================
   BUYER (LOCAL)
   ========================= */
function getBuyer() {
  return loadJSONLocal(KEY_BUYER, { name: "", phone: "", address: "", note: "" });
}
function setBuyer(d) {
  saveJSONLocal(KEY_BUYER, d);
}

function bindBuyerInputsOnce() {
  if (!$("buyerName")) return;
  if ($("buyerName").dataset.bound === "1") return;
  $("buyerName").dataset.bound = "1";

  const b = getBuyer();
  $("buyerName").value = b.name || "";
  $("buyerPhone").value = b.phone || "";
  $("buyerAddress").value = b.address || "";
  $("buyerNote").value = b.note || "";

  const saveNow = () => {
    setBuyer({
      name: ($("buyerName").value || "").trim(),
      phone: ($("buyerPhone").value || "").trim(),
      address: ($("buyerAddress").value || "").trim(),
      note: ($("buyerNote").value || "").trim(),
    });
    renderCart(); // refresh link cadangan
  };

  $("buyerName").addEventListener("input", saveNow);
  $("buyerPhone").addEventListener("input", saveNow);
  $("buyerAddress").addEventListener("input", saveNow);
  $("buyerNote").addEventListener("input", saveNow);
}

/* =========================
   CART (LOCAL)
   ========================= */
function getCart() { return loadJSONLocal(KEY_CART, []); }
function setCart(items) { saveJSONLocal(KEY_CART, items); }
function cartCount() { return getCart().reduce((sum, it) => sum + (it.qty || 0), 0); }

function updateCartBadge() {
  const n = cartCount();
  const badge = $("cartBadge");
  if (!badge) return;
  if (n > 0) {
    badge.textContent = n;
    badge.classList.remove("hidden-soft");
  } else {
    badge.classList.add("hidden-soft");
  }
}

function cartKey(productId, variantId) {
  return `${productId}__${variantId || "default"}`;
}

function addToCart(productId, variantId) {
  const cart = getCart();
  const key = cartKey(productId, variantId);
  const idx = cart.findIndex(x => x.key === key);

  if (idx >= 0) cart[idx].qty += 1;
  else cart.push({ key, productId, variantId: variantId || null, qty: 1 });

  setCart(cart);
  updateCartBadge();
}

function incCart(key) {
  const cart = getCart();
  const idx = cart.findIndex(x => x.key === key);
  if (idx >= 0) cart[idx].qty += 1;
  setCart(cart);
  renderCart();
  updateCartBadge();
}

function decCart(key) {
  const cart = getCart();
  const idx = cart.findIndex(x => x.key === key);
  if (idx >= 0) {
    cart[idx].qty -= 1;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
  }
  setCart(cart);
  renderCart();
  updateCartBadge();
}

function removeCart(key) {
  const cart = getCart().filter(x => x.key !== key);
  setCart(cart);
  renderCart();
  updateCartBadge();
}

function getVariant(product, variantId) {
  const vars = Array.isArray(product.variants) ? product.variants : [];
  if (!variantId) return null;
  return vars.find(v => v.id === variantId) || null;
}

function itemPrice(product, variantId) {
  const v = getVariant(product, variantId);
  if (v && typeof v.price === "number") return v.price;
  return Number(product.price || 0);
}

function validateBuyerRequired() {
  const b = getBuyer();
  const ok = (b.name || "").trim().length > 0 && (b.address || "").trim().length > 0;
  if (!ok) {
    $("buyerWarn")?.classList.remove("hidden-soft");
    setTimeout(() => $("buyerWarn")?.classList.add("hidden-soft"), 1800);
    return false;
  }
  return true;
}

function buildCheckoutText(cartItems, productsMap, storesMap) {
  const buyer = getBuyer();
  const lines = ["Halo Admin, saya mau checkout pesanan ini:", ""];

  lines.push("== DATA PEMBELI ==");
  lines.push(`Nama: ${buyer.name || "-"}`);
  lines.push(`No HP: ${buyer.phone || "-"}`);
  lines.push(`Alamat: ${buyer.address || "-"}`);
  lines.push(`Catatan: ${buyer.note || "-"}`);
  lines.push("");

  let total = 0;
  lines.push("== PESANAN ==");

  cartItems.forEach((it, i) => {
    const p = productsMap.get(it.productId);
    if (!p) return;
    const s = storesMap.get(p.storeId);
    const v = getVariant(p, it.variantId);
    const price = itemPrice(p, it.variantId);
    const sub = price * Number(it.qty || 0);
    total += sub;

    lines.push(
      `${i + 1}. ${p.name}${v ? " - " + v.name : ""} (x${it.qty})`,
      `   - Toko: ${s?.name || "-"}`,
      `   - Harga: Rp ${fmtRupiah(price)}`,
      `   - Subtotal: Rp ${fmtRupiah(sub)}`
    );
  });

  lines.push("");
  lines.push(`TOTAL: Rp ${fmtRupiah(total)}`);
  return lines.join("\n");
}

function renderCart() {
  bindBuyerInputsOnce();

  const cart = getCart();
  const storesMap = new Map((liveStores || []).map(s => [s.id, s]));
  const productsMap = new Map((liveProducts || []).map(p => [p.id, p]));

  const box = $("cartList");
  if (!box) return;
  box.innerHTML = "";

  if (cart.length === 0) {
    $("cartTotal").textContent = "Rp 0";
    $("btnCheckoutWA").href = "#";
    box.innerHTML = `
      <div class="bg-white rounded-3xl border border-slate-200 p-5 text-center text-slate-600">
        Keranjang masih kosong.
      </div>
    `;
    return;
  }

  let total = 0;

  cart.forEach(it => {
    const p = productsMap.get(it.productId);
    if (!p) return;
    const s = storesMap.get(p.storeId);
    const v = getVariant(p, it.variantId);
    const price = itemPrice(p, it.variantId);
    const sub = price * Number(it.qty || 0);
    total += sub;

    const row = document.createElement("div");
    row.className = "rounded-3xl border border-slate-200 p-4 bg-white";
    row.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-extrabold">
            ${p.name}
            ${v ? `<span class="text-sm font-semibold text-slate-600"> • ${v.name}</span>` : ""}
          </div>
          <div class="text-sm text-slate-500">${s?.name || "-"}</div>
          <div class="text-sm text-slate-700 mt-1">Rp ${fmtRupiah(price)} × ${it.qty} = <b>Rp ${fmtRupiah(sub)}</b></div>
        </div>

        <button class="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-700 font-semibold" data-del>
          Hapus
        </button>
      </div>

      <div class="mt-3 flex items-center gap-2">
        <button class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold" data-dec>-</button>
        <div class="px-3 py-2 rounded-xl bg-slate-900 text-white font-extrabold">${it.qty}</div>
        <button class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold" data-inc>+</button>
      </div>
    `;

    row.querySelector("[data-inc]").onclick = () => incCart(it.key);
    row.querySelector("[data-dec]").onclick = () => decCart(it.key);
    row.querySelector("[data-del]").onclick = () => removeCart(it.key);

    box.appendChild(row);
  });

  $("cartTotal").textContent = `Rp ${fmtRupiah(total)}`;

  // href cadangan
  const phone = getAdminPhone();
  $("btnCheckoutWA").href = phone ? waLink(phone, buildCheckoutText(cart, productsMap, storesMap)) : "#";
}

/* =========================
   PUBLIC: STORES RENDER
   ========================= */
function renderStoreRow() {
  const stores = liveStores || [];
  let list = [...stores];

  // pinned dulu
  list.sort((a, b) => (b.pinned === true) - (a.pinned === true));

  const row = $("storeRow");
  if (!row) return;
  row.innerHTML = "";

  if (state.activeStoreId) {
    list = list.filter(s => s.id === state.activeStoreId);
    $("btnBackStore")?.classList.remove("hidden-soft");
    const s = stores.find(x => x.id === state.activeStoreId);
    $("storeTitle").textContent = s ? s.name : "Toko";
  } else {
    $("btnBackStore")?.classList.add("hidden-soft");
    $("storeTitle").textContent = "Semua Toko";
  }

  $("storeCount").textContent = `${list.length} toko`;

  if (list.length === 0) {
    row.innerHTML = `
      <div class="w-full bg-white rounded-3xl border border-slate-200 p-5 text-center text-slate-600">
        Belum ada toko.
      </div>
    `;
    return;
  }

  list.forEach(store => {
    const openBadge = store.open
      ? `<span class="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">BUKA</span>`
      : `<span class="text-[10px] px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-bold">TUTUP</span>`;

    const avatar = store.photo
      ? `<img src="${store.photo}" class="w-16 h-16 rounded-full object-cover ring-2 ring-slate-900" />`
      : `<div class="w-16 h-16 rounded-full bg-slate-900 text-white grid place-items-center font-extrabold ring-2 ring-slate-900">${initials(store.name)}</div>`;

    const btn = document.createElement("button");
    btn.className = "shrink-0 w-[110px] mx-auto text-center";
    btn.innerHTML = `
      <div class="mx-auto w-16 h-16">${avatar}</div>
      <div class="mt-2 text-xs font-bold leading-tight line-clamp-2">${store.name}</div>
      <div class="mt-1 flex justify-center">${openBadge}</div>
    `;

    btn.onclick = () => {
      // kalau sudah pilih toko, jangan ganti biar sesuai request kamu
      if (!state.activeStoreId) {
        state.activeStoreId = store.id;
        renderStoreRow();
        renderProducts();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    row.appendChild(btn);
  });
}

/* =========================
   CHIP + SEARCH
   ========================= */
function setChip(chip) {
  state.chip = chip;
  renderProducts();
}
function setChipUI(chip) {
  const all = $("chipAll");
  const pin = $("chipPinned");
  const open = $("chipOpenOnly");
  if (!all || !pin || !open) return;

  const reset = (btn) => btn.className =
    "chip px-3 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50";
  reset(all); reset(pin); reset(open);

  const active = (btn) => btn.className =
    "chip px-3 py-2 rounded-full text-sm font-semibold bg-slate-900 text-white";

  if (chip === "all") active(all);
  if (chip === "pinned") active(pin);
  if (chip === "openOnly") active(open);
}

/* =========================
   PUBLIC: PRODUCTS RENDER
   ========================= */
function renderProducts() {
  const stores = liveStores || [];
  const products = liveProducts || [];
  const storeMap = new Map(stores.map(s => [s.id, s]));

  const grid = $("productGrid");
  if (!grid) return;
  grid.innerHTML = "";

  let list = [...products];

  // filter by store (INI YANG BIKIN "klik toko -> hanya produk toko itu")
  if (state.activeStoreId) list = list.filter(p => p.storeId === state.activeStoreId);

  if (state.chip === "pinned") list = list.filter(p => p.pinned === true);
  if (state.chip === "openOnly") list = list.filter(p => (storeMap.get(p.storeId)?.open) === true);

  // search
  const q = (state.search || "").trim().toLowerCase();
  if (q) {
    list = list.filter(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.desc || "").toLowerCase().includes(q)
    );
  }

  const activeStore = state.activeStoreId ? storeMap.get(state.activeStoreId) : null;
  $("productTitle").textContent = activeStore ? `Produk - ${activeStore.name}` : "Produk (Semua Toko)";

  // pinned dulu
  list.sort((a, b) => (b.pinned === true) - (a.pinned === true));
  $("productCount").textContent = `${list.length} produk`;

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-white rounded-3xl border border-slate-200 p-6 text-center text-slate-600">
        Tidak ada produk yang cocok.
      </div>
    `;
    return;
  }

  list.forEach(p => {
    const store = storeMap.get(p.storeId);
    const isOpen = store?.open === true;

    const status = isOpen
      ? `<span class="px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Toko buka</span>`
      : `<span class="px-2 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">Toko tutup</span>`;

    const pinned = p.pinned
      ? `<span class="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Best Seller</span>`
      : ``;

    const photo = p.photo
      ? `<img src="${p.photo}" class="w-full h-44 object-cover rounded-2xl border border-slate-200" />`
      : `<div class="w-full h-44 rounded-2xl border border-slate-200 bg-slate-100 grid place-items-center text-slate-500 font-bold">FOTO PRODUK</div>`;

    const vars = Array.isArray(p.variants) ? p.variants : [];
    const varList = (vars.length > 0)
      ? vars.map(v => ({
          id: v.id,
          name: v.name,
          price: (typeof v.price === "number" ? v.price : Number(p.price || 0))
        }))
      : [{ id: "default", name: "Default", price: Number(p.price || 0) }];

    const variantChips = varList.map((v, idx) => `
      <label class="${isOpen ? "cursor-pointer" : "cursor-not-allowed"}">
        <input type="radio" name="var_${p.id}" value="${v.id}" class="hidden"
          ${idx === 0 ? "checked" : ""} ${!isOpen ? "disabled" : ""} />
        <div class="px-3 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 transition
                    ${!isOpen ? "opacity-60" : ""}" data-chip>
          <div class="leading-tight">${v.name}</div>
          <div class="text-xs text-slate-500 font-bold">Rp ${fmtRupiah(v.price)}</div>
        </div>
      </label>
    `).join("");

    const card = document.createElement("div");
    card.className = "bg-white rounded-3xl border border-slate-200 p-4";
    card.innerHTML = `
      ${photo}

      <div class="mt-3 flex items-start justify-between gap-2">
        <div>
          <div class="font-extrabold leading-snug">${p.name}</div>
          <div class="text-xs text-slate-500 mt-1">${store?.name || "-"}</div>
        </div>
        <div class="flex items-center gap-1">${pinned}${status}</div>
      </div>

      <div class="mt-2 text-slate-600 text-sm line-clamp-2">${p.desc || ""}</div>

      <div class="mt-3">
        <div class="flex items-center justify-between">
          <div class="text-xs font-extrabold text-slate-700">Pilih Varian</div>
          <div class="text-[11px] text-slate-500">${varList.length} pilihan</div>
        </div>

        <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2" data-varwrap>
          ${variantChips}
        </div>
      </div>

      <div class="mt-3 flex items-center justify-between">
        <div class="text-base font-extrabold" data-price>Rp ${fmtRupiah(varList[0].price)}</div>

        <div class="flex gap-2">
          <button class="px-4 py-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 font-semibold
                         ${!isOpen ? "opacity-50 cursor-not-allowed" : ""}"
                  data-add ${!isOpen ? "disabled" : ""}>
            + Keranjang
          </button>

          <button class="px-4 py-2 rounded-2xl bg-slate-900 text-white font-semibold hover:bg-slate-800
                         ${!isOpen ? "opacity-50 cursor-not-allowed" : ""}"
                  data-wa ${!isOpen ? "disabled" : ""}>
            WhatsApp
          </button>
        </div>
      </div>
    `;

    const priceEl = card.querySelector("[data-price]");
    const btnAdd = card.querySelector("[data-add]");
    const btnWa = card.querySelector("[data-wa]");

    function getSelectedVariantId() {
      const checked = card.querySelector(`input[name="var_${p.id}"]:checked`);
      const vId = checked ? checked.value : "default";
      return vId === "default" ? null : vId;
    }

    function updatePriceAndActiveChip() {
      const vId = getSelectedVariantId();
      const price = itemPrice(p, vId);
      priceEl.textContent = `Rp ${fmtRupiah(price)}`;

      const chips = card.querySelectorAll("[data-varwrap] [data-chip]");
      chips.forEach(ch => ch.classList.remove("ring-2", "ring-slate-900", "border-slate-900"));
      const activeInput = card.querySelector(`input[name="var_${p.id}"]:checked`);
      if (activeInput) {
        const chip = activeInput.parentElement.querySelector("[data-chip]");
        chip?.classList.add("ring-2", "ring-slate-900", "border-slate-900");
      }
    }

    card.querySelectorAll(`input[name="var_${p.id}"]`).forEach(r => {
      r.addEventListener("change", updatePriceAndActiveChip);
    });
    updatePriceAndActiveChip();

    btnAdd.onclick = () => {
      if (!isOpen) return;
      const vId = getSelectedVariantId();
      addToCart(p.id, vId);
    };

    btnWa.onclick = () => {
      if (!isOpen) return;

      const vId = getSelectedVariantId();
      const v = getVariant(p, vId);
      const price = itemPrice(p, vId);

      const phone = getAdminPhone();
      if (!phone) return alert("Nomor WhatsApp admin belum diisi (settings/main).");

      const text = [
        "Halo Admin, saya mau pesan:",
        `- Produk: ${p.name}${v ? " - " + v.name : ""}`,
        `- Harga: Rp ${fmtRupiah(price)}`,
        `- Toko: ${store?.name || "-"}`,
        "",
        "Nama:",
        "Alamat:",
        "Catatan (opsional):",
      ].join("\n");

      // popup safe
      const url = waLink(phone, text);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) window.location.href = url;
    };

    grid.appendChild(card);
  });
}

/* =========================
   RENDER ALL
   ========================= */
function renderAll() {
  renderStoreRow();
  renderProducts();
  renderFooterWA();
  updateCartBadge();
}

/* =========================
   MODAL CART EVENTS
   ========================= */
function openCart() {
  $("modalCart")?.classList.remove("hidden-soft");
  renderCart();
}
function closeCart() { $("modalCart")?.classList.add("hidden-soft"); }

if ($("btnOpenCart")) $("btnOpenCart").onclick = openCart;
if ($("btnCloseCart")) $("btnCloseCart").onclick = closeCart;

if ($("btnClearCart")) {
  $("btnClearCart").onclick = () => {
    if (!confirm("Kosongkan keranjang?")) return;
    setCart([]);
    renderCart();
    updateCartBadge();
  };
}

if ($("modalCart")) {
  $("modalCart").addEventListener("click", (e) => {
    if (e.target.id === "modalCart") closeCart();
  });
}

// Checkout WA: window.open + kosongkan cart
if ($("btnCheckoutWA")) {
  $("btnCheckoutWA").addEventListener("click", (e) => {
    e.preventDefault();

    if (!validateBuyerRequired()) return;

    const cart = getCart();
    if (!cart.length) return;

    const storesMap = new Map((liveStores || []).map(s => [s.id, s]));
    const productsMap = new Map((liveProducts || []).map(p => [p.id, p]));

    const phone = getAdminPhone();
    if (!phone) return alert("Nomor WhatsApp admin belum diisi (settings/main).");

    const text = buildCheckoutText(cart, productsMap, storesMap);
    const url = waLink(phone, text);

    // popup safe
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) window.location.href = url;

    // kosongkan cart setelah buka WA
    setCart([]);
    updateCartBadge();
    renderCart();
    closeCart();
  });
}

/* =========================
   PUBLIC EVENTS (chip/search/home)
   ========================= */
if ($("btnBackStore")) {
  $("btnBackStore").onclick = () => {
    state.activeStoreId = null;
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}

if ($("searchInput")) {
  $("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value || "";
    renderProducts();
  });
}

if ($("chipAll")) $("chipAll").onclick = () => { setChip("all"); setChipUI("all"); };
if ($("chipPinned")) $("chipPinned").onclick = () => { setChip("pinned"); setChipUI("pinned"); };
if ($("chipOpenOnly")) $("chipOpenOnly").onclick = () => { setChip("openOnly"); setChipUI("openOnly"); };

if ($("btnGoHome")) {
  $("btnGoHome").onclick = () => {
    state.activeStoreId = null;
    state.search = "";
    if ($("searchInput")) $("searchInput").value = "";
    setChip("all");
    setChipUI("all");
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}

/* =========================
   ADMIN AUTH UI
   ========================= */
function openLogin() { $("modalLogin")?.classList.remove("hidden-soft"); }
function closeLogin() {
  $("modalLogin")?.classList.add("hidden-soft");
  $("loginError")?.classList.add("hidden-soft");
}

function openAdminPanel() {
  $("adminPanel")?.classList.remove("hidden-soft");

  // isi phone dari firestore settings
  if ($("adminPhone")) $("adminPhone").value = liveSettings?.adminPhone || "";

  // fungsi detail ada Bagian 2
  syncAdminStoreSelects();
  renderAdminStores();
  renderAdminProducts();
}

function closeAdminPanel() {
  $("adminPanel")?.classList.add("hidden-soft");
  renderAll();
}

if ($("btnOpenAdminLogin")) {
  $("btnOpenAdminLogin").onclick = () => {
    if (adminUser) openAdminPanel();
    else openLogin();
  };
}

if ($("btnCloseLogin")) $("btnCloseLogin").onclick = closeLogin;

if ($("modalLogin")) {
  $("modalLogin").addEventListener("click", (e) => {
    if (e.target.id === "modalLogin") closeLogin();
  });
}

// LOGIN: input "Username" di HTML = EMAIL Firebase Auth
if ($("btnDoLogin")) {
  $("btnDoLogin").onclick = async () => {
    const email = ($("loginUser")?.value || "").trim();  // harus EMAIL
    const pass = ($("loginPass")?.value || "").trim();

    if (!email || !pass) {
      if ($("loginError")) {
        $("loginError").textContent = "Isi email & password.";
        $("loginError").classList.remove("hidden-soft");
      }
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      closeLogin();
      openAdminPanel();
    } catch (err) {
      console.error(err);
      if ($("loginError")) {
        $("loginError").textContent =
          "Login gagal. Pastikan email/password benar & domain sudah diizinkan di Firebase Auth.";
        $("loginError").classList.remove("hidden-soft");
      }
    }
  };
}

if ($("btnCloseAdmin")) $("btnCloseAdmin").onclick = closeAdminPanel;

if ($("btnLogout")) {
  $("btnLogout").onclick = async () => {
    try { await signOut(auth); } catch {}
    closeAdminPanel();
  };
}

// Auth state listener
onAuthStateChanged(auth, (user) => {
  adminUser = user || null;
});

/* =========================
   SAVE SETTINGS (adminPhone) -> settings/main
   ========================= */
if ($("btnSaveSettings")) {
  $("btnSaveSettings").onclick = async () => {
    const adminPhone = ($("adminPhone")?.value || "").replace(/\D/g, "");
    try {
      await setDoc(doc(db, "settings", "main"), { adminPhone }, { merge: true });
      $("settingsSaved")?.classList.remove("hidden-soft");
      setTimeout(() => $("settingsSaved")?.classList.add("hidden-soft"), 1200);
    } catch (e) {
      console.error(e);
      alert("Gagal simpan settings. Cek Firestore Rules (write butuh login).");
    }
  };
}

/* =========================
   ESC close modals
   ========================= */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeCart();
    closeLogin();
    window.closeStoreModal?.();
    window.closeProductModal?.();
  }
});

/* =========================
   FIRESTORE REALTIME LISTENERS
   ========================= */
function startRealtime() {
  // SETTINGS
  onSnapshot(doc(db, "settings", "main"), (snap) => {
    if (snap.exists()) liveSettings = snap.data();
    renderFooterWA();
    renderCart();
  });

  // STORES
  onSnapshot(query(collection(db, "stores"), orderBy("name")), (snap) => {
    liveStores = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // kalau toko aktif sudah hilang, reset
    if (state.activeStoreId && !liveStores.some(s => s.id === state.activeStoreId)) {
      state.activeStoreId = null;
    }

    renderStoreRow();
    renderProducts();

    // admin (Bagian 2 akan aktifkan)
    syncAdminStoreSelects();
    refreshAdminIfOpen();
  });

  // PRODUCTS
  onSnapshot(query(collection(db, "products"), orderBy("name")), (snap) => {
    liveProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProducts();
    renderCart();

    // admin (Bagian 2 akan aktifkan)
    refreshAdminIfOpen();
  });
}

/* =========================================================
   PLACEHOLDER ADMIN (FIX REDECLARE!)
   - PENTING: pakai LET supaya Bagian 2 bisa isi ulang tanpa error
   ========================================================= */
let syncAdminStoreSelects = () => {};
let renderAdminStores = () => {};
let renderAdminProducts = () => {};
let refreshAdminIfOpen = () => {};

/* =========================
   INIT
   ========================= */
startRealtime();
renderAll();

/* =========================
   END BAGIAN 1/3
   ========================= */
/* =========================================================
   AAA-FOOD-UMKM - app.js (RAPIH) - BAGIAN 2/3
   - ADMIN LIST & FILTER (stores/products)
   - SYNC SELECT DROPDOWN
   - MODAL TOKO (CRUD: create/update)
   - MODAL PRODUK (CRUD: create/update)
   - REQUIRE ADMIN GUARD
   ========================================================= */

/* =========================
   ADMIN GUARD
   ========================= */
function requireAdmin() {
  if (!adminUser) {
    alert("Harus login admin dulu.");
    openLogin();
    return false;
  }
  return true;
}

/* =========================
   ADMIN: STORE SELECTS
   - dropdown filter produk admin
   - dropdown toko di form produk
   ========================= */
syncAdminStoreSelects = function () {
  const stores = liveStores || [];

  // filter produk admin
  const selAdmin = $("adminStoreFilter");
  if (selAdmin) {
    const prev = selAdmin.value || "all";
    selAdmin.innerHTML = `<option value="all">Semua Toko</option>`;
    stores.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name || s.id;
      selAdmin.appendChild(opt);
    });
    if ([...selAdmin.options].some(o => o.value === prev)) selAdmin.value = prev;
  }

  // select toko di form produk
  const selForm = $("productStoreId");
  if (selForm) {
    const prev2 = selForm.value || "";
    selForm.innerHTML = "";
    stores.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name || s.id;
      selForm.appendChild(opt);
    });
    if (prev2 && [...selForm.options].some(o => o.value === prev2)) selForm.value = prev2;
  }
};

// refresh list produk admin kalau filter toko berubah
if ($("adminStoreFilter")) {
  $("adminStoreFilter").addEventListener("change", () => {
    renderAdminProducts();
  });
}

/* =========================
   ADMIN: SEARCH BIND (sekali)
   ========================= */
function bindAdminSearchOnce() {
  if ($("adminStoreSearch") && $("adminStoreSearch").dataset.bound !== "1") {
    $("adminStoreSearch").dataset.bound = "1";
    $("adminStoreSearch").addEventListener("input", (e) => {
      adminState.storeSearch = e.target.value || "";
      renderAdminStores();
    });
  }

  if ($("adminProductSearch") && $("adminProductSearch").dataset.bound !== "1") {
    $("adminProductSearch").dataset.bound = "1";
    $("adminProductSearch").addEventListener("input", (e) => {
      adminState.productSearch = e.target.value || "";
      renderAdminProducts();
    });
  }
}

/* =========================
   ADMIN: RENDER STORES (CRUD buttons)
   - NOTE: tombol hapus masih placeholder,
     delete cascade aktif di BAGIAN 3
   ========================= */
renderAdminStores = function () {
  const stores = liveStores || [];
  const box = $("adminStoreList");
  if (!box) return;
  box.innerHTML = "";

  const q = (adminState.storeSearch || "").trim().toLowerCase();
  let filtered = stores;

  if (q) {
    filtered = stores.filter(s => {
      const name = (s.name || "").toLowerCase();
      const cat = (s.category || "").toLowerCase();
      const addr = (s.address || "").toLowerCase();
      return name.includes(q) || cat.includes(q) || addr.includes(q);
    });
  }

  const sorted = filtered.slice().sort((a, b) => (b.pinned === true) - (a.pinned === true));

  if (sorted.length === 0) {
    box.innerHTML = `
      <div class="bg-slate-50 rounded-3xl border border-slate-200 p-6 text-center text-slate-600">
        Tidak ada toko yang cocok.
      </div>
    `;
    return;
  }

  sorted.forEach(s => {
    const avatar = s.photo
      ? `<img src="${s.photo}" class="w-14 h-14 rounded-2xl object-cover border border-slate-200" />`
      : `<div class="w-14 h-14 rounded-2xl bg-slate-900 text-white grid place-items-center font-extrabold">${initials(s.name)}</div>`;

    const card = document.createElement("div");
    card.className = "rounded-3xl border border-slate-200 p-4 bg-white";

    // ✅ penting: simpan storeId ke dataset biar Bagian 3 gampang hapus
    card.dataset.storeId = s.id;

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-3">
          ${avatar}
          <div>
            <div class="font-extrabold">${s.name || "-"}</div>
            <div class="text-sm text-slate-600">${s.category || "-"}</div>
            <div class="text-xs text-slate-500 mt-1">${s.address || ""}</div>
          </div>
        </div>
        <div class="flex flex-col items-end gap-1">
          <span class="px-2 py-1 rounded-full text-xs font-bold ${s.open ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}">
            ${s.open ? "BUKA" : "TUTUP"}
          </span>
          ${s.pinned ? `<span class="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Best Seller</span>` : ``}
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold" data-act="edit">Edit</button>
        <button class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold" data-act="toggleOpen">
          ${s.open ? "Tutup" : "Buka"}
        </button>
        <button class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold" data-act="togglePin">
          ${s.pinned ? "Lepas Best Seller" : "Best Sellerkan"}
        </button>
        <button class="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-700 font-semibold" data-act="del">
          Hapus
        </button>
      </div>
    `;

    card.querySelector('[data-act="edit"]').onclick = () => openStoreModal(s.id);

    card.querySelector('[data-act="toggleOpen"]').onclick = async () => {
      if (!requireAdmin()) return;
      try {
        await updateDoc(doc(db, "stores", s.id), { open: !s.open });
      } catch (e) {
        console.error(e);
        alert("Gagal ubah status buka/tutup.");
      }
    };

    card.querySelector('[data-act="togglePin"]').onclick = async () => {
      if (!requireAdmin()) return;
      try {
        await updateDoc(doc(db, "stores", s.id), { pinned: !s.pinned });
      } catch (e) {
        console.error(e);
        alert("Gagal ubah Best Seller.");
      }
    };

    // placeholder delete (aktif di Bagian 3)
    card.querySelector('[data-act="del"]').onclick = async () => {
      alert("Hapus toko + produk terkait akan aktif di Bagian 3.");
    };

    box.appendChild(card);
  });
};

/* =========================
   ADMIN: RENDER PRODUCTS (CRUD buttons)
   - NOTE: tombol hapus masih placeholder,
     delete + clean cart aktif di BAGIAN 3
   ========================= */
renderAdminProducts = function () {
  const stores = liveStores || [];
  const storeMap = new Map(stores.map(s => [s.id, s]));
  const prods = liveProducts || [];

  const box = $("adminProductList");
  if (!box) return;
  box.innerHTML = "";

  const filterId = $("adminStoreFilter")?.value || "all";
  let list = [...prods];
  if (filterId !== "all") list = list.filter(p => p.storeId === filterId);

  const q = (adminState.productSearch || "").trim().toLowerCase();
  if (q) {
    list = list.filter(p => {
      const name = (p.name || "").toLowerCase();
      const desc = (p.desc || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }

  list.sort((a, b) => (b.pinned === true) - (a.pinned === true));

  if (list.length === 0) {
    box.innerHTML = `
      <div class="bg-slate-50 rounded-3xl border border-slate-200 p-6 text-center text-slate-600">
        Tidak ada produk yang cocok.
      </div>
    `;
    return;
  }

  list.forEach(p => {
    const store = storeMap.get(p.storeId);

    const photo = p.photo
      ? `<img src="${p.photo}" class="w-full h-32 object-cover rounded-2xl border border-slate-200" />`
      : `<div class="w-full h-32 rounded-2xl border border-slate-200 bg-slate-100 grid place-items-center text-slate-500 font-bold">FOTO</div>`;

    const card = document.createElement("div");
    card.className = "rounded-3xl border border-slate-200 p-4 bg-white";

    // ✅ penting: simpan productId ke dataset biar Bagian 3 gampang hapus
    card.dataset.productId = p.id;

    card.innerHTML = `
      ${photo}
      <div class="mt-3 flex items-start justify-between gap-2">
        <div>
          <div class="font-extrabold">${p.name || "-"}</div>
          <div class="text-xs text-slate-500 mt-1">${store?.name || "-"}</div>
          <div class="text-sm text-slate-700 mt-1">Rp ${fmtRupiah(p.price)}</div>
        </div>
        <div class="flex flex-col items-end gap-1">
          ${p.pinned ? `<span class="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Best Seller</span>` : ``}
        </div>
      </div>

      <div class="mt-2 text-xs text-slate-500 line-clamp-2">${p.desc || ""}</div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold" data-act="edit">Edit</button>
        <button class="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold" data-act="pin">
          ${p.pinned ? "Lepas Best Seller" : "Best Sellerkan"}
        </button>
        <button class="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-700 font-semibold" data-act="del">
          Hapus
        </button>
      </div>

      <div class="mt-2 text-xs text-slate-500">
        Varian: <b>${Array.isArray(p.variants) && p.variants.length ? p.variants.length : 0}</b>
      </div>
    `;

    card.querySelector('[data-act="edit"]').onclick = () => openProductModal(p.id);

    card.querySelector('[data-act="pin"]').onclick = async () => {
      if (!requireAdmin()) return;
      try {
        await updateDoc(doc(db, "products", p.id), { pinned: !p.pinned });
      } catch (e) {
        console.error(e);
        alert("Gagal ubah Best Seller produk.");
      }
    };

    // placeholder delete (aktif di Bagian 3)
    card.querySelector('[data-act="del"]').onclick = async () => {
      alert("Hapus produk akan aktif di Bagian 3.");
    };

    box.appendChild(card);
  });
};

/* =========================
   MODAL STORE (Create / Update)
   ========================= */
function openStoreModal(id = null) {
  if (!requireAdmin()) return;

  $("modalStore")?.classList.remove("hidden-soft");

  if (!id) {
    $("storeFormTitle").textContent = "Tambah Toko";
    $("storeId").value = "";
    $("storeName").value = "";
    $("storeCategory").value = "";
    $("storeAddress").value = "";
    $("storeOpen").checked = true;
    $("storePinned").checked = false;
    if ($("storePhotoUrl")) $("storePhotoUrl").value = "";
    return;
  }

  const s = (liveStores || []).find(x => x.id === id);
  if (!s) return;

  $("storeFormTitle").textContent = "Edit Toko";
  $("storeId").value = s.id;
  $("storeName").value = s.name || "";
  $("storeCategory").value = s.category || "";
  $("storeAddress").value = s.address || "";
  $("storeOpen").checked = !!s.open;
  $("storePinned").checked = !!s.pinned;
  if ($("storePhotoUrl")) $("storePhotoUrl").value = s.photo || "";
}

function closeStoreModal() {
  $("modalStore")?.classList.add("hidden-soft");
}
window.closeStoreModal = closeStoreModal;

if ($("btnNewStore")) $("btnNewStore").onclick = () => openStoreModal(null);
if ($("btnCloseStoreModal")) $("btnCloseStoreModal").onclick = closeStoreModal;

if ($("modalStore")) {
  $("modalStore").addEventListener("click", (e) => {
    if (e.target.id === "modalStore") closeStoreModal();
  });
}

if ($("btnSaveStore")) {
  $("btnSaveStore").onclick = async () => {
    if (!requireAdmin()) return;

    const id = ($("storeId").value || "").trim();
    const name = ($("storeName").value || "").trim();
    if (!name) return alert("Nama toko wajib diisi.");

    const category = ($("storeCategory").value || "").trim();
    const address = ($("storeAddress").value || "").trim();
    const open = !!$("storeOpen")?.checked;
    const pinned = !!$("storePinned")?.checked;
    const photo = driveToDirect($("storePhotoUrl")?.value || "");

    const storeId = id || uid("store");
    const payload = { id: storeId, name, category, address, open, pinned, photo };

    try {
      await setDoc(doc(db, "stores", storeId), payload, { merge: true });
      closeStoreModal();
      syncAdminStoreSelects(); // refresh dropdown
    } catch (e) {
      console.error(e);
      alert("Gagal simpan toko. Cek Firestore Rules (write butuh login).");
    }
  };
}

/* =========================
   VARIANTS (Produk) helpers
   ========================= */
function parseVariantsText(txt) {
  const lines = (txt || "").split("\n").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const [nameRaw, priceRaw] = line.split("|").map(x => (x || "").trim());
    if (!nameRaw) continue;
    const price = Number(priceRaw || 0);
    out.push({ id: uid("v"), name: nameRaw, price: Number.isFinite(price) ? price : 0 });
  }
  return out;
}
function variantsToText(variants) {
  const vars = Array.isArray(variants) ? variants : [];
  return vars.map(v => `${v.name}|${v.price}`).join("\n");
}

/* =========================
   MODAL PRODUCT (Create / Update)
   ========================= */
function openProductModal(id = null) {
  if (!requireAdmin()) return;

  $("modalProduct")?.classList.remove("hidden-soft");
  syncAdminStoreSelects();

  const stores = liveStores || [];
  if (stores.length === 0) {
    alert("Buat toko dulu sebelum menambah produk.");
    closeProductModal();
    return;
  }

  if (!id) {
    $("productFormTitle").textContent = "Tambah Produk";
    $("productId").value = "";
    $("productStoreId").value = stores[0].id;
    $("productName").value = "";
    $("productPrice").value = "";
    $("productDesc").value = "";
    $("productPinned").checked = false;
    $("productVariants").value = "";
    if ($("productPhotoUrl")) $("productPhotoUrl").value = "";
    return;
  }

  const p = (liveProducts || []).find(x => x.id === id);
  if (!p) return;

  $("productFormTitle").textContent = "Edit Produk";
  $("productId").value = p.id;
  $("productStoreId").value = p.storeId;
  $("productName").value = p.name || "";
  $("productPrice").value = p.price ?? "";
  $("productDesc").value = p.desc || "";
  $("productPinned").checked = !!p.pinned;
  $("productVariants").value = variantsToText(p.variants);
  if ($("productPhotoUrl")) $("productPhotoUrl").value = p.photo || "";
}

function closeProductModal() {
  $("modalProduct")?.classList.add("hidden-soft");
}
window.closeProductModal = closeProductModal;

if ($("btnNewProduct")) $("btnNewProduct").onclick = () => openProductModal(null);
if ($("btnCloseProductModal")) $("btnCloseProductModal").onclick = closeProductModal;

if ($("modalProduct")) {
  $("modalProduct").addEventListener("click", (e) => {
    if (e.target.id === "modalProduct") closeProductModal();
  });
}

if ($("btnSaveProduct")) {
  $("btnSaveProduct").onclick = async () => {
    if (!requireAdmin()) return;

    const stores = liveStores || [];
    if (stores.length === 0) return alert("Buat toko dulu sebelum menambah produk.");

    const id = ($("productId").value || "").trim();
    const storeId = $("productStoreId").value;
    const name = ($("productName").value || "").trim();
    const price = Number($("productPrice").value || 0);
    const desc = ($("productDesc").value || "").trim();
    const pinned = !!$("productPinned")?.checked;
    const variants = parseVariantsText($("productVariants").value);
    const photo = driveToDirect($("productPhotoUrl")?.value || "");

    if (!name) return alert("Nama produk wajib diisi.");

    const prodId = id || uid("prod");
    const payload = {
      id: prodId,
      storeId,
      name,
      price: Number.isFinite(price) ? price : 0,
      desc,
      pinned,
      photo,
      variants
    };

    try {
      await setDoc(doc(db, "products", prodId), payload, { merge: true });
      closeProductModal();
    } catch (e) {
      console.error(e);
      alert("Gagal simpan produk. Cek Firestore Rules (write butuh login).");
    }
  };
}

/* =========================
   ADMIN PANEL OPEN PATCH
   - pastikan bind search & render admin
   ========================= */
const _openAdminPanelOld_v2 = openAdminPanel;
openAdminPanel = function () {
  _openAdminPanelOld_v2();
  bindAdminSearchOnce();

  // restore input search state
  if ($("adminStoreSearch")) $("adminStoreSearch").value = adminState.storeSearch || "";
  if ($("adminProductSearch")) $("adminProductSearch").value = adminState.productSearch || "";

  syncAdminStoreSelects();
  renderAdminStores();
  renderAdminProducts();
};

/* =========================
   REFRESH ADMIN IF OPEN
   ========================= */
refreshAdminIfOpen = function () {
  const panel = $("adminPanel");
  const isOpen = panel && !panel.classList.contains("hidden-soft");
  if (!isOpen) return;

  syncAdminStoreSelects();
  renderAdminStores();
  renderAdminProducts();
};

/* =========================
   END BAGIAN 2/3
   ========================= */
/* =========================================================
   AAA-FOOD-UMKM - app.js (RAPIH) - BAGIAN 3/3 (AKHIR)
   - DELETE STORE (CASCADE DELETE PRODUCTS)
   - DELETE PRODUCT + CLEAN CART
   - CSV IMPORT (BATCH)
   - EXPORT JSON
   - RESET DEMO (SEED)
   - PATCH: refresh admin saat panel terbuka
   ========================================================= */

/* =========================
   DELETE STORE (CASCADE)
   - hapus semua products yg storeId == storeId
   - lalu hapus dokumen store
   ========================= */
async function deleteStoreCascade(storeId) {
  if (!storeId) return;

  // ambil semua produk milik toko ini
  const qx = query(collection(db, "products"), where("storeId", "==", storeId));
  const snap = await getDocs(qx);

  const batch = writeBatch(db);

  // hapus produk-produk
  snap.forEach(d => batch.delete(d.ref));

  // hapus toko
  batch.delete(doc(db, "stores", storeId));

  await batch.commit();
}

/* =========================
   DELETE PRODUCT + CLEAN CART
   ========================= */
async function deleteProductAndCleanCart(prodId) {
  if (!prodId) return;

  await deleteDoc(doc(db, "products", prodId));

  // bersihin cart yg memakai produk itu
  const cart = getCart().filter(it => it.productId !== prodId);
  setCart(cart);
  updateCartBadge();
  renderCart();
}

/* =========================
   PATCH: renderAdminStores
   - tombol hapus toko jadi beneran (cascade)
   ========================= */
const _renderAdminStoresOld_v3 = renderAdminStores;
renderAdminStores = function () {
  _renderAdminStoresOld_v3();

  const box = $("adminStoreList");
  if (!box) return;

  box.querySelectorAll('[data-act="del"]').forEach(btn => {
    btn.onclick = async (e) => {
      if (!requireAdmin()) return;

      const card = e.target.closest("div.rounded-3xl");
      const storeId = card?.dataset?.storeId || "";
      if (!storeId) return alert("Store ID tidak ditemukan.");

      const store = (liveStores || []).find(s => s.id === storeId);
      const storeName = store?.name || storeId;

      if (!confirm(`Hapus toko "${storeName}"?\nSemua produk toko ini juga akan terhapus.`)) return;

      try {
        await deleteStoreCascade(storeId);

        // jika public lagi filter toko ini, reset
        if (state.activeStoreId === storeId) state.activeStoreId = null;

        // bersihkan cart item yang produknya sudah tidak ada (aman)
        const cart = getCart();
        if (cart.length) {
          const prodMap = new Map((liveProducts || []).map(p => [p.id, p]));
          setCart(cart.filter(it => prodMap.has(it.productId)));
          updateCartBadge();
          renderCart();
        }
      } catch (err) {
        console.error(err);
        alert("Gagal hapus toko (cascade). Pastikan Firestore rules mengizinkan write untuk user login.");
      }
    };
  });
};

/* =========================
   PATCH: renderAdminProducts
   - tombol hapus produk jadi beneran + bersihkan cart
   ========================= */
const _renderAdminProductsOld_v3 = renderAdminProducts;
renderAdminProducts = function () {
  _renderAdminProductsOld_v3();

  const box = $("adminProductList");
  if (!box) return;

  box.querySelectorAll('[data-act="del"]').forEach(btn => {
    btn.onclick = async (e) => {
      if (!requireAdmin()) return;

      const card = e.target.closest("div.rounded-3xl");
      const prodId = card?.dataset?.productId || "";
      if (!prodId) return alert("Product ID tidak ditemukan.");

      const prod = (liveProducts || []).find(p => p.id === prodId);
      const prodName = prod?.name || prodId;

      if (!confirm(`Hapus produk "${prodName}"?`)) return;

      try {
        await deleteProductAndCleanCart(prodId);
      } catch (err) {
        console.error(err);
        alert("Gagal hapus produk. Pastikan Firestore rules mengizinkan write untuk user login.");
      }
    };
  });
};

/* =========================
   CSV IMPORT (BATCH)
   Format:
   store_id,nama,harga,deskripsi,pinned(0/1),varian_opsional
   varian_opsional: "Ayam|25000; +Nasi|32000"
   ========================= */
function parseCSVLine(line) {
  // simple CSV (tanpa quote). kalau butuh quote, nanti kita upgrade.
  return (line || "").split(",").map(x => (x || "").trim());
}

function parseVariantsCsvField(field) {
  const raw = (field || "").trim();
  if (!raw) return [];
  const parts = raw.split(";").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const [nameRaw, priceRaw] = part.split("|").map(x => (x || "").trim());
    if (!nameRaw) continue;
    const price = Number(priceRaw || 0);
    out.push({ id: uid("v"), name: nameRaw, price: Number.isFinite(price) ? price : 0 });
  }
  return out;
}

if ($("btnImportCsv")) {
  $("btnImportCsv").onclick = async () => {
    if (!requireAdmin()) return;

    const msg = $("importMsg");
    const setMsg = (text, ok = true) => {
      if (!msg) return;
      msg.textContent = text;
      msg.className = "text-sm font-semibold " + (ok ? "text-emerald-700" : "text-rose-700");
    };

    const text = ($("bulkCsv")?.value || "").trim();
    if (!text) return setMsg("CSV kosong.", false);

    const stores = liveStores || [];
    if (stores.length === 0) return setMsg("Buat toko dulu sebelum import produk.", false);

    const storeSet = new Set(stores.map(s => s.id));
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    let okCount = 0, failCount = 0;

    try {
      const batch = writeBatch(db);

      for (const line of lines) {
        const [storeId, name, priceRaw, desc, pinnedRaw, variantsRaw] = parseCSVLine(line);

        if (!storeId || !storeSet.has(storeId) || !name) {
          failCount++;
          continue;
        }

        const price = Number(priceRaw || 0);
        const pinned = String(pinnedRaw || "0").trim() === "1";
        const variants = parseVariantsCsvField(variantsRaw);

        const prodId = uid("prod");
        batch.set(doc(db, "products", prodId), {
          id: prodId,
          storeId,
          name,
          price: Number.isFinite(price) ? price : 0,
          desc: (desc || ""),
          pinned,
          photo: "",
          variants
        });

        okCount++;
      }

      await batch.commit();
      setMsg(`Import selesai ✅ berhasil: ${okCount}, gagal: ${failCount}`, true);
    } catch (err) {
      console.error(err);
      setMsg("Import gagal. Cek Firestore Rules (write butuh login).", false);
    }
  };
}

/* =========================
   EXPORT JSON (settings + stores + products)
   ========================= */
if ($("btnExportData")) {
  $("btnExportData").onclick = () => {
    if (!requireAdmin()) return;

    const data = {
      settings: liveSettings || {},
      stores: liveStores || [],
      products: liveProducts || [],
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "aaa-food-umkm-data.json";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

/* =========================
   RESET DEMO (OPTIONAL)
   - hapus semua stores/products, lalu seed default
   ========================= */

// helper: hapus semua dokumen di collection
async function clearCollection(collName) {
  const snap = await getDocs(collection(db, collName));
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// default seed (minimal) -> boleh kamu ganti
const defaultSettings = { adminPhone: "" };
const defaultStores = [
  { id: "store_1", name: "Toko Contoh 1", category: "Makanan", address: "Alamat contoh", open: true, pinned: true, photo: "" },
  { id: "store_2", name: "Toko Contoh 2", category: "Minuman", address: "Alamat contoh", open: true, pinned: false, photo: "" },
];
const defaultProducts = [
  {
    id: "prod_1",
    storeId: "store_1",
    name: "Ayam Geprek",
    price: 25000,
    desc: "Pedas mantap",
    pinned: true,
    photo: "",
    variants: [
      { id: "v1", name: "Ayam saja", price: 25000 },
      { id: "v2", name: "+ Nasi", price: 32000 },
    ]
  },
  { id: "prod_2", storeId: "store_2", name: "Es Teh", price: 7000, desc: "Segar", pinned: false, photo: "", variants: [] },
];

if ($("btnResetDemo")) {
  $("btnResetDemo").onclick = async () => {
    if (!requireAdmin()) return;
    if (!confirm("Reset demo? Semua data toko & produk akan kembali ke default.")) return;

    try {
      // hapus existing
      await clearCollection("products");
      await clearCollection("stores");

      // set settings
      await setDoc(doc(db, "settings", "main"), defaultSettings, { merge: true });

      // seed stores/products
      const batch = writeBatch(db);

      defaultStores.forEach(s => {
        const payload = { ...s, id: s.id, photo: driveToDirect(s.photo || "") };
        batch.set(doc(db, "stores", s.id), payload);
      });

      defaultProducts.forEach(p => {
        const payload = { ...p, id: p.id, photo: driveToDirect(p.photo || "") };
        batch.set(doc(db, "products", p.id), payload);
      });

      await batch.commit();

      // reset cart & buyer (local)
      setCart([]);
      setBuyer({ name: "", phone: "", address: "", note: "" });
      updateCartBadge();
      renderCart();

      // reset public state
      state.activeStoreId = null;
      state.search = "";
      state.chip = "all";
      if ($("searchInput")) $("searchInput").value = "";
      setChipUI("all");

      const msg = $("importMsg");
      if (msg) {
        msg.textContent = "Reset demo selesai ✅";
        msg.className = "text-sm font-semibold text-emerald-700";
      }
    } catch (err) {
      console.error(err);
      alert("Reset demo gagal. Cek Firestore Rules (write butuh login).");
    }
  };
}

/* =========================
   PATCH: renderAll -> refresh admin jika panel open
   ========================= */
const _renderAllOld_v3 = renderAll;
renderAll = function () {
  _renderAllOld_v3();
  refreshAdminIfOpen?.();
};

/* =========================
   END BAGIAN 3/3
   ========================= */

