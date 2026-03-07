# Jak nainstalovat add-ms365 skill

## 1. Zkopíruj skill do projektu

```bash
cp -r ~/nanoclaw-group/add-ms365-skill /path/to/nanoclaw/.claude/skills/add-ms365
```

Nebo pokud používáš tento projekt přímo:
```bash
cp -r /workspace/group/add-ms365-skill .claude/skills/add-ms365
```

## 2. Spusť skill

V hlavní skupině (main channel) napiš:
```
/add-ms365
```

Claude Code skill provede:
- Kontrolu prerekvizit (zeptá se na Azure credentials)
- Aplikování změn do kódu (Dockerfile, agent-runner, container-runner)
- Rebuild Docker image
- Restart služby

## 3. Přidej credentials do .env

```bash
MS365_CLIENT_ID=xxxx-xxxx-xxxx-xxxx
MS365_CLIENT_SECRET=your-secret-value
MS365_TENANT_ID=xxxx-xxxx-xxxx-xxxx
# Pro osobní Microsoft účet: MS365_TENANT_ID=consumers
```

## Co skill změní

| Soubor | Změna |
|--------|-------|
| `container/Dockerfile` | Přidá `@softeria/ms-365-mcp-server` do globálních npm instalací |
| `container/agent-runner/src/index.ts` | Přidá `ms365` MCP server + `mcp__ms365__*` do allowedTools |
| `src/container-runner.ts` | Přidá MS365 credentials do `readSecrets()` |

## Po instalaci

Agent bude rozumět dotazům jako:
- "zkontroluj moje emaily"
- "co mám dnes v kalendáři?"
- "vytvoř schůzku zítra v 10:00"
- "pošli email Martinovi..."

Při prvním použití agent provede **device code flow** — zobrazí URL a kód, které zadáš do prohlížeče pro přihlášení k Microsoft účtu. Token se uloží a příště to nebude potřeba (do restartu kontejneru).
