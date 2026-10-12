# Tax Return Helper

**Prepare your Bangladesh income tax return on your own computer, then type it into [etaxnbr.gov.bd](https://etaxnbr.gov.bd) without the guesswork.**

Filing the e-return means gathering a year of salary, bank, investment and spending figures, then making the website's assets and liabilities statement balance to exactly 0. This app walks you through that in eight steps, in the same order as the website. It estimates your tax as you go, balances your figures for you, and gives you a sheet of every number to type in, page by page.

- **Private.** It runs on your own machine and keeps everything in plain files in its `data` folder. No account, no internet connection, nothing is uploaded.
- **Nothing to install** apart from Python. There are no packages or build steps.
- **Built for salaried individuals** filing in Bangladesh. It works for other income too, such as bank interest, dividends and rent.

> **The app's figures are estimates.** The website does the official calculation, so check your tax against its **Tax & Payment** page before you pay. This project isn't affiliated with the National Board of Revenue (NBR).

---

## Contents

1. [Before you start](#before-you-start)
2. [Install and run](#install-and-run)
3. [Two terms you need: assessment year and income year](#two-terms-you-need-assessment-year-and-income-year)
4. [Filing a return, step by step](#filing-a-return-step-by-step)
5. [Other things it does](#other-things-it-does)
6. [Your data](#your-data)
7. [Troubleshooting](#troubleshooting)
8. [For contributors](#for-contributors)

---

## Before you start

You'll need:

- **A TIN** and the **mobile number registered with your NID**. The website sends you a one-time code when you sign up.
- **An account on [etaxnbr.gov.bd](https://etaxnbr.gov.bd).** The first time, choose *e-Return*, then *I am not yet registered*, enter your TIN and mobile number, confirm the code and set a password. You don't need it until step 7, but it's worth checking early that your login works.
- **Your documents for the year.** Step 1 in the app has the full checklist. The main ones are:
  - your salary certificate and the tax deducted at source (TDS) certificate from your employer
  - bank statements showing balances on 30 June, and interest certificates
  - statements for insurance, DPS, provident fund and savings certificates
  - loan and credit card statements
  - last year's return, for last year's net wealth

## Install and run

You need **Python 3.10 or newer**. Then download the app: on GitHub click **Code → Download ZIP** and unzip it, or run `git clone`.

| System | How to start it |
|---|---|
| **macOS** | Double-click **`Start Tax Helper.command`**. The first time, macOS may block it: right-click it, choose **Open**, then confirm. |
| **Windows** | Install Python from [python.org](https://www.python.org/downloads/) and tick **"Add python.exe to PATH"** in the installer. Then double-click **`server.py`**. |
| **Linux** | Run `python3 server.py` in the app's folder. |
| **Docker** | Run `docker compose up -d --build`. It restarts on its own whenever Docker is running. |

The app opens in your browser at **http://127.0.0.1:8765**. It's only reachable from your own computer. To stop it, close the terminal window, or run `docker compose down` for Docker.

Options:

```bash
python3 server.py --port 9000      # use a different port
python3 server.py --no-browser     # don't open the browser automatically
```

## Two terms you need: assessment year and income year

Bangladesh taxes the **income year**, which runs from 1 July to 30 June. You file the return in the **assessment year** that follows it.

> The **AY 2026-27** return covers income earned from **1 July 2025 to 30 June 2026**, and is filed after 30 June 2026. The usual deadline is 30 November, and it's often extended.

The **Year** list at the top of the app shows both. A coloured badge tells you which year is open:

- **Filing now:** the return that's due.
- **In progress:** the current income year, which you can track month by month.
- **Past year** or **future year:** a warning banner appears before you edit it.

## Filing a return, step by step

The sidebar lists eight steps. A step gets a **✓** when it's done and a **!** when it needs attention. **Home** always shows your next step with a **Continue** button, and every step has **Back** and **Next** buttons at the bottom.

Each step also says where its figures go on the website, under **"On the website"**.

| # | Step | What you do | On the website |
|---|---|---|---|
| 1 | **Documents** | Tick off documents as you gather them. Mark anything that doesn't apply to you as **N/A**. | — |
| 2 | **Salary income** *(optional)* | Enter payslips month by month, totals so far, or the whole year at once. Then click **Send totals to Income & tax**. | — |
| 3 | **Income & tax** | Salary components, other income such as bank interest, TDS and advance tax. Check them against your certificates. | Income |
| 4 | **Rebate** | Investments made during the year: life insurance, DPS, provident fund, savings certificates, shares. | Rebate |
| 5 | **Expenditure** | What you spent, in the website's own rows. You can import totals from an expense tracker CSV. | Expenditure (IT-10BB) |
| 6 | **Assets & liabilities** | What you owned and owed on 30 June. Use **Balance it** until the difference is **0**. | Assets & Liabilities (IT-10B) |
| 7 | **Enter on the website** | Every figure to type in, page by page. **Copy** a number, paste it into the site, tick the row. | Every page |
| 8 | **Pay & submit** | Pay what's left, submit, download the acknowledgement slip, then record it all here and lock the year. | Tax & Payment → Return View → Submit |

### Why the difference must be 0

The website checks that your money adds up: what came in (income, plus gifts or loans received) must equal what went out (spending and tax) plus the growth in your net wealth. If it doesn't, you can't submit.

The app shows this **difference** on Home and in step 6. When it isn't 0, **Balance it** suggests the usual causes, such as a missing bank account, cash in hand, or untracked spending. It then lets you split what's left between expenses and an asset.

### Tips for the website

Most steps have a **💡 Tips** section about snags people commonly hit on the website. For example: challan numbers getting cut off, bank interest belonging under *Financial Assets*, or which box a tax payment goes in. Step 7 also has a **Troubleshooting** list.

## Other things it does

- **Several years.** Pick **＋ Start AY …** from the **Year** list to start the next year. It carries over your assets and liabilities (last year's closing values become this year's opening values), policies, accounts and categories. **All years** shows key figures side by side.
- **Several people.** Pick **＋ Add person…** from the **Person** list to keep separate returns for, say, you and your spouse.
- **Import a filed return (PDF).** Record a year you filed before you started using the app. On the website, open the filed return's **Return View** and save it as a PDF. Then use **Settings → Record a past year from its return**. The year is saved and locked, and the next year starts from its figures.
- **Import a monthly tax card (PDF).** Fill a month of salary and TDS from your employer's tax card. This currently reads the **accordHRM** format. Look for **Import a tax card** in step 2.
- **Tax rules per year.** Tax-free amounts, slabs, rebate rates, caps and minimum tax are all editable in **Settings → Tax rules**. The defaults follow the Finance Act 2025. The rules change with each budget, so check them every year.
- **Export.** Download a year, or the all-years summary, as a CSV for Excel, Numbers or Google Sheets.
- **Lock a year** once it's filed, so nothing changes by accident. You can still view and export it.

The two PDF imports only read PDFs that contain text, like the ones websites and payroll systems produce. They can't read scans or photos. Files are read in memory and not kept.

## Your data

Everything lives in the `data` folder next to the app:

```
data/
  people/
    me/
      2026-2027.json        ← one file per assessment year
      backups/2026-2027/    ← automatic backups
  removed/                  ← people you removed (nothing is deleted)
```

- **It saves automatically** as you type. Before each save, the previous version is backed up: at most one backup a minute, keeping the last 30.
- **To move to another computer**, copy the whole folder, including `data`.
- **`data` is excluded from git**, so your figures never end up in a commit.
- **Keep only one browser tab of the app open.** Two tabs can overwrite each other's changes.

## Troubleshooting

**The page didn't change after I updated the app.**
Reload with a hard refresh: Ctrl+Shift+R, or Cmd+Shift+R on a Mac. With Docker, run `docker compose up -d --build` first.

**My figures went back to old values.**
Another tab of the app probably saved over them. Close the extra tabs, and restore from `data/people/<person>/backups/` if you need to.

**"Can't reach the local server".**
The app's window or terminal was closed. Start it again.

**The website's tax differs from the app's.**
The website is right. Compare its *Tax Computation* line by line with step 3. If the website uses different rules, such as a different rebate rate, update **Settings → Tax rules** to match.

**The difference is 0 in the app but not on the website.**
Compare *Income shown*, *Tax exempted income*, *Annual living expense* and *Net wealth* with the summary in step 6, one at a time. Usually one field on the website wasn't updated.

## For contributors

Bug reports and pull requests are welcome. The app is deliberately small and dependency-free:

| File | What it is |
|---|---|
| `server.py` | A Python standard-library web server. It serves the UI and reads and writes the JSON files in `data/`. |
| `pdftext.py` | A small PDF text extractor, used by the two PDF imports. |
| `static/index.html`, `static/styles.css`, `static/app.js` | The whole app: a single page in plain JavaScript, with no framework and no build step. |

To work on it, run `python3 server.py` and reload the browser after editing files in `static/`.

**Please don't attach real returns or tax documents to issues.** Describe the problem, or use made-up figures.

## License

MIT. See [LICENSE](LICENSE).
