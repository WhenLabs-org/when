import type { SecretProvider } from "../runtime/registry.js";

type SecretsManagerClientLike = {
  send: (command: unknown) => Promise<{ SecretString?: string }>;
};

type SecretsManagerModule = {
  SecretsManagerClient: new (opts: { region?: string }) => SecretsManagerClientLike;
  GetSecretValueCommand: new (opts: {
    SecretId: string;
    VersionStage?: string;
  }) => unknown;
};

/**
 * AWS Secrets Manager provider. Reference format:
 *   @aws-sm:arn:aws:secretsmanager:us-east-1:123:secret:my-secret#FIELD
 *   @aws-sm:my-secret#FIELD   (uses default region)
 *
 * Depends on the optional peer `@aws-sdk/client-secrets-manager`; loaded lazily
 * so envalid can install without the AWS SDK.
 */
export function awsSmProvider(
  options: { region?: string; client?: SecretsManagerClientLike } = {},
): SecretProvider {
  let clientPromise: Promise<SecretsManagerClientLike> | undefined;
  const getClient = async (): Promise<SecretsManagerClientLike> => {
    if (options.client) return options.client;
    if (!clientPromise) {
      clientPromise = (async () => {
        const mod = (await import(
          "@aws-sdk/client-secrets-manager" as string
        )) as SecretsManagerModule;
        return new mod.SecretsManagerClient({
          region: options.region ?? process.env.AWS_REGION,
        });
      })();
    }
    return clientPromise;
  };

  return {
    scheme: "aws-sm",
    async resolve(payload) {
      const hashIdx = payload.indexOf("#");
      const hasField = hashIdx > 0;
      const secretId = hasField ? payload.slice(0, hashIdx) : payload;
      const field = hasField ? payload.slice(hashIdx + 1) : undefined;

      const client = await getClient();
      const mod = (await import(
        "@aws-sdk/client-secrets-manager" as string
      )) as SecretsManagerModule;
      const cmd = new mod.GetSecretValueCommand({ SecretId: secretId });
      const response = await client.send(cmd);
      const secretString = response.SecretString;
      if (secretString === undefined) {
        throw new Error(`AWS secret ${secretId} has no SecretString`);
      }
      if (!field) return secretString;
      try {
        const parsed = JSON.parse(secretString) as Record<string, string>;
        const value = parsed[field];
        if (value === undefined) {
          throw new Error(
            `AWS secret ${secretId} has no field "${field}"`,
          );
        }
        return value;
      } catch (err) {
        if ((err as Error).message.startsWith("AWS secret")) throw err;
        throw new Error(
          `AWS secret ${secretId} is not JSON; cannot extract field "${field}"`,
        );
      }
    },
  };
}
