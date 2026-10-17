import { api, setSession, clearSession, getToken, simpleMarkdown } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const detailEl = document.querySelector("#detail");
const form = document.querySelector("#post-form");
const formError = document.querySelector("#form-error");
let mode = "login";
let currentUser = "";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function showList() {
  detailEl.classList.add("hidden");
  const data = await api("/api/posts");
  listEl.innerHTML = "";
  data.posts.forEach((p) => {
    const box = document.createElement("div");
    box.className = "post";
    box.innerHTML = `<h3>${p.title}</h3><small>por ${p.author}</small>`;
    const open = document.createElement("button");
    open.className = "ghost";
    open.textContent = "Ver";
    open.addEventListener("click", () => showPost(p.id));
    box.append(open);
    if (p.author === currentUser) {
      const del = document.createElement("button");
      del.className = "ghost";
      del.textContent = "Borrar";
      del.addEventListener("click", async () => { await api(`/api/posts/${p.id}`, { method: "DELETE" }); await showList(); });
      box.append(del);
    }
    listEl.append(box);
  });
}
async function showPost(id) {
  const data = await api(`/api/posts/${id}`);
  listEl.innerHTML = "";
  detailEl.classList.remove("hidden");
  detailEl.innerHTML = `<h2>${data.post.title}</h2><small>por ${data.post.author}</small><div>${simpleMarkdown(data.post.body)}</div><h4>Comentarios</h4><div id="comments"></div><form id="cform"><input id="ctext" placeholder="Escribe un comentario" required /><button class="primary" type="submit">Comentar</button></form><button id="back" class="ghost" type="button">Volver</button>`;
  const commentsEl = detailEl.querySelector("#comments");
  data.comments.forEach((c) => {
    const box = document.createElement("div");
    box.className = "comment";
    box.innerHTML = `<strong>${c.author}</strong>: ${c.text}`;
    commentsEl.append(box);
  });
  detailEl.querySelector("#back").addEventListener("click", showList);
  detailEl.querySelector("#cform").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api(`/api/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ text: detailEl.querySelector("#ctext").value.trim() }) });
    await showPost(id);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    currentUser = user.username;
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await showList();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); detailEl.classList.add("hidden"); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/posts", { method: "POST", body: JSON.stringify({ title: document.querySelector("#title").value.trim(), body: document.querySelector("#body").value }) });
    form.reset();
    await showList();
  } catch (err) { showError(formError, err.message); }
});
boot();
