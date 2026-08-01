import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seed } from "./seed";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "15mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "15mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      if (/password|secret|token|screenshot|accountNumber|adminPin/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, redactLogValue(child)];
    }),
  );
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(redactLogValue(capturedJsonResponse))}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Security: block the well-known /admin path at the server level.
  // Any request to /admin or /admin/* returns a plain 404, indistinguishable
  // from a non-existent route. The real admin UI is served only under the
  // secret path configured via VITE_ADMIN_SECRET_PATH.
  app.use((req, res, next) => {
    const p = req.path;
    if (p === "/admin" || p.startsWith("/admin/")) {
      return res.status(404).send("Not found");
    }
    next();
  });

  // Seed database with initial data
  await seed().catch(console.error);
  
  await registerRoutes(httpServer, app);

  // Process daily earnings and staking releases
  const processEarningsInterval = async () => {
    try {
      await storage.processEarnings();
      log("Daily earnings processed successfully", "earnings");
    } catch (error) {
      console.error("Error processing daily earnings:", error);
    }
    try {
      await storage.releaseMaturedStakings();
    } catch (error) {
      console.error("Error releasing stakings:", error);
    }
  };
  
  // Run immediately on startup
  setTimeout(processEarningsInterval, 5000);
  
  // Then run every 5 minutes to ensure timely earnings processing
  setInterval(processEarningsInterval, 5 * 60 * 1000);

  // Clean up deposit screenshots: approved/rejected deposits lose their image after 24h
  const cleanupScreenshots = async () => {
    try {
      await storage.cleanupDepositScreenshots();
      log("Deposit screenshots cleanup done", "cleanup");
    } catch (error) {
      console.error("Error cleaning up deposit screenshots:", error);
    }
  };
  setTimeout(cleanupScreenshots, 10000);
  setInterval(cleanupScreenshots, 60 * 60 * 1000); // every hour

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
