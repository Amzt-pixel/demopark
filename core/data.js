// ════════════════════════════════════════════
// data.js — Data layer. CSV → dataList[]
// Depends on: nothing. Load after state.js.
// ════════════════════════════════════════════

'use strict';

// ── Config ─────────────────────────────────
const CSV_URL = 'https://raw.githubusercontent.com/Amzt-pixel/vocabdb/refs/heads/main/samplefdata2.csv';

const CATEGORY_MAP = { 1: 'Word', 2: 'Idiom', 3: 'Phrasal' };
const USAGE_MAP    = { 0: 'Common', 1: 'Unique', 2: 'Specific', 3: 'Colloquial', 4: 'Common', 5: 'Common', 6: 'Common' };

// ── Session snapshot ───────────────────────
let dataList     = [];
let lastSyncedAt = null;

// ── Public API ─────────────────────────────

async function loadFromGitHub() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error('GitHub fetch failed: ' + res.status);
  const text = await res.text();
  return parseCSV(text);
}

function loadFromText(csvText) {
  return parseCSV(csvText);
}

function buildDataList(rows) {
  dataList     = rows.map(row => normaliseRow(row));
  lastSyncedAt = new Date();
  return dataList;
}

// ── CSV Parsing ────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (!vals.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

// ── Row normalisation ──────────────────────

function normaliseRow(row) {
  const numid    = parseFloat(row['numid']);
  const category = parseInt(row['category']) || 1;
  const usage    = parseInt(row['usage'])    || 0;
  const active   = row['active'] === 'true' || row['active'] === '1' || row['active'] === 'True';
  const review   = row['review_note'] === 'true' || row['review_note'] === '1' || row['review_note'] === 'True';
  const validNum = !isNaN(numid) && numid !== 0;

  return {
    uid:           parseInt(row['uid']) || 0,
    numid:         isNaN(numid) ? 0 : numid,
    word:          row['word']          || '',
    category,
    categoryLabel: CATEGORY_MAP[category] || 'Word',
    role:          row['role']          || '',
    definition1:   row['definition1']   || '',
    definition2:   row['definition2']   || '',
    example1:      row['example1']      || '',
    example2:      row['example2']      || '',
    example3:      row['example3']      || '',
    example4:      row['example4']      || '',
    example5:      row['example5']      || '',
    bengali_def:   row['bengali_def']   || '',
    bengali_ex1:   row['bengali_ex1']   || '',
    bengali_ex2:   row['bengali_ex2']   || '',
    bengali_ex3:   row['bengali_ex3']   || '',
    refword:       row['refword']       || '',
    usage,
    usageLabel:    USAGE_MAP[usage]     || 'Common',
    review_note:   review,
    comment:       row['comment']       || '',
    creation_date: row['creation_date'] || '',
    active,

    // Derived flags
    isInvalid:       !validNum,
    isInactive:      !active,
    hasDef:          !!(row['definition1']),
    hasExample:      !!(row['example1']),
    hasTranslation:  !!(row['bengali_def']),
    hasBengaliEx:    !!(row['bengali_ex1']),
  };
}

// ── Filtering ─────────────────────────────

function applyFilters(entries, filters = {}) {
  let result = [...entries];

  // Category — single
  if (filters.category && filters.category !== 'all') {
    const map = { word: 1, idiom: 2, phrasal: 3 };
    const val = map[filters.category];
    if (val) result = result.filter(e => e.category === val);
  }

  // Usage/label — single
  if (filters.usage && filters.usage !== 'all') {
    const map = { common: 0, unique: 1, specific: 2, colloquial: 3 };
    const val = map[filters.usage];
    if (val !== undefined) result = result.filter(e => e.usage === val);
  }

  // Condition chips — multi
  if (filters.onlyDefs)       result = result.filter(e => e.hasDef);
  if (filters.noExamples)     result = result.filter(e => !e.hasExample);
  if (filters.reviewNote)     result = result.filter(e => e.review_note);
  if (filters.invalid)        result = result.filter(e => e.isInvalid);
  if (filters.inactive)       result = result.filter(e => e.isInactive);
  if (filters.hasTranslation) result = result.filter(e => e.hasTranslation);
  if (filters.isolated)       result = result.filter(e => !e.refword);

  // NumId range
  if (filters.numidMin !== '' && filters.numidMin != null) {
    result = result.filter(e => e.numid >= parseFloat(filters.numidMin));
  }
  if (filters.numidMax !== '' && filters.numidMax != null) {
    result = result.filter(e => e.numid <= parseFloat(filters.numidMax));
  }

  // Text search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(e => e.word.toLowerCase().includes(q));
  }

  return result;
}

// ── Sorting ───────────────────────────────

function applySort(entries, sortKey = 'word_asc') {
  const arr = [...entries];
  switch (sortKey) {
    case 'word_asc':    return arr.sort((a, b) => a.word.localeCompare(b.word));
    case 'word_desc':   return arr.sort((a, b) => b.word.localeCompare(a.word));
    case 'numid_asc':   return arr.sort((a, b) => a.numid - b.numid);
    case 'numid_desc':  return arr.sort((a, b) => b.numid - a.numid);
    case 'date_newest': return arr.sort((a, b) => b.creation_date.localeCompare(a.creation_date));
    case 'date_oldest': return arr.sort((a, b) => a.creation_date.localeCompare(b.creation_date));
    default:            return arr;
  }
}

// ── Lookup helpers ────────────────────────

function getEntryByUid(uid) {
  return dataList.find(e => e.uid === uid) || null;
}

function searchEntries(query, limit = 20) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return dataList
    .filter(e => e.word.toLowerCase().includes(q))
    .slice(0, limit);
}

function getGroupMembers(numid) {
  const abs = Math.abs(numid);
  return dataList.filter(e => Math.abs(e.numid) === abs);
}

// ── Tile meta string ──────────────────────
// Returns array of parts shown on tile line 2

function buildTileMeta(entry) {
  return {
    label:     entry.usageLabel,                    // always shown — Common or otherwise
    indicators: [
      { key: 'D',  active: entry.hasDef         },
      { key: 'E',  active: entry.hasExample      },
      { key: 'T',  active: entry.hasTranslation  },
      { key: 'TE', active: entry.hasBengaliEx    },
    ]
  };
}
