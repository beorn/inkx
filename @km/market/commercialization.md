---
id: "@km/market/commercialization"
aliases:
  - km-market.commercialization
  - km-market-commercialization
created_by: claude:4929065a
created_at: 2026-04-01T21:08:03Z
owner: bjorn@stabell.org
---

# [ ] Commercialization strategy: terminfo.dev + termless ecosystem @km/market #feature #P3

Commercialization strategy for the terminfo.dev + termless ecosystem.

## Landscape Research (2026-04-01)

### "caniuse" sites — all free, none are businesses
| Site | Creator | Model | Revenue |
|------|---------|-------|---------|
| caniuse.com | Alexis Deveria (Adobe employee) | Patreon + BrowserStack partnership | Side project |
| caniemail.com | Remi Parmentier (Tilt Studio) | Sponsored by Resend | Side project for consultancy |
| kangax compat-table | Juriy Zaytsev | None | Open source reference |
| html5test.com | Niels Leenheer | None | Dormant |
| node.green | William Kapke | None | Community project |

### The money is in TESTING, not DATA
| Company | What | Revenue/Valuation |
|---------|------|-------------------|
| BrowserStack | Cross-browser testing | $4B+ valuation, $250M+ raised |
| Sauce Labs | Cloud testing (acquired by Tricentis) | Acquired for $1.33B (2024) |
| LambdaTest | Budget cross-browser testing | Series C, growing |
| Litmus | Email client testing/previews | Enterprise pricing, 700K+ users |
| Email on Acid | Email testing (acquired by Sinch) | Acquired |

### Key insight
BrowserStack PARTNERED with caniuse — "see compatibility on caniuse → test it on BrowserStack". The data drives traffic, the testing service captures revenue.

### Our position
terminfo.dev is MORE open than caniuse (full source + data + probes, CC BY 4.0). We have the testing layer (Termless) that caniuse lacks (BrowserStack is a separate company).

## The Funnel
```
terminfo.dev (free data, CC BY 4.0) → "does my terminal support X?"
    ↓
termless.dev (open source) → "test my TUI app across terminals"
    ↓
@termless/* (npm packages) → developers integrate into CI
    ↓
??? → hosted service / commercial offering
```

## Open Questions
1. What's the commercial offering? Hosted Termless CI? API access? Consulting?
2. What's the MVP to gauge interest?
3. Who are the first customers? (Gemini CLI, Claude Code, Shopify CLI, etc.)
4. What would they pay for that they can't do with open source?