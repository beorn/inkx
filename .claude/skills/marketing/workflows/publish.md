# Publish & Cross-Post Workflow

Publish an article and distribute it across channels.

## Steps

### 1. Pre-Publish Checks

- [ ] Article passes review checklist (see write-article.md)
- [ ] All code examples tested
- [ ] Canonical URL set in frontmatter
- [ ] OG image generated (if supported)
- [ ] Internal links verified

### 2. Publish to Own Site

```bash
# Commit the article
git add vendor/<site>/docs/blog/posts/<article>.md
git commit -m "blog(<site>): <title>"
git push
```

Wait for CI deploy to complete. Verify the article is live at the canonical URL.

### 3. Submit to Search Engines

- Google Search Console: Request indexing for the new URL
- Verify the sitemap was updated (VitePress auto-generates)

### 4. Cross-Post (Day 0-1)

#### dev.to
- Use dev.to's RSS import or create manually
- Set `canonical_url` to your site's URL
- Ensure code blocks render correctly
- Add "Originally published at [site]" footer

#### Hashnode
- Import via RSS or create manually
- Set canonical URL
- Verify formatting

### 5. Social (Day 0-1)

#### Twitter/X
- Write 3-5 tweet thread with key insights
- Include link to article
- Include 1-2 terminal screenshots or code snippets

#### Bluesky
- Same as Twitter content

### 6. Community (Day 3-7, selective)

Only for genuinely novel or discussion-worthy articles:

#### Hacker News
- Title should be factual, not promotional
- Best for: benchmarks, architecture deep dives, historical content, novel tools
- Do NOT submit tutorials or "getting started" content

#### Lobsters
- Tag appropriately (programming, terminal, javascript, etc.)
- Best for: technical deep dives, comparisons, protocol explainers

#### Reddit
- r/programming, r/typescript, r/commandline as appropriate
- Must be genuinely useful to the subreddit, not self-promotion

### 7. Newsletter Queue

Add to the next monthly newsletter digest. Track in SKILL.md newsletter section.

### 8. GitHub Integration (Week 2)

- Update relevant README with link to article (if it adds value)
- Post in GitHub Discussions (if the project has them)
- Reference from release notes (if article covers new features)

### 9. Update Tracker

Update SKILL.md execution tracker with publish date.
