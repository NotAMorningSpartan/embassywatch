import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis.js";

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!redis) {
      next();
      return;
    }

    const key = `rl:${req.ip}`;
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSec);
      }

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - current));

      if (current > max) {
        const ttl = await redis.ttl(key);
        res.setHeader("Retry-After", ttl);
        res.status(429).json({
          error: "Too many requests",
          statusCode: 429,
          retryAfter: ttl,
        });
        return;
      }

      next();
    } catch {
      next();
    }
  };
}
