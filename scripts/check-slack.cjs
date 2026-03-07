const { readFileSync } = require("fs");
const lines = readFileSync(".env", "utf8").split("\n");
const env = {};
for (const l of lines) {
  if (!l || l.startsWith("#")) continue;
  const idx = l.indexOf("=");
  if (idx > 0) env[l.slice(0, idx)] = l.slice(idx + 1);
}
const token = env.SLACK_BOT_TOKEN;

async function main() {
  const hist = await fetch("https://slack.com/api/conversations.history?channel=C0AK7DZQL20&limit=10", {
    headers: { Authorization: "Bearer " + token }
  }).then(r => r.json());

  if (!hist.ok) { console.log("history error:", hist.error); }
  else {
    console.log("=== Messages in #dev ===");
    for (const m of (hist.messages || [])) {
      console.log(new Date(parseFloat(m.ts) * 1000).toISOString(), m.user || m.bot_id, (m.text || "").substring(0, 100), "subtype:", m.subtype);
    }
  }

  const auth = await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: "Bearer " + token }
  });
  console.log("\n=== OAuth scopes ===");
  console.log("x-oauth-scopes:", auth.headers.get("x-oauth-scopes"));
  const authData = await auth.json();
  console.log("bot user:", authData.user_id, authData.user);
}

main().catch(console.error);
