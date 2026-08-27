import { z } from 'zod';

const localHost = /^(localhost|127\.0\.0\.1|::1)$/i;

const serverEnvironmentSchema = z
  .object({
    FLUXA_API_BASE_URL: z
      .string()
      .url()
      .default('http://localhost:3000/api/v1'),
    FLUXA_INTERNAL_API_BASE_URL: z.string().url().optional(),
  })
  .superRefine((environment, context) => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const apiUrl = new URL(environment.FLUXA_API_BASE_URL);

    if (apiUrl.protocol !== 'https:' || localHost.test(apiUrl.hostname)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FLUXA_API_BASE_URL'],
        message: 'must be a non-local HTTPS URL in production',
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnv(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    FLUXA_API_BASE_URL: process.env.FLUXA_API_BASE_URL,
    FLUXA_INTERNAL_API_BASE_URL: process.env.FLUXA_INTERNAL_API_BASE_URL,
  });
}

export function getFluxaServerApiBaseUrl(
  environment: ServerEnvironment = getServerEnv(),
): string {
  return (
    environment.FLUXA_INTERNAL_API_BASE_URL ?? environment.FLUXA_API_BASE_URL
  ).replace(/\/+$/, '');
}
