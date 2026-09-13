import { NextResponse } from "next/server";

/**
 * HTTP Basic Auth across the whole app.
 *
 * This is deliberately the simplest thing that works: one shared credential
 * handed out privately, no user store, no sessions, no dependencies. It is
 * appropriate because the app holds no accounts and no server-side data, the
 * point is to keep the deployment private while the AMFI permission question
 * is open, not to manage identities.
 *
 * It runs on every request including /api/nav, so the NAV endpoint is not
 * reachable without credentials either.
 */

const encoder = new TextEncoder();

/**
 * Compare two strings without leaking their contents through timing.
 * Hashing first makes the comparison fixed-length regardless of input, so
 * length differences do not leak either. Web Crypto is used because
 * middleware runs on the Edge runtime, where node:crypto is unavailable.
 */
const secureEquals = async (a, b) => {
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);

  let diff = 0;
  for (let i = 0; i < viewA.length; i += 1) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
};

const unauthorized = () =>
  new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Mutual Fund Returns Calculator", charset="UTF-8"',
      // Never let a 401 be cached and served to someone else.
      "Cache-Control": "no-store",
    },
  });

export async function middleware(request) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // Unconfigured credentials fail CLOSED in production. Forgetting to set the
  // env vars on Vercel should make the site unreachable, never public.
  if (!user || !password) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "BASIC_AUTH_USER / BASIC_AUTH_PASSWORD are not set, refusing all requests."
      );
      return new NextResponse(
        "This deployment is misconfigured: no credentials are set.",
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.next(); // local dev without credentials stays usable
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  // Only the FIRST colon separates user from password, passwords may contain
  // colons and splitting on all of them would silently truncate them.
  const separator = decoded.indexOf(":");
  if (separator === -1) return unauthorized();

  const givenUser = decoded.slice(0, separator);
  const givenPassword = decoded.slice(separator + 1);

  // Both comparisons always run, so a wrong username costs the same as a
  // wrong password and the pair cannot be probed independently.
  const [userOk, passwordOk] = await Promise.all([
    secureEquals(givenUser, user),
    secureEquals(givenPassword, password),
  ]);

  if (!userOk || !passwordOk) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own static assets and the favicon. Those carry
     * no data and excluding them keeps the 401 challenge from firing on every
     * chunk request, which browsers handle poorly.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
