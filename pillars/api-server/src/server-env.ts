/**
 * server-env — process.env helpers.
 *
 * Defensive design:
 *   - Fail-fast if PEMs look like the bug class we hit in CI: env value
 *     contains literal `\n` escape sequences instead of real newlines.
 *     This is the bug pattern from scripts/gen-dev-jwt.mjs escaping
 *     newlines with `replace(/\n/g, "\\n")` before writing to `.env`.
 *   - Fail-fast if PEM is missing the BEGIN/END headers — silently
 *     accepting a malformed PEM would let api-server start, then crash
 *     on the first signed JWT.
 *   - Fail-fast in production if either PEM is missing — the server
 *     cannot sign or verify JWTs without them.
 */
const PEM_PRIVATE_HEADER = "BEGIN PRIVATE KEY";
const PEM_PUBLIC_HEADER = "BEGIN PUBLIC KEY";

function looksLikeEscapedNewlines(value: string): boolean {
  // Cheap check: a real PEM with no escaped newlines shouldn't match.
  // If the value contains `\` followed by `n` and lacks real `\n` chars,
  // we are looking at the bug class.
  if (value.includes("\n")) return false;
  return /\\n/.test(value);
}

function isPemWellFormed(value: string, header: string): boolean {
  return value.includes(header) && value.includes("END");
}

export function getJwtPemEnv(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const privateKeyPem = process.env["JWT_PRIVATE_KEY_PEM"] ?? "";
  const publicKeyPem = process.env["JWT_PUBLIC_KEY_PEM"] ?? "";
  const isProd = process.env["NODE_ENV"] === "production";

  // Defense-in-depth: detect the escaped-newline bug class regardless of
  // NODE_ENV. The bug manifests as api-server starting with keys that
  // look present but are unusable, and the only symptom is a later
  // crash on first signed JWT — too late to debug.
  if (looksLikeEscapedNewlines(privateKeyPem)) {
    throw new Error(
      "JWT_PRIVATE_KEY_PEM contains literal '\\n' escape sequences " +
        "instead of real newlines. Check that the producer (script, " +
        "Helm values, Doppler) writes the value verbatim without " +
        "JSON.stringify or string escaping.",
    );
  }
  if (looksLikeEscapedNewlines(publicKeyPem)) {
    throw new Error(
      "JWT_PUBLIC_KEY_PEM contains literal '\\n' escape sequences " +
        "instead of real newlines. Check that the producer writes the " +
        "value verbatim without string escaping.",
    );
  }

  // PEM shape validation in production — fail-fast on first startup,
  // not on first auth request. Dev mode tolerates empty / placeholder
  // PEMs to keep local iteration fast.
  if (isProd) {
    if (
      privateKeyPem !== "" &&
      !isPemWellFormed(privateKeyPem, PEM_PRIVATE_HEADER)
    ) {
      throw new Error(
        "JWT_PRIVATE_KEY_PEM is set but does not look like a PKCS#8 " +
          `PEM (expected '${PEM_PRIVATE_HEADER}' header and 'END' footer).`,
      );
    }
    if (
      publicKeyPem !== "" &&
      !isPemWellFormed(publicKeyPem, PEM_PUBLIC_HEADER)
    ) {
      throw new Error(
        "JWT_PUBLIC_KEY_PEM is set but does not look like an SPKI " +
          `PEM (expected '${PEM_PUBLIC_HEADER}' header and 'END' footer).`,
      );
    }
  }

  // Production gate — never start in production without both keys.
  if (isProd && (privateKeyPem.trim() === "" || publicKeyPem.trim() === "")) {
    throw new Error(
      "JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM required in production",
    );
  }

  return { privateKeyPem, publicKeyPem };
}
