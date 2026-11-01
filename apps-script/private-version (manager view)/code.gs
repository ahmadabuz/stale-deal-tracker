const CONFIG = {
  dealsSheet: "open_deals",
  managerEmail: "manager@gmail.com", // ADD YOUR EMAIL HERE
  staleTier: "Qualify or close",
  remindAfterDays: 7,        // a contact logged within this many days removes a deal from the list
  extremePercentile: 0.75,   // flag reps in the top quarter by stale deal value
  topDealsPerRep: 3,
  openStages: ["Engaging", "Prospecting"]
};

function getOpenDeals_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.dealsSheet);
  return toObjects(sheet).filter(d => CONFIG.openStages.includes(d.deal_stage));
}

function sendManagerReport() {
  const deals = getOpenDeals_();

  // stale deals with no recent contact
  const today = new Date();
  const stale = deals.filter(d => {
    if (d.tier !== CONFIG.staleTier) return false;
    if (!d.last_contact_date) return true;
    return (today - new Date(d.last_contact_date)) / 86400000 > CONFIG.remindAfterDays;
  });

  // per-rep stats
  const byRep = {};
  stale.forEach(d => (byRep[d.sales_agent] = byRep[d.sales_agent] || []).push(d));

  const stats = Object.keys(byRep).map(rep => {
    const list = byRep[rep].sort((a, b) => b.sales_price - a.sales_price);
    return {
      rep,
      manager: list[0].manager,
      count: list.length,
      value: list.reduce((s, d) => s + Number(d.sales_price || 0), 0),
      oldest: Math.max(...list.map(d => Number(d.age_days))),
      top: list.slice(0, CONFIG.topDealsPerRep)
    };
  }).sort((a, b) => b.value - a.value);

  // flag the top quarter by stale value
  const values = stats.map(s => s.value).sort((a, b) => a - b);
  const threshold = values.length
    ? values[Math.floor(CONFIG.extremePercentile * (values.length - 1))] : 0;
  const flagged = stats.filter(s => s.value >= threshold);

  // build and send the report
  const total = stale.reduce((s, d) => s + Number(d.sales_price || 0), 0);
  const rows = flagged.map(s =>
    `<tr><td>${s.rep}</td><td>${s.manager}</td><td>${s.count}</td>` +
    `<td>$${s.value.toLocaleString()}</td><td>${s.oldest}</td></tr>`).join("");
  const details = flagged.map(s =>
    `<p><b>${s.rep}</b>, highest-value stale deals:<br>` +
    s.top.map(d => `${d.account || "no account yet"} | ${d.product} | ` +
                   `${d.age_days} days | $${d.sales_price}`).join("<br>") + `</p>`).join("");

  const html =
    `<p>${stale.length} open deals are past the longest observed sales cycle with no recent contact ` +
    `(list value $${total.toLocaleString()}).<br>` +
    `${flagged.length} of ${stats.length} reps are flagged as the highest stale value on the team.</p>` +
    `<table border="1" cellpadding="6" style="border-collapse:collapse">` +
    `<tr><th>Rep</th><th>Manager</th><th>My Deals</th><th>Stale value</th><th>Oldest (days)</th></tr>` +
    `${rows}</table>${details}`;

  MailApp.sendEmail({
    to: CONFIG.managerEmail,
    subject: `Stale pipeline report: ${flagged.length} reps need attention`,
    body: `${flagged.length} reps flagged. Open this email in HTML view for the full report.`,
    htmlBody: html
  });
}

function toObjects(sheet) {
  const [header, ...rows] = sheet.getDataRange().getValues();
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// ---- web page ----

const REPS_SHEET = "reps";

function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("My Deals")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function getPageData(selectedRep) {
  const reps = toObjects(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPS_SHEET));
  const names = reps.map(r => r.sales_agent).filter(String).sort();
  const rep = selectedRep || names[0];
  if (!rep) return { error: "No reps found in the reps tab." };

  const tz = Session.getScriptTimeZone();
  const fmt = v => v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : (v || "");
  const today = new Date();
  const order = { "Qualify or close": 0, "Check in": 1, "On track": 2 };

  const deals = getOpenDeals_()
    .filter(d => d.sales_agent === rep)
    .map(d => {
      const last = d.last_contact_date instanceof Date ? d.last_contact_date : null;
      const recent = last && (today - last) / 86400000 <= CONFIG.remindAfterDays;
      return {
        id: String(d.opportunity_id).trim(),
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

function logContact(opportunityId, note) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.dealsSheet);
  const data = sheet.getDataRange().getValues();
  const h = data[0].map(x => String(x).trim());
  const idCol = h.indexOf("opportunity_id");
  const dateCol = h.indexOf("last_contact_date") + 1;
  const noteCol = h.indexOf("rep_note") + 1;
  if (idCol === -1 || dateCol === 0 || noteCol === 0) {
    throw new Error("Missing a required column header.");
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === String(opportunityId).trim()) {
      sheet.getRange(i + 1, dateCol).setValue(new Date());
      if (note) sheet.getRange(i + 1, noteCol).setValue(note);
      return true;
    }
  }
  throw new Error("Deal not found.");
}
function debugReps() {
  const deals = getOpenDeals_();
  const counts = {};
  deals.forEach(d => counts[d.sales_agent] = (counts[d.sales_agent] || 0) + 1);
  console.log("open deals:", deals.length);
  console.log("per rep:", JSON.stringify(counts));
}

function debugPage() {
  const r = getPageData("Darcel Schlecht");
  console.log(r ? "deals returned: " + r.deals.length : "RETURNED NULL");
  console.log(JSON.stringify(r).slice(0, 600));
}
