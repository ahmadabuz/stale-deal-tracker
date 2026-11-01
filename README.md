# Stale Deal Tracker

A weekly email and web dashboard that show a sales manager which reps have the most money sitting in stale deals. Built with Google Sheets and Google Apps Script, using public CRM sample data.

[ADD DEMO GIF OR VIDEO LINK HERE]

## The problem

In a spreadsheet of open deals, it's hard to see which ones have gone quiet. A manager has to filter, sort and check dates by hand to find them, and by then the deal may be dead. This project does that check automatically and puts the answer in front of the manager every Monday.

## What it does

**1. Monday report email.** Every Monday, a script reads the open deals, finds the stale ones, adds up their value per rep, and emails the manager a summary:
- how many open deals are stale, and their total value
- the reps with the most stale value (the top quarter by value)
- for each flagged rep: deal count, total stale value, oldest deal, and their three highest-value stale deals

**2. Manager dashboard.** A web page where the manager can:
- switch between reps with a dropdown
- see open deals, deals needing action, and the value needing action
- see each deal's account, product, value, age, status (color-coded), last contact and note
- click **Log contact** to record a contact date and a note, which updates the spreadsheet and takes the deal off the "needs action" list

[ADD EMAIL SCREENSHOT: images/email-report.png]
[ADD DASHBOARD SCREENSHOT: images/dashboard.png]

## How a deal is judged stale

Each open deal gets a status from its age, measured in days since the first engagement:

| Status | Age | Meaning |
|---|---|---|
| On track | 88 days or less | Moving normally |
| Check in | 89 to 138 days | Taking longer than most deals |
| Qualify or close | Over 138 days | Past the longest normal sales cycle |

The 88 and 138 day thresholds come from the sales cycle of deals that already closed in this dataset [ADD DETAIL: for example, 88 days is the 75th percentile and 138 days is the longest observed cycle. Link your notebook if you include it].

A deal **needs action** when:
1. its status is `Qualify or close`, and
2. it has no logged contact in the last 7 days.

Logging a contact takes the deal off the list for 7 days. After that it returns, unless it has been contacted again.

The thresholds, the 7-day window and the "top quarter" cutoff are all set in the `CONFIG` block at the top of `Code.gs`.

## How it works

```
Google Sheet  ──►  Apps Script (Code.gs)
 open_deals         ├─ sendManagerReport()  ──► weekly email (time trigger, Mondays)
 reps               ├─ getPageData()        ──► feeds the dashboard
 teams              └─ logContact()         ◄── "Log contact" button on the dashboard
 products                     ▲
                      index.html (dashboard)
```

- **Sheet formulas** calculate age, price, manager, region and status.
- **Apps Script** reads the sheet, applies the stale-deal rules, sends the email and serves the web page.
- **The dashboard** reads through `getPageData()` and writes through `logContact()`.

## Data

Source: [Maven Analytics CRM Sales Opportunities](https://mavenanalytics.io/data-playground/crm-sales-opportunities) (public sample data). Three of its files are used, kept unmodified in `data/raw/`:

| File | Spreadsheet tab | Used for |
|---|---|---|
| `sales_pipeline.csv` | `open_deals` (columns A to H) | One row per deal: agent, product, account, stage, dates |
| `sales_teams.csv` | `teams` | Each rep's manager and regional office |
| `products.csv` | `products` | Each product's list price |

### Columns added in the spreadsheet

Columns I to O of `open_deals` are formulas, or are filled by the script:

| Column | How it is filled |
|---|---|
| `age_days` | 31 Dec 2017 minus `engage_date` |
| `sales_price` | Product list price, looked up from `products` |
| `manager`, `regional_office` | Looked up from `teams` by sales agent |
| `tier` | `On track`, `Check in` or `Qualify or close` (see above) |
| `last_contact_date`, `rep_note` | Written by the dashboard's Log contact button |

The `reps` tab is the unique list of sales agents in `open_deals`. It fills the dashboard dropdown.

### Things to know about the data

- **Dates.** The deals are from 2016 and 2017, so age is measured against 31 Dec 2017 instead of today's date. Using today's date would make every deal look years old.
- **Open deals only.** Only deals in the `Engaging` and `Prospecting` stages count as open. The sheet still contains Won and Lost rows, and the script ignores them by filtering on `deal_stage`.
- **Deal value is an estimate.** Open deals have no `close_value`, so value comes from the product's list price. Won deals in the data closed slightly away from list price, so real values would differ.
- **Product names.** One product is written `GTXPro` in the deals and `GTX Pro` in the products file. The price formula handles this.
- **Missing accounts.** Some early-stage deals have no account name. The dashboard shows "no account yet".

## Setup

### 1. Build the spreadsheet

1. Create a Google Sheet and import the three CSV files into tabs named exactly:
   `open_deals` (from `sales_pipeline.csv`), `teams` (from `sales_teams.csv`) and `products` (from `products.csv`).
2. Import into a **new** spreadsheet and check that `engage_date` shows as right-aligned dates. Importing into an existing sheet can turn dates into text and break the age formula.
3. In `open_deals`, add these headers in `I1:O1`, spelled exactly like this:

   `age_days`, `sales_price`, `manager`, `regional_office`, `tier`, `last_contact_date`, `rep_note`

4. Put one formula in row 2 of each column. Don't drag them down. Each one fills its whole column.

   `I2` (age_days):
   ```
   =ARRAYFORMULA(IF(A2:A="",,IF(F2:F="",0,DATE(2017,12,31)-F2:F)))
   ```
   `J2` (sales_price):
   ```
   =ARRAYFORMULA(IF(A2:A="",,IFERROR(VLOOKUP(SUBSTITUTE(C2:C,"GTXPro","GTX Pro"),products!A:C,3,FALSE),0)))
   ```
   `K2` (manager):
   ```
   =ARRAYFORMULA(IF(A2:A="",,IFERROR(VLOOKUP(B2:B,teams!A:C,2,FALSE),"")))
   ```
   `L2` (regional_office):
   ```
   =ARRAYFORMULA(IF(A2:A="",,IFERROR(VLOOKUP(B2:B,teams!A:C,3,FALSE),"")))
   ```
   `M2` (tier):
   ```
   =ARRAYFORMULA(IF(A2:A="",,IF(I2:I>138,"Qualify or close",IF(I2:I>88,"Check in","On track"))))
   ```
   Leave `N` and `O` empty. The script fills them.

5. Create a tab named `reps`. Put `sales_agent` in `A1` and this in `A2`:
   ```
   =SORT(UNIQUE(FILTER(open_deals!B2:B, open_deals!E2:E<>"Won", open_deals!E2:E<>"Lost")))
   ```
6. Optional: filter `deal_stage` in `open_deals` to hide Won and Lost rows. This only changes what you see. The script does its own filtering.

### 2. Add the script

1. In the spreadsheet, open **Extensions → Apps Script**.
2. Paste `apps-script/Code.gs` into `Code.gs`.
3. Add an HTML file named `index` and paste `apps-script/index.html` into it.
4. In `CONFIG`, set `managerEmail` to your own address.

### 3. Deploy the dashboard

**Deploy → New deployment → Web app**
- Execute as: **Me**
- Who has access: **Only myself**

After any code change, use **Deploy → Manage deployments → Edit → New version**. Saving alone doesn't update the live page.

### 4. Schedule the Monday email

1. Open **Triggers** (the clock icon) and click **Add Trigger**.
2. Function: `sendManagerReport`
3. Event source: **Time-driven**, type **Week timer**, day **Every Monday**, and pick an hour.
4. Authorize the script when asked.

To test now, select `sendManagerReport` in the editor toolbar and click **Run**.

## Configuration

Set in `CONFIG` at the top of `Code.gs`:

| Setting | Default | What it does |
|---|---|---|
| `managerEmail` | `manager@example.com` | Who receives the Monday report |
| `staleTier` | `Qualify or close` | The status that counts as stale |
| `remindAfterDays` | `7` | Days a logged contact removes a deal from the list |
| `extremePercentile` | `0.75` | Flags reps in the top quarter by stale value |
| `topDealsPerRep` | `3` | Deals listed per flagged rep in the email |
| `openStages` | `Engaging`, `Prospecting` | Deal stages treated as open |

## Public read-only version (optional)

To share a live demo without giving write access, make a second Apps Script project bound to the same sheet, using the files in `apps-script/read-only/`. It has no `logContact` and no `sendManagerReport`, so the page can only read.

- Execute as: **Me**
- Who has access: **Anyone**
- Don't add the Monday trigger to this project.

This version has no sign-in, so anyone with the link sees every rep's deals. Use it only with public or sample data, as here. [LINK TO LIVE READ-ONLY DEMO]

## Limitations

- **Manager only.** There's no rep sign-in. Reps can't log their own contacts, so the manager or whoever has access logs them. Letting each rep log their own calls would be the next step.
- **Access control is deployment-level.** The private dashboard is protected by "Only myself". There's no per-user check in the code.
- **Estimated value.** Value uses list price, not negotiated price.
- **Fixed reference date.** Age is measured from 31 Dec 2017 because of the dataset's age.
- **Read speed.** The script reads the whole `open_deals` tab each time. This is fine at a few thousand rows and gets slow in the tens of thousands.

## Project structure

```
stale-deal-tracker/
├── README.md
├── apps-script/
│   ├── Code.gs
│   ├── index.html
│   └── read-only/
│       ├── Code.gs
│       └── index.html
├── data/
│   └── raw/
│       ├── sales_pipeline.csv
│       ├── sales_teams.csv
│       └── products.csv
└── images/
    ├── email-report.png
    ├── dashboard.png
    └── demo.gif
```

## Troubleshooting

- **Dashboard shows old behavior after an edit.** Create a **New version** in Manage deployments.
- **Log contact does nothing.** Check that the `open_deals` headers are exactly `opportunity_id`, `last_contact_date` and `rep_note`, and that no header cell is blank. Open the web app in a private window signed into only the owning Google account.
- **All values are $0.** The `products` tab is missing, or a product name doesn't match.
- **Age formula errors.** `engage_date` was imported as text. Re-import into a new spreadsheet.
- **A rep shows no deals.** They may have no open deals. Check `open_deals` for their name.

## Tech

Google Sheets, Google Apps Script (JavaScript), HTML and CSS.

## License and data credit

Code: [MIT or your choice].
Data: Maven Analytics, CRM Sales Opportunities sample dataset. See their site for terms.
