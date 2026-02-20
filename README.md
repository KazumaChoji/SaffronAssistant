# SaffronAssistant

a cool macos overlay assistant. Slides in from the edge of the screen with a hotkey (cmd + `), has an AI chat agent (Claude), notes, todos, a web browser, a calendar habit tracker, a timer/stopwatch/clock page with a flash screen overlay when timer is done. Everything lives locally in a SQLite database.

## Setup

Requires Node.js 20+ and pnpm 8+.

```bash
git clone https://github.com/KazumaChoji/SaffronAssistant.git
cd SaffronAssistant
pnpm install
pnpm --filter desktop dev
```

On first launch, go to Settings and add your **Anthropic API key** (required). You can also add a **Replicate key** if you want image generation.

## License

MIT
