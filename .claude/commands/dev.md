Start the dev server. Use `--local` to use local backend instead of production.

$ARGUMENTS: --local (optional) - Use local backend at localhost:8787

## Setup (first time only)

If using local backend, ensure secrets are configured:
```bash
pnpm worker:setup
```

This stores PIN, MISTRAL_API_KEY, and GITHUB_TOKEN in macOS keychain and creates `worker/.dev.vars`.

## Commands

```bash
# Kill any existing dev server
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Check if --local flag was passed
if [[ "$ARGUMENTS" == *"--local"* ]]; then
  echo "Starting with LOCAL backend (localhost:8787)"
  echo "Make sure worker is running: pnpm worker"
  VITE_USE_LOCAL_API=true pnpm dev --host 0.0.0.0
else
  echo "Starting with REMOTE backend (production)"
  pnpm dev --host 0.0.0.0
fi
```
