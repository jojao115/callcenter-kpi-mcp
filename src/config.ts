import { z } from 'zod';

const esquema = z.object({
  DATABASE_URL: z.string().min(1, 'Defina DATABASE_URL (veja o .env.example).'),
  MAX_LINHAS: z.coerce.number().int().min(1).max(1000).default(100),
  STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
});

export type Config = z.infer<typeof esquema>;

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = esquema.safeParse(env);
  if (!r.success) {
    throw new Error(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}
