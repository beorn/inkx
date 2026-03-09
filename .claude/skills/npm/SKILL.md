---
description: "Check npm package and org scope availability. Use when exploring package names, reserving npm names, or checking if a scope/package exists."
argument-hint: "<names...>"
allowed-tools: Bash
---

# npm — Package Name Availability

**Keywords**: npm, package name, availability, scope, org, registry, reserve, check name, naming

Check whether npm package names, scoped packages, and org scopes are available.

## Quick Check

```bash
# Packages and org scopes — bunx npm-name-cli is the primary tool
bunx npm-name-cli mypackage @myorg anotherpackage

# Scoped packages (check if a specific @scope/name is taken)
curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/@SCOPE%2FNAME"
# 404 = available, 200 = taken
```

## Tools

### `bunx npm-name-cli` (primary)

Sindresorhus's CLI. Checks both packages AND org scope ownership.

```bash
bunx npm-name-cli steeply @leafy chahai
# ✔ steeply is available
# ✖ @leafy is unavailable (org exists)
# ✔ chahai is available
```

**Handles**: exact name lookup, org scope ownership detection.
**Does NOT handle**: similarity blocking (see below).

### curl (for scoped packages)

`npm-name-cli` doesn't check `@scope/name` pairs — only bare names and `@scope` orgs. Use curl for scoped:

```bash
for scope in leafy steeply chahai; do
  echo -n "@$scope/tea: "
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/@${scope}%2Ftea")
  [ "$code" = "404" ] && echo "available" || echo "taken"
done
```

## Similarity Blocking (the hard problem)

npm rejects names "confusingly similar" to existing packages at **publish time only**. No API or CLI can check this in advance.

**How it works**: npm normalizes names by stripping `-`, `.`, `_`. If the normalized form matches an existing package, publish is rejected.

**Known examples**:
- `hightea` → blocked by `high-tea`
- `omlog` → blocked by similarity to `npmlog`

**Manual variant check** (best effort — catches hyphenated collisions):

```bash
bash -c '
check_variants() {
  local name="$1"
  local len=${#name}
  for ((i=1; i<len; i++)); do
    local variant="${name:0:i}-${name:i}"
    local code=$(curl -s -o /dev/null -w "%{http_code}" "https://registry.npmjs.org/$variant")
    if [ "$code" = "200" ]; then
      echo "$name: BLOCKED by $variant"
      return
    fi
  done
  echo "$name: no hyphenated conflicts found"
}
check_variants "mypackage"
'
```

**Scoped packages bypass similarity** — `@myorg/log` publishes fine even though `log` exists.

## Procedure

1. Run `bunx npm-name-cli` with all candidate names and org scopes
2. For available bare names, run the variant check to catch similarity blocks
3. For scoped packages, use curl to check `@scope/name`
4. Present results:

```
Name             Package    Org Scope    Variants
─────────────────────────────────────────────────
steeply          available  available    clean
chahai           available  available    clean
hightea          available  -            BLOCKED by high-tea
@leafy           -          taken        -
```

## Tips

- **Scoped packages are safest** — no similarity blocking, no squatting risk
- **npm-name-cli says available ≠ publishable** — it doesn't catch similarity blocks
- **Squatting disputes**: [npm dispute policy](https://docs.npmjs.com/policies/disputes) for abandoned packages
- **Org scopes are first-come**: create with `npm org create` to reserve
