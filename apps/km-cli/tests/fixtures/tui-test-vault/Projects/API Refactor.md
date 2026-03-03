# API Refactor

Modernizing the backend API with GraphQL and improved authentication.

## Authentication

### JWT Implementation

- [x] Research JWT libraries
- [x] Design token structure
- [/] Implement token generation @backend-team
- [ ] Add refresh token flow
- [!] Security audit (waiting for @security-team)

### OAuth Integration

- [ ] Google OAuth setup priority:: P1
- [ ] GitHub OAuth setup priority:: P2
- [-] Facebook OAuth (removed from scope)

## GraphQL Migration

Tasks for migrating from REST to GraphQL:

- [x] Set up Apollo Server
- [/] Define schema types
- [ ] Implement resolvers for:
  - [ ] User queries
  - [ ] Product mutations
  - [ ] Order subscriptions
- [ ] Write integration tests

## Column Rules Example

### Backlog km.add:: status:open priority:>2

- [ ] Low priority cleanup tasks
- [ ] Documentation updates

### In Progress km.sync:: status:blocked km.limit:: 3

- [/] Current sprint items
- [!] Items waiting on dependencies

### Done km.collapse:: true

- [x] Completed items (collapsed by default)

## Code Snippets

GraphQL schema definition:

```graphql
type User {
  id: ID!
  email: String!
  name: String
  orders: [Order!]!
}

type Query {
  user(id: ID!): User
  users(limit: Int = 10): [User!]!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
}
```

Example resolver:

```typescript
const resolvers = {
  Query: {
    user: async (_, { id }, { dataSources }) => {
      return dataSources.userAPI.getUser(id)
    },
  },
}
```

## Dependencies

This project depends on:

- [[Resources/API Guidelines]] for standards
- External: Auth0 for identity management

Blocks:

- [[Projects/Website Redesign]] needs our new auth endpoints

## Notes

> **Important**: Maintain backwards compatibility with v1 REST endpoints during migration period.

Key decisions from planning meeting:

1. Use Apollo Server 4.x
2. Keep REST for legacy mobile apps
3. 3-month migration timeline
