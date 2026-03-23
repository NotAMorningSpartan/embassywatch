import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { AppDataSource } from "../config/database.js";
import { redis } from "../config/redis.js";
import { User } from "../entities/User.js";
import {
  authenticate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();
const userRepo = () => AppDataSource.getRepository(User);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

// POST /api/auth/login
router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await userRepo().findOneBy({ email });
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const payload = { id: user.id, email: user.email, role: user.role };
  const token = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  res.json({
    token,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

// POST /api/auth/refresh
router.post("/refresh", validate(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;

  let decoded: { id: string; type: string };
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "Invalid refresh token");
  }

  if (decoded.type !== "refresh") {
    throw new AppError(401, "Invalid refresh token");
  }

  if (redis) {
    const blacklisted = await redis.get(`bl:${refreshToken}`);
    if (blacklisted) {
      throw new AppError(401, "Token has been revoked");
    }
  }

  const user = await userRepo().findOneBy({ id: decoded.id });
  if (!user) {
    throw new AppError(401, "User not found");
  }

  const payload = { id: user.id, email: user.email, role: user.role };
  const token = signAccessToken(payload);

  res.json({ token });
});

// POST /api/auth/logout
router.post("/logout", authenticate, validate(logoutSchema), async (req, res) => {
  const { refreshToken } = req.body;

  if (redis) {
    // Blacklist for 7 days (refresh token lifetime)
    await redis.set(`bl:${refreshToken}`, "1", "EX", 7 * 24 * 60 * 60);
  }

  res.json({ message: "Logged out" });
});

export default router;
