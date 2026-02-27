---
description: Debugs Redis-related bugs or unexpected behavior. Checks atomicity, TTL, key naming, and traces values before and after the operation.
---

I have a Redis-related bug or unexpected behavior.

Steps to follow:
1. First print the exact Redis command being executed and its arguments
2. Check if this operation needs atomicity — if yes, confirm it is inside a Lua script
3. Check the TTL and key naming convention being used
4. Add temporary debug logging to trace the value of the key before and after the operation
5. Suggest the fix with explanation of WHY the bug happened
6. After fix, remind me to remove temporary debug logs