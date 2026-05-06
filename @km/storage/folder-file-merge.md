---
mentions:
  - km
id: "@km/storage/folder-file-merge"
aliases:
  - km-storage.folder-file-merge
  - km-storage-folder-file-merge
created_by: claude:b92140a2
created_at: 2026-03-17T03:44:40Z
owner: bjorn@stabell.org
---

# [ ] Folder-file merge: designated index file merges with folder node @km/storage #feature #P2

When a folder contains a same-name .md file (e.g., early-orbit/ + early-orbit.md), the file should be designated as the folder-file and merged structurally with the folder node.

**Design thinking:**

- One file in a folder can be designated the folder-file and merged with the folder-level
- Any section in the file and any files/folders in the folder can be merged into one children list
- Folder-children can be picked up and represented as transcluded items ![[item]] in the folder-file
- This enables folders to implement an ordered list of subitems (the folder-file controls ordering)
- The folder-file can also contain its own md sections

**Current state:**

- Display-level collapsing exists (breadcrumb shows 'early-orbit / .md') via getCollapsedTypeSuffix()
- But structurally they remain separate nodes — folder has .md files as children, .md file has sections as children
- Column derivation treats the folder's children as columns → the .md file is ONE column with sections as cards
- User expectation: sections from the index file should be columns alongside the other files

**Attempted approach (reverted):**

- expandIndexFile() in use-columns.ts replaced the index file with its sections inline
- expandChildFolders() did the same recursively for child folders
- Problem: mixing 34 items (11 sections + 23 files) as siblings is incoherent — they're different conceptual levels

**Open questions:**

- Should this merge happen at the Repo level (getChildren returns merged list) or at the view level?
- How does the folder-file control ordering of transcluded folder children?
- How do sections and files interleave in the merged children list?
- Should the folder-file's frontmatter become the folder's metadata?

