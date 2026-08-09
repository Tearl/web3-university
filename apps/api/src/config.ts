import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ORACLE_API_KEY: z.string().min(8).default("change-me"),
});

export const config = schema.parse(process.env);
