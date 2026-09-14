import Link from "next/link";

export const metadata = {
  title: "How the numbers are calculated",
  description:
    "Every formula and term this calculator uses, stated plainly, including what the figures leave out.",
};

const Formula = ({ children }) => (
  <pre className="my-3 overflow-x-auto rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-[13px] leading-relaxed font-mono text-gray-800">
    {children}
  </pre>
);

const Term = ({ id, name, children }) => (
  <section id={id} className="scroll-mt-20 border-t border-gray-200 py-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{name}</h3>
    <div className="space-y-3 text-[15px] leading-relaxed text-gray-700">
      {children}
    </div>
  </section>
);

const Caution = ({ title, children }) => (
  <div className="my-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
    <p className="text-[13px] font-semibold text-amber-900 mb-1">{title}</p>
    <div className="text-[14px] leading-relaxed text-amber-900">{children}</div>
  </div>
);

export default function GlossaryPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <Link
        href="/sheet"
        className="text-sm text-[#00b5ef] hover:underline transition-colors"
      >
        &larr; Back to your holdings
      </Link>

      <h1 className="mt-6 text-3xl font-bold text-gray-900">
        How the numbers are calculated
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
        Every formula this calculator uses, written out. Nothing here is hidden
        or approximated behind the scenes. If a figure on your table looks wrong,
        this page should let you reproduce it by hand.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Jump to a term">
        {[
          ["nav", "NAV"],
          ["units", "Units"],
          ["current-value", "Current value"],
          ["gain", "Gain"],
          ["absolute-return", "Absolute return"],
          ["cagr", "CAGR"],
          ["xirr", "XIRR"],
          ["avg-cost", "Average cost"],
          ["ter", "Expense ratio"],
          ["plan-option", "Plan and option"],
          ["excluded", "What is excluded"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-[#00b5ef]/40 px-3 py-1 text-xs text-[#0095c7] transition-colors hover:bg-[#00b5ef]/10"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-4">
        <Term id="nav" name="NAV (Net Asset Value)">
          <p>
            The per-unit price of a mutual fund scheme, published once per
            business day. SEBI defines it as:
          </p>
          <Formula>{`NAV = (market value of investments + current assets
       - current liabilities and provisions)
      / units outstanding`}</Formula>
          <p>
            Two consequences matter here. Fund expenses are accrued as current
            liabilities, so <strong>the expense ratio is already inside the NAV
            you see</strong>. And NAV is published after markets close, so the
            most recent NAV is normally the previous business day&apos;s.
          </p>
          <p>
            This app reads NAVs from AMFI, the industry body that publishes them.
            The date shown at the top of your table is the date AMFI stamped on
            that figure, not the date you loaded the page.
          </p>
        </Term>

        <Term id="units" name="Units">
          <p>How many units your money bought on the day you invested.</p>
          <Formula>{`units = amount invested / NAV on the purchase date`}</Formula>
          <p>
            Example: ₹10,000 invested at a NAV of 50 buys 200 units. Units are
            the thing you actually own; the NAV is just what one of them was
            worth that day.
          </p>
        </Term>

        <Term id="current-value" name="Current value">
          <Formula>{`current value = units * current NAV`}</Formula>
          <p>
            200 units at today&apos;s NAV of 100 is ₹20,000. That is the whole
            calculation. It never goes through a return percentage.
          </p>
          <Caution title="Why that matters">
            An earlier version of this app reconstructed value from the CAGR
            instead of from units. For ₹10,000 that doubled over five years it
            reported ₹17,434.92 on load and ₹11,486.98 after an edit, against a
            true ₹20,000. Deriving money from an annualised rate is a lossy
            round trip. It is now computed one way, in one place, and pinned by
            a test.
          </Caution>
        </Term>

        <Term id="gain" name="Gain">
          <Formula>{`gain = current value - amount invested`}</Formula>
          <p>
            Unrealised. It is what you would have made if you sold at the NAV
            shown, before any exit load or tax.
          </p>
        </Term>

        <Term id="absolute-return" name="Absolute return">
          <p>
            How much the NAV moved, as a percentage, ignoring how long you held
            it.
          </p>
          <Formula>{`absolute return % = (current NAV / purchase NAV - 1) * 100`}</Formula>
          <p>
            NAV 50 to NAV 100 is +100%, whether that took six weeks or six
            years. This is the most honest single number for a short holding,
            because it makes no claim about time.
          </p>
        </Term>

        <Term id="cagr" name="CAGR (Compound Annual Growth Rate)">
          <p>
            The constant yearly rate that would have compounded your purchase
            NAV into today&apos;s NAV over the time you held it.
          </p>
          <Formula>{`years = days held / 365
CAGR % = ((current NAV / purchase NAV) ^ (1 / years) - 1) * 100`}</Formula>
          <p>
            NAV 50 to NAV 100 over five years is a CAGR of about 14.86%: growing
            at 14.86% a year for five years doubles your money.
          </p>
          <Caution title="Below one year, CAGR is a projection and not a return">
            <p>
              Annualising a short period asks &quot;what if this kept happening
              all year?&quot;, which is a forecast, not a measurement. A fund up
              5% in a single day annualises to roughly 5,500,000,000%.
            </p>
            <p className="mt-2">
              This app still shows the figure for holdings under a year, because
              hiding it is its own kind of dishonesty, but it renders it greyed
              with the holding period attached, like{" "}
              <code className="rounded bg-black/5 px-1">-15.53% (45d)</code>. The
              absolute return next to it is the number that actually happened.
            </p>
          </Caution>
          <p className="text-sm text-gray-600">
            SEBI takes the same view for scheme disclosures: returns for a
            scheme in existence less than a year are shown as absolute, not
            compounded. See the Master Circular for Mutual Funds dated 20 March
            2026, in the format for &quot;How has the scheme performed&quot;.
          </p>
        </Term>

        <Term id="xirr" name="XIRR">
          <p>
            The one to use when you bought the same fund more than once. XIRR is
            the annual rate that makes all your cashflows, on the actual dates
            they happened, balance against what the holding is worth today.
          </p>
          <Formula>{`find r such that:

  sum over each cashflow i of:
    CF[i] / (1 + r) ^ (days[i] / 365)  =  0

where each purchase is negative (money out)
and today's value is positive (money in)`}</Formula>
          <p>
            There is no closed-form answer, so it is solved numerically. This app
            uses Newton-Raphson with a bisection fallback for the awkward cases.
          </p>
          <Caution title="You cannot average CAGRs to get this">
            <p>
              Three lots with CAGRs of 10.52%, 12% and 15.60% do not give a
              portfolio return of their average. A money-weighted answer accounts
              for how much went in at each date, so a large late purchase that
              did poorly drags the result far more than a small early one that
              did well.
            </p>
            <p className="mt-2">
              That is why the Holdings view reports XIRR per holding and there is
              no total under the CAGR column. A single-lot holding is a lump sum,
              so there its XIRR and its CAGR are the same number, which is a test
              in this codebase.
            </p>
          </Caution>
          <p className="text-sm text-gray-600">
            The day count here is a flat 365, matching Excel and Google Sheets.
            You can verify any figure by pasting your dates and amounts into a
            spreadsheet and calling <code className="rounded bg-black/5 px-1">
            =XIRR(amounts, dates)</code>.
          </p>
        </Term>

        <Term id="avg-cost" name="Average cost per unit">
          <Formula>{`average cost = total invested / total units`}</Formula>
          <p>
            Weighted by how much you put in, not the plain average of the NAVs
            you bought at. If you invest ₹90,000 at NAV 90 and ₹1,000 at NAV 10,
            your average cost is about 82.73, not 50.
          </p>
        </Term>

        <Term id="plan-option" name="Plan and option (Direct, Regular, Growth, IDCW)">
          <p>
            <strong>Direct</strong> plans have no distributor commission, so they
            carry a lower expense ratio and a separate, higher NAV than{" "}
            <strong>Regular</strong> plans of the identical fund.
          </p>
          <p>
            <strong>Growth</strong> reinvests everything into the NAV.{" "}
            <strong>IDCW</strong> (Income Distribution cum Capital Withdrawal,
            called Dividend before April 2021) pays money out, and the NAV drops
            by the payout each time.
          </p>
          <Caution title="This app understates IDCW holdings">
            Because a payout reduces the NAV, comparing your purchase NAV to
            today&apos;s NAV misses every rupee you already received. Your
            uploaded file has no record of those payouts, so the calculator
            cannot add them back. For an IDCW holding, treat the return shown as
            a floor, not an answer, and check your consolidated account
            statement.
          </Caution>
          <p>
            This is also why the app refuses to guess when a scheme name matches
            more than one plan or option. Showing a Regular NAV against a Direct
            holding produces a confidently wrong number, which is worse than
            showing nothing.
          </p>
        </Term>

        <Term id="ter" name="Expense ratio (TER)">
        <p>
          What the fund charges you each year to run the scheme, as a
          percentage of assets. SEBI requires every AMC to publish it daily on
          AMFI&apos;s website, which is where this figure comes from.
        </p>
        <Caution title="It is already taken out of the returns shown">
          <p>
            Fund expenses accrue into the NAV every day, so the NAV you see is
            already net of them. Every return on this page, CAGR and XIRR
            alike, is therefore <strong>already after expenses</strong>.
          </p>
          <p className="mt-2">
            The column is shown so you can see what you are paying. It is never
            subtracted from anything. Subtracting it again would count the same
            cost twice and understate your returns by roughly the full expense
            ratio each year.
          </p>
        </Caution>
        <p>
          Where it is genuinely useful is comparing plans. A Regular plan pays
          distributor commission and a Direct plan does not, so the identical
          fund has two different expense ratios and two different NAVs. Where
          you hold a Regular plan, the table shows how much less the Direct
          plan of that same scheme charges.
        </p>
        <p className="text-sm text-gray-600">
          The figure is dated, because AMFI&apos;s file fills in over several
          days and the most recent day is usually incomplete. This app picks
          the most recent well-populated date rather than today, and shows
          nothing at all for a scheme it cannot match.
        </p>
      </Term>

      <Term id="excluded" name="What these numbers exclude">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Tax.</strong> Nothing here is post-tax. Capital gains rules
              for mutual funds changed in July 2024, and the Income-tax Act 2025
              took effect in April 2026, so check current rates rather than
              assuming.
            </li>
            <li>
              <strong>Exit load.</strong> Charged on redemption by many schemes,
              typically within a year of purchase. Unlike the expense ratio,
              there is no machine-readable source for it: SEBI sets no
              disclosure format, AMFI publishes nothing, and it exists only as
              prose in each scheme&apos;s offer document. Rather than guess,
              this app leaves it out and says so.
            </li>
            <li>
              <strong>Stamp duty</strong> of 0.005% on purchases since July 2020.
            </li>
            <li>
              <strong>IDCW payouts</strong> you have already received, as above.
            </li>
            <li>
              <strong>Verification of your purchase NAV.</strong> The app takes
              the NAV from your file and does not check it against what was
              actually published that day.
            </li>
            <li>
              <strong>Any benchmark.</strong> A 12% return is shown without
              context about what the category or index did.
            </li>
          </ul>
          <p>
            Expense ratio is <em>not</em> on this list, because it is already
            deducted inside the NAV. Subtracting it again would understate your
            returns.
          </p>
        </Term>
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 text-sm leading-relaxed text-gray-600">
        <p>
          NAV data comes from{" "}
          <a
            href="https://www.amfiindia.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00b5ef] hover:underline"
          >
            AMFI
          </a>
          . This is an unofficial tool, not affiliated with or endorsed by AMFI
          or any AMC. It performs arithmetic on data you supply. It is not
          investment advice. Verify anything that matters against your own
          consolidated account statement before acting on it.
        </p>
      </div>

      <Link
        href="/sheet"
        className="mt-6 inline-block text-sm text-[#00b5ef] hover:underline"
      >
        &larr; Back to your holdings
      </Link>
    </main>
  );
}
