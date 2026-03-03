// Reference: blueprint:javascript_log_in_with_replit
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required. Please set it in your Secrets.");
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
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.id_token = tokens.id_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  // Upsert user - only sets default role on first insert, preserves role on updates
  const existingUser = await storage.getUser(claims["sub"]);
  
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    // Only set default role if user doesn't exist yet - new users default to 'customer'
    role: existingUser?.role || 'customer',
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login",
      max_age: 0,
      scope: ["openid", "email", "profile"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const idToken = user?.id_token;
    req.logout(() => {
      req.session.destroy((err) => {
        res.clearCookie("connect.sid");
        const endSessionParams: any = {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        };
        if (idToken) {
          endSessionParams.id_token_hint = idToken;
        }
        res.redirect(client.buildEndSessionUrl(config, endSessionParams).href);
      });
    });
  });

  // Switch account - fully logs out of Replit to allow choosing a different account
  app.get("/api/switch-account", (req, res) => {
    req.logout(() => {
      req.session.destroy(async (err) => {
        res.clearCookie("connect.sid");
        // Redirect to Replit's main logout, which will clear their session cookies
        // Then redirect back to our login page
        const returnUrl = encodeURIComponent(`${req.protocol}://${req.hostname}/api/login`);
        res.redirect(`https://replit.com/logout?goto=${returnUrl}`);
      });
    });
  });
}

export async function refreshUserToken(user: any) {
  const config = await getOidcConfig();
  const tokenResponse = await client.refreshTokenGrant(config, user.refresh_token);
  updateUserSession(user, tokenResponse);
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (user.expires_at && now <= user.expires_at) {
    return next();
  }

  if (user.refresh_token) {
    try {
      await refreshUserToken(user);
      return next();
    } catch (error: any) {
      console.error("Token refresh failed for user", user.claims.sub, ":", error?.message || error);
    }
  }

  if (user.claims?.sub) {
    return next();
  }

  req.logout?.(() => {});
  res.status(401).json({ message: "Session expired. Please log in again." });
};

// Middleware to check if user has admin or manager role (for product management)
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!user || !user.claims) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    let role = user.cachedRole;
    const cacheAge = Date.now() - (user.cachedRoleAt || 0);
    if (!role || cacheAge > 300_000) {
      const dbUser = await storage.getUser(user.claims.sub);
      if (!dbUser) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      role = dbUser.role;
      user.cachedRole = role;
      user.cachedRoleAt = Date.now();
    }
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Middleware to check if user has strict admin role (for employee management only)
export const requireStrictAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!user || !user.claims) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    let role = user.cachedRole;
    const cacheAge = Date.now() - (user.cachedRoleAt || 0);
    if (!role || cacheAge > 300_000) {
      const dbUser = await storage.getUser(user.claims.sub);
      if (!dbUser) {
        return res.status(403).json({ message: "Forbidden: Admin-only access required" });
      }
      role = dbUser.role;
      user.cachedRole = role;
      user.cachedRoleAt = Date.now();
    }
    if (role !== 'admin') {
      return res.status(403).json({ message: "Forbidden: Admin-only access required" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

// Middleware to check if user is staff (salesman, staff, manager, or admin - not customer)
export const requireStaff: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!user || !user.claims) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    let role = user.cachedRole;
    const cacheAge = Date.now() - (user.cachedRoleAt || 0);
    if (!role || cacheAge > 300_000) {
      const dbUser = await storage.getUser(user.claims.sub);
      if (!dbUser) {
        return res.status(403).json({ message: "Forbidden: Staff access required" });
      }
      role = dbUser.role;
      user.cachedRole = role;
      user.cachedRoleAt = Date.now();
    }
    const staffRoles = ['salesman', 'staff', 'manager', 'admin'];
    if (!staffRoles.includes(role)) {
      return res.status(403).json({ message: "Forbidden: Staff access required" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};
