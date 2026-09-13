import {
  getSnapshot,
  lookup,
  ATTRIBUTION,
  MAX_SCHEMES_PER_REQUEST,
} from "@/lib/amfi";
import { rateLimit, clientKey, RATE_LIMIT } from "@/lib/rateLimit";

// This route reaches out to AMFI and must never be prerendered at build time.
export const dynamic = "force-dynamic";

const json = (body, init = {}) =>
  Response.json(body, {
    ...init,
    headers: {
      // Responses are derived from AMFI data and scoped to one user's
      // holdings: ask intermediaries not to retain them.
      "Cache-Control": "private, no-store",
      ...init.headers,
    },
  });

export async function GET(request) {
  const limit = rateLimit(clientKey(request));
  if (!limit.allowed) {
    return json(
      { status: false, error: "Too many requests, please slow down" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
          "RateLimit-Limit": String(RATE_LIMIT),
          "RateLimit-Remaining": "0",
        },
      }
    );
  }

  const rawSchemes = request.nextUrl.searchParams.get("schemes");
  if (!rawSchemes) {
    return json({ status: false, error: "No schemes provided" }, { status: 400 });
  }

  const schemeList = rawSchemes
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (schemeList.length === 0 || schemeList.length > MAX_SCHEMES_PER_REQUEST) {
    return json(
      {
        status: false,
        error: `Provide between 1 and ${MAX_SCHEMES_PER_REQUEST} schemes`,
      },
      { status: 400 }
    );
  }

  try {
    const index = await getSnapshot();

    const results = schemeList.map((query) => {
      const { match, confidence, candidates } = lookup(index, query);

      if (match) {
        return {
          statusCode: 200,
          data: {
            // `scheme` echoes the request so the client joins on it rather
            // than trusting array position.
            scheme: query,
            matchedScheme: match.name,
            plan: match.plan,
            option: match.option,
            schemeCode: match.code,
            nav: match.nav,
            date: match.date,
            confidence,
          },
        };
      }

      return {
        statusCode: 404,
        data: { scheme: query, confidence },
        error:
          confidence === "ambiguous"
            ? `Matched ${candidates.length} schemes; specify plan and option`
            : "Not found",
      };
    });

    const unmatched = results.filter((r) => r.statusCode !== 200).length;

    return json({
      status: true,
      navDate: index.navDate,
      attribution: ATTRIBUTION,
      matched: results.length - unmatched,
      unmatched,
      data: results,
    });
  } catch (err) {
    // Never echo the upstream error to the client; log it for the operator.
    console.error("NAV lookup failed:", err);
    return json(
      { status: false, error: "Failed to fetch NAV data" },
      { status: 502 }
    );
  }
}
