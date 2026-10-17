import { URL } from "node:url";
import { comments, connect, isReady, mapComment, mapPost, posts, toId, users } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/posts") {
    const rows = await posts().find({}).sort({ createdAt: -1 }).limit(20).toArray();
    return sendJson(res, 200, { posts: rows.map(mapPost) });
  }
  if (method === "POST" && pathname === "/api/posts") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "El titulo es obligatorio" });
    const result = await posts().insertOne({ userId, title: title.slice(0, 80), body: String(body.body || "").slice(0, 5000), author: user.username, createdAt: new Date() });
    return sendJson(res, 201, { post: mapPost(await posts().findOne({ _id: result.insertedId })) });
  }
  const postIdMatch = pathname.match(/^\/api\/posts\/([a-fA-F0-9]{24})$/);
  if (postIdMatch && method === "GET") {
    const post = await posts().findOne({ _id: toId(postIdMatch[1]) });
    if (!post) return sendJson(res, 404, { error: "Post no encontrado" });
    const cmts = await comments().find({ postId: postIdMatch[1] }).sort({ createdAt: 1 }).toArray();
    return sendJson(res, 200, { post: mapPost(post), comments: cmts.map(mapComment) });
  }
  if (postIdMatch && method === "DELETE") {
    const result = await posts().deleteOne({ _id: toId(postIdMatch[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Post no encontrado o no es tuyo" });
    await comments().deleteMany({ postId: postIdMatch[1] });
    return sendEmpty(res, 204);
  }

  if (method === "POST" && pathname.match(/^\/api\/posts\/[a-fA-F0-9]{24}\/comments$/)) {
    const pid = pathname.split("/")[3];
    const body = await readJson(req);
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res, 400, { error: "El comentario es obligatorio" });
    const result = await comments().insertOne({ postId: pid, userId, text: text.slice(0, 500), author: user.username, createdAt: new Date() });
    return sendJson(res, 201, { comment: mapComment(await comments().findOne({ _id: result.insertedId })) });
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Blog en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
