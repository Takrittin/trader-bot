import "server-only";

import { z } from "zod";
import {
  ALPACA_DATA_BASE_URL,
  ALPACA_PAPER_TRADING_BASE_URL,
  isPaperTradingBaseUrl,
} from "@/lib/alpaca/constants";

const requiredSecret = z.string().trim().min(1);

const rawServerEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    ALPACA_TRADING_MODE: z.literal("paper").default("paper"),
    ALPACA_TRADING_BASE_URL: z
      .string()
      .trim()
      .url()
      .default(ALPACA_PAPER_TRADING_BASE_URL),
    ALPACA_DATA_BASE_URL: z.string().trim().url().default(ALPACA_DATA_BASE_URL),
    ALPACA_API_KEY_ID: requiredSecret.optional(),
    ALPACA_API_SECRET_KEY: requiredSecret.optional(),
    APCA_API_KEY_ID: requiredSecret.optional(),
    APCA_API_SECRET_KEY: requiredSecret.optional(),
  })
  .superRefine((env, context) => {
    if (!isPaperTradingBaseUrl(env.ALPACA_TRADING_BASE_URL)) {
      context.addIssue({
        code: "custom",
        path: ["ALPACA_TRADING_BASE_URL"],
        message:
          "Live trading URLs are not allowed. Use https://paper-api.alpaca.markets.",
      });
    }

    if (!(env.ALPACA_API_KEY_ID ?? env.APCA_API_KEY_ID)) {
      context.addIssue({
        code: "custom",
        path: ["ALPACA_API_KEY_ID"],
        message: "Required paper Alpaca key ID.",
      });
    }

    if (!(env.ALPACA_API_SECRET_KEY ?? env.APCA_API_SECRET_KEY)) {
      context.addIssue({
        code: "custom",
        path: ["ALPACA_API_SECRET_KEY"],
        message: "Required paper Alpaca secret key.",
      });
    }
  })
  .transform((env) => ({
    nodeEnv: env.NODE_ENV,
    alpaca: {
      tradingMode: env.ALPACA_TRADING_MODE,
      tradingBaseUrl: env.ALPACA_TRADING_BASE_URL,
      dataBaseUrl: env.ALPACA_DATA_BASE_URL,
      apiKeyId: env.ALPACA_API_KEY_ID ?? env.APCA_API_KEY_ID ?? "",
      apiSecretKey: env.ALPACA_API_SECRET_KEY ?? env.APCA_API_SECRET_KEY ?? "",
    },
  }));

export type ServerEnv = z.infer<typeof rawServerEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = rawServerEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid server environment: ${details}`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
