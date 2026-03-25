# Content Enrichment Workflow

AI-assisted enrichment of terminfo.dev content files. Adds history, pitfalls, examples, and relationships to features, terminals, standards, and categories.

## When to Run

- After initial content extraction (Phase 1 of data architecture)
- When enrichment coverage is below target (see coverage report)
- Before publishing blog articles that reference specific features or terminals
- Monthly maintenance pass

## Content Files

All content lives in `vendor/terminfo.dev/content/`:

| File | Entries | Required Fields | Enrichment Fields |
|------|---------|----------------|-------------------|
| `features.json` | ~133 | name, slug, url, tags, body, probe | history, pitfalls[], relatedFeatures[], examples[], aliases[] |
| `terminals.json` | ~11 | label, slug | history, founded, language, license, renderer, pitfalls[], relatedTerminals[], platforms[] |
| `standards.json` | ~10 | label | history, yearPublished, organization, parent, children[], url |
| `categories.json` | ~13 | label, order | history, seeAlso[], description |
| `annotations.json` | ~88 | note | (no enrichment fields — annotations are always hand-curated) |

## Steps

### 1. Coverage Report

Read all content files and report enrichment status:

```bash
cd /Users/beorn/Code/pim/km/vendor/terminfo.dev
bun -e "
const fs = require('fs');
const files = ['features', 'terminals', 'standards', 'categories'];
for (const f of files) {
  const data = JSON.parse(fs.readFileSync('content/' + f + '.json', 'utf-8'));
  const entries = Object.entries(data).filter(([k]) => !k.startsWith('\$'));
  const fields = { features: ['body','history','pitfalls','relatedFeatures','examples'],
                    terminals: ['body','history','founded','language'],
                    standards: ['description','history','yearPublished','organization'],
                    categories: ['description','history'] };
  console.log(f + ': ' + entries.length + ' entries');
  for (const field of fields[f] ?? []) {
    const has = entries.filter(([_,v]) => v[field] && (Array.isArray(v[field]) ? v[field].length > 0 : true)).length;
    console.log('  ' + field + ': ' + has + '/' + entries.length + ' (' + Math.round(has/entries.length*100) + '%)');
  }
}
"
```

### 2. Select Targets

Pick entries to enrich based on priority:
1. **High-traffic features** — features that appear on comparison/category pages most often
2. **Failing features** — features where many terminals fail (users searching for "why doesn't X support Y")
3. **Differentiating features** — features where terminals disagree (comparison page value)
4. **Standard-defining features** — features tagged with important standards

### 3. Research and Generate

For each target entry, generate enrichment content:

**Features** — research using web search + terminfo.dev's own data:
- `history`: When was this escape sequence introduced? Which VT version? Has it evolved?
- `pitfalls`: Common implementation mistakes. Check annotations.json for clues.
- `relatedFeatures`: Features that interact or share concerns (e.g., SGR 1 bold ↔ SGR 22 normal)
- `examples`: Code snippets in bash/python/typescript showing usage
- `aliases`: Alternative names (e.g., "bold" vs "bright" vs "intense")

**Terminals** — research from project websites, READMEs, Wikipedia:
- `history`: Origin story, key milestones
- `founded`: Year first released
- `language`: Primary implementation language
- `license`: Open source license
- `renderer`: GPU rendering technology

**Standards** — research from specification documents:
- `history`: When published, by whom, evolution
- `yearPublished`: Publication year
- `organization`: Publishing body
- `parent`/`children`: Standard hierarchy

### 4. Write to JSON

Update the content file with new fields. Example for a feature:

```json
{
  "sgr.bold": {
    "name": "Bold (SGR 1)",
    "slug": "sgr-1-bold",
    "url": "https://vt100.net/docs/vt510-rm/SGR.html",
    "tags": ["ecma-48", "vt100"],
    "body": "existing body...",
    "probe": "existing probe...",
    "baseline": "core",
    "history": "Bold was defined in the original ECMA-48 standard (1976) and implemented in the DEC VT100 (1978). It was one of the first SGR attributes, alongside underline and blink. Some early terminals rendered bold as 'bright' (lighter color) rather than heavier weight — this ambiguity persists in some modern terminals.",
    "pitfalls": ["SGR 22 resets both bold AND faint simultaneously — there is no way to reset bold alone"],
    "relatedFeatures": ["sgr.faint", "sgr.normal-intensity"],
    "examples": [
      {
        "language": "bash",
        "code": "printf '\\e[1mBold text\\e[22m Normal text\\n'",
        "description": "Enable bold, print text, reset intensity"
      }
    ]
  }
}
```

### 5. Validate

After writing:
```bash
bun run build  # Must succeed
```

### 6. Update Tracker

Update the enrichment coverage in `/marketing SKILL.md` with new percentages.

## Guidelines

- **Accuracy over volume** — every claim must be verifiable. Cite spec URLs.
- **Don't guess** — if you can't find when a feature was introduced, leave the field out rather than guessing
- **Keep it concise** — 2-3 sentences for history, 1 sentence per pitfall
- **Test code examples** — every example must actually work in a terminal
- **Don't overwrite existing content** — only add new fields, never change existing body/description
