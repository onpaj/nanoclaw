#!/bin/bash
# Self-Improvement Activator Hook
# Triggers on UserPromptSubmit — reminds agent to evaluate learnings after tasks
set -e

cat << 'EOF'
<self-improvement-reminder>
After completing this task, evaluate if extractable knowledge emerged:
- User corrected you or provided new personal info?
- Non-obvious solution discovered through investigation?
- Tool/API failed unexpectedly?
- User requested a capability you don't have?

If yes: Log to /workspace/group/.learnings/ using the format in your instructions.
If broadly applicable (recurring pattern, user preference): Promote to /workspace/group/CLAUDE.md.
</self-improvement-reminder>
EOF
