# Missing close fence

This file has an unterminated code fence. The parser MUST NOT crash.
The serializer should produce something that, when re-parsed, is stable
(fixed-point reached by second round-trip).

Preamble text.

```typescript
// This fence is never closed
function hello() {
  return "world"
}

More text that is arguably "inside" the code block from CommonMark's
perspective, because the fence extends to EOF.
