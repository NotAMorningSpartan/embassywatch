import "reflect-metadata";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { AppDataSource } from "./config/database.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import authRoutes from "./routes/auth.js";
import embassyRoutes from "./routes/embassies.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";
import threatRoutes from "./routes/threats.js";
import reportRoutes from "./routes/reports.js";
import aiRoutes from "./routes/ai.js";
import { startScheduler } from "./services/scheduler.js";
import { initSocketServer } from "./services/socketServer.js";
import { startMockEmitter } from "./services/MockEventEmitter.js";

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api", reportRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/embassies", embassyRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/threats", threatRoutes);
app.use("/api/ai", aiRoutes);

app.use(errorHandler);

AppDataSource.initialize()
  .then(() => {
    console.log("Database connected.");
    startScheduler();

    // Initialize WebSocket server
    initSocketServer(httpServer);

    // Mock emitter is started on-demand from the admin panel
    // via POST /api/admin/mock-emitter/start

    httpServer.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
    process.exit(1);
  });
