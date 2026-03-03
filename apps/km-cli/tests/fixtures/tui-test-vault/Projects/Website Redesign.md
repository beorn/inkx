# Website Redesign

A complete overhaul of the company website with [[Resources/Design System|our design system]].

## All Task States

### Open Tasks [ ]

- [ ] Create wireframes for homepage
- [ ] Design new color palette @designer
- [ ] Set up staging environment

### In Progress [/]

- [/] Implement new navigation component @sarah
- [/] Mobile responsive testing

### Done [x]

- [x] Audit current site performance
- [x] Initial stakeholder meeting (uppercase X also works)

### Blocked [!]

- [!] Deploy to production (waiting on SSL cert)
- [!] API integration (blocked by [[Projects/API Refactor]])

### Dropped [-]

- [-] Use WordPress (decided against)
- [-] Third-party chat widget (too expensive)

## Tasks with Priorities

- [ ] Critical security fix priority:: P1 📅 2025-01-15
- [ ] Update hero section priority:: P2
- [ ] Optimize images priority:: P3
- [ ] Nice-to-have animations priority:: P4

## Tasks with Dates

- [ ] Launch deadline 📅 2025-03-01
- [ ] Start development ⏳ 2025-01-20
- [ ] Both dates 📅 2025-02-15 ⏳ 2025-01-25
- [ ] Inline style due:2025-02-01 start:: 2025-01-15

## Tasks with Assignments

- [ ] Frontend work @alice @bob
- [ ] Backend API @charlie
- [ ] Design review @sarah #design

## Code Examples

The current site uses **React** with `styled-components`:

```jsx
function Navigation() {
  return (
    <Nav>
      <Logo src="/logo.svg" />
      <Links>
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
      </Links>
    </Nav>
  )
}
```

We're considering switching to:

1. Next.js for SSR
2. Tailwind CSS for styling
3. Vercel for deployment

```css
/* New design tokens */
:root {
  --color-primary: #3b82f6;
  --color-secondary: #10b981;
  --spacing-unit: 8px;
}
```

## Tables

| Phase       | Duration | Status      | Owner  |
| ----------- | -------- | ----------- | ------ |
| Discovery   | 2 weeks  | Done        | @pm    |
| Design      | 3 weeks  | In Progress | @sarah |
| Development | 6 weeks  | Not Started | @team  |
| Testing     | 2 weeks  | Not Started | @qa    |

## Links and References

- Figma: https://figma.com/project/xyz
- Staging: https://staging.example.com
- See [[Resources/Design System]] for brand guidelines
- API specs in [[Resources/API Guidelines#Authentication]]
