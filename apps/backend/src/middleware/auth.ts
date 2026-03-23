import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler.js";
import { UserRole } from "../entities/enums.js";

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const JWT_SECRET = () => process.env.JWT_SECRET || "embassywatch-dev-secret";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "Authentication required");
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET()) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError(401, "Invalid or expired token");
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, "Authentication required");
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "Insufficient permissions");
    }
    next();
  };
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: "1h" });
}

export function signRefreshToken(id: string): string {
  return jwt.sign({ id, type: "refresh" }, JWT_SECRET(), { expiresIn: "7d" });
}

export function verifyRefreshToken(token: string): { id: string; type: string } {
  return jwt.verify(token, JWT_SECRET()) as { id: string; type: string };
}
