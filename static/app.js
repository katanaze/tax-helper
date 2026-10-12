'use strict';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const num = v => { const n = parseFloat(String(v ?? '').replace(/[\u2212\u2013]/g, '-').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const sum = arr => arr.reduce((a, b) => a + num(b), 0);
const fmt = n => (Math.round(n) || 0).toLocaleString('en-IN'); // || 0 turns -0 into 0
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const isBlank = v => v === '' || v === null || v === undefined;
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
// Paths starting with "~" belong to the transient past-return form (pastDraft), not the saved year.
const bindRoot = path => (path[0] === '~' ? [pastDraft, path.slice(1)] : [state, path]);
const getBound = path => getPath(...bindRoot(path));
function setPath(obj, path, val) {
  const ks = path.split('.'); const last = ks.pop();
  ks.reduce((o, k) => o[k], obj)[last] = val;
}

/* ---------- constants ---------- */
// The numbered steps, in the order you work through a return. `portal` is where the figures go on etaxnbr.gov.bd.
const STEPS = [
  { id: 'checklist', group: 'Prepare', title: 'Gather documents', nav: 'Documents',
    lead: 'Collect the certificates and statements you need. Mark anything that doesn\'t apply to you as N/A.' },
  { id: 'monthly', group: 'Prepare', title: 'Salary income', nav: 'Salary income',
    lead: 'Enter payslips as they arrive, totals so far, or the whole year at once. Then send the totals to Income & tax.' },
  { id: 'income', group: 'Prepare', title: 'Income & tax', nav: 'Income & tax',
    lead: 'Salary, other income such as bank interest, and the tax already deducted. This is what the return\'s tax is worked out from.',
    portal: 'Income → Salaries, Financial Assets' },
  { id: 'investments', group: 'Prepare', title: 'Investments (tax rebate)', nav: 'Rebate',
    lead: 'Life insurance, DPS, provident fund and other investments made during the income year reduce your tax.',
    portal: 'Rebate' },
  { id: 'expenses', group: 'Prepare', title: 'Expenditure', nav: 'Expenditure',
    lead: 'What you spent during the income year, in the same rows as the website.',
    portal: 'Expenditure (IT-10BB)' },
  { id: 'wealth', group: 'Prepare', title: 'Assets & liabilities', nav: 'Assets & liabilities',
    lead: 'What you owned and owed at the end of the year. The difference must be 0 before the website lets you submit.',
    portal: 'Assets & Liabilities (IT-10B)' },
  { id: 'sheet', group: 'File', title: 'Enter on etaxnbr.gov.bd', nav: 'Enter on the website',
    lead: 'Keep this beside the website and type each figure in, page by page. Tick rows off as you go.',
    portal: 'Every page, in order' },
  { id: 'file', group: 'File', title: 'Pay & submit', nav: 'Pay & submit',
    lead: 'Pay what\'s left, submit the return, and share the acknowledgement slip.',
    portal: 'Tax & Payment → Return View → Submit' },
];
const STEP_OF = Object.fromEntries(STEPS.map((s, i) => [s.id, { ...s, n: i + 1 }]));
const TABS = [['overview', 'Home'], ...STEPS.map(s => [s.id, s.nav]), ['history', 'All years'], ['settings', 'Settings']];
// Asset categories in the order and wording of the website's Assets & Liabilities page
const ASSET_SECTIONS = [
  ['Business capital', ['Business capital']],
  ['Non-agricultural property', ['Non-agricultural property']],
  ['Agricultural property', ['Agricultural property']],
  ['Financial assets', ['Shares, debentures, bonds, securities, unit certificates', 'Sanchayapatra', 'Fixed deposits, term deposits',
    'DPS', 'Loans given to others', 'Provident fund and other funds', 'Other financial assets']],
  ['Motor car', ['Motor car']],
  ['Gold, diamond, gems and other items', ['Gold, diamond, gems and other items']],
  ['Furniture, equipment and electronic items', ['Furniture, equipment and electronic items']],
  ['Other assets of significant value', ['Other assets of significant value']],
  ['Cash and fund outside business', ['Bank accounts, cards and e-cash', 'Cash in hand', 'Other deposits, balance and advance']],
  ['Asset outside Bangladesh', ['Asset outside Bangladesh']],
];
const ASSET_CATS = ASSET_SECTIONS.flatMap(([, cats]) => cats);
const POLICY_OWNER = { self: 'My return', other: 'Their return' };
const ACQ_OPTS = { '': '—', Purchase: 'Purchase', Gift: 'Gift', Inheritance: 'Inheritance', Other: 'Other' }; // "Type of acquisition"
const ASSET_SECTION_OF = Object.fromEntries(ASSET_SECTIONS.flatMap(([sec, cats]) => cats.map(cat => [cat, sec])));
const OLD_ASSET_CATS = {
  'Bank balance': 'Bank accounts, cards and e-cash', 'Fixed deposit / DPS': 'Fixed deposits, term deposits',
  'Savings certificates / govt. bonds': 'Sanchayapatra', 'Shares / mutual funds / debentures': 'Shares, debentures, bonds, securities, unit certificates',
  'Provident fund': 'Provident fund and other funds', 'Life insurance (premiums paid)': 'Other financial assets',
  'Non-agricultural property (land / flat)': 'Non-agricultural property', 'Motor vehicle': 'Motor car',
  'Gold / ornaments': 'Gold, diamond, gems and other items', 'Furniture & equipment': 'Furniture, equipment and electronic items',
  'Electronic items': 'Furniture, equipment and electronic items', 'Assets outside Bangladesh': 'Asset outside Bangladesh',
  'Other assets': 'Other assets of significant value',
};
const LIAB_CATS = ['Bank loan', 'Home loan / mortgage', 'Credit card balance', 'Personal loan (unsecured)', 'Other liability'];
const INCOME_TYPES = ['Bank interest (savings / FDR)', 'DPS profit', 'Savings certificate interest', 'Dividend', 'Rental income', 'Other income'];
const TAXPAYER_CATS = {
  general: 'General',
  women_senior: 'Woman, or aged 65+',
  disabled_thirdgender: 'Person with disability / third gender',
  freedom_fighter: 'Gazetted war-wounded freedom fighter / July warrior',
};

function defaultRules() {
  // Finance Act 2025 figures for AY 2026-27 and 2027-28. Verify each year.
  return {
    thresholds: { general: 375000, women_senior: 425000, disabled_thirdgender: 500000, freedom_fighter: 525000 },
    slabs: [
      { upto: 300000, rate: 10 }, { upto: 400000, rate: 15 }, { upto: 500000, rate: 20 },
      { upto: 2000000, rate: 25 }, { upto: '', rate: 30 },
    ],
    minTax: 5000,
    salaryExemptDivisor: 3,
    salaryExemptCap: 500000,
    rebatePctIncome: 3,
    rebatePctInvestment: 15,
    rebateCap: 1000000,
    insurancePctOfSumAssured: 10,
    dpsCap: 120000,
    savingsCertCap: 500000,
  };
}

// Rows of the website's Expenditure page, in its order. Sections with a name have sub-rows;
// the site adds those up itself. Old ids (food, housing, transport, utility, education, travel,
// festival, other) are kept so saved data and CSV mappings carry over.
const EXPENSE_LAYOUT = [
  [null, [['food', 'Expenses for food, clothing and other essentials'], ['housing', 'Accommodation expense']]],
  ['Auto and transportation expenses', [['transport_driver', "Driver's salary, fuel and maintenance"], ['transport', 'Other transportation']]],
  ['Household and utility expenses', [['utility_electricity', 'Electricity'], ['utility_gas', 'Gas, water, sewer and garbage'],
    ['utility_phone', 'Phone, internet, TV channels and subscription'], ['household_other', 'Home-support stuff and other expenses']]],
  [null, [['education', 'Education expenses']]],
  ['Festival and other special expenses', [['festival', 'Festival, party, events'], ['travel', 'Domestic and overseas tour, holiday, etc.'],
    ['philanthropy', 'Philanthropy, etc.'], ['special', 'Other special expenses']]],
  [null, [['other', 'Any other expenses']]],
];
const EXPENSE_GROUP_OF = Object.fromEntries(EXPENSE_LAYOUT.flatMap(([g, rows]) => rows.map(([id]) => [id, g])));

function defaultExpenseCats() {
  return EXPENSE_LAYOUT.flatMap(([, rows]) => rows).map(([id, name]) => ({ id, name, tracked: 0, fixed: false, adj: 0 }));
}

// Move a year saved with the old, shorter category list onto the website's layout.
function migrateExpenses(ex) {
  const fresh = defaultExpenseCats(); const byId = Object.fromEntries(fresh.map(x => [x.id, x]));
  ex.loanInterest = num(ex.loanInterest);
  for (const old of ex.categories) {
    if (old.id === 'interest') { ex.loanInterest += num(old.tracked) + num(old.adj); continue; }
    if (old.id === 'utility') {
      // the website splits utilities into three rows; a lump can't be split automatically
      if (num(old.tracked) || num(old.adj)) fresh.push({ ...old, name: 'Utilities (old category): split this into Electricity, Gas… and Phone… above', adj: num(old.adj), fixed: false });
      continue;
    }
    const target = byId[old.id];
    if (target) { target.tracked += num(old.tracked); target.adj += num(old.adj); target.fixed = target.fixed || !!old.fixed; }
    else fresh.push({ ...old, adj: num(old.adj), fixed: !!old.fixed }); // a category the user added themselves
  }
  for (const [k, v] of Object.entries(ex.mapping || {})) {
    if (v === 'utility') ex.mapping[k] = ''; // re-pick: Electricity, Gas… or Phone…
    if (v === 'interest') ex.mapping[k] = 'loanInterest';
  }
  ex.categories = fresh; ex.layout = 2;
}

function yearInfo(ay) {
  const a = parseInt(ay.slice(0, 4), 10);
  return {
    ayLabel: `AY ${a}-${String(a + 1).slice(2)}`,
    iyLabel: `${a - 1}-${String(a).slice(2)}`,
    start: `${a - 1}-07-01`,
    end: `${a}-06-30`,
    startLabel: `1 July ${a - 1}`,
    endLabel: `30 June ${a}`,
    prevEndLabel: `30 June ${a - 1}`,
    deadline: `30 November ${a}`,
  };
}
const nextAY = ay => { const a = parseInt(ay.slice(0, 4), 10) + 1; return `${a}-${a + 1}`; };
function defaultAY() {
  const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}
// Where a year stands today: the return due now ('filing'), the income year under way ('earning'), or 'past' / 'future'.
function yearRole(ay) {
  const filing = defaultAY(), earning = nextAY(filing);
  return ay === filing ? 'filing' : ay === earning ? 'earning' : ay < filing ? 'past' : 'future';
}
const ROLE_LABEL = { filing: 'Filing now', earning: 'In progress', past: 'Past year', future: 'Future year' };

function blankYear(ay) {
  return {
    version: 1,
    assessmentYear: ay,
    profile: { name: '', tin: '', category: 'general' },
    rules: defaultRules(),
    salary: {
      employer: '',
      components: ['Basic salary', 'House rent allowance', 'Medical allowance', 'Conveyance allowance',
        'Festival bonus', 'Other allowances', "Employer's contribution to provident fund"]
        .map(name => ({ id: uid(), name, amount: 0 })),
      tds: 0,
    },
    otherIncome: [],
    advanceTax: [],
    investments: { insurance: [], dps: [], pf: { employee: 0, employer: 0 }, savingsCerts: [], shares: [], other: [] },
    assets: [
      ['Bank accounts, cards and e-cash', 'Salary account'], ['Cash in hand', ''],
      ['Provident fund and other funds', 'Employer PF'], ['Other financial assets', 'Life insurance'],
      ['Gold, diamond, gems and other items', ''], ['Furniture, equipment and electronic items', ''],
    ].map(([category, description]) => ({ id: uid(), category, description, opening: 0, closing: 0, change: 0, byChange: false })),
    liabilities: [],
    openingNetWealthOverride: '',
    otherReceipts: [],
    prevYearTaxPaid: 0,
    expenses: { layout: 2, categories: defaultExpenseCats(), loanInterest: 0, envSurcharge: 0, otherOutflow: { loss: 0, gifts: 0 }, mapping: {}, csv: { dateCol: '', amountCol: '', catCol: '', dateFmt: 'auto' } },
    checklist: { done: {}, na: {}, custom: [] },
    entered: {},
    submission: { date: '', ackNo: '', notes: '', submitted: false, taxPaid: false, taxPaidAmount: '', taxPaidDate: '', taxPaidChallan: '', ackEmployer: { sent: false, date: '' }, ackBanks: [] },
    previous: null,
    yearEnd: null,
    locked: false,
    monthly: defaultMonthly(),
  };
}

function normalize(doc) {
  const b = blankYear(doc.assessmentYear);
  const oldExpenseLayout = doc.expenses && doc.expenses.layout !== 2; // check before defaults are filled in
  const oldSubmission = doc.submission && doc.submission.submitted === undefined;
  for (const k of Object.keys(b)) if (doc[k] === undefined) doc[k] = b[k];
  for (const k of ['salary', 'investments', 'expenses', 'checklist', 'profile', 'submission', 'rules', 'monthly']) {
    for (const kk of Object.keys(b[k])) if (doc[k][kk] === undefined) doc[k][kk] = b[k][kk];
  }
  if (oldSubmission && doc.submission.date) doc.submission.submitted = true; // older files only had a date
  if (oldExpenseLayout) {
    for (const x of doc.expenses.categories) if (x.override !== undefined && !isBlank(x.override)) { x.tracked = num(x.override); x.fixed = true; }
    migrateExpenses(doc.expenses);
  }
  for (const x of doc.expenses.categories) {
    // older files: a "fixed amount" pinned a category; it becomes the amount, locked
    if (x.adj === undefined) x.adj = 0;
    if (x.fixed === undefined) x.fixed = false;
    if (x.override !== undefined) { if (!isBlank(x.override)) { x.tracked = num(x.override); x.fixed = true; } delete x.override; }
  }
  for (const a of doc.assets) if (OLD_ASSET_CATS[a.category]) a.category = OLD_ASSET_CATS[a.category];
  for (const r of [...doc.assets, ...doc.liabilities]) {
    if (r.change === undefined) r.change = num(r.closing) - num(r.opening);
    if (r.byChange === undefined) r.byChange = false;
  }
  return doc;
}

/**
 * Year-end values: closing assets/liabilities, net wealth and expenses, frozen when the year is
 * filed. The next year takes its opening values (and "last year" figures) from here.
 */
function yearEndSnapshot(s) {
  const c = compute(s);
  const row = a => ({ id: a.id, category: a.category, description: a.description, qty: a.qty || '', acq: a.acq || '', closing: Math.round(num(a.closing)), byChange: !!a.byChange });
  return {
    savedAt: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    assets: s.assets.map(row),
    liabilities: s.liabilities.map(row),
    closingNetWealth: Math.round(c.closingNW),
    expenses: Object.fromEntries(s.expenses.categories.map(x => [x.id, c[`expFinal_${x.id}`]])),
    lifestyle: c.finalLifestyle, taxPaid: Math.round(c.taxPaidOutflow), taxAtSource: Math.round(c.taxAtSource), taxOther: Math.round(c.taxOtherPaid), loanInterest: c.loanInterest, envSurcharge: c.envSurcharge,
    finalTotal: c.finalTotal,
    balance: Math.round(c.balance),
  };
}
// The saved year-end values, or the year's current figures if none were saved.
const yearEndOf = s => s.yearEnd || yearEndSnapshot(s);
const prevAY = ay => { const a = parseInt(ay, 10) - 1; return `${a}-${a + 1}`; };

// Set this year's opening values from the previous year's year-end values.
function refreshOpeningFrom(prev) {
  const ye = yearEndOf(prev);
  for (const list of ['assets', 'liabilities']) {
    // match: the row carried from it > same category and description > the only row of that category on both sides
    const used = new Set();
    const free = r => !used.has(r);
    const onlyOne = (arr, cat) => { const m = arr.filter(r => r.category === cat); return m.length === 1 ? m[0] : null; };
    for (const p of ye[list]) {
      const sole = onlyOne(ye[list], p.category) && onlyOne(state[list].filter(free), p.category);
      let row = state[list].find(r => free(r) && r.fromId === p.id)
        || state[list].find(r => free(r) && r.category === p.category && (r.description || '') === (p.description || ''))
        || (sole || null);
      if (row) used.add(row);
      if (!row) {
        row = { id: uid(), category: p.category, description: p.description, qty: p.qty || '', acq: p.acq || '', opening: 0, closing: p.closing, change: 0, byChange: p.byChange };
        state[list].push(row); used.add(row);
      }
      row.fromId = p.id; row.opening = p.closing;
      if (!row.qty && p.qty) row.qty = p.qty;
      if (!row.acq && p.acq) row.acq = p.acq;
      if (row.byChange) row.closing = num(row.opening) + num(row.change);
      else row.change = num(row.closing) - num(row.opening);
    }
  }
  state.openingNetWealthOverride = ye.closingNetWealth;
  state.previous = { assessmentYear: prev.assessmentYear, closingNetWealth: ye.closingNetWealth };
}

function rollover(prev, ay) {
  const ye = yearEndOf(prev);
  const n = blankYear(ay);
  n.profile = clone(prev.profile);
  n.rules = clone(prev.rules);
  n.salary.employer = prev.salary.employer;
  n.submission.ackBanks = (prev.submission.ackBanks || []).map(b => ({ id: uid(), name: b.name, sent: false, date: '' }));
  n.salary.components = prev.salary.components.map(x => ({ id: uid(), name: x.name, amount: 0 }));
  n.otherIncome = prev.otherIncome.map(x => ({ ...x, id: uid(), gross: 0, tds: 0 }));
  n.investments.insurance = prev.investments.insurance.map(x => ({ ...x, id: uid(), premiumPaid: 0 }));
  n.investments.dps = prev.investments.dps.map(x => ({ ...x, id: uid(), deposited: 0 }));
  const carry = a => ({ id: uid(), fromId: a.id, category: a.category, description: a.description, qty: a.qty || '', acq: a.acq || '', opening: a.closing, closing: a.closing, change: 0, byChange: a.byChange });
  n.assets = ye.assets.map(carry);
  n.liabilities = ye.liabilities.map(carry);
  n.openingNetWealthOverride = ye.closingNetWealth; // "Net wealth at the last date of previous income year"
  n.expenses.categories = prev.expenses.categories.map(c => ({ ...c, tracked: 0, adj: 0 }));
  n.expenses.loanInterest = 0; n.expenses.envSurcharge = 0;
  n.expenses.mapping = clone(prev.expenses.mapping);
  n.expenses.csv = clone(prev.expenses.csv);
  n.checklist.custom = clone(prev.checklist.custom);
  n.monthly.components = clone(prev.monthly.components);
  // Balance paid with last year's return is normally paid after 30 June, i.e. in this new income year.
  n.prevYearTaxPaid = prev.submission?.taxPaid ? num(prev.submission.taxPaidAmount) : Math.max(0, ye.balance);
  n.previous = { assessmentYear: prev.assessmentYear, closingNetWealth: ye.closingNetWealth };
  return n;
}

/* ---------- calculations ---------- */
// Tax on a given gross salary + other income, with a given eligible investment.
function taxCalc(s, grossSalary, otherIncome, investment) {
  const r = s.rules; const t = {};
  t.grossSalary = grossSalary;
  t.salaryExempt = Math.min(grossSalary / (num(r.salaryExemptDivisor) || 3), num(r.salaryExemptCap));
  t.taxableSalary = grossSalary - t.salaryExempt;
  t.totalIncome = t.taxableSalary + otherIncome;
  t.threshold = num(r.thresholds[s.profile.category] ?? r.thresholds.general);

  let rem = t.totalIncome, tax = 0;
  const first = Math.min(rem, t.threshold); rem -= first;
  t.slabRows = [{ band: t.threshold, rate: 0, amount: first, tax: 0, remaining: rem }];
  for (const sl of r.slabs) {
    const band = isBlank(sl.upto) ? Infinity : num(sl.upto);
    const amt = Math.min(rem, band);
    const st = amt * num(sl.rate) / 100;
    tax += st; rem -= amt;
    t.slabRows.push({ band, rate: num(sl.rate), amount: amt, tax: st, remaining: rem });
  }
  t.grossTax = Math.round(tax); // the site rounds each line
  t.eligibleInvestment = investment;
  t.rebateByIncome = t.totalIncome * num(r.rebatePctIncome) / 100;
  t.rebateByInvestment = investment * num(r.rebatePctInvestment) / 100;
  t.rebate = Math.round(Math.min(t.rebateByIncome, t.rebateByInvestment, num(r.rebateCap), t.grossTax));
  // investment needed to max out the rebate
  t.investmentForMaxRebate = Math.min(t.rebateByIncome, num(r.rebateCap)) / (num(r.rebatePctInvestment) / 100 || 1);
  const aboveThreshold = t.totalIncome > t.threshold;
  t.netTaxBeforeMin = Math.max(0, t.grossTax - t.rebate);
  t.netTax = aboveThreshold ? Math.max(t.netTaxBeforeMin, num(r.minTax)) : 0;
  t.minTaxApplied = aboveThreshold && t.netTaxBeforeMin < num(r.minTax);
  return t;
}

function compute(s) {
  const r = s.rules; const c = { warnings: [] };
  const yi = yearInfo(s.assessmentYear);

  c.otherIncomeGross = sum(s.otherIncome.map(x => x.gross));
  c.otherIncomeTds = sum(s.otherIncome.map(x => x.tds));

  // Investments
  const inv = s.investments;
  c.invInsurance = 0;
  for (const p of inv.insurance) {
    const allow = Math.min(num(p.premiumPaid), num(p.sumAssured) * num(r.insurancePctOfSumAssured) / 100);
    c[`insAllow_${p.id}`] = allow; c.invInsurance += allow;
    if (num(p.premiumPaid) > 0 && num(p.sumAssured) === 0) c.warnings.push(`Insurance ${p.policyNo || p.company}: enter the policy value (sum assured), otherwise nothing is allowable.`);
  }
  c.dpsDeposited = sum(inv.dps.map(x => x.deposited));
  c.invDps = Math.min(c.dpsDeposited, num(r.dpsCap));
  c.invPf = num(inv.pf.employee) + num(inv.pf.employer);
  c.savingsBought = sum(inv.savingsCerts.map(x => x.amount));
  c.invSavings = Math.min(c.savingsBought, num(r.savingsCertCap));
  c.invShares = sum(inv.shares.map(x => x.amount));
  c.invOther = sum(inv.other.map(x => x.amount));
  c.eligibleInvestment = c.invInsurance + c.invDps + c.invPf + c.invSavings + c.invShares + c.invOther;

  Object.assign(c, taxCalc(s, sum(s.salary.components.map(x => x.amount)), c.otherIncomeGross, c.eligibleInvestment));

  c.salaryTds = num(s.salary.tds);
  c.ait = sum(s.advanceTax.map(x => x.amount));
  c.taxCredits = c.salaryTds + c.otherIncomeTds + c.ait;
  c.balance = c.netTax - c.taxCredits;
  c.balanceLabel = c.balance > 0 ? 'Payable with return' : c.balance < 0 ? 'Excess paid (refund)' : 'Fully settled';
  c.balanceAbs = Math.abs(c.balance);

  // Wealth
  c.assetsOpen = sum(s.assets.map(x => x.opening));
  c.assetsClose = sum(s.assets.map(x => x.closing));
  c.liabOpen = sum(s.liabilities.map(x => x.opening));
  c.liabClose = sum(s.liabilities.map(x => x.closing));
  c.assetsChange = c.assetsClose - c.assetsOpen;
  c.liabChange = c.liabClose - c.liabOpen;
  for (const a of s.assets) c[`chg_${a.id}`] = num(a.closing) - num(a.opening);
  for (const a of s.liabilities) c[`chg_${a.id}`] = num(a.closing) - num(a.opening);
  c.openingNWItems = c.assetsOpen - c.liabOpen;
  c.openingNW = isBlank(s.openingNetWealthOverride) ? c.openingNWItems : num(s.openingNetWealthOverride);
  c.openingNWDiff = c.openingNW - c.openingNWItems;
  c.closingNW = c.assetsClose - c.liabClose;
  c.nwChange = c.closingNW - c.openingNW;
  if (!isBlank(s.openingNetWealthOverride) && Math.round(c.openingNWDiff) !== 0)
    c.warnings.push(`Opening net wealth from last year's return differs from your itemised opening values by ${fmt(c.openingNWDiff)}. Fix the opening values so next year carries over cleanly.`);
  if (s.previous && Math.round(s.previous.closingNetWealth) !== Math.round(c.openingNW))
    c.warnings.push(`Opening net wealth (${fmt(c.openingNW)}) doesn't match last year's closing net wealth in this app (${fmt(s.previous.closingNetWealth)}).`);

  // Expenditure and the site's Assets & Liabilities summary:
  //   Difference = Source of fund − (Change in net wealth + Other fund outflow), and must be 0.
  c.otherReceipts = sum(s.otherReceipts.map(x => x.amount));
  c.inflows = c.grossSalary + c.otherIncomeGross + c.otherReceipts;
  c.prevYearTaxPaid = num(s.prevYearTaxPaid);
  // The website splits this line into two fields.
  c.taxAtSource = c.salaryTds + c.otherIncomeTds + c.ait; // "Tax at source and advance tax"
  c.taxOtherPaid = c.prevYearTaxPaid;                    // "Tax, surcharge or other amount"
  c.taxPaidOutflow = c.taxAtSource + c.taxOtherPaid;

  const cats = s.expenses.categories;
  c.trackedTotal = sum(cats.map(x => x.tracked));
  c.adjTotal = sum(cats.map(x => x.adj));
  for (const x of cats) { c[`expFinal_${x.id}`] = Math.round(num(x.tracked) + num(x.adj)); c[`expAdj_${x.id}`] = num(x.adj); }
  c.finalLifestyle = sum(cats.map(x => c[`expFinal_${x.id}`]));   // "Total expense relating to lifestyle"
  EXPENSE_LAYOUT.forEach(([g, rows], gi) => {
    if (!g) return;
    const ids = rows.map(([id]) => id);
    const inG = cats.filter(x => ids.includes(x.id));
    c[`expGrpT_${gi}`] = sum(inG.map(x => x.tracked)); c[`expGrpA_${gi}`] = sum(inG.map(x => x.adj));
    c[`expGrpF_${gi}`] = sum(inG.map(x => c[`expFinal_${x.id}`]));
  });
  c.loanInterest = num(s.expenses.loanInterest);
  c.envSurcharge = num(s.expenses.envSurcharge);
  // "Total amount of expense and tax" = the "Annual Living Expense" on the Assets & Liabilities page
  c.finalTotal = c.finalLifestyle + Math.round(c.taxPaidOutflow) + c.loanInterest + c.envSurcharge;
  c.adjustPct = c.trackedTotal > 0 ? (c.adjTotal / c.trackedTotal) * 100 : null;
  c.outflowLoss = num(s.expenses.otherOutflow.loss);
  c.outflowGifts = num(s.expenses.otherOutflow.gifts);

  c.incomeShown = c.totalIncome;   // "Income shown in the return"
  c.exemptIncome = c.salaryExempt; // "Tax exempted income and allowances"
  c.sourceOfFund = c.incomeShown + c.exemptIncome + c.otherReceipts;
  c.otherFundOutflow = c.finalTotal + c.outflowLoss + c.outflowGifts;
  c.totalFundOutflow = c.nwChange + c.otherFundOutflow;
  c.difference = Math.round(c.sourceOfFund - c.totalFundOutflow) || 0;
  c.differenceAbs = Math.abs(c.difference);
  c.balanced = c.difference === 0;
  c.differenceLabel = c.balanced ? 'Difference' : c.difference > 0 ? 'Difference (not yet accounted for)' : 'Difference (outflow too high)';

  const ew = [];
  if (c.balanced) {
    ew.push(['ok', c.adjustPct !== null && Math.abs(c.adjustPct) > 15
      ? `Balanced, but reported expenses are ${c.adjustPct > 0 ? '+' : ''}${c.adjustPct.toFixed(0)}% off what you tracked. Make sure that's realistic.`
      : 'Balanced: the difference is 0.']);
  } else if (c.difference > 0) {
    ew.push(['warn', `${fmt(c.difference)} of your income isn't accounted for. You either spent more than you recorded, or owned more on 30 June than you've listed. Use "Balance it" below.`]);
  } else {
    ew.push(['bad', `Outflow is ${fmt(-c.difference)} more than your sources. Expenses or closing assets may be too high, last year's net wealth too low, or income / receipts (gifts, loans) missing.`]);
  }
  c.expenseWarningsHtml = ew.map(([k, t]) => `<div class="${k}">${esc(t)}</div>`).join('');
  c.diffStatusHtml = c.balanced
    ? '<div class="ok"><b>Balanced:</b> the difference is 0, so the website will accept these figures.</div>'
    : `<div class="${c.difference > 0 ? 'warn' : 'bad'}"><b>Difference ${fmt(c.difference)}:</b> it must be 0 before you can submit. <a href="#" data-action="scroll" data-to="balanceSection" data-lock-safe="1">Balance it ↓</a></div>`;
  if (!c.balanced) c.warnings.push(`The Assets & liabilities difference is ${fmt(c.difference)}; it must be 0. Use Balance it in step 6, Assets & liabilities.`);

  c.wealthChecks = wealthChecks(s, c);
  c.wealthChecksHtml = c.wealthChecks.length ? c.wealthChecks.map(w => `<div class="warn">${esc(w)}</div>`).join('') : '<div class="ok">No issues found.</div>';
  c.warnings.push(...c.wealthChecks);

  // Checklist progress
  const items = checklistDef(s).flatMap(sec => sec.items).concat(s.checklist.custom.map(x => ({ id: x.id })));
  const applies = items.filter(i => !s.checklist.na[i.id]); // "not applicable" items don't count
  c.checkNA = items.length - applies.length;
  c.checkTotal = applies.length;
  c.checkDone = applies.filter(i => s.checklist.done[i.id]).length;
  c.checkPct = c.checkTotal ? Math.round(c.checkDone / c.checkTotal * 100) : 100;
  c.checkLabel = `${c.checkDone} of ${c.checkTotal} done${c.checkNA ? ` · ${c.checkNA} not applicable` : ''}`;

  // Monthly tracker (flattened with an mo_ prefix for data-calc)
  const mo = monthlyCalc(s, c.eligibleInvestment);
  for (const [k, v] of Object.entries(mo)) if (typeof v !== 'object') c[`mo_${k}`] = v;
  c.mo = mo;

  c.warningsHtml = c.warnings.length
    ? c.warnings.map(w => `<div class="warn">${esc(w)}</div>`).join('')
    : '<div class="ok">No issues detected.</div>';
  c.yi = yi;
  return c;
}

/* ---------- monthly tracker ---------- */
function monthLabels(ay) {
  const a = parseInt(ay.slice(0, 4), 10);
  const names = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const long = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];
  return names.map((n, i) => {
    const yr = i < 6 ? a - 1 : a;
    return { short: `${n} ${String(yr).slice(2)}`, long: `${long[i]} ${yr}` };
  });
}
const blankMonth = () => ({ received: false, amounts: {}, tds: {}, tdsRegular: '', tdsOneTime: '', note: '' });
function defaultMonthly() {
  return {
    components: [
      ['Basic salary', true], ['House rent allowance', true], ['Conveyance allowance', true], ['Medical allowance', true],
      ['Performance bonus', false], ['Profit sharing bonus', false], ['Festival bonus', false],
    ].map(([name, recurring]) => ({ id: uid(), name, kind: 'salary', recurring })),
    months: Array.from({ length: 12 }, blankMonth),
    carryIn: { through: '-1', amounts: {}, tds: {}, tdsRegular: 0, tdsOneTime: 0 },
    investmentOverride: '',
  };
}

/**
 * Month status: 'carry' (covered by carried-in totals), 'actual' (ticked as received),
 * 'planned' (future month with typed values), 'projected' (future month, estimated).
 * Projection for a future month: a typed value wins; otherwise recurring components repeat
 * the latest received month and one-off components are 0.
 */
function monthlyCalc(s, investmentFromTab) {
  const m = s.monthly; const comps = m.components; const ci = m.carryIn; const o = {};
  const through = num(ci.through);
  const covered = i => i <= through;
  let last = -1;
  m.months.forEach((mm, i) => { if (!covered(i) && mm.received) last = i; });
  const lastM = last >= 0 ? m.months[last] : null;
  o.monthsReceived = m.months.filter((mm, i) => covered(i) || mm.received).length;
  o.remainingMonths = 12 - o.monthsReceived;
  o.skipped = m.months.filter((mm, i) => i < last && !covered(i) && !mm.received).length;
  o.receivedLabel = `${o.monthsReceived} of 12 months received`;
  o.status = m.months.map((mm, i) => covered(i) ? 'carry' : mm.received ? 'actual'
    : comps.some(c => !isBlank(mm.amounts[c.id])) ? 'planned' : 'projected');

  const valueFor = (mm, i, c) => {
    if (covered(i)) return 0; // included in carry-in totals
    const v = mm.amounts[c.id];
    if (mm.received) return num(v);
    if (!isBlank(v)) return num(v);
    return c.recurring && lastM ? num(lastM.amounts[c.id]) : 0;
  };
  o.monthGross = m.months.map(() => 0);
  o.monthTds = m.months.map(() => 0);
  let salaryAnnual = 0, otherAnnual = 0, salaryActual = 0, otherActual = 0;
  for (const c of comps) {
    let act = through >= 0 ? num(ci.amounts[c.id]) : 0, proj = 0;
    m.months.forEach((mm, i) => {
      const v = valueFor(mm, i, c);
      if (mm.received && !covered(i)) act += v; else proj += v;
      o.monthGross[i] += v;
    });
    o[`act_${c.id}`] = act; o[`proj_${c.id}`] = proj; o[`ann_${c.id}`] = act + proj;
    o[`tdsc_${c.id}`] = (through >= 0 ? num(ci.tds?.[c.id]) : 0) + sum(m.months.filter((mm, i) => mm.received && !covered(i)).map(mm => mm.tds[c.id]));
    if (c.kind === 'other') { otherAnnual += act + proj; otherActual += act; }
    else { salaryAnnual += act + proj; salaryActual += act; }
  }
  o.salaryActual = salaryActual; o.salaryAnnual = salaryAnnual; o.salaryProjected = salaryAnnual - salaryActual;
  o.otherActual = otherActual; o.otherAnnual = otherAnnual; o.otherProjected = otherAnnual - otherActual;
  o.totalActual = salaryActual + otherActual; o.totalAnnual = salaryAnnual + otherAnnual; o.totalProjected = o.totalAnnual - o.totalActual;

  const useCarry = through >= 0;
  o.tdsRegular = useCarry ? num(ci.tdsRegular) : 0; o.tdsOneTime = useCarry ? num(ci.tdsOneTime) : 0;
  o.tdsOther = useCarry ? sum(Object.values(ci.tds || {})) : 0;
  m.months.forEach((mm, i) => {
    if (covered(i)) return;
    const t = num(mm.tdsRegular) + num(mm.tdsOneTime) + sum(Object.values(mm.tds));
    o.monthTds[i] = t;
    if (!mm.received) return;
    o.tdsRegular += num(mm.tdsRegular); o.tdsOneTime += num(mm.tdsOneTime); o.tdsOther += sum(Object.values(mm.tds));
  });
  m.months.forEach((mm, i) => { o[`gross_${i}`] = o.monthGross[i]; o[`tds_${i}`] = o.monthTds[i]; });
  o.tdsPaid = o.tdsRegular + o.tdsOneTime + o.tdsOther;
  o.tdsSalaryPaid = o.tdsRegular + o.tdsOneTime;

  o.investment = isBlank(m.investmentOverride) ? investmentFromTab : num(m.investmentOverride);
  const t = taxCalc(s, salaryAnnual, otherAnnual, o.investment);
  for (const [k, v] of Object.entries(t)) if (typeof v !== 'object') o[k] = v;
  o.slabRows = t.slabRows;
  t.slabRows.forEach((r, i) => { o[`slabAmt_${i}`] = r.amount; o[`slabTax_${i}`] = r.tax; o[`slabRem_${i}`] = r.remaining; });

  o.remainingLiability = t.netTax - o.tdsPaid;
  o.remainingLabel = o.remainingLiability >= 0 ? 'Remaining tax liability' : 'Paid more than the projected tax';
  o.remainingAbs = Math.abs(o.remainingLiability);
  o.monthlyNeeded = o.remainingMonths > 0 ? Math.max(0, o.remainingLiability) / o.remainingMonths : 0;
  o.lastRegularTds = lastM ? num(lastM.tdsRegular) : 0;
  o.endBalanceAtCurrentRate = t.netTax - (o.tdsPaid + o.lastRegularTds * o.remainingMonths);
  o.endBalanceLabel = o.endBalanceAtCurrentRate > 0
    ? `Still owed at year end if TDS stays at ${fmt(o.lastRegularTds)}/month`
    : `Over-deducted at year end if TDS stays at ${fmt(o.lastRegularTds)}/month`;
  o.endBalanceAbs = Math.abs(o.endBalanceAtCurrentRate);
  return o;
}

/* ---------- checklist ---------- */
const ckState = (s, id) => (s.checklist.na[id] ? 'N/A' : s.checklist.done[id] ? 'Yes' : 'No');
function checklistDef(s) {
  const y = yearInfo(s.assessmentYear);
  const i = (id, text) => ({ id, text });
  return [
    { section: '1. Gather documents', items: [
      i('doc-salary', `Salary certificate / annual pay statement for income year ${y.iyLabel} (${y.startLabel} – ${y.endLabel}) listing each component`),
      i('doc-tds', 'Employer TDS certificate (total deducted for the year, plus the challan details the website asks for)'),
      i('doc-bank', `Statement for every bank account (and mobile wallet) showing the balance on ${y.endLabel}`),
      i('doc-interest', 'Bank interest / tax deduction certificates (savings, FDR, DPS)'),
      i('doc-insurance', `Life insurance: policy document (sum assured) and premium payment certificate for ${y.startLabel} – ${y.endLabel}`),
      i('doc-dps', `DPS statements: deposits made during the year and balance on ${y.endLabel}`),
      i('doc-pf', 'Provident fund statement (your and employer contributions, balance)'),
      i('doc-securities', 'Savings certificates, bonds, BO account / mutual fund statements, dividend certificates (if any)'),
      i('doc-loans', `Loan and credit card statements: balances on ${y.prevEndLabel} and ${y.endLabel}, interest paid`),
      i('doc-prev', `Last year's return or acknowledgement (for net wealth on ${y.prevEndLabel})`),
      i('doc-ait', 'Advance tax receipts (e.g. vehicle tax token AIT), if any'),
      i('doc-expenses', `Expense tracker export covering ${y.startLabel} – ${y.endLabel}`),
      i('doc-login', 'etaxnbr.gov.bd login works (TIN and the mobile number registered with it)'),
    ] },
    { section: '2. Prepare in this app', items: [
      i('app-salary', 'Salary components entered; the total matches the salary certificate'),
      i('app-tds', 'Salary TDS entered and matches the TDS certificate'),
      i('app-other', 'Other income (bank interest, dividends) entered with tax deducted'),
      i('app-invest', 'Rebate investments entered; rebate looks right'),
      i('app-expenses', 'Expenditure entered: what you actually spent'),
      i('app-assets', `Every asset and liability has a value on ${y.endLabel}`),
      i('app-opening', `Previous year's net wealth matches last year's return`),
      i('app-balance', 'Assets & liabilities difference is 0, and any expense adjustment looks reasonable'),
    ] },
    { section: '3. File on etaxnbr.gov.bd', items: [
      i('web-login', `Log in and start the return for ${y.ayLabel}`),
      i('web-info', 'Confirm personal information; select income sources (salary, and any others)'),
      i('web-salary', 'Enter salary details and tax deducted at source (step 7 lists them), then the challan details from the TDS certificate'),
      i('web-other', 'Enter other income and its tax deducted'),
      i('web-invest', 'Rebate: enter investments'),
      i('web-expenses', 'Expenditure: enter the amounts from step 7'),
      i('web-assets', "Assets & Liabilities: enter assets, liabilities and previous year's net wealth; the Summary's Difference must show 0"),
      i('web-review', "Compare the site's tax figure with the estimate here; investigate any difference"),
      i('web-pay', "Pay the site's Net Payable (Tax & Payment → Pay Now), then confirm it in step 8, Pay & submit"),
      i('web-submit', 'Submit the return'),
      i('web-ack', 'Download the acknowledgement slip and return copy; save them in this folder'),
    ] },
    { section: '4. After filing', items: [
      i('after-record', 'Confirm "Return submitted" under Pay and submit, with the acknowledgement number'),
      i('after-share', 'Give the acknowledgement slip to your employer and to your banks (see Pay and submit)'),
      i('after-next', `Deadline reminder: returns are normally due by ${y.deadline} (check for extensions)`),
    ] },
  ];
}

/* ---------- state & persistence ---------- */
let state = null;
let years = [];
let people = [];    // [{id, name, years}]
let person = null;  // id of the person whose returns are open
const yearsUrl = (ay, pid = person) => `/api/people/${pid}/years${ay ? `/${ay}` : ''}`;
const personName = (pid = person) => people.find(p => p.id === pid)?.name || '';
let tab = 'overview';
let csv = null; // transient CSV import data
let prevDoc = null; // transient: the previous assessment year, if it's saved in the app
let saveTimer = null;
let dirty = false;

function setStatus(t) { $('#saveStatus').textContent = t; }

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function scheduleSave() {
  dirty = true; setStatus('Unsaved changes…');
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 600);
}
async function save() {
  clearTimeout(saveTimer);
  if (!dirty || !state) return;
  dirty = false;
  try {
    const r = await api(yearsUrl(state.assessmentYear), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state),
    });
    setStatus(`Saved ${r.savedAt.slice(11, 16)}`);
    if (!years.includes(state.assessmentYear)) { years.push(state.assessmentYear); years.sort(); renderYearSelect(); }
  } catch (e) {
    dirty = true; setStatus('Save failed: is the server running?');
  }
}
window.addEventListener('pagehide', () => {
  if (dirty && state) fetch(yearsUrl(state.assessmentYear), { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
});

async function loadYear(ay) {
  await save();
  try { state = normalize(await api(yearsUrl(ay))); }
  catch { state = blankYear(ay); state.profile.name = personName(); dirty = true; save(); }
  csv = null; selMonth = null; cardResult = null; bal = { toExp: 0, assetId: null, touched: false };
  prevDoc = null;
  if (years.includes(prevAY(ay))) { try { prevDoc = normalize(await api(yearsUrl(prevAY(ay)))); } catch { /* shown as missing */ } }
  renderYearSelect(); render();
}

function renderYearSelect() {
  const all = Array.from(new Set([...years, state?.assessmentYear].filter(Boolean))).sort();
  const nx = state && nextAY(state.assessmentYear);
  $('#yearSelect').innerHTML = all.map(y => `<option value="${y}" ${y === state?.assessmentYear ? 'selected' : ''}>${yearInfo(y).ayLabel} (income year ${yearInfo(y).iyLabel})</option>`).join('')
    + (nx && !all.includes(nx) ? `<option value="__next">＋ Start ${yearInfo(nx).ayLabel}…</option>` : '');
  if (state) {
    const role = yearRole(state.assessmentYear);
    $('#yearRole').textContent = ROLE_LABEL[role] + (state.locked ? ' · locked' : '');
    $('#yearRole').className = `year-pill role-${role}`;
    document.body.dataset.role = role;
    document.title = `${yearInfo(state.assessmentYear).ayLabel} (${ROLE_LABEL[role].toLowerCase()}) · Tax Return Helper`;
  }
}

function renderPersonSelect() {
  $('#personSelect').innerHTML = people.map(p => `<option value="${esc(p.id)}" ${p.id === person ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    + '<option value="__add">＋ Add person…</option>';
}
function rememberPerson() { try { localStorage.setItem('person', person); } catch { /* per-browser convenience only */ } }

// Open a person's latest year (or a blank current year if they have none).
async function switchPerson(pid) {
  await save();
  person = pid; rememberPerson();
  years = (await api(yearsUrl())).years;
  state = null; tab = 'overview'; historyData = null; pastDraft = null;
  history.replaceState(null, '', '#overview');
  renderPersonSelect();
  await loadYear(years.length ? years[years.length - 1] : defaultAY());
}
async function addPerson() {
  const name = (prompt("Name of the person whose return you're preparing:") || '').trim();
  if (!name) return;
  await save();
  const p = await api('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  people.push(p); people.sort((a, b) => a.name.localeCompare(b.name));
  await switchPerson(p.id);
}
async function renamePerson() {
  const name = (prompt('New name:', personName()) || '').trim();
  if (!name || name === personName()) return;
  await api(`/api/people/${person}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  people.find(p => p.id === person).name = name;
  people.sort((a, b) => a.name.localeCompare(b.name));
  if (!state.locked && (!state.profile.name || state.profile.name === name)) state.profile.name = name;
  renderPersonSelect(); render();
}
async function removePerson() {
  if (people.length < 2) { alert('Add another person first: there must always be at least one.'); return; }
  if (!confirm(`Remove ${personName()} and all their years from the app?\n\nNothing is deleted: their folder moves to data/removed/, and you can move it back into data/people/ to restore it.`)) return;
  await save(); dirty = false;
  await api(`/api/people/${person}`, { method: 'DELETE' });
  people = people.filter(p => p.id !== person);
  await switchPerson(people[0].id);
}

async function startNextYear() {
  const ay = nextAY(state.assessmentYear);
  if (years.includes(ay)) return loadYear(ay);
  if (!confirm(`Create ${yearInfo(ay).ayLabel} from ${yearInfo(state.assessmentYear).ayLabel}?\n\nThis year's closing assets and liabilities become next year's opening values. Policies, accounts, salary component names and expense categories carry over with amounts reset.`)) return;
  await save();
  state = rollover(state, ay); dirty = true; selMonth = null; await save();
  tab = 'overview'; renderYearSelect(); render();
}

/* ---------- input builders ---------- */
function inp(path, { type = 'text', ph = '', cls = '', signed = false, safe = false } = {}) {
  const v = getBound(path);
  const ls = path[0] === '~' || safe ? 'data-lock-safe="1"' : ''; // still editable when the year is locked
  if (type === 'num' || type === 'optnum') {
    // A plain amount of 0 shows as an empty box with a grey "0" placeholder, so typing never appends to it.
    // In optional fields a blank means "auto", so an explicit 0 is kept visible.
    const shown = isBlank(v) || (type === 'num' && num(v) === 0) ? '' : fmt(num(v));
    return `<input class="num ${cls}" ${ls} inputmode="${signed ? 'text' : 'decimal'}" data-bind="${path}" data-type="${type}" value="${shown}" placeholder="${esc(ph || (type === 'optnum' ? 'auto' : '0'))}">`;
  }
  if (type === 'dec') return `<input class="num" inputmode="decimal" data-bind="${path}" data-type="dec" value="${esc(v)}" placeholder="${esc(ph)}">`;
  if (type === 'date') return `<input type="date" ${ls} data-bind="${path}" value="${esc(v)}">`;
  if (type === 'area') return `<textarea rows="3" data-bind="${path}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
  return `<input ${ls} data-bind="${path}" value="${esc(v)}" placeholder="${esc(ph)}">`;
}
function sel(path, options) {
  const v = getBound(path);
  const opts = Array.isArray(options) ? options.map(o => [o, o]) : Object.entries(options);
  if (!isBlank(v) && !opts.some(([k]) => k === v)) opts.unshift([v, v]);
  return `<select ${path[0] === '~' ? 'data-lock-safe="1"' : ''} data-bind="${path}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
const field = (label, html, hint = '') => `<label class="field"><span>${label}</span>${html}${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
const calc = (key, cls = '') => `<span class="calc ${cls}" data-calc="${key}"></span>`;

const TPL = {
  comp: () => ({ id: uid(), name: '', amount: 0 }),
  oi: () => ({ id: uid(), type: INCOME_TYPES[0], source: '', gross: 0, tds: 0 }),
  simple: () => ({ id: uid(), desc: '', amount: 0 }),
  ins: () => ({ id: uid(), company: 'MetLife', policyNo: '', sumAssured: 0, premiumPaid: 0, owner: 'self' }),
  dps: () => ({ id: uid(), bank: '', account: '', deposited: 0 }),
  asset: () => ({ id: uid(), category: ASSET_CATS[0], description: '', qty: '', acq: '', opening: 0, closing: 0, change: 0, byChange: false }),
  liab: () => ({ id: uid(), category: LIAB_CATS[0], description: '', opening: 0, closing: 0, change: 0, byChange: false }),
  expcat: () => ({ id: uid(), name: '', tracked: 0, fixed: false, adj: 0 }),
  custom: () => ({ id: uid(), text: '' }),
  mcomp: () => ({ id: uid(), name: '', kind: 'salary', recurring: true }),
};

/**
 * cols: [{label, key, type?: 'num'|'text'|'date'|'optnum', select?, calc?: row => key, ph?}]
 */
function table(listPath, cols, tpl, { addLabel = 'Add row', foot = null, cls = '' } = {}) {
  const list = getPath(state, listPath);
  const head = cols.map(c => `<th class="${c.type === 'num' || c.type === 'optnum' || c.calc ? 'r' : ''}">${c.label}</th>`).join('') + '<th></th>';
  const body = list.map((row, i) => `<tr>${cols.map(c => {
    if (c.calc) return `<td class="r">${calc(c.calc(row))}</td>`;
    if (c.groups) return `<td>${selGroups(`${listPath}.${i}.${c.key}`, c.groups)}</td>`;
    if (c.select) return `<td>${sel(`${listPath}.${i}.${c.key}`, c.select)}</td>`;
    return `<td>${inp(`${listPath}.${i}.${c.key}`, { type: c.type || 'text', ph: c.ph, cls: c.cls ? c.cls(row) : '', signed: c.signed })}</td>`;
  }).join('')}<td class="r"><button class="icon" data-action="del" data-list="${listPath}" data-idx="${i}" title="Remove row">✕</button></td></tr>`).join('');
  const footHtml = foot ? `<tfoot><tr>${foot.map(f => `<td class="${f.startsWith('<') ? 'r' : ''}">${f}</td>`).join('')}<td></td></tr></tfoot>` : '';
  return `<div class="table-scroll"><table class="grid ${cls}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + 1}" class="empty">Nothing added yet.</td></tr>`}</tbody>${footHtml}</table></div>
    <button class="add" data-action="add" data-list="${listPath}" data-tpl="${tpl}">+ ${addLabel}</button>`;
}

/* ---------- views ---------- */
const views = {};

// Collapsible tips for snags people commonly hit on the website.
const tips = (items, title = 'Tips: common snags on the website') =>
  `<details class="tips"><summary>${title}</summary><ul>${items.map(t => `<li>${t}</li>`).join('')}</ul></details>`;

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Bank names from accounts, deposits, cards, loans and interest income, for the "acknowledgement sent" list.
function suggestBanks(s) {
  const bankCats = ['Bank accounts, cards and e-cash', 'Fixed deposits, term deposits', 'DPS'];
  const texts = [
    ...s.assets.filter(a => bankCats.includes(a.category) && num(a.closing)).map(a => a.description),
    ...s.liabilities.filter(l => num(l.closing)).map(l => l.description),
    ...s.otherIncome.map(x => x.source),
  ];
  const names = texts.map(t => {
    const m = String(t || '').match(/^(.*?\b(?:Bank(?: PLC| Ltd\.?| Limited)?|PLC|Ltd\.?|Limited|Finance|bKash|Nagad))\b/i);
    return (m ? m[1] : '').replace(/\s*[–-]\s*$/, '').trim();
  }).filter(Boolean);
  const have = new Set(s.submission.ackBanks.map(b => b.name.toLowerCase()));
  return [...new Set(names)].filter(n => !have.has(n.toLowerCase()));
}
const ackDone = (s, c) => (c.grossSalary <= 0 || s.submission.ackEmployer.sent)
  && s.submission.ackBanks.length > 0 && s.submission.ackBanks.every(b => b.sent);

// Pay the net payable, then submit: two confirmations, on the Pay & submit step.
function filingPanelHtml(c) {
  const sub = state.submission; const due = Math.round(c.balance); const nextAy = yearInfo(nextAY(state.assessmentYear)).ayLabel;
  const step = (done, title, body) => `<div class="filing-step ${done ? 'done' : ''}"><div class="filing-head"><span class="filing-mark">${done ? '✓' : ''}</span><b>${title}</b></div>${body}</div>`;
  let pay;
  if (sub.taxPaid) {
    pay = step(true, 'Net payable tax paid', `<p>Tk <b>${fmt(num(sub.taxPaidAmount))}</b> paid${sub.taxPaidDate ? ` on ${esc(sub.taxPaidDate)}` : ''}${sub.taxPaidChallan ? `, challan ${esc(sub.taxPaidChallan)}` : ''}.</p>
      <p class="muted">${nextAy} takes this as "Tax, surcharge or other amount". Put any card fee under Any other expenses there.</p>
      <p><button class="secondary" data-action="undo-paid" data-lock-safe="1">Undo</button></p>`);
  } else if (due <= 0) {
    pay = step(true, 'Net payable tax', `<p>Nothing to pay by this estimate (${due < 0 ? `${fmt(-due)} paid in excess` : 'fully settled'}). Check the site's <b>Net Payable</b> on Tax &amp; Payment before submitting.</p>`);
  } else {
    pay = step(false, 'Net payable tax', `<p>Estimate here: <b>${fmt(due)}</b>. Pay the site's <b>Net Payable</b> (Tax &amp; Payment → Pay Now); it's the official figure. Then confirm.</p>
      <div class="row">
        ${field('Amount paid (Tk)', inp('submission.taxPaidAmount', { type: 'num', ph: fmt(due), safe: true }), 'The challan amount, not including a card fee')}
        ${field('Date paid', inp('submission.taxPaidDate', { type: 'date', safe: true }))}
        ${field('Challan no.', inp('submission.taxPaidChallan', { ph: `e.g. ${state.assessmentYear.slice(2, 4)}${state.assessmentYear.slice(7, 9)}-0012345678`, safe: true }))}
      </div>
      <p><button data-action="confirm-paid" data-lock-safe="1">Confirm tax paid</button></p>`);
  }
  const submit = sub.submitted
    ? step(true, 'Return submitted', `<p>Submitted${sub.date ? ` on ${esc(sub.date)}` : ''}${sub.ackNo ? `, acknowledgement no. ${esc(sub.ackNo)}` : ''}.${state.locked ? ' The year is locked.' : ''}</p>
      <p><button class="secondary" data-action="undo-submitted" data-lock-safe="1">Undo</button></p>`)
    : step(false, 'Return submitted', `<p>After submitting on the site, download the acknowledgement slip and the return copy, then confirm here. You'll be offered to lock the year and save its year-end values for next year.</p>
      <div class="row">
        ${field('Date submitted', inp('submission.date', { type: 'date', safe: true }))}
        ${field('Acknowledgement / return no.', inp('submission.ackNo', { safe: true }))}
      </div>
      <p><button data-action="confirm-submitted" data-lock-safe="1">Confirm return submitted</button></p>`);
  const sentCell = (sent, date, act, idx = '') => sent
    ? `<span class="ok-inline">✓ Sent${date ? ` ${esc(date)}` : ''}</span> <button class="secondary" data-action="ack-undo" data-target="${act}" data-idx="${idx}" data-lock-safe="1">Undo</button>`
    : `<button data-action="ack-sent" data-target="${act}" data-idx="${idx}" data-lock-safe="1">Confirm sent</button>`;
  const rows = [];
  if (c.grossSalary > 0) rows.push(`<tr><td>Employer${state.salary.employer ? `: <b>${esc(state.salary.employer)}</b>` : ''}</td><td class="r">${sentCell(sub.ackEmployer.sent, sub.ackEmployer.date, 'employer')}</td></tr>`);
  sub.ackBanks.forEach((b, i) => rows.push(`<tr><td>${inp(`submission.ackBanks.${i}.name`, { ph: 'Bank name', safe: true })}</td>
    <td class="r">${sentCell(b.sent, b.date, 'bank', i)} <button class="icon" data-action="ack-del-bank" data-idx="${i}" data-lock-safe="1" title="Remove">✕</button></td></tr>`));
  const sugg = suggestBanks(state);
  const share = step(ackDone(state, c), 'Acknowledgement shared', `<p class="muted">Give a copy of the acknowledgement slip (proof of return submission) to ${c.grossSalary > 0 ? 'your employer, which needs it for its own tax filing, and ' : ''}each bank where you have an account, deposit, card or loan. Banks ask for it to keep deposits over Tk 10 lakh, credit cards and loans going.</p>
    ${rows.length ? `<table class="grid ack-table"><tbody>${rows.join('')}</tbody></table>` : ''}
    <p><button class="secondary" data-action="ack-add-bank" data-lock-safe="1">+ Add bank</button>
      ${sugg.length ? `<button class="secondary" data-action="ack-suggest" data-lock-safe="1" title="${esc(sugg.join(', '))}">Add from my accounts (${sugg.length})</button>` : ''}</p>`);
  return `<section class="panel"><h3>Pay and submit</h3><div class="filing">${pay}${submit}${share.replace('class="filing-step', 'class="filing-step wide')}</div></section>`;
}

// Home panel for a year that's partly entered: actual income so far against the projection.
function incomeSoFarHtml(mo) {
  if (!(mo.monthsReceived > 0 && mo.monthsReceived < 12)) return '';
  const pct = mo.totalAnnual > 0 ? Math.min(100, Math.round(mo.totalActual / mo.totalAnnual * 100)) : 0;
  const left = 12 - mo.monthsReceived;
  return `<section class="panel">
    <h3>Income so far</h3>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <p class="muted">${mo.monthsReceived} of 12 months received: ${pct}% of the projected income for the year.</p>
    <dl class="sum">
      <dt>Received so far (${mo.monthsReceived} month${mo.monthsReceived === 1 ? '' : 's'})</dt><dd>${calc('mo_totalActual')}</dd>
      <dt>Still to come (projected, ${left} month${left === 1 ? '' : 's'})</dt><dd>${calc('mo_totalProjected')}</dd>
      <dt class="total">Projected income for the year</dt><dd class="total">${calc('mo_totalAnnual')}</dd>
      <dt>Projected tax for the year</dt><dd>${calc('mo_netTax')}</dd>
      <dt>Tax deducted so far</dt><dd>${calc('mo_tdsPaid')}</dd>
      <dt>${calc('mo_remainingLabel')}</dt><dd>${calc('mo_remainingAbs')}</dd>
      <dt>Monthly TDS needed to clear it</dt><dd>${calc('mo_monthlyNeeded')}</dd>
    </dl>
    <p class="muted">Projected months repeat your latest month's recurring items; bonuses count only where you've planned them. <a href="#" data-action="tab" data-tab="monthly">Open Salary income</a></p>
  </section>`;
}

views.overview = () => {
  const y = yearInfo(state.assessmentYear); const c = compute(state); const s = state;
  const nx = nextStep(s, c); const nextLbl = yearInfo(nextAY(s.assessmentYear)).ayLabel;
  const hero = nx
    ? `<div class="next-card ${nx.state === 'warn' ? 'warn-card' : ''}"><div>
        <div class="kicker">${nx.state === 'warn' ? 'Needs attention' : 'Next step'}</div>
        <div class="title">${nx.n}. ${esc(nx.title)}</div><p>${esc(nx.detail)}</p></div>
        <button data-action="tab" data-tab="${nx.id}">${nx.state === 'warn' ? 'Fix it' : 'Continue'} →</button></div>`
    : `<div class="next-card"><div><div class="kicker">All done</div><div class="title">${y.ayLabel} is submitted</div>
        <p>${s.submission.ackNo ? `Acknowledgement no. ${esc(s.submission.ackNo)}. ` : ''}Next year's opening values come from this one.</p></div>
        <button data-action="start-next" data-lock-safe="1">${years.includes(nextAY(s.assessmentYear)) ? 'Open' : 'Start'} ${nextLbl} →</button></div>`;
  const stepRows = STEPS.map(st => {
    const ss = stepState(st.id, s, c);
    return `<li class="st-${ss.state}"><button data-action="tab" data-tab="${st.id}">
      <span class="nav-num">${ss.state === 'done' ? '✓' : ss.state === 'warn' ? '!' : STEP_OF[st.id].n}</span>
      <span class="name">${esc(st.nav)}</span><span class="detail">${esc(ss.detail)}</span><span class="chev">›</span></button></li>`;
  }).join('');
  const due = Math.round(c.balance);
  return `
  <div class="page-head"><div class="eyebrow">Income year ${y.startLabel} – ${y.endLabel}</div>
    <h1>Your ${y.ayLabel} return</h1>
    <p class="lead">Returns are normally due by <b>${y.deadline}</b>; check for extensions. Figures here are estimates: the website does the official calculation.</p></div>
  ${hero}
  <div class="cards">
    <div class="card"><div class="label">Tax payable</div><div class="value">${calc('netTax')}</div><div class="sub">After rebate · estimate</div></div>
    <div class="card"><div class="label">Already paid</div><div class="value">${calc('taxCredits')}</div><div class="sub">Tax deducted and advance tax</div></div>
    <div class="card ${due > 0 ? 'attn' : 'good'}"><div class="label">${calc('balanceLabel')}</div><div class="value">${calc('balanceAbs')}</div><div class="sub">${due > 0 ? 'Pay before you submit' : 'Nothing more to pay'}</div></div>
    <div class="card ${c.balanced ? 'good' : 'attn'}"><div class="label">Assets &amp; liabilities difference</div><div class="value">${calc('difference')}</div><div class="sub">${c.balanced ? 'Balanced' : 'Must be 0 to submit'}</div></div>
  </div>
  <section class="panel">
    <div class="panel-head"><h3>Your return, step by step</h3><span class="muted">${STEPS.filter(st => stepState(st.id, s, c).state === 'done').length} of ${STEPS.length} done</span></div>
    <ol class="step-list">${stepRows}</ol>
  </section>
  ${incomeSoFarHtml(c.mo)}
  <div class="grid-2">
    <section class="panel"><h3>At a glance</h3>
      <dl class="sum">
        <dt>Gross salary</dt><dd>${calc('grossSalary')}</dd>
        <dt>Taxable income</dt><dd>${calc('totalIncome')}</dd>
        <dt>Investment rebate</dt><dd>${calc('rebate')}</dd>
        <dt>Net wealth on ${y.endLabel}</dt><dd>${calc('closingNW')}</dd>
      </dl></section>
    <section class="panel"><h3>Things to check</h3><div data-calc-html="warningsHtml"></div></section>
  </div>`;
};

let selMonth = null; // transient: month open in the monthly editor
function defaultSelMonth() {
  const m = state.monthly; let i = 0;
  m.months.forEach((mm, k) => { if (k <= num(m.carryIn.through) || mm.received) i = Math.min(11, k + 1); });
  return i;
}

const incomeMode = through => (through >= 11 ? 'year' : through >= 0 ? 'ytd' : 'monthly');
function defaultYtdThrough() {
  // the month before this one, if we're inside the income year; otherwise May
  const a = parseInt(state.assessmentYear, 10), d = new Date();
  const idx = (d.getFullYear() - (a - 1)) * 12 + d.getMonth() - 6 - 1;
  return idx >= 0 && idx <= 10 ? idx : 10;
}

/**
 * Change how many months the lump-sum totals cover (-1 = none, 11 = whole year).
 * Months that become covered and already have entries can be folded into the totals.
 */
function setCarryThrough(nt) {
  const m = state.monthly, ci = m.carryIn, old = num(ci.through), L = monthLabels(state.assessmentYear);
  if (nt === old) return false;
  const hasTotals = Object.values(ci.amounts).some(v => num(v)) || Object.values(ci.tds || {}).some(v => num(v))
    || num(ci.tdsRegular) || num(ci.tdsOneTime);
  if (nt < 0 && hasTotals) {
    if (!confirm('Switch to month by month? The totals you entered will be cleared.')) return false;
    ci.amounts = {}; ci.tds = {}; ci.tdsRegular = 0; ci.tdsOneTime = 0;
  }
  const absorb = m.months.map((x, i) => i).filter(i => i > old && i <= nt && m.months[i].received);
  if (absorb.length && confirm(`You've entered ${absorb.map(i => L[i].short).join(', ')} month by month. Add ${absorb.length === 1 ? 'it' : 'them'} into the totals?\n\nOK adds them. Cancel leaves them out of the totals, so you'd type them in yourself.`)) {
    for (const i of absorb) {
      const mm = m.months[i];
      for (const c of m.components) {
        if (!isBlank(mm.amounts[c.id])) ci.amounts[c.id] = num(ci.amounts[c.id]) + num(mm.amounts[c.id]);
        if (!isBlank(mm.tds[c.id])) ci.tds[c.id] = num(ci.tds[c.id]) + num(mm.tds[c.id]);
      }
      ci.tdsRegular = num(ci.tdsRegular) + num(mm.tdsRegular);
      ci.tdsOneTime = num(ci.tdsOneTime) + num(mm.tdsOneTime);
      m.months[i] = blankMonth();
    }
  }
  ci.through = String(nt); selMonth = null;
  return true;
}

views.monthly = () => {
  const s = state, m = s.monthly, comps = m.components, L = monthLabels(s.assessmentYear), y = yearInfo(s.assessmentYear);
  const mo = compute(s).mo;
  const through = num(m.carryIn.through), mode = incomeMode(through);
  if (selMonth === null) selMonth = defaultSelMonth();
  const i = selMonth, mm = m.months[i], covered = i <= through;
  let last = -1; m.months.forEach((x, k) => { if (k > through && x.received) last = k; });
  const lastM = last >= 0 ? m.months[last] : null;
  const statusText = { carry: 'in the totals', actual: 'received', planned: 'planned', projected: 'projected' };

  const modeBtn = (id, label) => `<button class="${mode === id ? 'on' : ''}" data-action="mo-mode" data-mode="${id}">${label}</button>`;
  const throughSel = `<label class="field" style="max-width:320px"><span>My totals cover</span><select id="ytdThrough">${L.slice(0, 11).map((l, k) => `<option value="${k}" ${through === k ? 'selected' : ''}>July – ${l.long}</option>`).join('')}</select></label>`;
  const modeHelp = {
    monthly: 'Enter each payslip as it arrives. Recurring items (basic, allowances) are projected forward at the latest month\'s amount, so you can see your tax position at any point in the year.',
    ytd: 'Enter totals up to a month (like a payroll sheet\'s "YTD" column), then add the remaining months one by one.',
    year: `Enter the full year's totals in one go, from your salary certificate or payroll sheet (${y.startLabel} – ${y.endLabel}).`,
  }[mode];

  // the tax-deducted column is only for other-income items (salary TDS has its own boxes)
  const hasOther = comps.some(c => c.kind === 'other');
  const tdsHead = hasOther ? '<th class="r">Tax deducted</th>' : '';
  const tdsCell = (c, path) => (hasOther ? `<td>${c.kind === 'other' ? inp(path, { type: c.kind === 'other' && path.includes('carryIn') ? 'num' : 'optnum', ph: '0' }) : ''}</td>` : '');
  const totalsTable = `
    <table class="grid"><thead><tr><th>Item</th><th class="r">${mode === 'year' ? 'Total for the year' : through >= 0 ? `Total July – ${L[through].long}` : 'Total'} (Tk)</th>${tdsHead}</tr></thead><tbody>
      ${comps.map(c => `<tr><td>${esc(c.name)}${c.kind === 'other' ? ' <span class="muted">(other income)</span>' : ''}</td><td>${inp(`monthly.carryIn.amounts.${c.id}`, { type: 'num' })}</td>${tdsCell(c, `monthly.carryIn.tds.${c.id}`)}</tr>`).join('')}
    </tbody></table>
    <div class="row" style="margin-top:10px">
      ${field('Regular monthly TDS on salary (total)', inp('monthly.carryIn.tdsRegular', { type: 'num' }))}
      ${field('One-time TDS on salary (total)', inp('monthly.carryIn.tdsOneTime', { type: 'num' }), 'If you only know the overall TDS, put it all in one box.')}
    </div>
    <p class="muted">Missing an item? Add it under "Income items" below.</p>`;

  const chips = L.map((l, k) => `<button class="chip st-${mo.status[k]} ${k === i ? 'active' : ''}" data-action="month" data-idx="${k}" title="${statusText[mo.status[k]]}">${l.short}</button>`).join('');

  let editor;
  if (covered) {
    editor = `<p class="muted">${L[i].long} is included in your totals above.</p>`;
  } else {
    const prevOk = i > 0 && i - 1 > through;
    const compRows = comps.map(c => {
      const ph = mm.received ? '0' : fmt(c.recurring && lastM ? num(lastM.amounts[c.id]) : 0);
      return `<tr><td>${esc(c.name)} ${c.kind === 'other' ? '<span class="muted">(other income)</span>' : ''}${c.recurring ? '' : ' <span class="muted">· one-off</span>'}</td>
        <td>${inp(`monthly.months.${i}.amounts.${c.id}`, { type: 'optnum', ph })}</td>
        ${tdsCell(c, `monthly.months.${i}.tds.${c.id}`)}</tr>`;
    }).join('');
    editor = `
      <div class="row" style="align-items:center;justify-content:space-between">
        <h3 style="margin:0">${L[i].long}</h3>
        <label class="received-toggle ${mm.received ? 'on' : ''}"><input type="checkbox" data-bind="monthly.months.${i}.received" data-type="bool" data-rerender="1" ${mm.received ? 'checked' : ''}> ${mm.received ? 'Received ✓' : 'Mark as received'}</label>
      </div>
      <p>
        <button class="secondary" data-action="mo-copy" ${prevOk ? '' : 'disabled'}>Copy from ${i > 0 ? L[i - 1].short : 'previous month'}</button>
        <button class="secondary" data-action="mo-clear">Clear month</button>
        ${i < 11 ? `<button class="secondary" data-action="month" data-idx="${i + 1}">Next: ${L[i + 1].short} →</button>` : ''}
      </p>
      <p class="muted">${mm.received
        ? 'This month counts as actual income and tax paid.'
        : 'Not received yet, so it counts as a projection. Once your payslip arrives, enter the amounts and tick <b>Mark as received</b>. Grey numbers are projections; type a value to plan a different amount (e.g. an expected bonus).'}
        Copy brings over the recurring items and regular TDS and marks the month received.</p>
      <table class="grid"><thead><tr><th>Item</th><th class="r">Amount (Tk)</th>${tdsHead}</tr></thead><tbody>${compRows}</tbody>
        <tfoot><tr><td>Month total</td><td class="r">${calc(`mo_gross_${i}`)}</td>${hasOther ? '<td></td>' : ''}</tr></tfoot></table>
      <div class="row" style="margin-top:10px">
        ${field('Regular monthly TDS on salary', inp(`monthly.months.${i}.tdsRegular`, { type: 'optnum', ph: '0' }))}
        ${field('One-time TDS (e.g. on a bonus)', inp(`monthly.months.${i}.tdsOneTime`, { type: 'optnum', ph: '0' }))}
        ${field('Note', inp(`monthly.months.${i}.note`, { ph: 'e.g. increment from this month' }))}
      </div>`;
  }

  const sumRows = comps.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${calc(`mo_act_${c.id}`)}</td><td class="r">${calc(`mo_proj_${c.id}`)}</td><td class="r">${calc(`mo_ann_${c.id}`)}</td></tr>`).join('');
  const slabRows = mo.slabRows.map((r, k) => `<tr><td class="r">${r.band === Infinity ? 'Rest' : fmt(r.band)}</td><td class="r">${r.rate}%</td><td class="r">${calc(`mo_slabAmt_${k}`)}</td><td class="r">${calc(`mo_slabTax_${k}`)}</td><td class="r">${calc(`mo_slabRem_${k}`)}</td></tr>`).join('');
  const monthGrid = L.map((l, k) => `<tr><td><a href="#" data-action="month" data-idx="${k}">${l.long}</a></td><td><span class="dot st-${mo.status[k]}"></span>${statusText[mo.status[k]]}</td><td class="r">${k <= through ? '—' : calc(`mo_gross_${k}`)}</td><td class="r">${k <= through ? '—' : calc(`mo_tds_${k}`)}</td><td class="muted">${esc(m.months[k].note)}</td></tr>`).join('');

  const kindOpts = { salary: 'Salary', other: 'Other income' };
  const compMgr = comps.map((c, k) => `<tr>
    <td>${inp(`monthly.components.${k}.name`)}</td>
    <td>${sel(`monthly.components.${k}.kind`, kindOpts)}</td>
    <td style="text-align:center"><input type="checkbox" data-bind="monthly.components.${k}.recurring" data-type="bool" ${c.recurring ? 'checked' : ''}></td>
    <td class="r"><button class="icon" data-action="del" data-list="monthly.components" data-idx="${k}">✕</button></td></tr>`).join('');

  return `<section class="panel">
    <h3>How do you want to enter your income?</h3>
    <div class="seg">${modeBtn('monthly', 'Month by month')}${modeBtn('ytd', 'Totals so far, then monthly')}${modeBtn('year', 'Whole year at once')}</div>
    <p class="muted" style="margin:10px 0 0">${modeHelp} You can switch at any time.</p>
  </section>
  ${mode !== 'monthly' ? `<section class="panel">
    <h3>${mode === 'year' ? `Totals for ${y.startLabel} – ${y.endLabel}` : 'Totals so far'}</h3>
    ${mode === 'ytd' ? throughSel : ''}
    ${totalsTable}
  </section>` : ''}
  ${mo.skipped ? `<div class="warn">${mo.skipped} month(s) before your latest payslip aren't marked received, so they're being projected. Enter them, or switch to "Totals so far, then monthly".</div>` : ''}
  ${cardResultHtml()}
  ${mode !== 'year' ? `<section class="panel">
    <p style="margin-top:0"><button class="secondary" data-action="mo-card">Import a tax card (PDF)</button>
      <input type="file" id="taxCardPdf" accept="application/pdf,.pdf" hidden>
      <span class="muted">Optional: the monthly Tax Card PDF from accordHRM fills that month's salary and TDS.</span></p>
    <div class="chips">${chips}</div>
    <p class="muted" style="margin:6px 0 12px">${calc('mo_receivedLabel')} · <span class="dot st-actual"></span>received <span class="dot st-planned"></span>planned <span class="dot st-projected"></span>projected${mode === 'ytd' ? ' <span class="dot st-carry"></span>in the totals' : ''}</p>
    ${editor}
  </section>` : ''}
  <section class="panel">
    <h3>Income for the year</h3>
    <table class="grid"><thead><tr><th>Item</th><th class="r">Received so far</th><th class="r">Still to come</th><th class="r">Annual</th></tr></thead>
      <tbody>${sumRows}</tbody>
      <tfoot>
        <tr><td>Total</td><td class="r">${calc('mo_totalActual')}</td><td class="r">${calc('mo_totalProjected')}</td><td class="r">${calc('mo_totalAnnual')}</td></tr>
      </tfoot></table>
  </section>
  <section class="panel">
    <h3>Tax ${mode === 'year' ? 'calculation' : 'projection'}</h3>
    <dl class="sum">
      <dt>Salary</dt><dd>${calc('mo_salaryAnnual')}</dd>
      <dt>Salary exemption</dt><dd>${calc('mo_salaryExempt')}</dd>
      <dt>Other income</dt><dd>${calc('mo_otherAnnual')}</dd>
      <dt class="total">Total taxable income</dt><dd class="total">${calc('mo_totalIncome')}</dd>
    </dl>
    <table class="grid" style="margin:12px 0"><thead><tr><th class="r">Slab</th><th class="r">Rate</th><th class="r">Income in slab</th><th class="r">Tax</th><th class="r">Remaining</th></tr></thead>
      <tbody>${slabRows}</tbody><tfoot><tr><td>Total tax</td><td></td><td></td><td class="r">${calc('mo_grossTax')}</td><td></td></tr></tfoot></table>
    ${field('Eligible investment for the year (Tk)', inp('monthly.investmentOverride', { type: 'optnum', ph: `${fmt(compute(s).eligibleInvestment)} from the Rebate step` }),
      'Leave blank to use the Rebate step, or type what you plan to invest by 30 June.')}
    <dl class="sum">
      <dt>${s.rules.rebatePctIncome}% rebate cap</dt><dd>${calc('mo_rebateByIncome')}</dd>
      <dt>Investment needed for the full rebate</dt><dd>${calc('mo_investmentForMaxRebate')}</dd>
      <dt>Investment used</dt><dd>${calc('mo_investment')}</dd>
      <dt>Tax rebate</dt><dd>${calc('mo_rebate')}</dd>
      <dt class="total">Tax payable for the year</dt><dd class="total">${calc('mo_netTax')}</dd>
      <dt>Regular TDS paid</dt><dd>${calc('mo_tdsRegular')}</dd>
      <dt>One-time TDS paid</dt><dd>${calc('mo_tdsOneTime')}</dd>
      <dt>Tax deducted on other income</dt><dd>${calc('mo_tdsOther')}</dd>
      <dt class="total">Total tax paid</dt><dd class="total">${calc('mo_tdsPaid')}</dd>
      <dt class="total">${calc('mo_remainingLabel')}</dt><dd class="total">${calc('mo_remainingAbs')}</dd>
      ${mode === 'year' ? '' : `<dt>Months remaining</dt><dd>${calc('mo_remainingMonths')}</dd>
      <dt>Monthly TDS needed to clear it</dt><dd>${calc('mo_monthlyNeeded')}</dd>
      <dt>${calc('mo_endBalanceLabel')}</dt><dd>${calc('mo_endBalanceAbs')}</dd>`}
    </dl>
  </section>
  ${mode !== 'year' ? `<section class="panel">
    <h3>Month by month</h3>
    <table class="grid"><thead><tr><th>Month</th><th>Status</th><th class="r">Income</th><th class="r">Tax deducted</th><th>Note</th></tr></thead><tbody>${monthGrid}</tbody></table>
  </section>` : ''}
  <section class="panel">
    <h3>Year end</h3>
    <p>Fill the salary components and salary TDS on <b>Income & tax</b> from these totals. Other-income items go to <b>Other income</b>.</p>
    <button data-action="mo-push">Send totals to Income & tax</button>
  </section>
  <section class="panel"><details><summary>Income items</summary><div style="margin-top:10px">
    <p class="muted">Use names that match your payslip. <b>Recurring</b> items repeat in projections; untick for bonuses. Use <b>Other income</b> for income streams outside your salary (they don't get the salary exemption).</p>
    <table class="grid"><thead><tr><th>Name</th><th>Type</th><th>Recurring</th><th></th></tr></thead><tbody>${compMgr}</tbody></table>
    <button class="add" data-action="add" data-list="monthly.components" data-tpl="mcomp">+ Add item</button>
  </div></details></section>`;
};

function pushMonthlyToIncome() {
  const mo = compute(state).mo, m = state.monthly;
  if (mo.remainingMonths > 0 && !confirm(`${mo.remainingMonths} month(s) aren't marked received yet, so their projected amounts will be used. Continue?`)) return;
  if (!confirm('Replace the salary components and salary TDS on Income & tax with these totals?')) return;
  state.salary.components = m.components.filter(x => x.kind !== 'other' && Math.round(mo[`ann_${x.id}`]))
    .map(x => ({ id: uid(), name: x.name, amount: Math.round(mo[`ann_${x.id}`]) }));
  state.salary.tds = Math.round(mo.tdsSalaryPaid);
  for (const x of m.components.filter(x => x.kind === 'other')) {
    let row = state.otherIncome.find(r => r.source === x.name);
    if (!row) { row = { ...TPL.oi(), type: 'Other income', source: x.name }; state.otherIncome.push(row); }
    row.gross = Math.round(mo[`ann_${x.id}`]);
    row.tds = Math.round(mo[`tdsc_${x.id}`]);
  }
  tab = 'income';
}

/* ---------- import a monthly tax card (accordHRM payroll PDF) ---------- */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function parseTaxCard(pages) {
  const L = returnLines(pages);
  if (!L.some(l => /^Tax Card$/i.test(l.text)) || !L.some(l => /^Income Details$/i.test(l.text))) {
    throw new Error("This doesn't look like a monthly tax card. Use the Tax Card PDF from accordHRM (one month's card).");
  }
  const all = L.map(l => l.text).join('\n');
  const iy = /Income Year\s*(\d{4})\s*-\s*(\d{4})/i.exec(all);
  // header rows are label/value pairs: "Employee | Name | Month | July-2026"
  const info = {};
  for (const l of L.slice(0, L.findIndex(x => /^Income Details$/i.test(x.text)))) {
    for (let k = 0; k + 1 < l.cells.length; k += 2) info[l.cells[k].t.toLowerCase()] = l.cells[k + 1].t;
  }
  const mm = /^([A-Za-z]+)[\s-]+(\d{4})$/.exec(info.month || '');
  const mi = mm ? MONTHS.indexOf(mm[1].toLowerCase()) : -1;
  if (!iy || mi < 0) throw new Error("Couldn't find the income year and month on the tax card.");
  const c = { incomeYear: `${iy[1]}-${iy[2]}`, ay: `${iy[2]}-${+iy[2] + 1}`, monthIdx: (mi + 6) % 12, monthLabel: `${mm[1]} ${mm[2]}`,
    employee: info.employee || '', tin: (info['e-tin'] || info.tin || '').replace(/\D/g, '') };

  // income heads: name | this month | YTD | projected annual
  const inc = section(L, /^Income Head/i, /^Total\b/);
  c.heads = inc.slice(1).filter(l => l.cells.length >= 2 && isAmt(l.cells[1].t))
    .map(l => ({ name: l.cells[0].t, amount: num(l.cells[1].t), ytd: num(l.cells[2]?.t), projected: num(l.cells[l.cells.length - 1].t) }));
  const totalLine = L.find(l => /^Total$/i.test(l.cells[0].t) && l.cells.length >= 3);
  c.projectedAnnual = totalLine ? num(totalLine.cells[totalLine.cells.length - 1].t) : sum(c.heads.map(h => h.projected));

  const v = re => amt(L, re) ?? 0;
  c.tdsRegular = v(/^Monthly Tax Deduction for/i);
  c.tdsOneTime = v(/^One-off Tax Deduction for/i) + v(/^Off Cycle Tax Deduction for/i);
  c.tdsTotal = v(/^Total Tax Deduction for/i);
  c.taxable = v(/^Total Taxable Income/i);
  c.grossTax = v(/^Total Income Tax Liability/i);
  c.taxPayable = v(/^Total income tax payable/i);
  // "Tax Reduction for Early Return Filing (5% or BDT 25,000 whichever is" wraps; its amount sits on the next line
  const ei = L.findIndex(l => /^Tax Reduction for Early Return Filing/i.test(l.text));
  c.earlyFiling = ei < 0 ? 0 : (lineLV(L[ei]).amts.pop() ?? (isAmt(L[ei + 1]?.text || '') ? num(L[ei + 1].text) : 0));
  const bi = L.findIndex(l => /^b\)$/.test(l.cells[0].t)); // "b) 0.1 x Actual investment declared | 1,00,000 | ..."
  c.investment = bi >= 0 ? num(L[bi].cells.find((x, k) => k > 0 && isAmt(x.t))?.t) : 0;
  const pct = re => { const x = re.exec(all); return x ? Math.round(parseFloat(x[1]) * 1000) / 10 : null; };
  c.rebatePctIncome = pct(/(\d*\.\d+)\s*x\s*Total Taxable Income/i);
  c.rebatePctInvestment = pct(/(\d*\.\d+)\s*x\s*Actual investment/i);
  c.rebateCap = amt(L, /^(c\) )?Maximum allowable limit/i);
  // slab rows: "On the first Tk. | 400,000 | 0% | 0"
  c.slabs = L.filter(l => /^On the (first|next|balance)/i.test(l.cells[0].t) && l.cells.length >= 3)
    .map(l => ({ income: num(l.cells[1].t), rate: num(l.cells[2].t) }));
  return c;
}

// The open year's monthly item that a tax card income head belongs to, by shared significant words.
function matchComponent(comps, name) {
  const words = n => n.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w && !['allowance', 'salary', 'bonus', 'the', 'of', 'and'].includes(w));
  const exact = comps.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (exact) return exact;
  const w = words(name);
  let best = null, score = 0;
  for (const c of comps) {
    const s = words(c.name).filter(x => w.includes(x)).length;
    if (s > score) { best = c; score = s; }
  }
  return best;
}

let cardResult = null; // transient: summary of the last tax card import

async function importTaxCard(file) {
  if (!file) return;
  try {
    const res = await fetch('/api/pdf-text', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'The server could not read the file.');
    const card = parseTaxCard(out.pages);
    if (applyTaxCard(card, file.name)) { scheduleSave(); render(); $('#cardResult')?.scrollIntoView({ block: 'start' }); }
  } catch (e) {
    alert(e.message);
  }
}

// Fill the card's month in Salary income. Returns false if nothing was changed.
function applyTaxCard(card, fileName) {
  const s = state, m = s.monthly, L = monthLabels(s.assessmentYear), i = card.monthIdx;
  if (card.ay !== s.assessmentYear) {
    const lbl = yearInfo(card.ay).ayLabel;
    alert(`This tax card is for income year ${card.incomeYear} (${lbl}), but ${yearInfo(s.assessmentYear).ayLabel} is open. `
      + (years.includes(card.ay) ? `Switch to ${lbl} with the year selector, then import it again.` : `Create ${lbl} first (the "Start" button at the top, or Settings → Years), then import it again.`));
    return false;
  }
  const myTin = s.profile.tin.replace(/\D/g, '');
  if (card.tin && myTin && card.tin !== myTin && !confirm(`This tax card is for ${card.employee} (TIN ${card.tin}), not ${personName()} (TIN ${s.profile.tin}). Import it anyway?`)) return false;
  if (i <= num(m.carryIn.through)) {
    alert(`${L[i].long} is included in your totals on Salary income ("My totals cover"). Choose "Month by month", or make the totals end before ${L[i].long}, then import the card again.`);
    return false;
  }
  const mm = m.months[i];
  const hasData = mm.received || Object.values(mm.amounts).some(x => !isBlank(x)) || !isBlank(mm.tdsRegular) || !isBlank(mm.tdsOneTime);
  if (hasData && !confirm(`${L[i].long} already has values. Replace them with the tax card's?`)) return false;

  const filled = [], added = [];
  mm.amounts = {}; mm.tds = {};
  for (const h of card.heads) {
    let comp = matchComponent(m.components.filter(x => x.kind !== 'other'), h.name);
    if (!comp) {
      if (!h.amount && !h.projected) continue; // a head that's 0 all year
      comp = { id: uid(), name: h.name, kind: 'salary', recurring: !/bonus|arrear|incentive|one.?off|festival|eid/i.test(h.name) };
      m.components.push(comp); added.push(h.name);
    }
    mm.amounts[comp.id] = num(mm.amounts[comp.id]) + h.amount;
    filled.push([h.name === comp.name ? h.name : `${h.name} → ${comp.name}`, h.amount]);
  }
  mm.tdsRegular = card.tdsRegular; mm.tdsOneTime = card.tdsOneTime; mm.received = true;
  if (!mm.note) mm.note = 'From tax card';
  selMonth = i;

  // compare the employer's projection and tax rules with this app's
  const mo = compute(s).mo; const r = s.rules; const notes = [];
  const thr = card.slabs[0] && card.slabs[0].rate === 0 ? card.slabs[0].income : null;
  const ruleDiffs = [];
  const myThr = num(r.thresholds[s.profile.category] ?? r.thresholds.general);
  if (thr !== null && thr !== myThr) ruleDiffs.push(`tax-free amount ${fmt(thr)} (here ${fmt(myThr)})`);
  // bands are only certain where the next slab has income in it
  const bands = card.slabs.slice(1).map((x, k, arr) => ({ rate: x.rate, upto: k + 1 < arr.length && arr[k + 1].income > 0 ? x.income : null }));
  bands.forEach((b, k) => {
    const mine = r.slabs[k];
    if (!mine) return;
    if (b.rate !== num(mine.rate)) ruleDiffs.push(`slab ${k + 1} rate ${b.rate}% (here ${num(mine.rate)}%)`);
    if (b.upto !== null && b.upto !== num(mine.upto)) ruleDiffs.push(`${b.rate}% band ${fmt(b.upto)} (here ${fmt(num(mine.upto))})`);
  });
  if (card.rebatePctInvestment !== null && card.rebatePctInvestment !== num(r.rebatePctInvestment)) ruleDiffs.push(`rebate ${card.rebatePctInvestment}% of investment (here ${num(r.rebatePctInvestment)}%)`);
  if (card.rebatePctIncome !== null && card.rebatePctIncome !== num(r.rebatePctIncome)) ruleDiffs.push(`rebate cap ${card.rebatePctIncome}% of income (here ${num(r.rebatePctIncome)}%)`);
  if (card.rebateCap && card.rebateCap !== num(r.rebateCap)) ruleDiffs.push(`rebate limit ${fmt(card.rebateCap)} (here ${fmt(num(r.rebateCap))})`);
  if (Math.round(card.projectedAnnual) !== Math.round(mo.totalAnnual)) notes.push(`Your employer projects ${fmt(card.projectedAnnual)} for the year; Salary income projects ${fmt(mo.totalAnnual)}. The difference is usually bonuses: plan them on the months you expect them.`);
  if (card.earlyFiling) notes.push(`The card counts ${fmt(card.earlyFiling)} of "tax reduction for early return filing" as tax already paid. It isn't deducted from your salary, so it isn't entered here.`);
  cardResult = { fileName, month: L[i].long, filled, added, tdsRegular: card.tdsRegular, tdsOneTime: card.tdsOneTime, notes, ruleDiffs,
    card: { taxable: card.taxable, grossTax: card.grossTax, taxPayable: card.taxPayable, investment: card.investment }, rules: { thr, bands, ...card } };
  return true;
}

// Set this year's tax rules to the ones the tax card used (only the parts the card shows).
function applyCardRules() {
  const x = cardResult.rules; const r = state.rules;
  if (x.thr !== null) r.thresholds[state.profile.category in r.thresholds ? state.profile.category : 'general'] = x.thr;
  x.bands.forEach((b, k) => { if (!r.slabs[k]) return; r.slabs[k].rate = b.rate; if (b.upto !== null) r.slabs[k].upto = b.upto; });
  if (x.rebatePctInvestment !== null) r.rebatePctInvestment = x.rebatePctInvestment;
  if (x.rebatePctIncome !== null) r.rebatePctIncome = x.rebatePctIncome;
  if (x.rebateCap) r.rebateCap = x.rebateCap;
  cardResult.ruleDiffs = []; cardResult.rulesApplied = true;
}

function cardResultHtml() {
  const x = cardResult; if (!x) return '';
  const rows = x.filled.map(([n, a]) => `<tr><td>${esc(n)}</td><td class="r">${fmt(a)}</td></tr>`).join('');
  return `<section class="panel" id="cardResult">
    <div class="ok">Filled <b>${esc(x.month)}</b> from <b>${esc(x.fileName)}</b> and marked it received.</div>
    <table class="grid"><tbody>${rows}
      <tr><td>Regular monthly TDS on salary</td><td class="r">${fmt(x.tdsRegular)}</td></tr>
      ${x.tdsOneTime ? `<tr><td>One-time TDS</td><td class="r">${fmt(x.tdsOneTime)}</td></tr>` : ''}</tbody></table>
    ${x.added.length ? `<p class="muted">New income items added: ${x.added.map(esc).join(', ')}. Check whether each is recurring under "Income items" below.</p>` : ''}
    ${x.notes.map(n => `<div class="help">${esc(n)}</div>`).join('')}
    ${x.ruleDiffs.length ? `<div class="warn">The tax card uses different tax rules from this year's settings: ${esc(x.ruleDiffs.join('; '))}. Your employer's payroll usually follows the current Finance Act.
      <p style="margin-top:8px"><button data-action="card-rules">Use the tax card's rules</button></p></div>` : ''}
    ${x.rulesApplied ? '<div class="ok">Tax rules updated from the tax card. Check them in Settings → Tax rules.</div>' : ''}
    <p class="muted">Employer's figures for the year: taxable income ${fmt(x.card.taxable)}, tax ${fmt(x.card.grossTax)}, payable after rebate ${fmt(x.card.taxPayable)}${x.card.investment ? ` (assuming ${fmt(x.card.investment)} of investment)` : ''}.</p>
    <p><button class="secondary" data-action="card-dismiss">Dismiss</button></p>
  </section>`;
}

function copyPrevMonth() {
  const m = state.monthly, i = selMonth, prev = m.months[i - 1], cur = m.months[i];
  const hasData = Object.values(cur.amounts).some(v => !isBlank(v)) || !isBlank(cur.tdsRegular) || !isBlank(cur.tdsOneTime);
  if (hasData && !confirm('This month already has values. Overwrite them?')) return false;
  cur.amounts = {}; cur.tds = {};
  for (const c of m.components) {
    if (!c.recurring) continue;
    if (!isBlank(prev.amounts[c.id])) cur.amounts[c.id] = prev.amounts[c.id];
    if (c.kind === 'other' && !isBlank(prev.tds[c.id])) cur.tds[c.id] = prev.tds[c.id];
  }
  cur.tdsRegular = prev.tdsRegular; cur.tdsOneTime = ''; cur.received = true;
  return true;
}

views.checklist = () => {
  const { done, na } = state.checklist;
  const naBtn = id => `<button class="na-toggle" data-action="ck-na" data-id="${id}" title="${na[id] ? 'This applies to me after all' : "Doesn't apply to me: leave it out of the progress"}">${na[id] ? 'Applies' : 'N/A'}</button>`;
  const cls = id => (na[id] ? 'na' : done[id] ? 'done' : '');
  const box = id => `<input type="checkbox" id="ck-${id}" data-bind="checklist.done.${id}" data-type="bool" data-rerender="1" ${done[id] && !na[id] ? 'checked' : ''} ${na[id] ? 'disabled' : ''}>`;
  const item = (id, text) => `<div class="check-item ${cls(id)}">${box(id)}<label for="ck-${id}">${esc(text)}${na[id] ? ' <span class="na-tag">Not applicable</span>' : ''}</label>${naBtn(id)}</div>`;
  const secs = checklistDef(state).map(sec => `<section class="panel"><h3>${sec.section}</h3>${sec.items.map(i => item(i.id, i.text)).join('')}</section>`).join('');
  const custom = state.checklist.custom.map((c, i) => `<div class="check-item ${cls(c.id)}">${box(c.id)}${inp(`checklist.custom.${i}.text`, { ph: 'Your own item' })}${naBtn(c.id)}<button class="icon" data-action="del" data-list="checklist.custom" data-idx="${i}">✕</button></div>`).join('');
  return `<div class="progress"><div id="progBar" style="width:0%"></div></div><p class="muted">${calc('checkLabel')}</p>
    <p class="muted">Mark anything that doesn't apply to you as <b>N/A</b>: it's left out of the progress, so the checklist can reach 100%.</p>
    ${secs}
    <section class="panel"><h3>My items</h3><p class="muted">Custom items carry over to next year (unticked).</p>${custom}
    <button class="add" data-action="add" data-list="checklist.custom" data-tpl="custom">+ Add item</button></section>`;
};

views.income = () => {
  const y = yearInfo(state.assessmentYear);
  return `  <section class="panel">
    <h3>Salary (${y.startLabel} – ${y.endLabel})</h3>
    <div class="help"><p>Copy each line from your employer's salary certificate, using <b>full-year gross amounts</b> before tax. Use the same component names the website shows, so step 7 matches the site.</p>
    <p>If your employer pays into a recognised provident fund, their contribution counts as income here and as an investment in the Rebate step.</p></div>
    ${field('Employer', inp('salary.employer', { ph: 'Company name' }))}
    ${table('salary.components', [{ label: 'Component', key: 'name' }, { label: 'Amount (Tk)', key: 'amount', type: 'num' }], 'comp',
      { addLabel: 'Add component', foot: ['Gross salary', calc('grossSalary')] })}
    <dl class="sum" style="margin-top:12px">
      <dt>Exempt part (lower of 1/${esc(state.rules.salaryExemptDivisor)} of salary or Tk ${fmt(state.rules.salaryExemptCap)})</dt><dd>${calc('salaryExempt')}</dd>
      <dt class="total">Taxable salary</dt><dd class="total">${calc('taxableSalary')}</dd>
    </dl>
  </section>
  <section class="panel">
    <h3>Tax deducted from salary (TDS)</h3>
    ${field('Total TDS on salary for the year (Tk)', inp('salary.tds', { type: 'num' }),
      "From your employer's TDS certificate. Enter the challan details directly on the website.")}
    ${tips([
      'TDS challans your employer deposited are the year plus <b>11 digits</b> (e.g. <code>2425-00012345671</code>). If the challan box cuts off the last digit, type it <b>without the hyphen</b>. Challans you pay yourself have 10 digits after the year.',
      "The site's <b>Tax at source and advance tax</b> should equal TDS on salary + tax deducted on other income + advance tax here. If it's higher, a deduction was entered twice (e.g. the bank's TDS on the Financial Assets tab and again by hand).",
    ])}
  </section>
  <section class="panel">
    <h3>Other income</h3>
    <div class="help"><p>Bank interest, DPS profit, dividends, etc. Enter the <b>gross</b> amount (before tax) and the tax the bank deducted, as shown on its certificate.</p></div>
    ${tips([
      "On the site this goes on the <b>Income</b> page's <b>Financial Assets</b> tab, not on Assets & Liabilities. If the tab isn't there, tick <b>Financial Assets</b> as an income source on the <b>Assessment</b> page first.",
      'For savings accounts, FDRs and DPS at a bank, choose <b>Interest/Profit (Bank/FI)</b>, one row per account. <b>Related fees/charges</b> = 0 unless the certificate lists any. <b>Year end balance</b> = that account\'s balance on the last day of the income year (0 for a DPS that closed during the year).',
      'If this is left out on the site, "Income shown in the return" there is lower than here and the Difference won\'t be 0.',
    ])}
    ${table('otherIncome', [{ label: 'Type', key: 'type', select: INCOME_TYPES }, { label: 'Source', key: 'source', ph: 'Bank / company' }, { label: 'Gross (Tk)', key: 'gross', type: 'num' }, { label: 'Tax deducted (Tk)', key: 'tds', type: 'num' }], 'oi',
      { addLabel: 'Add income', foot: ['Total', '', calc('otherIncomeGross'), calc('otherIncomeTds')] })}
  </section>
  <section class="panel">
    <h3>Advance tax / other tax paid for this year</h3>
    <p class="muted">E.g. advance income tax paid with a vehicle tax token.</p>
    ${table('advanceTax', [{ label: 'Description', key: 'desc' }, { label: 'Amount (Tk)', key: 'amount', type: 'num' }], 'simple', { addLabel: 'Add payment', foot: ['Total', calc('ait')] })}
  </section>
  <section class="panel">
    <h3>Tax estimate</h3>
    <dl class="sum">
      <dt>Taxable income</dt><dd>${calc('totalIncome')}</dd>
      <dt>Tax-free threshold (${esc(TAXPAYER_CATS[state.profile.category])}, change in Settings)</dt><dd>${calc('threshold')}</dd>
      <dt>Tax on income</dt><dd>${calc('grossTax')}</dd>
      <dt>Less: investment rebate</dt><dd>${calc('rebate')}</dd>
      <dt class="total">Tax payable</dt><dd class="total">${calc('netTax')}</dd>
      <dt>Less: TDS on salary + other income + advance tax</dt><dd>${calc('taxCredits')}</dd>
      <dt class="total">${calc('balanceLabel')}</dt><dd class="total">${calc('balanceAbs')}</dd>
    </dl>
    <p class="muted">If tax after rebate is under the minimum tax (Tk ${fmt(state.rules.minTax)}) and income is above the threshold, the minimum applies.</p>
    ${tips([
      "If the site's tax differs, compare its <b>Tax Computation</b> line by line: Gross tax (then check the tax-free amount and slabs in Settings), Rebate (check the rebate rate in the Rebate step), and Total Payment &amp; Adjustments (your TDS).",
      'The site\'s figures are the official ones: pay its <b>Net Payable</b>. Adjust the rules here so next year\'s estimate starts closer.',
    ], 'Tips: if the site shows a different tax')}
  </section>`;
};

views.investments = () => {
  const r = state.rules; const y = yearInfo(state.assessmentYear);
  return `  <div class="help">
    <p><b>Only money you put in during the income year counts</b> (${y.startLabel} – ${y.endLabel}). The rebate is the lowest of: ${r.rebatePctIncome}% of taxable income, ${r.rebatePctInvestment}% of eligible investment, or Tk ${fmt(r.rebateCap)}.</p>
    <p>You'd need about ${calc('investmentForMaxRebate')} Tk of eligible investment to get the full rebate this year.</p>
  </div>
  <section class="panel">
    <h3>Life insurance (e.g. MetLife)</h3>
    <div class="help">
      <ul>
        <li><b>Policy value</b> = the <b>sum assured</b> (face amount) printed on your policy schedule. It's the full contract amount, not what you've paid so far, and the same every year.</li>
        <li><b>Premium paid</b> = only the premiums you actually paid between ${y.startLabel} and ${y.endLabel}. Count every instalment (monthly, quarterly or annual) paid in that period. MetLife can issue a premium payment certificate for a date range.</li>
        <li>Premiums you pay on your <b>spouse's or minor child's</b> policy also count. If that policy is listed as an asset on their own return, set <b>Asset listed on</b> to "Their return" so it isn't expected among your assets.</li>
        <li>Allowable for the rebate = the lower of the premium paid or ${r.insurancePctOfSumAssured}% of the sum assured.</li>
        <li>In Assets &amp; liabilities you can also show the policy as a financial asset (total premiums paid to date). See the note there.</li>
      </ul>
    </div>
    ${tips([
      "The insurer's app and a certificate can show different face amounts (e.g. one includes riders). Use the <b>basic sum assured</b> on the policy schedule. It only sets the 10% cap, so it rarely changes the rebate.",
      "The asset value (Assets &amp; liabilities) is the total premiums paid to date, or the value on the insurer's certificate. It isn't the sum assured, and it isn't only this year's premium.",
      "A policy for your spouse, e.g. given as Mahr: the premiums can count for your rebate, the policy is an asset on <b>their</b> return, and the premiums you paid go under <b>Gift, donation and contribution</b> on the Expenditure tab.",
    ])}
    ${table('investments.insurance', [
      { label: 'Company', key: 'company' }, { label: 'Policy no.', key: 'policyNo' },
      { label: 'Policy value / sum assured', key: 'sumAssured', type: 'num' },
      { label: 'Premium paid this year', key: 'premiumPaid', type: 'num' },
      { label: 'Asset listed on', key: 'owner', select: POLICY_OWNER },
      { label: 'Allowable', calc: row => `insAllow_${row.id}` }], 'ins',
      { addLabel: 'Add policy', foot: ['Total', '', '', '', '', calc('invInsurance')] })}
  </section>
  <section class="panel">
    <h3>DPS (deposit pension scheme)</h3>
    <p class="muted">Instalments you deposited during the year (not the balance). Allowable up to Tk ${fmt(r.dpsCap)} a year in total.</p>
    ${tips([
      "A DPS that matured or closed during the year still counts for the instalments you paid before it closed. The bank's certificate lists them.",
      "After it closes, its balance is 0 in Assets &amp; liabilities (the payout is now in your bank account), and its profit goes under Other income on Income &amp; tax.",
    ])}
    ${table('investments.dps', [{ label: 'Bank', key: 'bank' }, { label: 'Account no.', key: 'account' }, { label: 'Deposited this year', key: 'deposited', type: 'num' }], 'dps',
      { addLabel: 'Add DPS', foot: ['Allowable', '', calc('invDps')] })}
  </section>
  <section class="panel">
    <h3>Provident fund contributions</h3>
    <div class="row">
      ${field('Your contribution this year (Tk)', inp('investments.pf.employee', { type: 'num' }))}
      ${field("Employer's contribution this year (Tk)", inp('investments.pf.employer', { type: 'num' }), 'Recognised PF only; usually shown on the salary certificate')}
    </div>
  </section>
  <section class="panel">
    <h3>Savings certificates / government securities bought this year</h3>
    <p class="muted">Allowable up to Tk ${fmt(r.savingsCertCap)}.</p>
    ${table('investments.savingsCerts', [{ label: 'Description', key: 'desc' }, { label: 'Amount (Tk)', key: 'amount', type: 'num' }], 'simple', { addLabel: 'Add', foot: ['Allowable', calc('invSavings')] })}
  </section>
  <section class="panel">
    <h3>Listed shares / mutual funds bought this year</h3>
    ${table('investments.shares', [{ label: 'Description', key: 'desc' }, { label: 'Amount (Tk)', key: 'amount', type: 'num' }], 'simple', { addLabel: 'Add', foot: ['Total', calc('invShares')] })}
  </section>
  <section class="panel">
    <h3>Other eligible investments</h3>
    <p class="muted">Anything else the site lists (e.g. Zakat paid to an approved fund, donations to approved institutions). Enter only the allowable amount.</p>
    ${table('investments.other', [{ label: 'Description', key: 'desc' }, { label: 'Amount (Tk)', key: 'amount', type: 'num' }], 'simple', { addLabel: 'Add', foot: ['Total', calc('invOther')] })}
  </section>
  <section class="panel">
    <h3>Rebate</h3>
    <p class="muted">Rates for this year (also under Settings). If the site's <b>Total Allowable Investment</b> matches but its <b>Tax Rebate › On Investment</b> doesn't, the rate differs: divide the site's rebate by the investment and set that rate here.</p>
    <div class="row">
      ${field('Rebate: % of investment', inp('rules.rebatePctInvestment', { type: 'dec' }))}
      ${field('Rebate: % of taxable income', inp('rules.rebatePctIncome', { type: 'dec' }))}
      ${field('Rebate cap (Tk)', inp('rules.rebateCap', { type: 'num' }))}
    </div>
    <dl class="sum">
      <dt>Total eligible investment</dt><dd>${calc('eligibleInvestment')}</dd>
      <dt>Taxable income × income rate</dt><dd>${calc('rebateByIncome')}</dd>
      <dt>Eligible investment × investment rate</dt><dd>${calc('rebateByInvestment')}</dd>
      <dt>Cap</dt><dd>${fmt(r.rebateCap)}</dd>
      <dt class="total">Rebate (lowest, not more than the tax)</dt><dd class="total">${calc('rebate')}</dd>
    </dl>
  </section>`;
};

// Asset/liability rows: type either the closing value or the change; the other is calculated.
// Whichever was typed last drives the row (byChange), and closing is always stored for the return.
const assetExtra = a => { const x = [a.qty, a.acq && a.acq.toLowerCase()].filter(Boolean); return x.length ? ` (${x.join(', ')})` : ''; };

const wealthCols = (openLabel, closeLabel) => [
  { label: openLabel, key: 'opening', type: 'num' },
  { label: closeLabel, key: 'closing', type: 'num', cls: row => (row.byChange ? 'derived' : '') },
  { label: 'Change (+/−)', key: 'change', type: 'num', signed: true, cls: row => (row.byChange ? '' : 'derived') },
];

function syncWealthRow(path, input) {
  const m = path.match(/^(assets|liabilities)\.(\d+)\.(opening|closing|change)$/);
  if (!m) return;
  const [, list, idx, field] = m; const row = state[list][+idx];
  if (field === 'closing') row.byChange = false;
  if (field === 'change') row.byChange = true;
  if (row.byChange) row.closing = num(row.opening) + num(row.change);
  else row.change = num(row.closing) - num(row.opening);
  for (const f of ['closing', 'change']) {
    const el = document.querySelector(`[data-bind="${list}.${idx}.${f}"]`);
    if (!el) continue;
    el.classList.toggle('derived', f === 'closing' ? row.byChange : !row.byChange);
    if (el !== input) el.value = num(row[f]) === 0 ? '' : fmt(num(row[f]));
  }
}

function selGroups(path, sections) {
  const v = getBound(path);
  const known = sections.some(([, cats]) => cats.includes(v));
  return `<select data-bind="${path}">${known || isBlank(v) ? '' : `<option selected>${esc(v)}</option>`}${sections.map(([sec, cats]) =>
    `<optgroup label="${esc(sec)}">${cats.map(cat => `<option value="${esc(cat)}" ${cat === v ? 'selected' : ''}>${esc(cat)}</option>`).join('')}</optgroup>`).join('')}</select>`;
}

/* ---------- balancing ---------- */
let bal = { toExp: 0, assetId: null, touched: false }; // transient: the "Balance it" panel's choices

function balanceDefaults(c) {
  if (!bal.touched) bal.toExp = c.difference; // default: all into expenses, until the user types a split
  if (!state.assets.some(a => a.id === bal.assetId)) {
    bal.assetId = (state.assets.find(a => a.category === 'Cash in hand') || state.assets[0] || {}).id || null;
  }
}

// Spread `amount` across expense categories that aren't locked, in proportion to what was tracked.
function expenseSpread(amount) {
  const cats = state.expenses.categories.filter(x => !x.fixed);
  if (!cats.length) return null;
  const base = sum(cats.map(x => x.tracked));
  const out = {}; let assigned = 0; let largest = cats[0];
  for (const x of cats) {
    const share = base > 0 ? num(x.tracked) / base : (x.id === 'other' ? 1 : 0);
    out[x.id] = Math.floor(amount * share); assigned += out[x.id];
    if (num(x.tracked) > num(largest.tracked)) largest = x;
  }
  if (base === 0 && !cats.some(x => x.id === 'other')) largest = cats[cats.length - 1];
  out[largest.id] = (out[largest.id] || 0) + (Math.round(amount) - assigned); // rounding residue on the biggest
  return out;
}

function balancePreview() {
  const c = compute(state); balanceDefaults(c);
  const E = Math.round(num(bal.toExp)), W = c.difference - E;
  const a = state.assets.find(x => x.id === bal.assetId);
  const newTracked = c.finalLifestyle + E;
  const pct = c.trackedTotal > 0 ? ((newTracked - c.trackedTotal) / c.trackedTotal) * 100 : null;
  const parts = [];
  if (E) parts.push(`Living expenses ${E > 0 ? 'go up' : 'go down'} by <b>${fmt(Math.abs(E))}</b>, to ${fmt(newTracked)}${pct === null ? '' : ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs what you tracked)`}.`);
  if (W && a) parts.push(`<b>${esc(a.category)}${a.description ? ` – ${esc(a.description)}` : ''}</b> closing ${W > 0 ? 'goes up' : 'goes down'} by <b>${fmt(Math.abs(W))}</b>, to ${fmt(num(a.closing) + W)}${a.category === 'Cash in hand' ? ` (it was ${fmt(num(a.opening))} on last year's return)` : ''}.`);
  if (W && !a) parts.push(`<span class="bad">Add an asset row to put ${fmt(W)} into net wealth.</span>`);
  let warn = '';
  if (c.trackedTotal === 0) warn = '<div class="warn">You haven\'t entered any expenses yet. Enter what you spent in the Expenditure step first, so only the real gap is left to balance.</div>';
  else if (pct !== null && Math.abs(pct) > 15) warn = `<div class="warn">That's a ${Math.abs(pct).toFixed(0)}% change to your expenses. Check the asset list below for something missing first.</div>`;
  if (a && num(a.closing) + W < 0) warn += `<div class="bad">That would make ${esc(a.category)} negative.</div>`;
  if (a && W && a.category === 'Cash in hand') {
    const after = num(a.closing) + W, open = num(a.opening);
    if ((after > 200000 && after > 0.25 * c.sourceOfFund) || Math.abs(after - open) > Math.max(100000, 0.5 * open)) {
      warn += `<div class="warn">Cash in hand would be ${fmt(after)} (last year ${fmt(open)}). Only use cash you really held on 30 June: a padded cash figure becomes next year's opening value and has to be explained then.</div>`;
    }
  }
  if (newTracked < 0) warn += '<div class="bad">That would make expenses negative.</div>';
  return { html: parts.length ? `<p>${parts.join('<br>')}</p>${warn}` : '<p class="muted">Nothing to change.</p>', E, W, a, ok: !(a && num(a.closing) + W < 0) && newTracked >= 0 && !(W && !a) };
}

function applyBalance() {
  const p = balancePreview();
  if (!p.ok) { alert("That split can't be applied. See the message under the preview."); return false; }
  if (!confirm(`Apply this?\n\n${p.html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '')}`)) return false;
  if (p.E) {
    const spread = expenseSpread(p.E);
    if (!spread) { alert('All expense categories are locked. Unlock one in the Expenditure step.'); return false; }
    for (const x of state.expenses.categories) if (spread[x.id]) x.adj = num(x.adj) + spread[x.id];
  }
  if (p.W && p.a) {
    if (p.a.byChange) { p.a.change = num(p.a.change) + p.W; p.a.closing = num(p.a.opening) + num(p.a.change); }
    else { p.a.closing = num(p.a.closing) + p.W; p.a.change = num(p.a.closing) - num(p.a.opening); }
  }
  bal.touched = false;
  return true;
}

function balanceHints(c) {
  const has = cat => state.assets.some(a => a.category === cat && num(a.closing) > 0);
  if (c.difference > 0) {
    const h = [
      !has('Provident fund and other funds') && 'Provident fund balance (your and your employer\'s contributions plus interest)',
      'Other bank accounts, or mobile wallets such as bKash or Nagad',
      'Cash in hand on 30 June',
      !has('DPS') && 'DPS or fixed deposit balances',
      'Money you lent to someone, or advances you paid (e.g. a rent advance)',
      'Things you bought this year: gadgets, furniture, gold, a vehicle',
      'Spending you didn\'t track: cash, Eid, travel, gifts to family',
    ].filter(Boolean);
    return `<p>Income came in that isn't shown as spending or as something you own. Common gaps:</p><ul>${h.map(x => `<li>${x}</li>`).join('')}</ul>`;
  }
  return `<p>More is going out (spending plus growth in what you own) than came in. Common causes:</p><ul>
    <li>Money received that isn't income: gifts, inheritance, sale of an asset (add under Other receipts)</li>
    <li>A loan you took or money you owe (add as a liability)</li>
    <li>Last year's net wealth entered too low</li>
    <li>Assets at market value instead of cost, or expenses counted twice (e.g. DPS deposits or insurance premiums that are also assets)</li></ul>`;
}

function balancePanelHtml(c) {
  balanceDefaults(c);
  const assetOpts = state.assets.map(a => `<option value="${a.id}" ${a.id === bal.assetId ? 'selected' : ''}>${esc(a.category)}${a.description ? ` – ${esc(a.description)}` : ''}</option>`).join('');
  const p = c.balanced ? null : balancePreview();
  return c.balanced
    ? `<div class="ok">Balanced: the difference is 0. ${c.adjTotal ? `Expenses include ${fmt(c.adjTotal)} of balancing adjustments.` : ''}</div>`
    : `<div class="${c.difference > 0 ? 'warn' : 'bad'}">Difference: <b>${fmt(c.difference)}</b>. It must be 0 before you can submit.</div>
      ${balanceHints(c)}
      <p>Fix any real omission above first. Then split what's left between expenses (spending you didn't record) and net wealth (an asset's closing value):</p>
      <div class="row">
        <label class="field"><span>Put into expenses (Tk)</span><input class="num" id="balExp" inputmode="text" value="${fmt(num(bal.toExp))}"></label>
        <label class="field"><span>Rest into this asset's closing value</span><select id="balAsset">${assetOpts || '<option value="">No assets yet</option>'}</select></label>
      </div>
      <p><button class="secondary" data-action="bal-all-exp">All into expenses</button>
        <button class="secondary" data-action="bal-all-asset">All into the asset</button></p>
      <div id="balPreview">${p.html}</div>
      <p><button data-action="bal-apply">Apply</button></p>`;

}

views.expenses = () => {
  const y = yearInfo(state.assessmentYear);
  const cats = state.expenses.categories;
  const idx = Object.fromEntries(cats.map((x, i) => [x.id, i]));
  const last = prevDoc ? yearEndOf(prevDoc) : null;
  const L = v => (last ? `<td class="r muted">${v === null || v === undefined ? '' : fmt(v)}</td>` : '');
  const leaf = (x, sub) => { const i = idx[x.id]; return `<tr${sub ? ' class="sub"' : ''}>
    <td><span>${esc(x.name)}</span></td>${L(last && (last.expenses[x.id] || 0))}
    <td>${inp(`expenses.categories.${i}.tracked`, { type: 'num' })}</td>
    <td style="text-align:center"><input type="checkbox" title="Locked: balancing won't change this row" data-bind="expenses.categories.${i}.fixed" data-type="bool" ${x.fixed ? 'checked' : ''}></td>
    <td class="r muted">${calc(`expAdj_${x.id}`)}</td>
    <td class="r"><b>${calc(`expFinal_${x.id}`)}</b></td></tr>`; };
  const body = EXPENSE_LAYOUT.map(([g, rows], gi) => {
    const leaves = rows.map(([id]) => cats.find(x => x.id === id)).filter(Boolean);
    if (!g) return leaves.map(x => leaf(x, false)).join('');
    return `<tr class="grp"><td>${esc(g)}</td>${L(last && sum(rows.map(([id]) => last.expenses[id] || 0)))}<td class="r">${calc(`expGrpT_${gi}`)}</td><td></td><td class="r muted">${calc(`expGrpA_${gi}`)}</td><td class="r">${calc(`expGrpF_${gi}`)}</td></tr>`
      + leaves.map(x => leaf(x, true)).join('');
  }).join('');
  const extras = cats.filter(x => !EXPENSE_GROUP_OF.hasOwnProperty(x.id));
  const extraRows = extras.length ? `<tr class="grp"><td colspan="${last ? 6 : 5}">Your own categories <span class="muted">(not on the website: move these amounts into a website row)</span></td></tr>`
    + extras.map(x => leaf(x, true).replace('</td>', ` <button class="icon" data-action="del" data-list="expenses.categories" data-idx="${idx[x.id]}" title="Remove row">✕</button></td>`)).join('') : '';
  return `  <div class="help">
    <p>Enter what you <b>actually spent</b> from ${y.startLabel} to ${y.endLabel}. The rows match the website's Expenditure page. Don't force it to balance here: like the website, the balance check happens on <b>Assets & liabilities</b>, and <b>Balance it</b> there splits any gap between expenses and net wealth.</p>
  </div>
  <section class="panel">
    <h3>Expenses</h3>
    ${last ? `<p class="muted">The <b>${yearInfo(prevDoc.assessmentYear).ayLabel.replace('AY ', '')}</b> column shows last year's figures as filed, for comparison.</p>` : ''}
    <p class="muted"><b>Your amount</b> = what your records show. <b>Lock</b> = keep it as-is when balancing (e.g. rent or school fees you know exactly). <b>Balancing</b> = added by Balance it. <b>To enter</b> = the figure for the website. Section totals are calculated by the website.</p>
    <div class="table-scroll"><table class="grid expenditure">
      <thead><tr><th>Particulars</th>${last ? `<th class="r w-last">${yearInfo(prevDoc.assessmentYear).ayLabel.replace('AY ', '')}</th>` : ''}<th class="r w-amt">Your amount</th><th class="w-lock">Lock</th><th class="r w-bal">Balancing</th><th class="r w-fin">To enter</th></tr></thead>
      <tbody>${body}${extraRows}
        <tr class="total-row"><td>Total expense relating to lifestyle</td>${L(last && last.lifestyle)}<td class="r">${calc('trackedTotal')}</td><td></td><td class="r">${calc('adjTotal')}</td><td class="r">${calc('finalLifestyle')}</td></tr>
        <tr><td>Tax, charges, etc. paid during ${y.startLabel} to ${y.endLabel} <span class="muted">(below)</span></td>${L(last && last.taxPaid)}<td></td><td></td><td></td><td class="r">${calc('taxPaidOutflow')}</td></tr>
        <tr class="sub"><td>Tax at source and advance tax</td>${L(last && last.taxAtSource)}<td></td><td></td><td></td><td class="r"><b>${calc('taxAtSource')}</b></td></tr>
        <tr class="sub"><td>Tax, surcharge or other amount</td>${L(last && last.taxOther)}<td></td><td></td><td></td><td class="r"><b>${calc('taxOtherPaid')}</b></td></tr>
        <tr><td>Interest payment of personal loan</td>${L(last && last.loanInterest)}<td>${inp('expenses.loanInterest', { type: 'num' })}</td><td></td><td></td><td class="r"><b>${calc('loanInterest')}</b></td></tr>
        <tr><td>Environmental surcharge</td>${L(last && last.envSurcharge)}<td>${inp('expenses.envSurcharge', { type: 'num' })}</td><td></td><td></td><td class="r"><b>${calc('envSurcharge')}</b></td></tr>
      </tbody>
      <tfoot><tr><td>Total amount of expense and tax</td>${L(last && last.finalTotal)}<td></td><td></td><td></td><td class="r">${calc('finalTotal')}</td></tr></tfoot>
    </table></div>
    <p><button class="secondary" data-action="reset-adj">Remove balancing adjustments</button></p>
    <p class="muted">The total carries over to the Assets & Liabilities page as "Annual Living Expense".</p>
  </section>
  <section class="panel">
    <h3>Tax paid during the income year</h3>
    ${field(`Tax paid between ${y.startLabel} and ${y.endLabel} for earlier years (Tk)`, inp('prevYearTaxPaid', { type: 'num' }),
      "E.g. the balance you paid when filing last year's return. Filled in automatically when a year is created with 'Start next year'.")}
    ${tips([
      'The site splits <b>Tax, charges, etc. paid</b> into two boxes: <b>Tax at source and advance tax</b>, and <b>Tax, surcharge or other amount</b>. Step 7 lists both.',
      'Use the challan amount for earlier years\' tax (last year\'s return lists it under "Tax Paid with Return"). A card or processing fee isn\'t tax: put it under <b>Any other expenses</b>.',
      "Don't include this year's own net payable here. It's paid after the year ends, so it counts in next year's return.",
    ])}
    <dl class="sum">
      <dt>TDS on salary</dt><dd>${calc('salaryTds')}</dd>
      <dt>Tax deducted on other income</dt><dd>${calc('otherIncomeTds')}</dd>
      <dt>Advance tax</dt><dd>${calc('ait')}</dd>
      <dt class="total">Tax at source and advance tax</dt><dd class="total">${calc('taxAtSource')}</dd>
      <dt class="total">Tax, surcharge or other amount <span class="muted">(earlier years' tax paid this year)</span></dt><dd class="total">${calc('taxOtherPaid')}</dd>
      <dt class="total">Tax paid (total)</dt><dd class="total">${calc('taxPaidOutflow')}</dd>
    </dl>
  </section>
  <section class="panel">
    <h3>Other outflow</h3>
    <p class="muted">Shown separately from living expenses on the site's Assets & Liabilities page.</p>
    <div class="row">
      ${field('Loss, deduction, other expense (Tk)', inp('expenses.otherOutflow.loss', { type: 'num' }))}
      ${field('Gift, donation and contribution (Tk)', inp('expenses.otherOutflow.gifts', { type: 'num' }))}
    </div>
    ${tips([
      'On the site these two boxes are on the <b>Assets &amp; Liabilities</b> page, under Other fund outflow, not on Expenditure.',
      '<b>Gift, donation and contribution</b> = money or property you gave away: a gift to a relative, Mahr, or premiums on someone else\'s policy. Zakat and charity already in the Philanthropy row shouldn\'t be counted again here.',
      'Gifts you <b>received</b> go under Other receipts in Assets &amp; liabilities, as a source of fund.',
    ])}
  </section>
  <section class="panel">
    <h3>Balance check</h3>
    <dl class="sum"><dt>${calc('differenceLabel')}</dt><dd class="total">${calc('difference')}</dd></dl>
    <div data-calc-html="expenseWarningsHtml" style="margin-top:10px"></div>
    <p><a href="#" data-action="tab" data-tab="wealth">Go to Assets & liabilities →</a></p>
  </section>
  ${csvPanel()}`;
};

views.wealth = () => {
  const y = yearInfo(state.assessmentYear);
  const c = compute(state);
  return `<div data-calc-html="diffStatusHtml"></div>
  <div class="help">
    <p><b>Opening</b> = value on ${y.prevEndLabel}. <b>Closing</b> = value on ${y.endLabel}. For each row, type <b>either the closing value or the change</b>; the other is calculated and shown in grey. The website asks for closing values.</p>
    <p>Use <b>cost</b> (what you paid), not market value. Categories follow the website's sections. Life insurance goes under <b>Other financial assets</b>, at total premiums paid to date. <b>Qty</b> and <b>Acquired</b> are what the website asks for gold, furniture and similar items.</p>
  </div>
  ${tips([
    'Bank accounts: the balance on the statement for the last day of the year. Credit card balances you owe are <b>liabilities</b>, not negative assets.',
    'A DPS or FDR that closed during the year: closing 0. Its payout is already in your bank balance. On the site, untick it or enter 0 as its balance.',
    "Your spouse's assets go on your statement only if they don't file their own return. A policy that's in their name goes on their return.",
    "<b>Cash in hand</b> is the usual cause of a gap that won't close. Last year's figure is fixed, so check this year's against your records (cash taken out minus cash spent).",
    'If the Difference is 0 here but not on the site, compare Income shown, Tax exempted income, Annual living expense and Other fund outflow with the Summary below, one at a time.',
  ])}
  <section class="panel">
    <h3>Assets</h3>
    ${table('assets', [
      { label: 'Category', key: 'category', groups: ASSET_SECTIONS }, { label: 'Description', key: 'description', ph: 'Details (bank, account, item…)' },
      { label: 'Qty', key: 'qty', ph: 'qty' }, { label: 'Acquired', key: 'acq', select: ACQ_OPTS },
      ...wealthCols(`Opening (${y.prevEndLabel})`, `Closing (${y.endLabel})`)], 'asset',
      { addLabel: 'Add asset', cls: 'assets', foot: ['Gross wealth', '', '', '', calc('assetsOpen'), calc('assetsClose'), calc('assetsChange')] })}
  </section>
  <section class="panel">
    <h3>Liabilities (outside business)</h3>
    <p class="muted">Outstanding balances: bank loans, credit card balance, money you owe to people.</p>
    ${table('liabilities', [
      { label: 'Category', key: 'category', select: LIAB_CATS }, { label: 'Description', key: 'description' },
      ...wealthCols('Opening', 'Closing')], 'liab',
      { addLabel: 'Add liability', foot: ['Total', '', calc('liabOpen'), calc('liabClose'), calc('liabChange')] })}
  </section>
  <section class="panel">
    <h3>Sources of fund: other receipts</h3>
    <p class="muted">Money received that isn't income: gifts or inheritance, proceeds from selling an asset, loans repaid to you. Don't list loans you took; they're liabilities.</p>
    ${table('otherReceipts', [{ label: 'Description', key: 'desc' }, { label: 'Amount (Tk)', key: 'amount', type: 'num' }], 'simple', { addLabel: 'Add receipt', foot: ['Total', calc('otherReceipts')] })}
  </section>
  <section class="panel">
    <h3>Net wealth of previous income year</h3>
    ${prevDoc
      ? `<p>Opening values come from <b>${yearInfo(prevDoc.assessmentYear).ayLabel}</b>'s ${prevDoc.yearEnd ? `year-end values (saved ${esc(prevDoc.yearEnd.savedAt)})` : 'current figures (year-end values not saved yet)'}: net wealth <b>${fmt(yearEndOf(prevDoc).closingNetWealth)}</b>.
         <button class="secondary" data-action="refresh-opening">Update opening values from ${yearInfo(prevDoc.assessmentYear).ayLabel}</button></p>`
      : `<p class="muted">${yearInfo(prevAY(state.assessmentYear)).ayLabel} isn't in the app, so enter opening values from last year's return.</p>`}
    ${field(`Net wealth at the last date of previous income year (${y.prevEndLabel})`, inp('openingNetWealthOverride', { type: 'optnum', ph: `${fmt(c.openingNWItems)} from the opening column` }),
      "Use the figure from last year's return (the site can import it). Leave blank to use your opening column.")}
  </section>
  <section class="panel">
    <h3>Summary <span class="muted">(same as the website)</span></h3>
    <dl class="sum">
      <dt>Gross wealth</dt><dd>${calc('assetsClose')}</dd>
      <dt>Total liabilities outside business</dt><dd>${calc('liabClose')}</dd>
      <dt class="total">Net wealth</dt><dd class="total">${calc('closingNW')}</dd>
      <dt>Net wealth at the last date of previous income year</dt><dd>${calc('openingNW')}</dd>
      <dt class="total">Change in net wealth</dt><dd class="total">${calc('nwChange')}</dd>
      <dt>Other fund outflow (living expense ${calc('finalTotal')} + other outflow)</dt><dd>${calc('otherFundOutflow')}</dd>
      <dt class="total">Total fund outflow</dt><dd class="total">${calc('totalFundOutflow')}</dd>
      <dt>Source of fund (income shown ${calc('incomeShown')} + tax-exempt ${calc('exemptIncome')} + other receipts)</dt><dd>${calc('sourceOfFund')}</dd>
      <dt class="total">Difference (must be 0)</dt><dd class="total ${c.balanced ? '' : 'diff-bad'}">${calc('difference')}</dd>
    </dl>
  </section>
  <section class="panel" id="balanceSection">
    <h3>Balance it</h3>
    <div id="balancePanel">${balancePanelHtml(c)}</div>
  </section>
  <section class="panel">
    <h3>Checks</h3>
    <div data-calc-html="wealthChecksHtml"></div>
  </section>
  <section class="panel"><details><summary>Where last year's paper return lines go</summary><div style="margin-top:10px">${paperMappingHtml()}</div></details></section>`;
};

// The Entry sheet's rows, grouped in the website's order: [{title, where, rows: [[key, label, value]]}].
function sheetGroups(s, c) {
  const y = yearInfo(s.assessmentYear);
  const groups = [];
  let where = '';
  const g = (title, rows) => rows.length && groups.push({ title, where, rows });
  where = 'Income › Salaries';
  g('Salary', [
    ...s.salary.components.filter(x => num(x.amount)).map(x => [`sal-${x.id}`, x.name, x.amount]),
    ['sal-total', 'Total gross salary (check)', c.grossSalary],
    ['sal-tds', 'Tax deducted at source on salary', c.salaryTds],
  ]);
  where = 'Income › Financial Assets';
  g('Other income', s.otherIncome.flatMap(x => [[`oi-${x.id}`, `${x.type}: ${x.source} (gross)`, x.gross], [`oit-${x.id}`, `${x.type}: ${x.source} (tax deducted)`, x.tds]]));
  where = 'Tax & Payment';
  g('Advance tax', s.advanceTax.map(x => [`ait-${x.id}`, x.desc, x.amount]));
  where = 'Rebate';
  g('Rebate (investments)', [
    ...s.investments.insurance.flatMap(p => [
      [`insv-${p.id}`, `${p.company} ${p.policyNo}: policy value (sum assured)`, p.sumAssured],
      [`insp-${p.id}`, `${p.company} ${p.policyNo}: premium paid this year`, p.premiumPaid]]),
    ...s.investments.dps.map(d => [`dps-${d.id}`, `DPS ${d.bank} ${d.account}: deposited this year`, d.deposited]),
    ...(num(s.investments.pf.employee) ? [['pf-emp', 'Own contribution to provident fund', s.investments.pf.employee]] : []),
    ...(num(s.investments.pf.employer) ? [['pf-er', "Employer's contribution to provident fund", s.investments.pf.employer]] : []),
    ...s.investments.savingsCerts.map(x => [`sc-${x.id}`, `Savings certificate: ${x.desc}`, x.amount]),
    ...s.investments.shares.map(x => [`sh-${x.id}`, `Shares / MF: ${x.desc}`, x.amount]),
    ...s.investments.other.map(x => [`io-${x.id}`, x.desc, x.amount]),
    ['inv-rebate', 'Expected rebate (check)', c.rebate],
  ]);
  where = 'Expenditure';
  g('Expenditure', [
    ...s.expenses.categories.filter(x => c[`expFinal_${x.id}`])
      .map(x => [`ex-${x.id}`, `${EXPENSE_GROUP_OF[x.id] ? `${EXPENSE_GROUP_OF[x.id]} › ` : ''}${x.name}`, c[`expFinal_${x.id}`]]),
    ['ex-life', 'Total expense relating to lifestyle (check)', c.finalLifestyle],
    ['ex-tax-src', `Tax, charges, etc. paid during ${y.startLabel} to ${y.endLabel} › Tax at source and advance tax`, c.taxAtSource],
    ['ex-tax-oth', `Tax, charges, etc. paid during ${y.startLabel} to ${y.endLabel} › Tax, surcharge or other amount`, c.taxOtherPaid],
    ...(c.loanInterest ? [['ex-int', 'Interest payment of personal loan', c.loanInterest]] : []),
    ...(c.envSurcharge ? [['ex-env', 'Environmental surcharge', c.envSurcharge]] : []),
    ['ex-total', 'Total amount of expense and tax (check)', c.finalTotal],
  ]);
  const assetRows = [];
  for (const [sec, cats] of ASSET_SECTIONS) {
    for (const a of s.assets.filter(x => cats.includes(x.category) && num(x.closing))) {
      assetRows.push([`as-${a.id}`, `${sec}${sec === a.category ? '' : ` › ${a.category}`}${a.description ? ` – ${a.description}` : ''}${assetExtra(a)}`, a.closing]);
    }
  }
  s.assets.filter(x => !ASSET_SECTION_OF[x.category] && num(x.closing)).forEach(a => assetRows.push([`as-${a.id}`, `${a.category}${a.description ? ` – ${a.description}` : ''}`, a.closing]));
  where = 'Assets & Liabilities';
  g(`Assets on ${y.endLabel}`, assetRows);
  g(`Liabilities on ${y.endLabel}`, s.liabilities.filter(a => num(a.closing)).map(a => [`li-${a.id}`, `${a.category}${a.description ? ` – ${a.description}` : ''}`, a.closing]));
  g('Other outflow', [
    ['oo-living', 'Annual living expense', c.finalTotal],
    ...(c.outflowLoss ? [['oo-loss', 'Loss deduction other expense', c.outflowLoss]] : []),
    ...(c.outflowGifts ? [['oo-gifts', 'Gift donation and contribution', c.outflowGifts]] : []),
  ]);
  g('Sources of fund', [
    ['sf-income', 'Income shown in the return (check)', c.incomeShown],
    ['sf-exempt', 'Tax exempted income and allowances (check)', c.exemptIncome],
    ...s.otherReceipts.map(x => [`rc-${x.id}`, `Other receipts: ${x.desc}`, x.amount]),
  ]);
  g('Net wealth of previous income year', [['nw-open', `Net wealth at the last date of previous income year (${y.prevEndLabel})`, c.openingNW]]);
  g('Summary (check: Difference must be 0)', [
    ['sm-gross', 'Gross wealth', c.assetsClose], ['sm-net', 'Net wealth', c.closingNW], ['sm-change', 'Change in net wealth', c.nwChange],
    ['sm-outflow', 'Total fund outflow', c.totalFundOutflow], ['sm-source', 'Source of fund', c.sourceOfFund], ['sm-diff', 'Difference', c.difference],
  ]);
  where = 'Tax & Payment';
  g('Tax (check against the site)', [
    ['tx-income', 'Taxable income', c.totalIncome], ['tx-gross', 'Tax on income', c.grossTax],
    ['tx-rebate', 'Rebate', c.rebate], ['tx-net', 'Tax payable', c.netTax], ['tx-bal', c.balanceLabel, c.balanceAbs],
  ]);
  return groups;
}
const sheetProgress = (s, c) => {
  const keys = sheetGroups(s, c).flatMap(gr => gr.rows.map(([k]) => k));
  return { total: keys.length, done: keys.filter(k => s.entered[k]).length };
};
let hideEntered = false; // transient: Entry sheet shows only the rows still to type in

views.sheet = () => {
  const c = compute(state); const s = state;
  const groups = sheetGroups(s, c);
  const pr = sheetProgress(s, c);
  const body = groups.map(gr => {
    const rows = gr.rows.filter(([key]) => !(hideEntered && s.entered[key]));
    if (!rows.length) return '';
    return `<section class="panel"><div class="panel-head"><h3>${esc(gr.title)}</h3>${gr.where ? `<span class="portal">On the website: <b>${esc(gr.where)}</b></span>` : ''}</div><table class="grid">${rows.map(([key, label, value]) => {
      const done = !!s.entered[key]; const v = Math.round(num(value));
      return `<tr class="sheet-row ${done ? 'entered' : ''} ${key === 'sm-diff' && v !== 0 ? 'diff-row' : ''}"><td><input type="checkbox" data-bind="entered.${key}" data-type="bool" data-rerender="1" ${done ? 'checked' : ''}></td>
        <td>${esc(label)}</td><td class="sheet-value">${fmt(v)}</td><td class="r"><button class="copy" data-action="copy" data-value="${v}">Copy</button></td></tr>`;
    }).join('')}</table></section>`;
  }).join('');
  const diffWarn = c.balanced ? '' : `<div class="bad"><b>The Assets &amp; liabilities difference is ${fmt(c.difference)}; it must be 0.</b>
      The website won't accept the return until it is, and the expense and asset figures below will change when you balance it.
      <a href="#" data-action="tab" data-tab="wealth">Balance it on Assets &amp; liabilities</a> before entering these figures.</div>`;
  const allDone = pr.total > 0 && pr.done === pr.total;
  return `${diffWarn}
    <div class="help"><p><b>Copy</b> puts the plain number (no commas) on your clipboard. Tick each row once it's on the site. Rows marked "(check)" are the site's own totals: compare, don't type.</p></div>
    <div class="sheet-toolbar">
      <span><b>${pr.done}</b> of ${pr.total} entered</span>
      <div class="progress"><div style="width:${pr.total ? Math.round(pr.done / pr.total * 100) : 0}%"></div></div>
      <button class="secondary" data-action="toggle-entered" data-lock-safe="1">${hideEntered ? 'Show all rows' : 'Hide entered rows'}</button>
      <button class="secondary" data-action="clear-entered">Untick all</button>
      <button class="secondary" data-action="print">Print</button>
    </div>
    ${hideEntered && allDone ? '<div class="ok">Everything is entered. Next: pay and submit.</div>' : ''}
    ${body}
    ${tips([
      "<b>The site's figure differs from a (check) row.</b> Find the first line that differs and look at the Tips on that step. The site does the official calculation: if its tax rules differ (e.g. the rebate rate), set them on the Rebate tab or in Settings so the estimate matches.",
      '<b>"Income shown in the return" is lower on the site.</b> Other income (bank interest, DPS profit) is probably missing: tick <b>Financial Assets</b> as an income source on the site\'s Assessment page, then fill in its Income tab.',
      '<b>The Difference is 0 here but not on the site.</b> Compare Income shown, Tax exempted income, Annual living expense and Net wealth one at a time with the Summary rows below. Usually one field on the site wasn\'t updated after a change here.',
      '<b>A challan number gets cut off.</b> TDS challans are the year plus 11 digits (e.g. 2425-00012345671). If the box drops the last digit, type it without the hyphen.',
      "<b>Changes in the app don't show up.</b> Reload with Cmd+Shift+R. If it runs in Docker, app updates need <code>docker compose up -d --build</code> first.",
      '<b>Figures went back to old values.</b> Keep only one tab of this app open: an old tab can save its stale copy over newer changes. Backups (one a minute, last 30) are in <code>data/people/&lt;person&gt;/backups/</code>.',
    ], 'Troubleshooting')}`;
};

// Step 8: the website's last pages, then the confirmations kept here.
views.file = () => {
  const c = compute(state); const y = yearInfo(state.assessmentYear); const due = Math.round(c.balance);
  return `<section class="panel">
    <h3>On the website</h3>
    <ol class="walk">
      <li><b class="where">Tax &amp; Payment: check the tax</b>
        <p>Compare the site's figures with this estimate. If they differ, the site is right: see the tips under Income &amp; tax.</p>
        <dl class="sum">
          <dt>Tax payable (after rebate)</dt><dd>${calc('netTax')}</dd>
          <dt>Tax deducted at source and advance tax</dt><dd>${calc('taxCredits')}</dd>
          <dt class="total">${calc('balanceLabel')}</dt><dd class="total">${calc('balanceAbs')}</dd>
        </dl></li>
      <li><b class="where">Tax &amp; Payment: pay the Net Payable</b>
        <p>${due > 0 ? `Pay the site's <b>Net Payable</b> with <b>Pay Now</b>, or pay it separately by challan and add the payment so that <b>Payable</b> shows 0. The site won't let you submit until it does.`
          : 'Nothing should be left to pay. The site\'s <b>Payable</b> must show 0 before you can submit.'}</p></li>
      <li><b class="where">Return View: check every page</b>
        <p>Look for missing income, assets or liabilities, and confirm the Assets &amp; Liabilities difference is 0.</p></li>
      <li><b class="where">Submit, then download the acknowledgement slip</b>
        <p>Save the slip and a copy of the return (print the Return View to PDF). You'll need the slip for your employer and banks. Keep the return PDF: next year, <b>Settings → Record a past year</b> can read it.</p></li>
    </ol>
  </section>
  ${filingPanelHtml(c)}
  <section class="panel">
    <h3>Notes for next year</h3>
    ${inp('submission.notes', { type: 'area', ph: 'Anything you learned, or values the site needed that weren\'t in here' })}
  </section>
  ${state.submission.submitted ? `<div class="ok">${y.ayLabel} is done. <button class="secondary" data-action="start-next" data-lock-safe="1">${years.includes(nextAY(state.assessmentYear)) ? 'Open' : 'Start'} ${yearInfo(nextAY(state.assessmentYear)).ayLabel}</button></div>` : ''}`;
};

/* ---------- step status ---------- */
// Where a step stands: 'done', 'warn' (needs attention) or '' (to do), with a one-line summary.
function stepState(id, s, c) {
  const r = (state, detail) => ({ state, detail });
  switch (id) {
    case 'checklist': {
      const docs = checklistDef(s)[0].items.filter(i => !s.checklist.na[i.id]);
      const got = docs.filter(i => s.checklist.done[i.id]).length;
      return r(got === docs.length ? 'done' : '', `${got} of ${docs.length} documents ready`);
    }
    case 'monthly': {
      const mo = c.mo;
      if (mo.monthsReceived === 12) return r('done', 'All 12 months entered');
      return r('', mo.monthsReceived ? `${mo.monthsReceived} of 12 months entered` : 'Optional: track payslips through the year');
    }
    case 'income':
      return c.grossSalary > 0 || c.otherIncomeGross > 0
        ? r('done', `Taxable income ${fmt(c.totalIncome)} · tax ${fmt(c.netTax)}`) : r('', 'Not started');
    case 'investments': {
      if (!(c.eligibleInvestment > 0)) return r('', c.totalIncome > c.threshold ? `Invest up to ${fmt(c.investmentForMaxRebate)} for the full rebate` : 'Nothing entered');
      const more = Math.max(0, c.investmentForMaxRebate - c.eligibleInvestment);
      return r('done', `Rebate ${fmt(c.rebate)}${more >= 1 ? ` · ${fmt(more)} short of the full rebate` : ' · full rebate'}`);
    }
    case 'expenses':
      return c.finalLifestyle > 0 ? r('done', `Living expenses ${fmt(c.finalLifestyle)}`) : r('', 'Not started');
    case 'wealth':
      // carried-over balances trivially "balance" before any income is in, so that doesn't count as done
      if (!s.assets.some(a => num(a.closing) || num(a.opening)) && !s.liabilities.length) return r('', 'Not started');
      if (!(c.grossSalary > 0 || c.otherIncomeGross > 0)) return r('', 'Fill in income first, then closing values');
      return c.balanced ? r('done', `Balanced · net wealth ${fmt(c.closingNW)}`) : r('warn', `Difference ${fmt(c.difference)}: must be 0`);
    case 'sheet': {
      const p = sheetProgress(s, c);
      return r(p.total && p.done === p.total ? 'done' : '', p.done ? `${p.done} of ${p.total} figures entered` : `${p.total} figures to enter`);
    }
    case 'file':
      if (s.submission.submitted) return r('done', `Submitted${s.submission.date ? ` on ${s.submission.date}` : ''}`);
      if (s.submission.taxPaid) return r('', 'Tax paid · submit the return');
      return r('', Math.round(c.balance) > 0 ? `About ${fmt(c.balance)} to pay` : 'Nothing to pay by this estimate');
    default: return r('', '');
  }
}

// The step to do next, or null once the return is submitted: a step that needs attention first, otherwise the
// first unfinished step after the furthest one done, so going back isn't suggested. Salary income is optional
// once Income & tax is filled in.
function nextStep(s, c) {
  if (s.submission.submitted) return null;
  const all = STEPS.map(st => ({ ...STEP_OF[st.id], ...stepState(st.id, s, c) }));
  const incomeDone = all.find(x => x.id === 'income').state === 'done';
  const open = all.filter(x => x.state !== 'done' && !(x.id === 'monthly' && incomeDone));
  const furthest = all.map(x => x.state === 'done').lastIndexOf(true);
  return open.find(x => x.state === 'warn') || open.find(x => x.n - 1 > furthest) || open[0] || null;
}

function navHtml(c) {
  const item = (id, label, mark, cls = '') => `<button class="nav-item ${cls} ${id === tab ? 'active' : ''}" data-action="tab" data-tab="${id}"><span class="nav-num">${mark}</span><span class="label">${esc(label)}</span></button>`;
  let h = item('overview', 'Home', '⌂', 'plain'); let grp = null;
  for (const st of STEPS) {
    if (st.group !== grp) { grp = st.group; h += `<div class="nav-group">${grp}</div>`; }
    const ss = stepState(st.id, state, c);
    h += item(st.id, st.nav, ss.state === 'done' ? '✓' : ss.state === 'warn' ? '!' : STEP_OF[st.id].n, `st-${ss.state}`);
  }
  return `${h}<div class="nav-group">More</div>${item('history', 'All years', '≡', 'plain')}${item('settings', 'Settings', '⋯', 'plain')}`;
}

function pageHead(id) {
  const st = STEP_OF[id];
  return `<div class="page-head"><div class="eyebrow">Step ${st.n} of ${STEPS.length}</div><h1>${esc(st.title)}</h1>
    <p class="lead">${esc(st.lead)}</p>${st.portal ? `<span class="portal">On the website: <b>${esc(st.portal)}</b></span>` : ''}</div>`;
}
function stepNavHtml(id) {
  const i = STEPS.findIndex(s => s.id === id); const prev = STEPS[i - 1]; const next = STEPS[i + 1];
  return `<div class="step-nav">
    <button class="secondary" data-action="tab" data-tab="${prev ? prev.id : 'overview'}">← ${esc(prev ? prev.nav : 'Home')}</button><span class="spacer"></span>
    <button data-action="tab" data-tab="${next ? next.id : 'overview'}">${next ? `Next: ${esc(next.nav)} →` : 'Back to Home'}</button></div>`;
}

/* ---------- all years & export ---------- */
let historyData = null; // transient: [{ay, s, c}] for the All years tab

async function loadAllYears() {
  await save();
  const out = [];
  for (const ay of years) {
    const doc = ay === state.assessmentYear ? state : normalize(await api(yearsUrl(ay)));
    out.push({ ay, s: doc, c: compute(doc) });
  }
  if (!years.includes(state.assessmentYear)) out.push({ ay: state.assessmentYear, s: state, c: compute(state) });
  return out.sort((a, b) => a.ay.localeCompare(b.ay));
}

function summaryRows(list) {
  const r = (label, f) => [label, ...list.map(({ s, c }) => f(s, c))];
  return [
    r('Income year', s => yearInfo(s.assessmentYear).iyLabel),
    r('Gross salary', (s, c) => Math.round(c.grossSalary)),
    r('Other income', (s, c) => Math.round(c.otherIncomeGross)),
    r('Taxable income', (s, c) => Math.round(c.totalIncome)),
    r('Eligible investment', (s, c) => Math.round(c.eligibleInvestment)),
    r('Rebate', (s, c) => Math.round(c.rebate)),
    r('Tax payable', (s, c) => Math.round(c.netTax)),
    r('Tax deducted / paid', (s, c) => Math.round(c.taxCredits)),
    r('Balance payable (refund if negative)', (s, c) => Math.round(c.balance)),
    r('Total assets (30 June)', (s, c) => Math.round(c.assetsClose)),
    r('Total liabilities (30 June)', (s, c) => Math.round(c.liabClose)),
    r('Net wealth (30 June)', (s, c) => Math.round(c.closingNW)),
    r('Increase in net wealth', (s, c) => Math.round(c.nwChange)),
    r('Annual living expense', (s, c) => Math.round(c.finalTotal)),
    r('Assets & liabilities difference (must be 0)', (s, c) => Math.round(c.difference)),
    r('Salary income: annual income', (s, c) => Math.round(c.mo.totalAnnual)),
    r('Checklist', (s, c) => c.checkLabel),
    r('Paid with return', s => (s.submission.taxPaid ? Math.round(num(s.submission.taxPaidAmount)) : '')),
    r('Submitted on', s => s.submission.date),
    r('Acknowledgement no.', s => s.submission.ackNo),
    r('Locked', s => (s.locked ? 'Yes' : 'No')),
  ];
}

views.history = () => {
  if (!historyData) {
    loadAllYears().then(d => { historyData = d; if (tab === 'history') render(); })
      .catch(() => { $('#main').innerHTML = '<div class="bad">Could not load all years.</div>'; });
    return '<div class="page-head"><h1>All years</h1></div><p class="muted">Loading…</p>';
  }
  const rows = summaryRows(historyData);
  const head = historyData.map(({ ay }) => `<th class="r"><a href="#" data-action="open-year" data-ay="${ay}">${yearInfo(ay).ayLabel}</a>${ay === state.assessmentYear ? ' <span class="muted">(open)</span>' : ''}</th>`).join('');
  const body = rows.map(([label, ...vals]) => `<tr><td>${esc(label)}</td>${vals.map(v => `<td class="r">${typeof v === 'number' ? fmt(v) : esc(v)}</td>`).join('')}</tr>`).join('');
  return `<div class="page-head"><h1>All years</h1><p class="lead">Key figures for every year saved. Click a year to open it. Amounts are what you entered, not the official assessment.</p></div>
    <section class="panel" style="overflow-x:auto"><table class="grid"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></section>
    <p><button data-action="export-all" data-lock-safe="1">Download this table (CSV)</button>
      <button class="secondary" data-action="export-year" data-lock-safe="1">Download ${yearInfo(state.assessmentYear).ayLabel} in full (CSV)</button></p>`;
};

const csvCell = v => { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
const fileSlug = () => personName().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || person;
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); // BOM so Excel reads UTF-8
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function yearCSV(s) {
  const c = compute(s), y = yearInfo(s.assessmentYear), mo = c.mo, m = s.monthly, L = monthLabels(s.assessmentYear);
  const R = Math.round; const rows = [];
  const sec = (title, header) => { rows.push([], [title.toUpperCase()]); if (header) rows.push(header); };
  rows.push(['Tax return data', y.ayLabel, `Income year ${y.startLabel} to ${y.endLabel}`], ['Exported', new Date().toISOString().slice(0, 10)]);

  sec('Profile');
  rows.push(['Name', s.profile.name], ['TIN', s.profile.tin], ['Taxpayer category', TAXPAYER_CATS[s.profile.category]],
    ['Submitted on', s.submission.date], ['Acknowledgement no.', s.submission.ackNo], ['Notes', s.submission.notes]);

  const through = num(m.carryIn.through);
  sec('Salary income', ['Item', 'Type', through >= 0 ? `Totals (Jul to ${L[through].short})` : 'Totals',
    ...L.map(l => l.short), 'Received so far', 'Still to come', 'Projected annual']);
  const cell = (i, v) => (i <= through ? '' : (isBlank(v) ? '' : R(num(v))));
  for (const comp of m.components) {
    rows.push([comp.name, `${comp.kind === 'other' ? 'Other income' : 'Salary'}${comp.recurring ? ', recurring' : ', one-off'}`,
      through >= 0 ? R(num(m.carryIn.amounts[comp.id])) : '', ...m.months.map((mm, i) => cell(i, mm.amounts[comp.id])),
      R(mo[`act_${comp.id}`]), R(mo[`proj_${comp.id}`]), R(mo[`ann_${comp.id}`])]);
  }
  rows.push(['Regular TDS', '', through >= 0 ? R(num(m.carryIn.tdsRegular)) : '', ...m.months.map((mm, i) => cell(i, mm.tdsRegular)), R(mo.tdsRegular)]);
  rows.push(['One-time TDS', '', through >= 0 ? R(num(m.carryIn.tdsOneTime)) : '', ...m.months.map((mm, i) => cell(i, mm.tdsOneTime)), R(mo.tdsOneTime)]);
  for (const comp of m.components.filter(x => x.kind === 'other')) {
    rows.push([`Tax deducted: ${comp.name}`, '', through >= 0 ? R(num(m.carryIn.tds[comp.id])) : '', ...m.months.map((mm, i) => cell(i, mm.tds[comp.id])), R(mo[`tdsc_${comp.id}`])]);
  }
  rows.push(['Status', '', '', ...mo.status.map(x => ({ carry: 'in the totals', actual: 'received', planned: 'planned', projected: 'projected' }[x]))]);
  rows.push(['Note', '', '', ...m.months.map(mm => mm.note)]);
  sec('Salary income: tax projection');
  rows.push(['Projected taxable income', R(mo.totalIncome)], ['Tax before rebate', R(mo.grossTax)], ['Investment used', R(mo.investment)],
    ['Rebate', R(mo.rebate)], ['Tax payable', R(mo.netTax)], ['Tax paid so far', R(mo.tdsPaid)],
    ['Remaining liability', R(mo.remainingLiability)], ['Months remaining', mo.remainingMonths], ['Monthly TDS needed', R(mo.monthlyNeeded)]);

  sec('Salary (as filed)', ['Component', 'Amount']);
  s.salary.components.forEach(x => rows.push([x.name, R(num(x.amount))]));
  rows.push(['Gross salary', R(c.grossSalary)], ['Exempt', R(c.salaryExempt)], ['Taxable salary', R(c.taxableSalary)], ['TDS on salary', R(c.salaryTds)]);
  if (s.otherIncome.length) {
    sec('Other income', ['Type', 'Source', 'Gross', 'Tax deducted']);
    s.otherIncome.forEach(x => rows.push([x.type, x.source, R(num(x.gross)), R(num(x.tds))]));
  }
  if (s.advanceTax.length) {
    sec('Advance tax', ['Description', 'Amount']);
    s.advanceTax.forEach(x => rows.push([x.desc, R(num(x.amount))]));
  }

  const inv = s.investments;
  sec('Investments', ['Type', 'Description', 'Policy value / sum assured', 'Paid this year', 'Allowable']);
  inv.insurance.forEach(p => rows.push(['Life insurance', `${p.company} ${p.policyNo}`.trim(), R(num(p.sumAssured)), R(num(p.premiumPaid)), R(c[`insAllow_${p.id}`])]));
  inv.dps.forEach(d => rows.push(['DPS', `${d.bank} ${d.account}`.trim(), '', R(num(d.deposited)), '']));
  if (inv.dps.length) rows.push(['DPS (allowable total)', '', '', R(c.dpsDeposited), R(c.invDps)]);
  if (num(inv.pf.employee) || num(inv.pf.employer)) rows.push(['Provident fund', 'Own + employer', '', R(c.invPf), R(c.invPf)]);
  inv.savingsCerts.forEach(x => rows.push(['Savings certificate', x.desc, '', R(num(x.amount)), '']));
  if (inv.savingsCerts.length) rows.push(['Savings certificates (allowable total)', '', '', R(c.savingsBought), R(c.invSavings)]);
  inv.shares.forEach(x => rows.push(['Shares / mutual funds', x.desc, '', R(num(x.amount)), R(num(x.amount))]));
  inv.other.forEach(x => rows.push(['Other', x.desc, '', R(num(x.amount)), R(num(x.amount))]));
  rows.push(['Total eligible investment', '', '', '', R(c.eligibleInvestment)], ['Rebate', '', '', '', R(c.rebate)]);

  const wealth = (title, list) => {
    sec(title, ['Category', 'Description', 'Qty', 'Acquired', `Opening (${y.prevEndLabel})`, `Closing (${y.endLabel})`, 'Change']);
    list.forEach(a => rows.push([a.category, a.description, a.qty || '', a.acq || '', R(num(a.opening)), R(num(a.closing)), R(num(a.closing) - num(a.opening))]));
  };
  wealth('Assets', s.assets);
  rows.push(['Total assets', '', '', '', R(c.assetsOpen), R(c.assetsClose), R(c.assetsClose - c.assetsOpen)]);
  wealth('Liabilities', s.liabilities);
  rows.push(['Total liabilities', '', '', '', R(c.liabOpen), R(c.liabClose), R(c.liabClose - c.liabOpen)]);
  sec('Net wealth');
  rows.push(['Opening net wealth', R(c.openingNW)], ['Closing net wealth', R(c.closingNW)], ['Increase', R(c.nwChange)]);
  if (s.otherReceipts.length) {
    sec('Other receipts', ['Description', 'Amount']);
    s.otherReceipts.forEach(x => rows.push([x.desc, R(num(x.amount))]));
  }

  sec('Expenditure', ['Section', 'Particulars', 'Your amount', 'Balancing adjustment', 'Reported', 'Locked']);
  s.expenses.categories.forEach(x => rows.push([EXPENSE_GROUP_OF[x.id] || '', x.name, R(num(x.tracked)), R(num(x.adj)), R(c[`expFinal_${x.id}`]), x.fixed ? 'Yes' : '']));
  rows.push(['', 'Total expense relating to lifestyle', R(c.trackedTotal), R(c.adjTotal), R(c.finalLifestyle)],
    ['', 'Tax, charges, etc. paid', '', '', R(c.taxPaidOutflow)],
    ['', '› Tax at source and advance tax', '', '', R(c.taxAtSource)], ['', '› Tax, surcharge or other amount', '', '', R(c.taxOtherPaid)], ['', 'Interest payment of personal loan', '', '', R(c.loanInterest)],
    ['', 'Environmental surcharge', '', '', R(c.envSurcharge)], ['', 'Total amount of expense and tax', '', '', R(c.finalTotal)]);
  rows.push(
    ['Loss deduction other expense', R(c.outflowLoss)], ['Gift donation and contribution', R(c.outflowGifts)]);
  sec('Assets & liabilities summary');
  rows.push(['Gross wealth', R(c.assetsClose)], ['Total liabilities', R(c.liabClose)], ['Net wealth', R(c.closingNW)],
    ['Net wealth at the last date of previous income year', R(c.openingNW)], ['Change in net wealth', R(c.nwChange)],
    ['Other fund outflow', R(c.otherFundOutflow)], ['Total fund outflow', R(c.totalFundOutflow)],
    ['Source of fund', R(c.sourceOfFund)], ['Difference (must be 0)', R(c.difference)]);

  sec('Tax summary');
  rows.push(['Taxable income', R(c.totalIncome)], ['Tax-free threshold', R(c.threshold)], ['Tax before rebate', R(c.grossTax)],
    ['Rebate', R(c.rebate)], ['Tax payable', R(c.netTax)], ['Tax deducted / paid', R(c.taxCredits)], [c.balanceLabel, R(c.balanceAbs)]);

  sec('Checklist', ['Section', 'Item', 'Done']);
  for (const g of checklistDef(s)) g.items.forEach(i => rows.push([g.section, i.text, ckState(s, i.id)]));
  s.checklist.custom.forEach(i => rows.push(['My items', i.text, ckState(s, i.id)]));
  return toCSV(rows);
}

async function exportAll() {
  const list = historyData || await loadAllYears();
  const rows = [['Metric', ...list.map(({ ay }) => yearInfo(ay).ayLabel)], ...summaryRows(list)];
  download(`tax-${fileSlug()}-all-years.csv`, toCSV(rows));
}

/* ---------- last year's paper return (IT-10B) ---------- */
// Lines of the IT-10B statement of assets, liabilities and expenses, and where each goes on the website.
const PAPER_ASSET_LINES = [
  ['business', '8(a)–(c) Business assets / director\'s shareholdings / partnership capital', 'Business capital'],
  ['nonagri', '8(d) Non-agricultural property / land / house property', 'Non-agricultural property'],
  ['agri', '8(e) Agricultural property', 'Agricultural property'],
  ['shares', '8(f)(i) Share / debenture / bond / securities / unit certificate', 'Shares, debentures, bonds, securities, unit certificates'],
  ['sanchay', '8(f)(ii) Sanchayapatra / deposit pension scheme', 'Sanchayapatra'],
  ['loan', '8(f)(iii) Loan given', 'Loans given to others'],
  ['deposit', '8(f)(iv) Savings deposit / term deposit', 'Fixed deposits, term deposits'],
  ['pf', '8(f)(v) Provident fund or other fund', 'Provident fund and other funds'],
  ['otherinv', '8(f)(vi) Other investment (e.g. life insurance)', 'Other financial assets'],
  ['vehicle', '8(g) Motor vehicle(s)', 'Motor car'],
  ['ornaments', '8(h) Ornaments', 'Gold, diamond, gems and other items'],
  ['furniture', '8(i) Furniture and electronic items', 'Furniture, equipment and electronic items'],
  ['otherassets', '8(j) Other assets', 'Other assets of significant value'],
  ['bank', '8(k)(i) Bank balance', 'Bank accounts, cards and e-cash'],
  ['cash', '8(k)(ii) Cash in hand', 'Cash in hand'],
  ['others', '8(k)(iii) Others (under cash and fund outside business)', 'Other deposits, balance and advance'],
  ['abroad', '9 Assets outside Bangladesh', 'Asset outside Bangladesh'],
];
const PAPER_LIAB_LINES = [
  ['inst', '6(a) Institutional liabilities', 'Bank loan'],
  ['noninst', '6(b) Non-institutional liabilities', 'Personal loan (unsecured)'],
  ['other', '6(c) Other liabilities', 'Other liability'],
];
const PAPER_OTHER_LINES = [
  ['1(a) Total income shown in return', 'Sources of fund › Income shown in the return'],
  ['1(b) Tax exempted income', 'Sources of fund › Tax exempted income and allowances'],
  ['1(c) Receipt of gift and others', 'Sources of fund › Other receipts'],
  ['2 Net wealth as on last date of previous income year', 'Net wealth at the last date of previous income year'],
  ['4(a) Expense relating to lifestyle (IT-10BB)', 'Expenditure total → "Annual living expense"'],
  ['4(b) Gift / expenses / loss not in IT-10BB', 'Other outflow › Loss deduction / Gift, donation and contribution'],
  ['6 Personal liabilities outside business', 'Liabilities (outside business)'],
];

function paperMappingHtml() {
  const rows = [...PAPER_OTHER_LINES, ...PAPER_ASSET_LINES.map(([, p, w]) => [p, `${ASSET_SECTION_OF[w]}${ASSET_SECTION_OF[w] === w ? '' : ` › ${w}`}`])];
  return `<table class="grid"><thead><tr><th>Last year's return (IT-10B)</th><th>On the website / in this app</th></tr></thead><tbody>
    ${rows.map(([p, w]) => `<tr><td>${esc(p)}</td><td>${esc(w)}</td></tr>`).join('')}</tbody></table>`;
}

/* ---------- import a filed return (the website's Return View saved as PDF) ---------- */
// Tax rules of earlier years, so a year recorded from its return shows the tax it actually had.
const KNOWN_RULES = {
  // Finance Act 2024 (income year 2024-25); checked against a filed AY 2025-26 return.
  '2025-2026': {
    thresholds: { general: 350000, women_senior: 400000, disabled_thirdgender: 475000, freedom_fighter: 500000 },
    slabs: [{ upto: 100000, rate: 5 }, { upto: 400000, rate: 10 }, { upto: 500000, rate: 15 }, { upto: 500000, rate: 20 },
      { upto: 2000000, rate: 25 }, { upto: '', rate: 30 }],
    rebatePctInvestment: 15,
  },
};
const rulesForYear = ay => ({ ...defaultRules(), ...clone(KNOWN_RULES[ay] || {}) });

const isAmt = t => /^-?(\d{1,3}(,\d{2,3})+|\d+)(\.\d+)?$/.test(t);
const isoDate = t => { const m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(t || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const titleCase = s => s.toLowerCase().replace(/(^|[\s.-])\S/g, c => c.toUpperCase());

// Pages of [[x, text], ...] lines from /api/pdf-text -> lines with cells, minus the browser's print header and footer.
function returnLines(pages) {
  return pages.flatMap(p => p.map(cells => ({ cells: cells.map(([x, t]) => ({ x, t })), text: cells.map(c => c[1]).join(' ') })))
    .filter(l => !/^about:blank \d+\/\d+$/.test(l.text) && !/^\d{1,2}\/\d{1,2}\/\d{2}, \d{1,2}:\d{2} [AP]M\b/.test(l.text));
}
// A table row's label (without its serial cell) and the amounts at its end.
function lineLV(l) {
  const ts = l.cells.map(c => c.t); const amts = [];
  while (ts.length > 1 && isAmt(ts[ts.length - 1])) amts.unshift(num(ts.pop()));
  if (ts.length > 1 && /^\d+\.$/.test(ts[0])) ts.shift();
  return { label: ts.join(' '), amts };
}
function section(lines, startRe, endRe) {
  const i = lines.findIndex(l => startRe.test(l.text));
  if (i < 0) return [];
  const j = lines.findIndex((l, k) => k > i && endRe.test(l.text));
  return lines.slice(i, j < 0 ? undefined : j);
}
// Amount on the line whose label matches: null if there's no such line, 0 if the line has no amount.
function amt(lines, re, { first = false } = {}) {
  for (const l of lines) {
    const { label, amts } = lineLV(l);
    if (re.test(label)) return amts.length ? (first ? amts[0] : amts[amts.length - 1]) : 0;
  }
  return null;
}
// Rows of an attachment table. A row starts on a line that passes isStart; text wrapped onto the
// following lines is added to the column it sits under.
function tableRows(lines, isStart) {
  const rows = []; let cur = null;
  for (const l of lines) {
    if (isStart(l)) { cur = l.cells.map(c => ({ ...c })); rows.push(cur); continue; }
    if (!cur) continue;
    for (const c of l.cells) {
      const col = cur.reduce((b, k) => (Math.abs(k.x - c.x) < Math.abs(b.x - c.x) ? k : b));
      col.t += ` ${c.t}`;
    }
  }
  return rows.map(r => r.map(c => c.t));
}

function parseReturn(pages) {
  const L = returnLines(pages);
  if (!L.some(l => /^Statement of Income and Tax/i.test(l.text))) {
    throw new Error(L.some(l => /^Acknowledgement Receipt/i.test(l.text))
      ? "This is the acknowledgement receipt. Import the return itself: open the filed return's Return View on the website and save it as a PDF."
      : "This doesn't look like an income tax return (IT-11GA). Use the PDF of the return from the website's Return View.");
  }
  const r = { warnings: [] };
  const head = section(L, /./, /^Statement of Income and Tax/);
  const cell1 = re => { const l = head.find(x => re.test(x.text)); return l && l.cells[1] ? l.cells[1].t : ''; };
  const ay = /Assessment Year:\s*(\d{4})-(\d{4})/.exec(L.map(l => l.text).join('\n'));
  if (!ay) throw new Error("Couldn't find the assessment year in the PDF.");
  r.ay = `${ay[1]}-${ay[2]}`;
  r.name = cell1(/^1\. Name of the Taxpayer/);
  const tinLine = head.find(l => /^3\. TIN/.test(l.text));
  r.tin = tinLine ? tinLine.cells.slice(1).map(c => c.t).join('').replace(/\D/g, '') : '';
  r.serial = cell1(/^Serial No\. of Return/).replace(/\D/g, '');
  r.submitted = isoDate(cell1(/^Date of Return Submission/));
  const emp = head.map(l => /employer\S*\s+name.*?\):\s*(.+)$/i.exec(l.text)).find(Boolean);
  r.employer = emp ? emp[1].trim() : '';

  const main = section(L, /^Statement of Income and Tax/, /^Schedule\s*-?\s*1$|^Schedule\s*-?\s*5$|^IT-\s?10/);
  const m = re => amt(main, re) ?? 0;
  r.income = {
    employment: m(/^Income from Employment/), rent: m(/^Income from Rent/), agriculture: m(/^Income from Agriculture/),
    business: m(/^Income from Business/), capitalGain: m(/^Income from Capital Gain/), financial: m(/^Income from Financial Assets/),
    other: m(/^Income from Other Sources/), firm: m(/^Share of Income from Firm/), minorSpouse: m(/^Income of Minor or Spouse/),
    abroad: m(/^Taxable Income from Abroad/), total: m(/^Total Income \(Aggregate/),
  };
  r.tax = {
    gross: m(/^Gross Tax on Taxable Income/), rebate: m(/^Tax Rebate/), net: m(/^Net Tax after Rebate/), minimum: m(/^Minimum Tax/),
    payable: m(/^Tax Payable/), envSurcharge: amt(main, /^\(c\) Environmental Surcharge/, { first: true }) ?? 0,
    delayInterest: m(/^Delay Interest/), totalPayable: m(/^Total Amount Payable/),
  };
  r.pay = {
    tds: m(/^Tax Deducted or Collected at Source/), advance: m(/^Advance Tax paid/), refundAdjusted: m(/^Adjustment of Tax Refund/),
    withReturn: m(/^Tax Paid with this Return/), total: m(/^Total Tax Paid and Adjusted/), exemptIncome: m(/^Tax Exempted \/ Tax Free Income/),
  };

  // Schedule 1: part (a) for government pay scale, part (b) for everyone else. Rows before the total are the salary items.
  const salaryRows = (sec, totalRe) => {
    const out = []; let total = null, exempt = null;
    for (const l of sec) {
      const { label, amts } = lineLV(l);
      const n = /^(\d+)\.\s*(.+)$/.exec(label);
      if (!n || !amts.length) continue;
      if (totalRe.test(n[2])) { total = amts[0]; if (amts.length === 3) exempt = amts[1]; break; }
      if (amts[0]) out.push({ name: n[2].replace(/\s*\(provide detail\)/i, ''), amount: amts[0] });
    }
    return { items: out, total, exempt };
  };
  const govt = salaryRows(section(L, /^a\. This part is applicable for employees receiving salary under government/, /^b\. This part/), /^Total$/);
  const priv = section(L, /^b\. This part is applicable for employees other than/, /^Schedule\s*-?\s*5$|^IT-\s?10|^Statement of Expenses/);
  const pv = salaryRows(priv, /^Total Salary Received/);
  const sal = pv.items.length || pv.total ? pv : govt;
  r.salary = { items: sal.items, total: sal.total ?? sum(sal.items.map(x => x.amount)),
    exempt: amt(priv, /^14\. Exempted Amount/) ?? sal.exempt ?? r.pay.exemptIncome };

  const s5 = section(L, /^Schedule\s*-?\s*5$/, /^IT-\s?10|^Statement of Expenses/);
  r.investments = [];
  s5.forEach((l, i) => {
    let { label, amts } = lineLV(l);
    if (!/^\d+\.$/.test(l.cells[0]?.t) || !amts[0] || /^Total Investment|^Amount of Tax Rebate/.test(label)) return;
    for (let k = i + 1; k < s5.length && s5[k].cells.length === 1 && !/^\d+\.$/.test(s5[k].cells[0].t); k++) label += ` ${s5[k].text}`; // wrapped label
    r.investments.push({ line: parseInt(l.cells[0].t, 10), label, amount: amts[0] });
  });
  r.investmentTotal = amt(s5, /^Total Investment/) ?? sum(r.investments.map(x => x.amount));

  const bb = section(L, /^Statement of Expenses Relating to Lifestyle/, /^Verification$/);
  const b = re => amt(bb, re);
  r.lifestyle = bb.length ? {
    food: b(/^Personal and family fooding/), housing: b(/^Housing Expense/), transport: b(/^Personal Transport/),
    utility: b(/^Utility Expense/), education: b(/^Education Expense/), travel: b(/^Personal Expense for Local and Foreign Travel/),
    festival: b(/^Festival and Other Special/), tax: b(/^Tax Deducted \/ Collected at Source/), interest: b(/^Interest Paid on Personal Loan/),
    total: b(/^Total:?$/),
  } : null;

  const w = section(L, /^Statement of Assets, Liabilities and Expenses/, /^Verification$/);
  const a = re => amt(w, re) ?? 0;
  const orn = w.map(l => /^\(h\) Ornaments.*\(([^)]*\d[^)]*)\)/i.exec(lineLV(l).label)).find(Boolean);
  r.wealth = {
    incomeShown: a(/^\(a\) Total Income Shown/), exempt: a(/^\(b\) Tax Exempted Income/), receipts: a(/^\(c\) Receipt of Gift/),
    prevNW: a(/^2\. Net Wealth as on Last Date/), lifestyle: a(/^\(a\) Expense relating to Lifestyle/), otherOutflow: a(/^\(b\) Gift \/ Expenses \/ Loss/),
    netWealth: a(/^5\. Net Wealth at the Last Date/), totalAssets: amt(w, /^10\. Total Assets/) ?? a(/^Total Asse?ss?ts inside Bangladesh/),
    liabs: { inst: a(/^\(a\) Institutional Liabilities/), noninst: a(/^\(b\) Non-Institutional Liabilities/), other: a(/^\(c\) Other Liabilities/) },
    assets: {
      business: a(/^\(a\) Total Asset of Business/) - a(/^Less: Business Liabilities/) + a(/^\(b\) Director/) + a(/^\(c\) Business Capital/),
      nonagri: a(/^\(d\) Non-Agricultural/), agri: a(/^\(e\) Agricultural/), shares: a(/^\(i\) Share/), sanchay: a(/^\(ii\) Sanchay/),
      loan: a(/^\(iii\) Loan Given/), deposit: a(/^\(iv\) Savings Deposit/), pf: a(/^\(v\) Provident Fund/), otherinv: a(/^\(vi\) Other Investment/),
      vehicle: a(/^\(g\) Motor Vehicle/), ornaments: a(/^\(h\) Ornaments/), furniture: a(/^\(i\) Furniture/), otherassets: a(/^\(j\) Other Assets/),
      bank: a(/^\(i\) Bank Balance/), cash: a(/^\(ii\) Cash in Hand$/), others: a(/^\(iii\) Others/), abroad: a(/^9\. Assets Outside Bangladesh/),
    },
    ornamentQty: orn && !/^mention/i.test(orn[1]) ? orn[1] : '',
  };

  // Attachments: other financial assets, bank accounts, tax challans
  const fin = section(L, /^Other Financial Assets$/, /^Bank account\/Card\/Electronic Cash$|^Source Tax, AIT|^PARTICULARS OF (?!FINANCIAL)/i);
  r.otherFinancial = tableRows(fin, l => /^\d+$/.test(l.cells[0].t) && l.cells.length >= 3 && isAmt(l.cells[l.cells.length - 1].t))
    .map(c => ({ desc: c.length >= 5 ? `${c[1]} (${c[3]})` : c.slice(1, -1).join(' '), acq: /purchas/i.test(c[2] || '') ? 'Purchase' : /gift/i.test(c[2] || '') ? 'Gift' : /inherit/i.test(c[2] || '') ? 'Inheritance' : '', amount: num(c[c.length - 1]) }));
  const bank = section(L, /^Bank account\/Card\/Electronic Cash$/, /^Source Tax, AIT|^PARTICULARS OF|^Tax Paid with Return/i);
  r.bankAccounts = tableRows(bank, l => /^\d+$/.test(l.cells[0].t) && l.cells.length >= 3 && isAmt(l.cells[l.cells.length - 1].t))
    .map(c => { const [type, bankName, acct] = c.slice(1, -1); return { type, bank: bankName || '', account: acct || '', amount: num(c[c.length - 1]) }; });
  const isChallanRow = l => /^\d{4}-\d{8,}$/.test(l.cells[0].t);
  r.challans = tableRows(section(L, /^Source Tax, AIT and Regular Tax Claim/, /^Tax Paid with Return$/), isChallanRow)
    .map(c => ({ challan: c[0], date: isoDate(c[1]), purpose: c[2] || '', authority: c[3] || '', amount: num(c[c.length - 1]) }));
  r.paidWithReturn = tableRows(section(L, /^Tax Paid with Return$/, /^$/), isChallanRow)
    .map(c => ({ challan: c[0], date: isoDate(c[1]), amount: num(c.slice(2).find(isAmt) || 0) }));
  return r;
}

// Fill the past-year form from a parsed return; the details the form has no fields for ride along in d.imp.
function draftFromReturn(r, fileName) {
  const d = blankPastDraft();
  const w = r.wealth;
  Object.assign(d, { ayStart: r.ay.slice(0, 4), incomeShown: w.incomeShown, exempt: w.exempt, receipts: w.receipts, prevNW: w.prevNW,
    lifestyle: w.lifestyle, otherOutflow: w.otherOutflow, imp: r, fileName });
  for (const k of Object.keys(d.liabs)) d.liabs[k].amount = w.liabs[k] || 0;
  for (const k of Object.keys(d.assets)) d.assets[k].amount = w.assets[k] || 0;
  d.assets.ornaments.qty = w.ornamentQty;
  // rows from the attachments replace a line's single row when they add up to it
  const split = (k, rows) => {
    if (!rows.length || Math.round(sum(rows.map(x => x.amount))) !== Math.round(w.assets[k])) return;
    if (rows.length === 1) Object.assign(d.assets[k], { desc: rows[0].desc, acq: rows[0].acq || '' });
    else d.assets[k].rows = rows;
  };
  split('bank', r.bankAccounts.map(x => ({ desc: [/^bank account$/i.test(x.type) ? '' : x.type, x.bank, x.account].filter(Boolean).join(' '), amount: x.amount })));
  split('otherinv', r.otherFinancial);
  return d;
}

async function importReturnPdf(file) {
  if (!file) return;
  try {
    const res = await fetch('/api/pdf-text', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'The server could not read the file.');
    pastDraft = draftFromReturn(parseReturn(out.pages), file.name);
    render();
    $('#pastImport')?.scrollIntoView({ block: 'start' });
  } catch (e) {
    alert(e.message);
  }
}

// What the imported year will look like, checked against the return's own figures.
function importChecks(d) {
  const r = d.imp; const ay = `${d.ayStart}-${num(d.ayStart) + 1}`; const lbl = yearInfo(ay).ayLabel;
  const doc = yearFromReturn(d); const c = compute(doc);
  const out = [];
  const same = (a, b2) => Math.round(a) === Math.round(b2);
  if (state.profile.tin && r.tin && state.profile.tin.replace(/\D/g, '') !== r.tin) out.push(['bad', `This return is for TIN ${r.tin} (${r.name}), but ${personName() || 'this person'}'s TIN is ${state.profile.tin}. Switch to the right person before saving.`]);
  if (years.includes(ay)) out.push(['warn', `${lbl} is already in the app. Saving replaces it (a backup is kept).`]);
  const taxOk = same(c.grossTax, r.tax.gross) && same(c.rebate, r.tax.rebate) && same(c.netTax, r.tax.payable);
  out.push(taxOk ? ['ok', `Tax matches the return: gross ${fmt(r.tax.gross)}, rebate ${fmt(r.tax.rebate)}, payable ${fmt(r.tax.payable)}.`]
    : ['warn', `With the app's tax rules for ${lbl}, gross tax is ${fmt(c.grossTax)}, rebate ${fmt(c.rebate)} and tax payable ${fmt(c.netTax)}; the return says ${fmt(r.tax.gross)}, ${fmt(r.tax.rebate)} and ${fmt(r.tax.payable)}. After saving, open ${lbl} and adjust Settings → Tax rules so the All years tab shows the right tax.`]);
  if (!same(c.totalIncome, r.income.total)) out.push(['warn', `Total income works out to ${fmt(c.totalIncome)} here, but the return says ${fmt(r.income.total)}.`]);
  out.push(Math.round(c.difference) === 0 ? ['ok', 'Assets & liabilities balance (difference 0), and net wealth on 30 June is ' + fmt(c.closingNW) + '.']
    : ['warn', `Assets & liabilities don't balance in the app (difference ${fmt(c.difference)}). Check the figures below against the return.`]);
  if (doc.expenses.categories.find(x => x.id === 'utility_electricity').tracked)
    out.push(['note', `The return has utilities as one line (${fmt(r.lifestyle.utility)}); it goes under Electricity, since the website now splits utilities into three rows.`]);
  return { out, doc, c };
}

function importReviewHtml(d) {
  const r = d.imp; const { out, doc, c } = importChecks(d);
  const cls = { ok: 'ok', warn: 'warn', bad: 'bad', note: 'help' };
  const row = (label, v) => `<tr><td>${label}</td><td class="r">${typeof v === 'number' ? fmt(v) : esc(v)}</td></tr>`;
  const det = [];
  det.push(row('Taxpayer', `${r.name}${r.tin ? `, TIN ${r.tin}` : ''}`));
  if (r.submitted) det.push(row('Submitted', `${r.submitted}${r.serial ? `, return no. ${r.serial}` : ''}`));
  if (doc.salary.employer) det.push(row('Employer', doc.salary.employer));
  doc.salary.components.forEach(x => det.push(row(`Salary: ${esc(x.name)}`, x.amount)));
  if (r.salary.exempt) det.push(row('Salary: tax exempted', r.salary.exempt));
  doc.otherIncome.forEach(x => det.push(row(`Other income: ${esc(x.source)}`, x.gross)));
  det.push(row('Tax deducted at source (salary)', doc.salary.tds));
  if (c.otherIncomeTds) det.push(row('Tax deducted at source (other income)', c.otherIncomeTds));
  if (c.ait) det.push(row('Advance tax', c.ait));
  doc.investments.other.forEach(x => det.push(row(`Rebate: ${esc(x.desc)}`, x.amount)));
  if (r.lifestyle) {
    doc.expenses.categories.filter(x => num(x.tracked)).forEach(x => det.push(row(`Expense: ${esc(x.name)}`, x.tracked)));
    if (doc.prevYearTaxPaid) det.push(row("Expense: previous years' tax paid in the year", doc.prevYearTaxPaid));
    if (doc.expenses.loanInterest) det.push(row('Expense: loan interest', doc.expenses.loanInterest));
  }
  if (doc.submission.taxPaid) det.push(row('Paid with the return', `${fmt(num(doc.submission.taxPaidAmount))} on ${doc.submission.taxPaidDate}, challan ${doc.submission.taxPaidChallan}`));
  return `<div id="pastImport" class="ok">Read <b>${esc(d.fileName)}</b>: the ${yearInfo(r.ay).ayLabel} return. Check the figures, then click <b>Save as that year</b> at the bottom.</div>
    ${out.map(([k, t]) => `<div class="${cls[k]}">${esc(t)}</div>`).join('')}
    <details class="tips"><summary>Also from the return: income, tax, rebate and expenses (${det.length} items)</summary><div>
      <table class="grid"><tbody>${det.join('')}</tbody></table></div></details>`;
}

let pastDraft = null; // transient: the "record a past year" form
function blankPastDraft() {
  return {
    ayStart: String(parseInt(state.assessmentYear, 10) - 1),
    incomeShown: 0, exempt: 0, receipts: 0, prevNW: 0, lifestyle: 0, otherOutflow: 0,
    assets: Object.fromEntries(PAPER_ASSET_LINES.map(([k]) => [k, { amount: 0, desc: '', qty: '', acq: '' }])),
    liabs: Object.fromEntries(PAPER_LIAB_LINES.map(([k]) => [k, { amount: 0 }])),
  };
}

function pastDraftCalc(d) {
  const o = {};
  o.source = num(d.incomeShown) + num(d.exempt) + num(d.receipts);
  o.sumWithPrev = o.source + num(d.prevNW);
  o.expense = num(d.lifestyle) + num(d.otherOutflow);
  o.netWealth = o.sumWithPrev - o.expense;          // line 5
  o.liab = sum(Object.values(d.liabs).map(x => x.amount));
  o.gross = o.netWealth + o.liab;                   // line 7
  o.assets = sum(Object.values(d.assets).map(x => x.amount));
  o.diff = Math.round(o.gross - o.assets);
  o.status = o.diff === 0 ? 'Matches: assets add up to gross wealth.' : `Assets are ${fmt(Math.abs(o.diff))} ${o.diff > 0 ? 'less' : 'more'} than gross wealth (line 7). Check the figures against the return.`;
  return o;
}

// Build a locked year from a past return's totals; its year-end values feed the following year.
function yearFromReturn(d) {
  const y = parseInt(d.ayStart, 10); const ay = `${y}-${y + 1}`;
  const doc = blankYear(ay);
  doc.profile = clone(state.profile);
  doc.salary.components = [{ id: uid(), name: 'Gross salary from the return (income shown + tax exempted)', amount: num(d.incomeShown) + num(d.exempt) }];
  if (num(d.receipts)) doc.otherReceipts = [{ id: uid(), desc: 'Receipt of gift and others (from the return)', amount: num(d.receipts) }];
  doc.openingNetWealthOverride = num(d.prevNW);
  doc.expenses.categories.find(x => x.id === 'other').tracked = num(d.lifestyle);
  doc.expenses.otherOutflow.loss = num(d.otherOutflow);
  const assetRow = (cat, description, qty, acq, amount) => ({ id: uid(), category: cat, description, qty, acq, opening: 0, closing: amount, change: amount, byChange: false });
  doc.assets = PAPER_ASSET_LINES.filter(([k]) => num(d.assets[k].amount) || d.assets[k].desc || d.assets[k].qty)
    .flatMap(([k, , cat]) => {
      const x = d.assets[k];
      if (x.rows && Math.round(sum(x.rows.map(y => y.amount))) === Math.round(num(x.amount))) return x.rows.map(y => assetRow(cat, y.desc, '', y.acq || '', y.amount));
      return [assetRow(cat, x.desc, x.qty, x.acq, num(x.amount))];
    });
  doc.liabilities = PAPER_LIAB_LINES.filter(([k]) => num(d.liabs[k].amount))
    .map(([k, label, cat]) => ({ id: uid(), category: cat, description: label.replace(/^\S+ /, ''), opening: 0, closing: num(d.liabs[k].amount), change: num(d.liabs[k].amount), byChange: false }));
  const lbl = yearInfo(ay).ayLabel;
  const r = d.imp; // the parsed PDF, when the figures were imported
  const detailed = r ? applyImportedReturn(doc, r, d) : false;
  const ye = yearEndSnapshot(doc);
  if (detailed) ye.savedAt = `from the ${lbl} return`;
  else {
    Object.assign(ye, { expenses: {}, lifestyle: null, taxPaid: null, loanInterest: null, envSurcharge: null,
      finalTotal: Math.round(num(d.lifestyle)), balance: 0, savedAt: `from the ${lbl} return` });
  }
  doc.yearEnd = ye;
  doc.locked = true;
  if (!r) doc.submission.notes = `Recorded from the ${lbl} return (IT-10B totals). Only totals are known: expense relating to lifestyle ${fmt(num(d.lifestyle))} is under "Any other expenses", and per-asset opening values aren't known.`;
  return doc;
}

// Income, tax, rebate, expenses and filing details from an imported return. Returns true when the
// return's lifestyle statement (IT-10BB) adds up, so the expenses are itemised rather than one lump.
function applyImportedReturn(doc, r, d) {
  const lbl = yearInfo(doc.assessmentYear).ayLabel;
  doc.rules = rulesForYear(doc.assessmentYear);
  doc.profile = { ...doc.profile, name: doc.profile.name || titleCase(r.name), tin: r.tin || doc.profile.tin };
  doc.salary.employer = r.employer || r.challans.find(x => /salary/i.test(x.purpose))?.authority || '';
  doc.salary.components = r.salary.items.length
    ? r.salary.items.map(x => ({ id: uid(), name: x.name, amount: x.amount }))
    : r.salary.total ? [{ id: uid(), name: 'Total salary received (from the return)', amount: r.salary.total }] : [];
  const inc = r.income;
  doc.otherIncome = [
    ['financial', 'Bank interest (savings / FDR)', 'Income from financial assets'], ['rent', 'Rental income', 'Income from rent'],
    ['agriculture', 'Other income', 'Income from agriculture'], ['business', 'Other income', 'Income from business'],
    ['capitalGain', 'Other income', 'Income from capital gain'], ['other', 'Other income', 'Income from other sources'],
    ['firm', 'Other income', 'Share of income from firm or AoP'], ['minorSpouse', 'Other income', 'Income of minor or spouse'],
    ['abroad', 'Other income', 'Taxable income from abroad'],
  ].filter(([k]) => num(inc[k])).map(([k, type, source]) => ({ id: uid(), type, source, gross: inc[k], tds: 0 }));
  // tax deducted at source: salary challans by purpose; the rest of line 20 belongs to other income
  const salaryTds = sum(r.challans.filter(x => /salary/i.test(x.purpose)).map(x => x.amount));
  const otherTds = Math.max(0, r.pay.tds - salaryTds);
  if (otherTds && doc.otherIncome.length) { doc.otherIncome[0].tds = otherTds; doc.salary.tds = salaryTds; }
  else doc.salary.tds = r.pay.tds;
  doc.advanceTax = r.pay.advance ? [{ id: uid(), desc: 'Advance tax (from the return)', amount: r.pay.advance }] : [];
  doc.investments.other = r.investments.map(x => ({ id: uid(), desc: `${x.label} (Schedule 5 line ${x.line})`, amount: x.amount }));
  doc.expenses.envSurcharge = r.tax.envSurcharge;

  const ls = r.lifestyle;
  const parts = ls ? ['food', 'housing', 'transport', 'utility', 'education', 'travel', 'festival', 'tax', 'interest'].map(k => num(ls[k])) : [];
  const detailed = !!ls && Math.round(sum(parts)) === Math.round(num(ls.total)) && Math.round(num(ls.total)) === Math.round(num(d.lifestyle));
  const cats = Object.fromEntries(doc.expenses.categories.map(x => [x.id, x]));
  // the lifestyle total includes the tax paid during the year, which the app keeps separately
  cats.other.tracked = Math.max(0, num(d.lifestyle) - r.pay.tds - r.pay.advance);
  if (detailed) {
    cats.other.tracked = 0;
    for (const [k, id] of [['food', 'food'], ['housing', 'housing'], ['transport', 'transport'], ['utility', 'utility_electricity'],
      ['education', 'education'], ['travel', 'travel'], ['festival', 'festival']]) cats[id].tracked = num(ls[k]);
    doc.expenses.loanInterest = num(ls.interest);
    // line 8 is tax deducted during the year plus earlier years' tax paid during it
    doc.prevYearTaxPaid = Math.max(0, num(ls.tax) - r.pay.tds - r.pay.advance);
  }

  const sub = doc.submission;
  if (r.submitted) Object.assign(sub, { submitted: true, date: r.submitted });
  if (r.serial) sub.ackNo = r.serial;
  if (r.pay.withReturn) {
    const ch = r.paidWithReturn;
    Object.assign(sub, { taxPaid: true, taxPaidAmount: r.pay.withReturn, taxPaidDate: ch.map(x => x.date).sort().pop() || '', taxPaidChallan: ch.map(x => x.challan).join(', ') });
  }
  sub.notes = `Imported from the ${lbl} return${d.fileName ? ` (${d.fileName})` : ''} on ${todayISO()}.`
    + (detailed ? (num(ls.utility) ? ` The return's utility expense (${fmt(num(ls.utility))}) is all under Electricity.` : '')
      : ` Expense relating to lifestyle ${fmt(num(d.lifestyle))} is under "Any other expenses".`)
    + ' Opening values per asset aren\'t known, only net wealth.';
  return detailed;
}

async function savePastYear() {
  const d = pastDraft; const y = parseInt(d.ayStart, 10);
  if (!(y > 2000 && y < 2100)) { alert('Enter the assessment year, e.g. 2025 for AY 2025-26.'); return; }
  const ay = `${y}-${y + 1}`; const lbl = yearInfo(ay).ayLabel;
  const chk = pastDraftCalc(d);
  const tin = d.imp?.tin; const myTin = state.profile.tin.replace(/\D/g, '');
  if (tin && myTin && tin !== myTin && !confirm(`This return is for TIN ${tin}, not ${personName()}'s (${state.profile.tin}). Save it under ${personName()} anyway?`)) return;
  if (chk.diff !== 0 && !confirm(`The figures don't add up (difference ${fmt(chk.diff)}). Save anyway?`)) return;
  if (years.includes(ay) && !confirm(`${lbl} already exists in the app. Replace it with these figures? (A backup is kept.)`)) return;
  const doc = yearFromReturn(d);
  await save();
  await api(yearsUrl(ay), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  if (!years.includes(ay)) { years.push(ay); years.sort(); }
  pastDraft = null; historyData = null;
  if (ay === state.assessmentYear) { await loadYear(ay); alert(`${lbl} saved.`); return; } // the open year was replaced
  const offers = ay === prevAY(state.assessmentYear) && !state.locked ? followingYearUpdates(doc) : [];
  if (ay === prevAY(state.assessmentYear)) prevDoc = doc;
  if (offers.length && confirm(`${lbl} saved. Update ${yearInfo(state.assessmentYear).ayLabel} from it now?\n\n${offers.map(o => `• ${o.text}`).join('\n')}`)) {
    offers.forEach(o => o.apply()); scheduleSave();
  } else if (!offers.length) alert(`${lbl} saved.`);
  renderYearSelect(); render();
}

// What the open year can take from the year before it, just recorded from its return.
function followingYearUpdates(prev) {
  const out = []; const cur = yearInfo(state.assessmentYear); const sub = prev.submission;
  out.push({ text: `Opening values and previous net wealth (${fmt(yearEndOf(prev).closingNetWealth)})`, apply: () => refreshOpeningFrom(prev) });
  const paid = num(sub.taxPaidAmount);
  if (sub.taxPaid && sub.taxPaidDate >= cur.start && sub.taxPaidDate <= cur.end && Math.round(num(state.prevYearTaxPaid)) !== Math.round(paid)) {
    out.push({ text: `Tax paid with that return, ${fmt(paid)} on ${sub.taxPaidDate}, as "Tax, surcharge or other amount" paid this year (now ${fmt(num(state.prevYearTaxPaid))})`, apply: () => { state.prevYearTaxPaid = paid; } });
  }
  if (!state.profile.tin && prev.profile.tin) out.push({ text: `TIN ${prev.profile.tin}`, apply: () => { state.profile.tin = prev.profile.tin; } });
  if (!state.salary.employer && prev.salary.employer) out.push({ text: `Employer: ${prev.salary.employer}`, apply: () => { state.salary.employer = prev.salary.employer; } });
  return out;
}

function pastReturnForm() {
  const picker = `<input type="file" id="returnPdf" accept="application/pdf,.pdf" data-lock-safe="1" hidden>`;
  if (!pastDraft) {
    return `<p><button data-action="past-import" data-lock-safe="1">Import a return PDF</button>
      <button class="secondary" data-action="past-start" data-lock-safe="1">Enter the figures by hand</button>${picker}</p>
      <p class="muted">To get the PDF: on etaxnbr.gov.bd open the filed return's <b>Return View</b>, print it and choose <b>Save as PDF</b>. The file is read on this computer and isn't kept.</p>`;
  }
  const n = path => inp(path, { type: 'num' });
  const acqOpts = { '': '—', Purchase: 'Purchase', Gift: 'Gift', Inheritance: 'Inheritance', Other: 'Other' };
  const rowsNote = k => { const rows = pastDraft.assets[k].rows; return rows && rows.length > 1 ? `<div class="muted">${rows.length} rows: ${rows.map(y => `${esc(y.desc)} ${fmt(y.amount)}`).join('; ')}</div>` : ''; };
  return `${pastDraft.imp ? importReviewHtml(pastDraft) : `<div class="help"><p>Type the figures from the return's <b>statement of assets, liabilities and expenses (IT-10B)</b>. This creates that year in the app, locked, with its year-end values saved, so the following year can take its opening values from it.</p></div>`}
    <div class="row">${field('Assessment year starting (e.g. 2025 for AY 2025-26)', `<input data-bind="~ayStart" value="${esc(pastDraft.ayStart)}" inputmode="numeric">`)}</div>
    <table class="grid"><tbody>
      <tr><td>1(a) Total income shown in return</td><td>${n('~incomeShown')}</td></tr>
      <tr><td>1(b) Tax exempted income</td><td>${n('~exempt')}</td></tr>
      <tr><td>1(c) Receipt of gift and others</td><td>${n('~receipts')}</td></tr>
      <tr><td>2 Net wealth as on last date of previous income year</td><td>${n('~prevNW')}</td></tr>
      <tr><td>4(a) Expense relating to lifestyle (IT-10BB)</td><td>${n('~lifestyle')}</td></tr>
      <tr><td>4(b) Gift / expenses / loss not mentioned in IT-10BB</td><td>${n('~otherOutflow')}</td></tr>
      ${PAPER_LIAB_LINES.map(([k, label]) => `<tr><td>${esc(label)}</td><td>${n(`~liabs.${k}.amount`)}</td></tr>`).join('')}
    </tbody></table>
    <h3 style="margin-top:14px">8 Particulars of assets</h3>
    <table class="grid"><thead><tr><th>Line</th><th>Description</th><th>Qty</th><th>Acquired</th><th class="r">Amount</th></tr></thead><tbody>
      ${PAPER_ASSET_LINES.map(([k, label]) => `<tr><td>${esc(label)}</td><td>${pastDraft.assets[k].rows?.length > 1 ? rowsNote(k) : inp(`~assets.${k}.desc`)}</td><td>${inp(`~assets.${k}.qty`, { ph: 'e.g. 10 bhori' })}</td><td>${sel(`~assets.${k}.acq`, acqOpts)}</td><td>${n(`~assets.${k}.amount`)}</td></tr>`).join('')}
    </tbody></table>
    <dl class="sum">
      <dt>Total source of fund (1)</dt><dd data-dcalc="source"></dd>
      <dt>Net wealth at the last date of the year (5)</dt><dd data-dcalc="netWealth"></dd>
      <dt>Gross wealth (7 = 5 + 6)</dt><dd data-dcalc="gross"></dd>
      <dt class="total">Total assets (8 + 9)</dt><dd class="total" data-dcalc="assets"></dd>
    </dl>
    <p data-dcalc="status" class="muted"></p>
    <p><button data-action="past-save" data-lock-safe="1">Save as that year</button> <button class="secondary" data-action="past-cancel" data-lock-safe="1">Cancel</button>${picker}</p>`;
}

/* ---------- checks on assets ---------- */
const isInsuranceRow = a => a.category === 'Other financial assets' && /insur|policy|metlife|alico|life/i.test(a.description || '');

function wealthChecks(s, c) {
  const out = [];
  const ins = s.assets.filter(isInsuranceRow);
  // only policies listed as your asset; a spouse's policy on their own return still counts for the rebate
  const premiums = Math.round(sum(s.investments.insurance.filter(p => p.owner !== 'other').map(p => p.premiumPaid)));
  if (ins.length) {
    const growth = Math.round(sum(ins.map(a => num(a.closing) - num(a.opening))));
    if (growth !== premiums) out.push(`Life insurance asset grew by ${fmt(growth)}, but premiums paid this year in the Rebate step total ${fmt(premiums)}. At total premiums paid, closing should be opening + ${fmt(premiums)}, unless the policy paid something out.`);
  } else if (premiums) {
    out.push(`You paid ${fmt(premiums)} of life insurance premiums (Rebate step) but no asset row looks like the policy. If you list it as an asset, add it under Other financial assets with "insurance" or the policy name in the description; otherwise the premiums belong in expenses.`);
  }
  const cash = s.assets.filter(a => a.category === 'Cash in hand');
  if (cash.length) {
    const open = Math.round(sum(cash.map(a => a.opening))), close = Math.round(sum(cash.map(a => a.closing)));
    if (close > 200000 && close > 0.25 * c.sourceOfFund) out.push(`Cash in hand of ${fmt(close)} is ${Math.round(close / c.sourceOfFund * 100)}% of this year's income. Large cash balances are hard to explain; use only cash you actually held on 30 June.`);
    if (Math.abs(close - open) > Math.max(100000, 0.5 * open)) out.push(`Cash in hand moved from ${fmt(open)} to ${fmt(close)}. A change this big should be explained by what the cash was spent on, deposited into, or came from.`);
  }
  return out;
}

function yearEndStatus() {
  const ye = state.yearEnd; const next = nextAY(state.assessmentYear);
  const nextNote = years.includes(next)
    ? ` ${yearInfo(next).ayLabel} already exists: open its Assets & liabilities step and click <b>Update opening values</b> to pick up changes.` : '';
  if (!ye) return `<div class="warn">Not saved yet. Next year would use the current figures.${nextNote}</div>`;
  const now = Math.round(compute(state).closingNW);
  const changed = now !== ye.closingNetWealth ? ` Your figures have changed since: net wealth is now ${fmt(now)}.` : '';
  return `<div class="${changed ? 'warn' : 'ok'}">Saved ${esc(ye.savedAt)}: net wealth ${fmt(ye.closingNetWealth)}, expense and tax ${fmt(ye.finalTotal)}.${changed}${nextNote}</div>`;
}

views.settings = () => {
  const r = state.rules; const lbl = yearInfo(state.assessmentYear).ayLabel;
  const slabs = r.slabs.map((sl, i) => `<tr><td>${inp(`rules.slabs.${i}.upto`, { type: 'optnum', ph: 'rest' })}</td><td>${inp(`rules.slabs.${i}.rate`, { type: 'dec' })}</td>
    <td class="r"><button class="icon" data-action="del" data-list="rules.slabs" data-idx="${i}">✕</button></td></tr>`).join('');
  return `<div class="page-head"><h1>Settings</h1><p class="lead">Your profile, this year's tax rules, and managing years and people.</p></div>
  <section class="panel">
    <h3>Profile</h3>
    <div class="row">
      ${field('Name', inp('profile.name'))}
      ${field('TIN', inp('profile.tin'))}
      ${field('Taxpayer category (sets the tax-free amount)', sel('profile.category', TAXPAYER_CATS))}
    </div>
  </section>
  <section class="panel">
    <h3>Tax rules for ${lbl}</h3>
    <div class="help"><p>Defaults follow Finance Act 2025 (AY 2026-27). Check them against the current Finance Act each year: they change with the budget. They only affect the estimates here; the site does the official calculation.</p></div>
    <div class="row">
      ${Object.entries(TAXPAYER_CATS).map(([k, l]) => field(`Tax-free: ${l}`, inp(`rules.thresholds.${k}`, { type: 'num' }))).join('')}
    </div>
    <h3 style="margin-top:8px">Slabs above the tax-free amount</h3>
    <table class="grid" style="max-width:420px"><thead><tr><th class="r">Next (Tk), blank = rest</th><th class="r">Rate %</th><th></th></tr></thead><tbody>${slabs}</tbody></table>
    <button class="add" data-action="add-slab">+ Add slab</button>
    <div class="row" style="margin-top:14px">
      ${field('Minimum tax (Tk)', inp('rules.minTax', { type: 'num' }))}
      ${field('Salary exemption: 1 / x of salary', inp('rules.salaryExemptDivisor', { type: 'dec' }))}
      ${field('Salary exemption cap (Tk)', inp('rules.salaryExemptCap', { type: 'num' }))}
    </div>
    <div class="row">
      ${field('Rebate: % of taxable income', inp('rules.rebatePctIncome', { type: 'dec' }))}
      ${field('Rebate: % of investment', inp('rules.rebatePctInvestment', { type: 'dec' }))}
      ${field('Rebate cap (Tk)', inp('rules.rebateCap', { type: 'num' }))}
    </div>
    <div class="row">
      ${field('Life insurance: max % of sum assured', inp('rules.insurancePctOfSumAssured', { type: 'dec' }))}
      ${field('DPS cap per year (Tk)', inp('rules.dpsCap', { type: 'num' }))}
      ${field('Savings certificate cap (Tk)', inp('rules.savingsCertCap', { type: 'num' }))}
    </div>
    <button class="secondary" data-action="reset-rules">Reset to defaults</button>
  </section>
  <section class="panel">
    <h3>Years</h3>
    <p>Switch years from the <b>Year</b> list at the top, which can also start ${yearInfo(nextAY(state.assessmentYear)).ayLabel} from this one. To open any other year, enter it here.</p>
    <div class="row" style="align-items:flex-end">
      <label class="field"><span>Assessment year starting (e.g. 2025 for AY 2025-26)</span><input id="newYearInput" data-lock-safe="1" inputmode="numeric" placeholder="${parseInt(state.assessmentYear, 10) - 1}"></label>
      <div class="field"><button class="secondary" data-action="create-year" data-lock-safe="1">Create / open year</button></div>
    </div>
  </section>
  <section class="panel">
    <h3>Record a past year from its return</h3>
    <p class="muted">For a year you filed before using this app. Import the filed return, or enter its totals, so that year shows in All years and the next year starts from the right opening values.</p>
    ${pastReturnForm()}
  </section>
  <section class="panel">
    <h3>Year-end values</h3>
    <p>Saving freezes this year's closing assets, liabilities, net wealth and expenses as filed. Next year takes its opening values from them, and its Expenditure page shows them as "Last year". Locking the year saves them too.</p>
    ${yearEndStatus()}
    <div class="actions"><button class="secondary" data-action="save-yearend" data-lock-safe="1">${state.yearEnd ? 'Save again with current figures' : 'Save year-end values'}</button></div>
  </section>
  <section class="panel">
    <h3>Lock this year</h3>
    <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="lockToggle" data-lock-safe="1" data-bind="locked" data-type="bool" data-rerender="1" ${state.locked ? 'checked' : ''}>
      Locked: the year is filed, so editing is disabled to prevent accidental changes. You can still view, export and start next year.</label>
  </section>
  <section class="panel">
    <h3>Person</h3>
    <p>These returns belong to <b>${esc(personName())}</b>. Each person has their own years, carry-overs and backups, in <code>data/people/${esc(person)}/</code>. Switch or add people from the <b>Person</b> list at the top.</p>
    <div class="actions"><button class="secondary" data-action="rename-person" data-lock-safe="1">Rename</button>
      <button class="secondary" data-action="remove-person" data-lock-safe="1">Remove from the app</button></div>
  </section>
  <section class="panel">
    <h3>Export</h3>
    <p>CSV files open in Excel, Numbers or Google Sheets. Amounts are plain numbers so they add up in a spreadsheet.</p>
    <div class="actions"><button data-action="export-year" data-lock-safe="1">Download ${lbl} (CSV)</button>
      <button class="secondary" data-action="export-all" data-lock-safe="1">Download all-years summary (CSV)</button></div>
    <p class="muted">Raw data is in <code>data/people/${esc(person)}/${state.assessmentYear}.json</code> in the app folder, with automatic backups in <code>data/people/${esc(person)}/backups/</code>.</p>
  </section>`;
};

/* ---------- CSV import ---------- */
function parseCSV(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = [];
    } else f += ch;
  }
  row.push(f); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

function parseDate(str, fmtName) {
  str = String(str ?? '').trim();
  const pad = n => String(n).padStart(2, '0');
  const ymd = (y, m, d) => (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) ? `${y}-${pad(m)}-${pad(d)}` : null;
  let m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m && (fmtName === 'auto' || fmtName === 'ymd')) return ymd(m[1], m[2], m[3]);
  m = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m && fmtName !== 'ymd') {
    let yr = +m[3]; if (yr < 100) yr += 2000;
    return fmtName === 'mdy' ? ymd(yr, m[1], m[2]) : ymd(yr, m[2], m[1]); // auto = day first
  }
  if (fmtName === 'auto') {
    const d = new Date(str);
    if (!isNaN(d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

function guessCategory(name) {
  const n = name.toLowerCase();
  const rules = [
    ['ignore', /transfer|invest|dps|insurance|premium|saving|sanchay|loan repay|emi|gold|stock|share|mutual|deposit/],
    ['loanInterest', /interest/],
    ['transport_driver', /fuel|petrol|octane|diesel|driver|car (service|maintenance)|parking/],
    ['transport', /transport|uber|pathao|ride|taxi|bus|cng|rickshaw|metro|train/],
    ['utility_electricity', /electric/],
    ['utility_gas', /gas|water|wasa|garbage|sewer/],
    ['utility_phone', /internet|phone|mobile|wifi|broadband|tv|netflix|spotify|subscription/],
    ['household_other', /household|maid|home support|cleaning|furnish/],
    ['housing', /rent|house|home|maintenance|repair/],
    ['education', /school|tuition|educat|course|book|college|university/],
    ['travel', /travel|hotel|flight|vacation|holiday|trip|tour|air/],
    ['philanthropy', /charity|donat|zakat|philanthrop/],
    ['festival', /eid|festival|wedding|party|event/],
    ['special', /gift/],
    ['food', /food|grocer|restaurant|dining|eat|cloth|apparel|shopping|personal care|health|medic|pharma/],
  ];
  const ids = new Set(state.expenses.categories.map(c => c.id));
  for (const [id, re] of rules) if (re.test(n) && (id === 'ignore' || id === 'loanInterest' || ids.has(id))) return id;
  return ids.has('other') ? 'other' : '';
}

function analyzeCsv() {
  const st = state.expenses.csv; const y = yearInfo(state.assessmentYear);
  const di = csv.headers.indexOf(st.dateCol), ai = csv.headers.indexOf(st.amountCol), ci = csv.headers.indexOf(st.catCol);
  if (di < 0 || ai < 0) { alert('Choose the date and amount columns first.'); return; }
  const totals = new Map(); let inRange = 0, outRange = 0, bad = 0;
  for (const r of csv.rows) {
    const d = parseDate(r[di], st.dateFmt);
    if (!d || isBlank(r[ai]?.trim())) { bad++; continue; }
    if (d < y.start || d > y.end) { outRange++; continue; }
    inRange++;
    const cat = (ci >= 0 ? String(r[ci] ?? '').trim() : '') || '(uncategorised)';
    totals.set(cat, (totals.get(cat) || 0) + Math.abs(num(r[ai])));
  }
  for (const cat of totals.keys()) if (state.expenses.mapping[cat] === undefined) state.expenses.mapping[cat] = guessCategory(cat);
  csv.analysis = { totals: [...totals].sort((a, b) => b[1] - a[1]), inRange, outRange, bad };
  scheduleSave(); render();
}

function applyCsv() {
  const sums = {}; let unmapped = 0;
  for (const [cat, amt] of csv.analysis.totals) {
    const to = state.expenses.mapping[cat];
    if (!to) { unmapped += amt; continue; }
    if (to !== 'ignore') sums[to] = (sums[to] || 0) + amt;
  }
  if (unmapped && !confirm(`${fmt(unmapped)} Tk is in categories you haven't mapped and will be left out. Continue?`)) return;
  if (!confirm('Replace the Tracked column with these totals?')) return;
  for (const c of state.expenses.categories) c.tracked = Math.round(sums[c.id] || 0);
  state.expenses.loanInterest = Math.round(sums.loanInterest || 0);
  scheduleSave(); render();
}

function csvPanel() {
  const st = state.expenses.csv; const y = yearInfo(state.assessmentYear);
  let inner = `<p class="muted">Export your expense tracker as CSV (one row per transaction with date, amount, and ideally a category). Only rows dated ${y.startLabel} – ${y.endLabel} are counted. The file is read in your browser; nothing is uploaded anywhere.</p>
    <input type="file" accept=".csv,.tsv,.txt" id="csvFile">`;
  if (csv) {
    const opts = (cur) => ['', ...csv.headers].map(h => `<option value="${esc(h)}" ${h === cur ? 'selected' : ''}>${esc(h || '—')}</option>`).join('');
    inner += `<p class="muted">${esc(csv.name)}: ${csv.rows.length} rows</p>
      <div class="row">
        <label class="field"><span>Date column</span><select data-bind="expenses.csv.dateCol">${opts(st.dateCol)}</select></label>
        <label class="field"><span>Date format</span>${sel('expenses.csv.dateFmt', { auto: 'Auto (day first if ambiguous)', ymd: 'YYYY-MM-DD', dmy: 'DD/MM/YYYY', mdy: 'MM/DD/YYYY' })}</label>
        <label class="field"><span>Amount column</span><select data-bind="expenses.csv.amountCol">${opts(st.amountCol)}</select></label>
        <label class="field"><span>Category column</span><select data-bind="expenses.csv.catCol">${opts(st.catCol)}</select></label>
      </div>
      <button data-action="csv-analyze">Total up by category</button>`;
    if (csv.analysis) {
      const a = csv.analysis;
      const catOpts = [['', '— choose —'], ['ignore', 'Ignore (not a living expense)'],
        ...state.expenses.categories.map(c => [c.id, `${EXPENSE_GROUP_OF[c.id] ? `${EXPENSE_GROUP_OF[c.id]} › ` : ''}${c.name}`]),
        ['loanInterest', 'Interest payment of personal loan']];
      inner += `<p class="muted">${a.inRange} rows in the income year · ${a.outRange} outside it · ${a.bad} skipped (no date or amount)</p>
        <div class="help"><p>Set <b>Ignore</b> for anything that moved money into an asset or paid off a liability: DPS deposits, insurance premiums (if the policy is listed as an asset), gold or gadgets listed as assets, loan principal repayments, transfers between your own accounts. Those are already counted in Assets & liabilities.</p></div>
        <table class="grid"><thead><tr><th>Your category</th><th class="r">Total</th><th>Goes to</th></tr></thead><tbody>
        ${a.totals.map(([cat, amt]) => `<tr><td>${esc(cat)}</td><td class="r">${fmt(amt)}</td><td><select data-mapsrc="${encodeURIComponent(cat)}">${catOpts.map(([k, l]) => `<option value="${esc(k)}" ${state.expenses.mapping[cat] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}
        </tbody></table>
        <p class="muted">Your mapping is saved and reused next year.</p>
        <button data-action="csv-apply">Use these as tracked amounts</button>`;
    }
  }
  return `<section class="panel"><details ${csv ? 'open' : ''}><summary>Import tracked expenses from a CSV</summary><div style="margin-top:10px">${inner}</div></details></section>`;
}

/* ---------- rendering ---------- */
// Banner saying which year is open when it isn't the one you'd normally be working on.
function yearBannerHtml() {
  const ay = state.assessmentYear, y = yearInfo(ay), lbl = y.ayLabel, role = yearRole(ay);
  const filing = defaultAY(), fl = yearInfo(filing).ayLabel;
  const go = ay !== filing && years.includes(filing)
    ? ` <button class="secondary" data-action="go-year" data-ay="${filing}" data-lock-safe="1">Go to ${fl} (filing now)</button>` : '';
  const locked = `${lbl} is locked (filed). Unlock it in Settings to make changes.`;
  if (role === 'past') {
    if (state.locked) return `<div class="year-banner past">You're looking at <b>${lbl}</b>, a past year. ${locked}${go}</div>`;
    const nx = nextAY(ay);
    return `<div class="year-banner past">You're looking at <b>${lbl}</b>, a past year (income year ${y.iyLabel}). Changes here alter that year's figures${years.includes(nx) ? `, and ${yearInfo(nx).ayLabel} takes its opening values from it` : ''}.${go}
      <button class="secondary" data-action="lock-year" data-lock-safe="1">Lock ${lbl}</button></div>`;
  }
  if (role === 'future') return `<div class="year-banner past">You're looking at <b>${lbl}</b>, a future year: its income year starts on ${y.startLabel}.${go}</div>`;
  if (role === 'earning' && prevDoc && prevDoc.assessmentYear === filing && !prevDoc.submission.submitted && !prevDoc.locked) {
    return `<div class="year-banner earning"><b>${lbl}</b> is the income year in progress (until ${y.endLabel}). The return due now is <b>${fl}</b>, by ${yearInfo(filing).deadline}.${go}</div>`;
  }
  return state.locked ? `<div class="warn">${locked}</div>` : '';
}

function render() {
  const isStep = !!STEP_OF[tab];
  $('#main').innerHTML = (tab !== 'history' ? yearBannerHtml() : '') + (isStep ? pageHead(tab) : '') + views[tab]() + (isStep ? stepNavHtml(tab) : '');
  renderYearSelect(); // keeps the year badge (e.g. "locked") current
  if (state.locked) {
    $('#main').querySelectorAll('input, select, textarea, button').forEach(el => {
      if (!el.dataset.lockSafe && !['month', 'copy', 'print', 'tab', 'open-year', 'go-year'].includes(el.dataset.action)) el.disabled = true;
    });
  }
  refreshCalc();
}

function refreshCalc() {
  const c = compute(state);
  $('#steps').innerHTML = navHtml(c); // step marks follow the figures as you type
  document.querySelectorAll('[data-calc]').forEach(el => {
    const v = c[el.dataset.calc];
    el.textContent = typeof v === 'number' ? fmt(v) : (v ?? '');
  });
  document.querySelectorAll('[data-calc-html]').forEach(el => { el.innerHTML = c[el.dataset.calcHtml] ?? ''; });
  const bar = $('#progBar'); if (bar) bar.style.width = `${c.checkPct}%`;
  if (pastDraft) {
    const d = pastDraftCalc(pastDraft);
    document.querySelectorAll('[data-dcalc]').forEach(el => { const v = d[el.dataset.dcalc]; el.textContent = typeof v === 'number' ? fmt(v) : v; });
  }
  const bp = $('#balancePanel');
  if (bp && !bp.contains(document.activeElement)) { bp.innerHTML = balancePanelHtml(c); if (state.locked) bp.querySelectorAll('input, select, button').forEach(el => { el.disabled = true; }); }
}

/* ---------- events ---------- */
function onEdit(e) {
  const t = e.target;
  if (t.dataset.mapsrc !== undefined) {
    state.expenses.mapping[decodeURIComponent(t.dataset.mapsrc)] = t.value;
    scheduleSave(); return;
  }
  if (!t.dataset.bind) return;
  if (state.locked && t.id !== 'lockToggle' && t.dataset.bind[0] !== '~' && !t.dataset.lockSafe) return;
  const type = t.dataset.type;
  let v = t.value;
  if (type === 'bool') v = t.checked;
  else if (type === 'num') v = num(v);
  else if (type === 'optnum') v = isBlank(v.trim()) ? '' : num(v);
  else if (type === 'dec') v = isBlank(v.trim()) ? '' : num(v);
  setPath(...bindRoot(t.dataset.bind), v);
  if (t.dataset.bind[0] === '~') { refreshCalc(); return; }
  if (t.dataset.bind === 'locked' && v && !state.yearEnd) state.yearEnd = yearEndSnapshot(state);
  syncWealthRow(t.dataset.bind, t);
  scheduleSave();
  if (t.dataset.rerender && e.type === 'change') render(); else refreshCalc();
}

document.addEventListener('input', e => {
  if (e.target.id === 'balExp') { bal.toExp = num(e.target.value); bal.touched = true; $('#balPreview').innerHTML = balancePreview().html; return; }
  if (e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') onEdit(e);
});
document.addEventListener('change', e => {
  if (e.target.id === 'csvFile') return loadCsvFile(e.target.files[0]);
  if (e.target.id === 'taxCardPdf') { const f = e.target.files[0]; e.target.value = ''; if (!state.locked) importTaxCard(f); return; }
  if (e.target.id === 'returnPdf') { const f = e.target.files[0]; e.target.value = ''; return importReturnPdf(f); }
  if (e.target.id === 'yearSelect') {
    if (e.target.value === '__next') { renderYearSelect(); return startNextYear(); }
    return loadYear(e.target.value);
  }
  if (e.target.id === 'personSelect') {
    if (e.target.value === '__add') { renderPersonSelect(); return addPerson(); }
    return switchPerson(e.target.value);
  }
  if (e.target.id === 'balAsset') { bal.assetId = e.target.value; $('#balPreview').innerHTML = balancePreview().html; return; }
  if (e.target.id === 'ytdThrough') {
    if (state.locked) return;
    if (setCarryThrough(+e.target.value)) { scheduleSave(); render(); } else render();
    return;
  }
  if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onEdit(e);
});
document.addEventListener('focusout', e => {
  const t = e.target;
  if (t.dataset?.type === 'num') t.value = num(t.value) === 0 ? '' : fmt(num(t.value));
  else if (t.dataset?.type === 'optnum' && !isBlank(t.value.trim())) t.value = fmt(num(t.value));
});
// Clicking into a field that holds 0 selects it, so the first keystroke replaces the 0.
document.addEventListener('focusin', e => {
  const t = e.target;
  if (t.tagName === 'INPUT' && t.classList.contains('num') && t.value.trim() !== '' && num(t.value) === 0) {
    requestAnimationFrame(() => t.select());
  }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action;
  if (a === 'tab') {
    e.preventDefault(); tab = b.dataset.tab; if (tab === 'history') historyData = null;
    history.replaceState(null, '', `#${tab}`); render(); window.scrollTo(0, 0);
    $('.side .nav-item.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // the step strip on phones
    return;
  }
  if (a === 'scroll') { e.preventDefault(); document.getElementById(b.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (a === 'start-next') return startNextYear();
  if (a === 'toggle-entered') { hideEntered = !hideEntered; render(); return; }
  if (state.locked && !['month', 'copy', 'print', 'export-year', 'export-all', 'open-year', 'go-year', 'create-year', 'save-yearend', 'past-start', 'past-import', 'past-cancel', 'past-save', 'rename-person', 'remove-person', 'confirm-paid', 'undo-paid', 'confirm-submitted', 'undo-submitted', 'ack-sent', 'ack-undo', 'ack-add-bank', 'ack-del-bank', 'ack-suggest'].includes(a)) return;
  if (a === 'add') { getPath(state, b.dataset.list).push(TPL[b.dataset.tpl]()); }
  else if (a === 'del') {
    const list = getPath(state, b.dataset.list); const item = list[+b.dataset.idx];
    const hasData = item && Object.entries(item).some(([k, v]) => k !== 'id' && !isBlank(v) && v !== 0);
    if (hasData && !confirm('Remove this row?')) return;
    list.splice(+b.dataset.idx, 1);
  }
  else if (a === 'add-slab') state.rules.slabs.push({ upto: '', rate: 0 });
  else if (a === 'reset-rules') { if (!confirm('Reset all tax rules to the built-in defaults?')) return; state.rules = defaultRules(); }
  else if (a === 'clear-entered') state.entered = {};
  else if (a === 'ck-na') { const na = state.checklist.na; if (na[b.dataset.id]) delete na[b.dataset.id]; else na[b.dataset.id] = true; }
  else if (a === 'print') return window.print();
  else if (a === 'copy') {
    await navigator.clipboard.writeText(b.dataset.value);
    b.textContent = 'Copied'; b.classList.add('done');
    setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1200);
    return;
  }
  else if (a === 'month') { e.preventDefault(); selMonth = +b.dataset.idx; render(); return; }
  else if (a === 'mo-copy') { if (!copyPrevMonth()) return; }
  else if (a === 'mo-clear') {
    if (!confirm('Clear all values for this month?')) return;
    state.monthly.months[selMonth] = blankMonth();
  }
  else if (a === 'mo-push') { pushMonthlyToIncome(); }
  else if (a === 'mo-card') { $('#taxCardPdf').click(); return; }
  else if (a === 'card-dismiss') { cardResult = null; render(); return; }
  else if (a === 'card-rules') { if (!confirm("Update this year's tax rules (Settings → Tax rules) to the tax card's?")) return; applyCardRules(); }
  else if (a === 'bal-all-exp' || a === 'bal-all-asset') {
    bal.toExp = a === 'bal-all-exp' ? compute(state).difference : 0; bal.touched = true;
    $('#balancePanel').innerHTML = balancePanelHtml(compute(state)); return;
  }
  else if (a === 'bal-apply') { if (!applyBalance()) return; }
  else if (a === 'past-start') { pastDraft = blankPastDraft(); render(); return; }
  else if (a === 'past-import') { $('#returnPdf').click(); return; }
  else if (a === 'past-cancel') { pastDraft = null; render(); return; }
  else if (a === 'past-save') { return savePastYear(); }
  else if (a === 'save-yearend') {
    if (state.yearEnd && !confirm('Replace the saved year-end values with the current figures?')) return;
    state.yearEnd = yearEndSnapshot(state);
  }
  else if (a === 'refresh-opening') {
    const lbl = yearInfo(prevDoc.assessmentYear).ayLabel;
    if (!confirm(`Set opening values and previous net wealth from ${lbl}'s year-end values?\n\nRows are matched to ${lbl}'s; any it has that are missing here are added. Rows where you entered a change keep the change; rows where you entered a closing value keep the closing value.`)) return;
    refreshOpeningFrom(prevDoc);
  }
  else if (a === 'reset-adj') {
    if (!confirm('Remove all balancing adjustments from expenses?')) return;
    state.expenses.categories.forEach(x => { x.adj = 0; });
  }
  else if (a === 'mo-mode') {
    const md = b.dataset.mode, cur = num(state.monthly.carryIn.through);
    const nt = md === 'monthly' ? -1 : md === 'year' ? 11 : (cur >= 0 && cur <= 10 ? cur : defaultYtdThrough());
    if (!setCarryThrough(nt)) return;
  }
  else if (a === 'csv-analyze') return analyzeCsv();
  else if (a === 'confirm-paid') {
    const sub = state.submission;
    if (!num(sub.taxPaidAmount)) sub.taxPaidAmount = Math.max(0, Math.round(compute(state).balance));
    if (!sub.taxPaidDate) sub.taxPaidDate = todayISO();
    sub.taxPaid = true; state.checklist.done['web-pay'] = true;
  }
  else if (a === 'undo-paid') { state.submission.taxPaid = false; state.checklist.done['web-pay'] = false; }
  else if (a === 'confirm-submitted') {
    const sub = state.submission; const due = Math.round(compute(state).balance); const lbl = yearInfo(state.assessmentYear).ayLabel;
    if (due > 0 && !sub.taxPaid && !confirm(`The net payable tax (about ${fmt(due)}) isn't confirmed as paid. The site normally needs it paid before you submit.\n\nMark the return submitted anyway?`)) return;
    if (!sub.date) sub.date = todayISO();
    sub.submitted = true;
    for (const k of ['web-submit', 'after-record']) state.checklist.done[k] = true;
    if (!state.locked && confirm(`Lock ${lbl} now?\n\nThis saves its year-end values (closing assets, liabilities, net wealth and expenses) for next year and stops accidental edits. You can unlock it in Settings.`)) {
      state.yearEnd = yearEndSnapshot(state); state.locked = true;
    }
  }
  else if (a === 'undo-submitted') {
    state.submission.submitted = false;
    for (const k of ['web-submit', 'after-record']) state.checklist.done[k] = false;
    if (state.locked && confirm('Unlock the year as well, so you can edit it?')) state.locked = false;
  }
  else if (a === 'ack-sent' || a === 'ack-undo') {
    const sub = state.submission; const sent = a === 'ack-sent';
    const t = b.dataset.target === 'employer' ? sub.ackEmployer : sub.ackBanks[+b.dataset.idx];
    t.sent = sent; t.date = sent ? todayISO() : '';
    state.checklist.done['after-share'] = ackDone(state, compute(state));
  }
  else if (a === 'ack-add-bank') state.submission.ackBanks.push({ id: uid(), name: '', sent: false, date: '' });
  else if (a === 'ack-del-bank') {
    const list = state.submission.ackBanks; const it = list[+b.dataset.idx];
    if (it && (it.name || it.sent) && !confirm(`Remove ${it.name || 'this bank'} from the list?`)) return;
    list.splice(+b.dataset.idx, 1);
    state.checklist.done['after-share'] = ackDone(state, compute(state));
  }
  else if (a === 'ack-suggest') {
    for (const name of suggestBanks(state)) state.submission.ackBanks.push({ id: uid(), name, sent: false, date: '' });
    state.checklist.done['after-share'] = false;
  }
  else if (a === 'rename-person') return renamePerson();
  else if (a === 'remove-person') return removePerson();
  else if (a === 'export-year') return download(`tax-${fileSlug()}-${state.assessmentYear}.csv`, yearCSV(state));
  else if (a === 'export-all') return exportAll();
  else if (a === 'open-year') { e.preventDefault(); tab = 'overview'; return loadYear(b.dataset.ay); }
  else if (a === 'go-year') { return loadYear(b.dataset.ay); } // stays on the same tab
  else if (a === 'lock-year') {
    if (!confirm(`Lock ${yearInfo(state.assessmentYear).ayLabel}? Editing is disabled until you unlock it in Settings, and its year-end values are saved if they aren't already.`)) return;
    state.locked = true; if (!state.yearEnd) state.yearEnd = yearEndSnapshot(state);
    renderYearSelect();
  }
  else if (a === 'create-year') {
    const y = parseInt($('#newYearInput').value, 10);
    if (!(y > 2000 && y < 2100)) { alert('Enter the first year of the assessment year, e.g. 2025 for AY 2025-26.'); return; }
    const ay = `${y}-${y + 1}`;
    if (!years.includes(ay) && !confirm(`Create a blank ${yearInfo(ay).ayLabel} (income year ${yearInfo(ay).iyLabel})?`)) return;
    tab = 'overview'; return loadYear(ay);
  }
  else if (a === 'csv-apply') return applyCsv();
  else return;
  scheduleSave(); render();
});

function loadCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(String(reader.result).replace(/^﻿/, ''));
    if (rows.length < 2) { alert('That file has no data rows.'); return; }
    const headers = rows[0].map(h => h.trim());
    csv = { name: file.name, headers, rows: rows.slice(1), analysis: null };
    const st = state.expenses.csv;
    const pick = (cur, re) => (headers.includes(cur) ? cur : headers.find(h => re.test(h)) || '');
    st.dateCol = pick(st.dateCol, /date|time/i);
    st.amountCol = pick(st.amountCol, /amount|value|debit|expense|cost|price/i);
    st.catCol = pick(st.catCol, /categ|type|tag/i);
    scheduleSave(); render();
  };
  reader.readAsText(file);
}


(async function init() {
  const fromHash = location.hash.slice(1);
  if (TABS.some(([id]) => id === fromHash)) tab = fromHash;
  try {
    people = (await api('/api/people')).people;
    if (!people.length) people = [await api('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Me' }) })];
  } catch { $('#main').innerHTML = '<div class="bad">Can\'t reach the local server. Start it with <code>python3 server.py</code>.</div>'; return; }
  let saved = null; try { saved = localStorage.getItem('person'); } catch { /* ignore */ }
  person = people.some(p => p.id === saved) ? saved : people[0].id;
  years = people.find(p => p.id === person).years;
  renderPersonSelect();
  await loadYear(years.length ? years[years.length - 1] : defaultAY());
})();
