# Development

## Tests

Run `npm test` from the repository root. If dependencies are missing, run `npm ci` first.

## Release workflow

Run `python build.py` to build `dist/cinema-helper.xpi` and `dist/cinema-helper.user.js`.
After behavior or UI changes, increment `version` in `manifest.json` before building.
Both artifacts use that version.
Push a Git tag of the form `v<version>` to publish both files through GitHub Releases.
The userscript checks that repository's latest release for updates.

When its `ExtensionSettings` policy points to `dist/cinema-helper.xpi`, Firefox Developer Edition installs the package at browser startup.
Do not use a proxy file in the Firefox profile to install from the project folder.
Distinguish a verified package build from a verified installation in Firefox.
