---
id: "@km/storage/contact-sync"
aliases:
  - km-storage.contact-sync
  - km-storage-contact-sync
created_by: Bjørn Stabell
created_at: 2026-03-31T17:38:31Z
---

# [ ] Bidirectional contact sync: vdirsyncer + markdown bridge @km/storage #feature #P3

Bidirectional sync between iCloud CardDAV and vault markdown contact files.

Current state: 3,719 VCF files exported one-time (Aug 2025) via vdirsyncer + Kimmi normalization. Read-only archive in ref/People/Contacts/card/. Excluded from km indexing.

Proposed approach (Path 2 - medium effort):
  iCloud CardDAV <-> vdirsyncer <-> VCF cache <-> bridge script <-> markdown contacts

Bridge script converts VCF <-> human-readable markdown with frontmatter (name, org, title, email, location). Kimmi already has vcard importer/exporter code in packages/kimmi-sync/src/formats/vcard/.

Steps:
1. Set up vdirsyncer bidirectional config (currently one-way)
2. Build VCF <-> markdown bridge (reuse Kimmi vcard code)
3. Generate markdown contact files from existing VCFs
4. Run vdirsyncer on cron for ongoing sync
5. Enable km indexing of markdown contacts (remove from .km/ignored)

This is the interim solution before the full entity layer (@km/tools/recall-enhance). Markdown files become migration source when SPO triples are ready.

Relevant code:
- Kimmi vcard: ~/Code/pim/kimmi/packages/kimmi-sync/src/formats/vcard/
- km connector: packages/@km/_orphan/connector-caldav/src/ (carddav-client.ts, vcard.ts)
- iCloud quirks: ~/Code/pim/kimmi/docs/specs/001-implement-kimmi-repo/icloud-quirks/
- vdirsyncer config: ~/Code/pim/kimmi/tmp/my-repo/status/vdirsyncer.conf