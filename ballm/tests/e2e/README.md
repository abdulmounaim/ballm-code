# End-to-end tests

These tests cover behavior that spans the client, the control plane, and managed policy. They are
kept outside the upstream runners so upstream CI stays untouched.

Run the fast checks:

```sh
bun test ballm/tests/e2e
```

## Manual policy check

1. Install the managed policy (or run with `OPENCODE_CONFIG_CONTENT` merged from it).
2. Create a project whose `opencode.json` adds another provider:

   ```json
   {
     "providers": {
       "openai": {
         "package": "@opencode/ai/providers/openai",
         "settings": { "apiKey": "sk-test" }
       }
     }
   }
   ```

3. Start the client in that project.
4. Confirm the provider list contains only `ballm`:

   ```sh
   opencode api get /api/provider/list
   opencode api get /api/integration/list
   ```

5. Confirm a request for the other provider fails:

   ```sh
   opencode run --model openai/gpt-4o-mini "hello"
   ```

## Device-flow check against a running control plane

```sh
BALLM=http://localhost:8787
CODE=$(curl -s -X POST "$BALLM/auth/device/code" -H 'content-type: application/json' -d '{"client_id":"ballm-cli"}')
echo "$CODE"
# approve with the user_code from the response
curl -s -X POST "$BALLM/auth/device/approve" -H 'content-type: application/json' \
  -d "{\"user_code\":\"<CODE>\",\"email\":\"dev@ballm.internal\"}"
# exchange the device_code
curl -s -X POST "$BALLM/auth/device/token" -H 'content-type: application/json' \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:device_code","device_code":"<DEVICE_CODE>","client_id":"ballm-cli"}'
```
