import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { Role } from "./generated/prisma/client.js";
import { env } from "./config.js";
import { prisma } from "./prisma.js";

export type AuthUser = { id: string; email: string; role: Role };

type AccessPayload = { sub: string; email: string; role: Role; type: "access" };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAccessToken(user: AuthUser): string {
  const expiresIn = env.ACCESS_TOKEN_TTL as NonNullable<
    jwt.SignOptions["expiresIn"]
  >;
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "access",
    } satisfies AccessPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn },
  );
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.refreshToken.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  return token;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateRefreshToken(
  token: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date())
    return null;
  await revokeRefreshToken(token);
  const authUser: AuthUser = {
    id: stored.user.id,
    email: stored.user.email,
    role: stored.user.role,
  };
  return {
    accessToken: createAccessToken(authUser),
    refreshToken: await createRefreshToken(stored.userId),
  };
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(
      Object.assign(new Error("Authentication required"), {
        statusCode: 401,
        code: "UNAUTHENTICATED",
      }),
    );
    return;
  }
  try {
    const payload = jwt.verify(
      header.slice(7),
      env.JWT_ACCESS_SECRET,
    ) as AccessPayload;
    if (payload.type !== "access") throw new Error("Invalid token type");
    req.authUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    next(
      Object.assign(new Error("Invalid or expired access token"), {
        statusCode: 401,
        code: "UNAUTHENTICATED",
      }),
    );
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      next(
        Object.assign(
          new Error("You do not have permission to perform this action"),
          { statusCode: 403, code: "FORBIDDEN" },
        ),
      );
      return;
    }
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}
