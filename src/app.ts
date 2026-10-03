import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { ZodError } from "zod";
import { env } from "./config.js";
import { router } from "./routes.js";

export const app = express();

app.use(helmet());
app.use(
  cors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/api/v1", router);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request is invalid.",
          details: error.flatten(),
        },
      });
    return;
  }
  const statusCode =
    typeof error?.statusCode === "number" ? error.statusCode : 500;
  const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
  if (statusCode >= 500) console.error(error);
  res
    .status(statusCode)
    .json({
      error: {
        code,
        message:
          statusCode >= 500 ? "An unexpected error occurred." : error.message,
      },
    });
};

app.use(errorHandler);
