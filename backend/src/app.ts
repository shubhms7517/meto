import { join, resolve } from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env, isProd } from "./config/env.js";
import { devRouter } from "./routes/dev.routes.js";
import { UPLOAD_ROOT } from "./lib/upload.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { chatsRouter } from "./routes/chats.routes.js";
import { statusRouter } from "./routes/status.routes.js";
import { callsRouter } from "./routes/calls.routes.js";
import { walletRouter } from "./routes/wallet.routes.js";
import { giftsRouter } from "./routes/gifts.routes.js";
import { rewardsRouter } from "./routes/rewards.routes.js";
import { matchRouter } from "./routes/match.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { hostRouter } from "./routes/host.routes.js";
import { supportRouter } from "./routes/support.routes.js";
import { devicesRouter } from "./routes/devices.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { agencyRouter } from "./routes/agency.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Admin panel (same server) ke liye: Google fonts, gift preview (blob), LAN pe http (upgrade nahi)
    // + Agora video monitor (admin/live-calls) ke liye Agora domains
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": [
          "'self'",
          "blob:",
          "https://*.agora.io",
          "wss://*.agora.io",
        ],
        "connect-src": [
          "'self'",
          "blob:",
          "https://*.agora.io",
          "wss://*.agora.io",
        ],
        "worker-src": ["'self'", "blob:"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "style-src": [
          "'self'",
          "https://fonts.googleapis.com",
          "'unsafe-inline'",
        ],
        "upgrade-insecure-requests": isProd ? [] : null,
      },
    },
  }),
);
// Mobile app browser nahi hai, isliye CORS ki zaroorat sirf future admin panel ke liye
app.use(cors({ origin: isProd ? false : true }));
app.use(express.json({ limit: "100kb" }));

// Admin panel: apna rate limit (panel me bahut requests hoti hain), app ke limit se pehle
app.use("/api/admin", adminRouter);
// Agency portal (admin se alag login + UI)
app.use("/api/agency", agencyRouter);

// Rate limiting — ek IP se bahut zyada requests block
const json429 = {
  error: {
    code: "rate_limited",
    message: "Too many requests. Please try again later",
  },
};
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: json429,
  }),
);
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json429,
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(
  "/uploads",
  express.static(UPLOAD_ROOT, { index: false, dotfiles: "deny", maxAge: "7d" }),
);

// Admin panel website (admin/ ka build) — http://<server>:4000/admin
const ADMIN_DIST = resolve("../admin/dist");
app.use(
  "/admin",
  express.static(ADMIN_DIST, { index: "index.html", maxAge: "1h" }),
);
app.get(/^\/admin(\/.*)?$/, (_req, res) =>
  res.sendFile(
    join(ADMIN_DIST, "index.html"),
    (err) =>
      err &&
      res
        .status(404)
        .end("Admin panel not built — run: npm --prefix admin run build"),
  ),
);

// Agency portal website (agency/ ka build) — http://<server>:4000/agency
const AGENCY_DIST = resolve("../agency/dist");
app.use(
  "/agency",
  express.static(AGENCY_DIST, { index: "index.html", maxAge: "1h" }),
);
app.get(/^\/agency(\/.*)?$/, (_req, res) =>
  res.sendFile(
    join(AGENCY_DIST, "index.html"),
    (err) =>
      err &&
      res
        .status(404)
        .end("Agency portal not built — run: npm --prefix agency run build"),
  ),
);

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/users", usersRouter);
app.use("/api/chats", chatsRouter);
app.use("/api/status", statusRouter);
app.use("/api/calls", callsRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/gifts", giftsRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/match", matchRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/host", hostRouter);
app.use("/api/support", supportRouter);
app.use("/api/devices", devicesRouter);
if (env.NODE_ENV === "development") {
  // Dev: app ki console warnings yahan dikhti hain (phone ka debugger khole bina)
  app.post("/api/devlog", (req, res) => {
    console.log(
      "📱 app",
      String(req.body?.level ?? "warn"),
      String(req.body?.msg ?? "").slice(0, 2000),
    );
    res.json({ ok: true });
  });
  app.use("/api/dev", devRouter);
}

app.use(notFoundHandler);
app.use(errorHandler);
