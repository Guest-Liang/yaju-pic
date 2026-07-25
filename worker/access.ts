import { createRemoteJWKSet, jwtVerify } from "jose"

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion"
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

export async function hasUploadAccess(
  request: Request,
  env: Env,
): Promise<boolean> {
  if (isLocalDevelopmentRequest(request)) {
    return true
  }

  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN)
  const audience = env.CF_ACCESS_AUD.trim()
  const token = request.headers.get(ACCESS_JWT_HEADER)?.trim()

  if (!teamDomain || !audience || !token || token.length > 16_384) {
    logAccessFailure(request, "missing-config-or-token")
    return false
  }

  try {
    const keys = createRemoteJWKSet(
      new URL(`${teamDomain}/cdn-cgi/access/certs`),
    )
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      audience,
      issuer: teamDomain,
    })

    return (
      payload.type === "app" &&
      typeof payload.email === "string" &&
      payload.email.length > 0
    )
  } catch (error) {
    logAccessFailure(
      request,
      error instanceof Error ? error.name : "jwt-verification-failed",
    )
    return false
  }
}

function normalizeTeamDomain(value: string): string {
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".cloudflareaccess.com") ||
      url.pathname !== "/"
    ) {
      return ""
    }
    return url.origin
  } catch {
    return ""
  }
}

function isLocalDevelopmentRequest(request: Request): boolean {
  return LOCAL_HOSTNAMES.has(new URL(request.url).hostname)
}

function logAccessFailure(request: Request, reason: string): void {
  console.warn(
    JSON.stringify({
      message: "Cloudflare Access authorization failed",
      method: request.method,
      path: new URL(request.url).pathname,
      reason,
    }),
  )
}
