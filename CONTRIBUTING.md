# Contributing

Thanks for helping improve Racelytic. Changes should preserve the historical
record, keep championship-specific rules explicit and remain usable without a
frontend framework.

## Before starting

- Search existing issues and pull requests for related work.
- Keep unrelated refactors out of focused fixes.
- For data corrections, include a reliable source and identify the affected
  championship, season, event and session.
- Do not commit credentials, source caches, database backups or files under
  `tmp/`.

## Development

Follow the setup in `README.md`, then run the application with:

```bash
npm run dev
```

Shared page-shell, series-configuration or route-generation changes require:

```bash
npm run build:frontend
```

Generated manifests should be updated through the build command rather than
edited manually.

For archive updates, follow [Data maintenance](docs/data-maintenance.md).
Collector changes should keep the versioned CSV files, import mapping and
published tables consistent. Review row-count changes before publishing; a
ratings rebuild follows the import rather than taking part in the table rename.

## Pull requests

A pull request should explain:

- what changed and why;
- the source for any historical-data correction;
- how the change was tested;
- any migration, deployment or data-refresh requirement.

Run the required checks before submitting:

```bash
npm test
npm run check
```

Add tests when behaviour, parsing, calculations, routes, SEO or archive
contracts change. Avoid tests that only repeat static implementation details.

Update the relevant Markdown guide when changing a command, data source,
supported question type or recovery procedure. Keep source attribution beside
the affected assets.

## Style

- Match the existing CommonJS and framework-free frontend conventions.
- Prefer small modules with explicit series configuration.
- Escape archive or user-controlled values before inserting HTML.
- Preserve accessible names, keyboard operation, responsive layouts and
  reduced-motion behaviour.
- Keep WEC calculations entry-first and class-aware.

## Rights and attribution

Only contribute material you are allowed to share. Preserve existing source,
licence and attribution notices. A contribution does not change the terms that
apply to third-party datasets or assets.
