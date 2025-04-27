import axios from "axios";

// Helper function to parse scheme name into base, plan, and variant
function parseSchemeName(schemeName) {
  const lowerName = schemeName.toLowerCase();
  let variant = null;
  let plan = null;

  // Determine variant
  if (lowerName.includes("growth")) {
    variant = "growth";
  } else if (
    lowerName.includes("income distribution cum capital withdrawal") ||
    lowerName.includes("idcw")
  ) {
    variant = "idcw";
  }

  // Determine plan
  const planRegex = /(direct|regular)(\s+plan)?/gi;
  const planMatch = lowerName.match(planRegex);
  if (planMatch) {
    const lastPlan = planMatch[planMatch.length - 1].toLowerCase();
    if (lastPlan.startsWith("direct")) {
      plan = "direct";
    } else if (lastPlan.startsWith("regular")) {
      plan = "regular";
    }
  }

  // Extract base name by removing plan and variant related terms
  let base = schemeName;

  // Remove variant terms
  if (variant === "growth") {
    base = base.replace(/growth/gi, "");
  } else if (variant === "idcw") {
    base = base.replace(/idcw/gi, "");
    base = base.replace(/income distribution cum capital withdrawal/gi, "");
  }

  // Remove plan terms
  if (plan === "direct") {
    base = base.replace(/direct\s+plan/gi, "");
    base = base.replace(/direct/gi, "");
  } else if (plan === "regular") {
    base = base.replace(/regular\s+plan/gi, "");
    base = base.replace(/regular/gi, "");
  }

  // Clean up the base name
  base = base
    .replace(/[-–]/g, " ") // Replace hyphens with spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/\bplan\b/gi, "") // Remove standalone 'plan' words
    .trim();

  return { base, plan, variant };
}

export const getNav = async (req, res) => {
  const rawSchemes = req.query.schemes;

  if (!rawSchemes) {
    return res
      .status(400)
      .json({ status: false, error: "No schemes provided" });
  }

  const schemeList = rawSchemes.split(",").map((s) => s.trim());

  try {
    const { data } = await axios.get(
      "https://www.amfiindia.com/spages/NAVAll.txt"
    );
    const lines = data.split("\n");

    // Preprocess all data lines into structured format
    const processedData = lines
      .map((line) => {
        const parts = line.split(";");
        if (parts.length < 6) return null; // Skip invalid lines

        const schemeName = parts[3].trim();
        const nav = parts[4].trim();
        const date = parts[5].trim();

        const { base, plan, variant } = parseSchemeName(schemeName);

        return {
          original: schemeName,
          base: base.toLowerCase(),
          plan,
          variant,
          nav,
          date,
        };
      })
      .filter((item) => item !== null);

    const results = [];

    for (const name of schemeList) {
      // Parse the query scheme
      const {
        base: queryBase,
        plan: queryPlan,
        variant: queryVariant,
      } = parseSchemeName(name);
      const normalizedQueryBase = queryBase.toLowerCase();

      // Find matching entries
      const matches = processedData.filter((entry) => {
        const baseMatch = entry.base.includes(normalizedQueryBase);
        const planMatch = !queryPlan || entry.plan === queryPlan;
        const variantMatch = !queryVariant || entry.variant === queryVariant;
        return baseMatch && planMatch && variantMatch;
      });

      if (matches.length > 0) {
        const match = matches[0]; // Take the first match
        results.push({
          statusCode: 200,
          data: {
            scheme: match.original,
            nav: match.nav,
            date: match.date,
          },
        });
      } else {
        results.push({
          statusCode: 404,
          data: { scheme: name },
          error: "Not found",
        });
      }
    }

    console.log(results.filter((result) => result.statusCode != 200).length);

    //console.log(
    //  "matches found : ",
    //  results.filter((result) => {
    //    return result.statusCode != 404 ? result : null;
    //  }).length
    //);

    res.status(200).json({ status: true, data: results });
  } catch (err) {
    res.status(500).json({ status: false, error: "Failed to fetch NAV data" });
  }
};
