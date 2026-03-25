import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // JWT authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const secret = process.env.JWT_SECRET || "dev-secret";
      const decoded = jwt.verify(token, secret) as { id: string; role: string };
      (socket as Socket & { userId?: string; userRole?: string }).userId = decoded.id;
      (socket as Socket & { userId?: string; userRole?: string }).userRole = decoded.role;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket as Socket & { userId?: string }).userId;
    console.log(`[Socket.IO] Client connected: ${userId}`);

    // Auto-join global feed
    socket.join("feed:global");

    // Auto-join user-specific watchlist room
    if (userId) {
      socket.join(`feed:watchlist:${userId}`);
    }

    // Subscribe to rooms
    socket.on("subscribe", (room: string) => {
      if (
        room.startsWith("feed:region:") ||
        room.startsWith("feed:embassy:") ||
        room.startsWith("feed:watchlist:")
      ) {
        socket.join(room);
      }
    });

    // Unsubscribe from rooms
    socket.on("unsubscribe", (room: string) => {
      if (room !== "feed:global") {
        socket.leave(room);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected: ${userId}`);
    });

    socket.on("error", (err) => {
      console.error(`[Socket.IO] Socket error for ${userId}:`, err.message);
    });
  });

  console.log("[Socket.IO] WebSocket server initialized");
  return io;
}

export function getIO(): Server | null {
  return io;
}

export interface FeedEvent {
  id: string;
  type: "NEW_EVENT" | "THREAT_CHANGE" | "THREAT_ASSESSED" | "SOURCE_STATUS" | "ANALYSIS_STARTED" | "ANALYSIS_COMPLETED";
  source?: string;
  sourceType?: "NEWS" | "WEATHER" | "ADVISORY" | "GEOPOLITICAL";
  title?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  embassyId?: string | null;
  embassyName?: string | null;
  country?: string;
  region?: string;
  previousLevel?: string;
  newLevel?: string;
  summary?: string;
  sourceName?: string;
  status?: "HEALTHY" | "DEGRADED" | "DOWN";
  embassyCount?: number;
  duration_ms?: number;
  timestamp: string;
}

export function emitFeedEvent(event: FeedEvent): void {
  if (!io) return;
  try {
    // Always emit to global
    io.to("feed:global").emit("feed:event", event);

    // Emit to region-specific room
    if (event.region) {
      io.to(`feed:region:${event.region}`).emit("feed:event", event);
    }

    // Emit to embassy-specific room
    if (event.embassyId) {
      io.to(`feed:embassy:${event.embassyId}`).emit("feed:event", event);
    }
  } catch (err) {
    // Fire and forget — never block the data pipeline
    console.error("[Socket.IO] Emission error:", (err as Error).message);
  }
}
