import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required.");
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

async function upsertUser(profile: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | undefined;
}) {
  const existingUser = await storage.getUser(profile.id);

  await storage.upsertUser({
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    profileImageUrl: profile.profileImageUrl,
    role: existingUser?.role || (profile.email.endsWith("@savvydealer.com") ? "admin" : "customer"),
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const callbackURL =
    process.env.GOOGLE_CALLBACK_URL || "/api/callback";

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL,
        scope: ["openid", "email", "profile"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || "";
          const userProfile = {
            id: profile.id,
            email,
            firstName: profile.name?.givenName || "",
            lastName: profile.name?.familyName || "",
            profileImageUrl: profile.photos?.[0]?.value,
          };

          await upsertUser(userProfile);

          // Store minimal user info in session
          const sessionUser = {
            id: profile.id,
            email,
          };

          done(null, sessionUser);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );

  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many login attempts. Please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get(
    "/api/login",
    loginLimiter,
    passport.authenticate("google", {
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
    })
  );

  app.get(
    "/api/callback",
    passport.authenticate("google", {
      successRedirect: "/",
      failureRedirect: "/api/login",
    })
  );

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });

  app.post("/api/admin/force-logout-all", async (req: any, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const adminUser = await storage.getUser(req.user.id);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const pg = await import("pg");
      const db = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
      await db.query("DELETE FROM sessions");
      await db.end();
      res.json({
        success: true,
        message: "All sessions cleared. Everyone will need to log in again.",
      });
    } catch (error: any) {
      console.error("Failed to clear sessions:", error?.message);
      res.status(500).json({ error: "Failed to clear sessions" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated() || !(req.user as any)?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    let role = user.cachedRole;
    const cacheAge = Date.now() - (user.cachedRoleAt || 0);
    if (!role || cacheAge > 300_000) {
      const dbUser = await storage.getUser(user.id);
      if (!dbUser) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      role = dbUser.role;
      user.cachedRole = role;
      user.cachedRoleAt = Date.now();
    }
    if (role !== "admin" && role !== "manager") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const requireStrictAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    let role = user.cachedRole;
    const cacheAge = Date.now() - (user.cachedRoleAt || 0);
    if (!role || cacheAge > 300_000) {
      const dbUser = await storage.getUser(user.id);
      if (!dbUser) {
        return res.status(403).json({ message: "Forbidden: Admin-only access required" });
      }
      role = dbUser.role;
      user.cachedRole = role;
      user.cachedRoleAt = Date.now();
    }
    if (role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin-only access required" });
    }
    next();
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
};

export const requireStaff: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    let role = user.cachedRole;
    const cacheAge = Date.now() - (user.cachedRoleAt || 0);
    if (!role || cacheAge > 300_000) {
      const dbUser = await storage.getUser(user.id);
      if (!dbUser) {
        return res.status(403).json({ message: "Forbidden: Staff access required" });
      }
      role = dbUser.role;
      user.cachedRole = role;
      user.cachedRoleAt = Date.now();
    }
    const staffRoles = ["salesman", "staff", "manager", "admin"];
    if (!staffRoles.includes(role)) {
      return res.status(403).json({ message: "Forbidden: Staff access required" });
    }
    next();
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
};
