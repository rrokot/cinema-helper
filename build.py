import json
from os import environ
from pathlib import Path
from textwrap import indent
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile

USERSCRIPT_FILENAME = "cinema-helper.user.js"
DEFAULT_RELEASE_REPOSITORY = "rrokot/cinema-helper"


def build_and_verify_xpi(project_dir, staged_xpi):
    manifest_path = project_dir / "manifest.json"
    license_path = project_dir / "LICENSE"
    source_files = sorted(path for path in (project_dir / "src").rglob("*") if path.is_file())
    archive_entries = {
        path.relative_to(project_dir).as_posix(): path
        for path in [manifest_path, license_path, *source_files]
    }

    with ZipFile(staged_xpi, "w", ZIP_DEFLATED) as archive:
        for entry_name, source_path in archive_entries.items():
            archive.write(source_path, entry_name)

    with ZipFile(staged_xpi) as archive:
        if archive.testzip() is not None:
            raise ValueError("Corrupt package")
        for entry_name, source_path in archive_entries.items():
            if archive.read(entry_name) != source_path.read_bytes():
                raise ValueError(f"Package mismatch: {source_path}")


def render_userscript(project_dir, archive, manifest):
    content_script = manifest["content_scripts"][0]
    shared_scripts = [path for path in content_script["js"] if path not in {
        "src/shared/webextension.js", "src/shared/kinogo.js",
    }]
    styles = "\n".join(archive.read(path).decode("utf-8") for path in content_script["css"])
    connect_hosts = [urlsplit(pattern).netloc for pattern in manifest["host_permissions"]]
    release_repository = environ.get("GITHUB_REPOSITORY", DEFAULT_RELEASE_REPOSITORY)
    release_url = f"https://github.com/{release_repository}/releases/latest/download/{USERSCRIPT_FILENAME}"
    grants = [
        "GM.xmlHttpRequest",
        "GM.getValues",
        "GM.setValues",
        "GM.listValues",
        "GM.deleteValues",
        "GM.addValueChangeListener",
        "GM_addStyle",
        "GM_registerMenuCommand",
    ]
    metadata = [
        "// ==UserScript==",
        f"// @name         {manifest['name']}",
        "// @namespace    https://github.com/rrokot/cinema",
        f"// @version      {manifest['version']}",
        f"// @updateURL    {release_url}",
        f"// @downloadURL  {release_url}",
        "// @license      MIT",
        f"// @description  {manifest['description']}",
        "// @match        https://*.kinopoisk.ru/*",
        "// @match        https://*.myshows.me/*",
        *(f"// @connect      {host}" for host in connect_hosts),
        *(f"// @grant        {grant}" for grant in grants),
        "// @run-at       document-idle",
        "// @sandbox      DOM",
        "// @noframes",
        "// ==/UserScript==",
    ]
    body = [
        '"use strict";',
        f"GM_addStyle({json.dumps(styles)});",
        archive.read("src/shared/kinogo.js").decode("utf-8").rstrip(),
        (project_dir / "userscript" / "platform.js").read_text(encoding="utf-8").rstrip(),
        *(archive.read(path).decode("utf-8").rstrip() for path in shared_scripts),
    ]
    license_text = archive.read("LICENSE").decode("utf-8").rstrip()
    license_comment = f"/*\n{license_text}\n*/"
    return "\n".join([
        *metadata, "", license_comment, "", "(() => {", indent("\n\n".join(body), "  "), "})();", "",
    ])


def build_artifacts():
    project_dir = Path(__file__).resolve().parent
    dist_dir = project_dir / "dist"
    dist_dir.mkdir(exist_ok=True)

    xpi_path = dist_dir / "cinema-helper.xpi"
    staged_xpi = xpi_path.with_suffix(".xpi.tmp")
    script_path = dist_dir / USERSCRIPT_FILENAME
    staged_script = script_path.with_suffix(".js.tmp")
    try:
        build_and_verify_xpi(project_dir, staged_xpi)
        with ZipFile(staged_xpi) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            script_bytes = render_userscript(project_dir, archive, manifest).encode("utf-8")
        staged_script.write_bytes(script_bytes)
        if staged_script.read_bytes() != script_bytes:
            raise ValueError(f"Userscript mismatch: {staged_script}")

        staged_script.replace(script_path)
        staged_xpi.replace(xpi_path)
    finally:
        staged_script.unlink(missing_ok=True)
        staged_xpi.unlink(missing_ok=True)

    for artifact in (xpi_path, script_path):
        print(f"Built and verified {artifact} (version {manifest['version']})")


if __name__ == "__main__":
    build_artifacts()
