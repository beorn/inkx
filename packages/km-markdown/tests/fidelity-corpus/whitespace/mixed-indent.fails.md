# Mixed indentation widths

Some lists indent children with 2 spaces, some with 4. A real vault contains
both because different editors disagree. The parser must handle them equally.

- Two-space indent root
  - Two-space child
    - Two-space grandchild
- Another two-space root

1. Ordered list
   - Four-space nested bullet
   - Another four-space nested bullet
2. Second ordered item

- Top
  - Child with trailing spaces after it
  - Another child
