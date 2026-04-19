import type { SecretProvider } from "../runtime/registry.js";

/**
 * Doppler provider. Reference format:
 *   @doppler:PROJECT/CONFIG/SECRET_NAME
 *
 * Reads `DOPPLER_TOKEN` (service-token or personal) from the env. Uses the
 * Doppler REST API directly so we don't need a Doppler SDK dep.
 */
export function dopplerProvider(
  options: { token?: string; fetch?: typeof fetch } = {},
): SecretProvider {
  const fetchFn = options.fetch ?? globalThis.fetch;
  return {
    scheme: "doppler",
    async resolve(payload, ctx) {
      const token = options.token ?? process.env.DOPPLER_TOKEN;
      if (!token) throw new Error("DOPPLER_TOKEN is not set");
      const parts = payload.split("/");
      if (parts.length !== 3) {
        throw new Error(
          `Doppler ref must be PROJECT/CONFIG/NAME, got "${payload}"`,
        );
      }
      const [project, config, name] = parts;
      const url = new URL(
        `https://api.doppler.com/v3/configs/config/secret?project=${project}&config=${config}&name=${name}`,
      ).toString();
      const auth = `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
      const res = await fetchFn(url, {
        headers: { authorization: auth },
        signal: ctx.signal,
      });
      if (!res.ok) {
        throw new Error(
          `Doppler request failed: ${res.status} ${res.statusText}`,
        );
      }
      const body = (await res.json()) as {
        value?: { computed?: string; raw?: string };
      };
      const value = body.value?.computed ?? body.value?.raw;
      if (value === undefined) {
        throw new Error(`Doppler secret "${payload}" has no value`);
      }
      return value;
    },
  };
}
