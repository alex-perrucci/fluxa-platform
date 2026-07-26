import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  FLUXA_API_BASE_URL: z
    .string()
    .url()
    .default('http://localhost:3000/api/v1'),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnv(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    FLUXA_API_BASE_URL: process.env.FLUXA_API_BASE_URL,
  });
}
