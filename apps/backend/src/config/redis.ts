import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

try {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    console.warn("Redis connection error:", err.message);
  });

  redis.connect().catch(() => {
    console.warn("Redis unavailable — rate limiting and token blacklist disabled.");
    redis = null;
  });
} catch {
  console.warn("Redis unavailable — rate limiting and token blacklist disabled.");
}

export { redis };
