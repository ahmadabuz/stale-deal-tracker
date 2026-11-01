const CONFIG = {
  dealsSheet: "open_deals",
  staleTier: "Qualify or close",
  remindAfterDays: 7,
  extremePercentile: 0.75,
  topDealsPerRep: 3
};

function toObjects(sheet) {
  const [header, ...rows] = sheet.getDataRange().getValues();
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const REPS_SHEET = "reps";

function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("My Deals")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// read-only: returns deals for the selected rep. No logging, no user email.
function getPageData(selectedRep) {
  const reps = toObjects(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPS_SHEET));
  const names = reps.map(r => r.sales_agent).filter(String).sort();
  const rep = selectedRep || names[0];
  if (!rep) return { error: "No reps found in the reps tab." };

  const tz = Session.getScriptTimeZone();
  const fmt = v => v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : (v || "");
  const today = new Date();
  const order = { "Qualify or close": 0, "Check in": 1, "On track": 2 };

  const deals = toObjects(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.dealsSheet))
    .filter(d => d.sales_agent === rep)
    .map(d => {
      const last = d.last_contact_date instanceof Date ? d.last_contact_date : null;
      const recent = last && (today - last) / 86400000 <= CONFIG.remindAfterDays;
      return {
        id: d.opportunity_id,
        account: d.account || "",
        product: d.product,
        price: Number(d.sales_price || 0),
        age: Number(d.age_days),
        tier: d.tier,
        lastContact: fmt(d.last_contact_date),
        note: d.rep_note || "",
        needsAction: d.tier === CONFIG.staleTier && !recent
      };
    })
    .sort((a, b) => (order[a.tier] - order[b.tier]) || (b.price - a.price));

  return { rep, repNames: names, deals };
}
