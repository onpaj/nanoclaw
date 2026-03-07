# MS365: Přihlásit druhý účet (device code flow)

## Stav
Prvni tenant prihlaseny. Druhy tenant blokovan — nutno zkusit znovu.

## Co je hotovo
- MS365 skill nainstalovan a funkcni pro prvni tenant
- Persistent token cache v `data/ms365-cache/`
- Container mountuje cache dir do `/workspace/ms365-cache`
- Agent-runner nastaven pro multi-account (MS365_MCP_TOKEN_CACHE_PATH, MS365_MCP_SELECTED_ACCOUNT_PATH)

## Co zbyvá
Prihlasit druhy ucet pres device code flow. Spustit v terminalu:

```bash
MS365_MCP_TENANT_ID=common \
MS365_MCP_TOKEN_CACHE_PATH=/home/rem/nanoclaw/data/ms365-cache/.token-cache.json \
MS365_MCP_SELECTED_ACCOUNT_PATH=/home/rem/nanoclaw/data/ms365-cache/.selected-account.json \
npx @softeria/ms-365-mcp-server --login
```

Zobrazi URL + kod, zadat v prohlizeci a prihlasit se uctem z druheho tenantu.

## Po prihlaseni
1. Rebuild a restart:
   ```bash
   npm run build && ./container/build.sh
   systemctl --user restart nanoclaw
   ```
2. Overit ze oba ucty jsou viditelne:
   ```bash
   MS365_MCP_TOKEN_CACHE_PATH=/home/rem/nanoclaw/data/ms365-cache/.token-cache.json \
   npx @softeria/ms-365-mcp-server --list-accounts
   ```
3. Agent pak pouziva parametr `account: "user@domena.cz"` v kazdem MS365 tool callu pro vyber uctu.
