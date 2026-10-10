# Tax Return Helper (etaxnbr.gov.bd)

Local web app for preparing the Bangladesh e-return.

**Start with Docker (recommended):** in this folder run

    docker compose up -d --build

then open http://127.0.0.1:8765. The container restarts automatically whenever Docker Desktop is running.
Your data stays in `./data` on this Mac (mounted into the container). After app updates, run the same command again to rebuild.
Stop it with `docker compose down`.

**Start without Docker:** double-click `Start Tax Helper.command` (or run `python3 server.py`). It opens http://127.0.0.1:8765.
Stop it with Ctrl+C in the terminal window.

- No dependencies (Python 3 standard library only). Only reachable from this Mac.
- Data: `data/people/<person>/<assessment-year>.json`, autosaved, with rolling backups in `data/people/<person>/backups/`.
- **Several people:** pick the person at the top, or **Add person** (e.g. your spouse). Each has their own years and carry-overs. **Settings → Person** renames or removes one (removed folders move to `data/removed/`; nothing is deleted).
- Each year: open the app, click **Start AY …** to carry over assets, liabilities, policies and categories.
- Check the tax rules in **Settings** after each budget (Finance Act). They only affect the estimates here.
- **All years** tab: key figures for every saved year side by side; click a year to open it.
- **Settings → Years**: create an earlier year (e.g. to record an old return). **Settings → Lock** makes a filed year read-only.
- **Export**: Settings or All years → download one year in full, or the all-years summary, as CSV.
