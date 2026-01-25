# API Guidelines

Best practices for API development. Referenced by [[Projects/API Refactor]].

## REST Conventions

- Use plural nouns for resources: `/users`, `/products`
- Use HTTP verbs correctly:
  - `GET` - Read
  - `POST` - Create
  - `PUT` - Update (full)
  - `PATCH` - Update (partial)
  - `DELETE` - Delete

## Error Handling

All errors should return:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {
      "field": "email",
      "value": "not-an-email"
    }
  }
}
```

Common error codes:

| Code               | HTTP Status | Description              |
| ------------------ | ----------- | ------------------------ |
| `VALIDATION_ERROR` | 400         | Invalid input            |
| `UNAUTHORIZED`     | 401         | Missing/invalid auth     |
| `FORBIDDEN`        | 403         | Insufficient permissions |
| `NOT_FOUND`        | 404         | Resource not found       |
| `RATE_LIMITED`     | 429         | Too many requests        |

## Authentication

We use JWT tokens:

- Access token: 15 minutes
- Refresh token: 7 days

```typescript
interface JWTPayload {
  sub: string // User ID
  email: string
  roles: string[]
  iat: number // Issued at
  exp: number // Expires
}
```

## Rate Limiting

| Tier       | Requests/hour | Burst |
| ---------- | ------------- | ----- |
| Free       | 100           | 10    |
| Pro        | 1000          | 50    |
| Enterprise | 10000         | 500   |

## Versioning

Use URL versioning: `/v1/users`, `/v2/users`

> **Note**: v1 endpoints will be deprecated after [[Projects/API Refactor]] completes.

## Tasks

- [ ] Document pagination standards
- [ ] Add examples for error handling
- [x] Define rate limit tiers
- [/] Write authentication flow docs @docs-team

## See Also

- [[Resources/Design System]] for frontend error states
- External: [REST API Design](https://restfulapi.net/)
