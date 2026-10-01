#!/usr/bin/env bash
# Moves collected games between pipeline/data/<patch>/ and the "data-<patch>" GitHub release.
# Files are gzipped, then encrypted with DATA_KEY (AES-256, key stretched with PBKDF2), so the raw
# per-game records stay private even though the repository and its releases are public.
#
#   bash pipeline/data-release.sh restore <patch>   download and decrypt into pipeline/data/<patch>/
#   bash pipeline/data-release.sh save <patch>      encrypt and upload, replacing what's there
#
# Needs: gh (logged in, or GH_TOKEN), openssl, and DATA_KEY (in the environment or the repo's .env).
set -euo pipefail

mode=${1:?usage: data-release.sh restore|save <patch>}
patch=${2:?usage: data-release.sh restore|save <patch>}
repo=${GITHUB_REPOSITORY:-omeaga1/hexcards-2}
root=$(cd "$(dirname "$0")/.." && pwd)
dir="$root/pipeline/data/$patch"

if [[ -z "${DATA_KEY:-}" && -f "$root/.env" ]]; then
  DATA_KEY=$(sed -n 's/^DATA_KEY=//p' "$root/.env")
fi
if [[ -z "${DATA_KEY:-}" ]]; then
  echo "DATA_KEY is not set. Add it to .env locally or to the repository's Actions secrets." >&2
  exit 1
fi
export DATA_KEY
cipher=(-aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:DATA_KEY)

mkdir -p "$dir"
cd "$dir"

case "$mode" in
  restore)
    if ! gh release download "data-$patch" --repo "$repo" --pattern '*.ndjson.gz.enc' --clobber 2>/dev/null; then
      echo "No collected games yet for patch $patch."
      exit 0
    fi
    for f in *.ndjson.gz.enc; do
      openssl enc -d "${cipher[@]}" -in "$f" | gunzip > "${f%.gz.enc}"
      rm "$f"
    done
    wc -l *.ndjson
    ;;
  save)
    shopt -s nullglob
    files=(*.ndjson)
    if (( ${#files[@]} == 0 )); then
      echo "Nothing to save in $dir."
      exit 0
    fi
    for f in "${files[@]}"; do
      gzip -c "$f" | openssl enc -e "${cipher[@]}" -out "$f.gz.enc"
    done
    gh release view "data-$patch" --repo "$repo" >/dev/null 2>&1 || \
      gh release create "data-$patch" --repo "$repo" --prerelease \
        --title "Collected games, patch $patch" \
        --notes "Encrypted working data for the Data workflow (ranked games used to compute builds). Not an app release and not readable without the project's key."
    gh release upload "data-$patch" *.ndjson.gz.enc --repo "$repo" --clobber
    # Remove any unencrypted copies left from before encryption.
    for old in $(gh release view "data-$patch" --repo "$repo" --json assets --jq '.assets[].name' | grep -E '\.ndjson\.gz$' || true); do
      gh release delete-asset "data-$patch" "$old" --repo "$repo" --yes
    done
    rm -f *.ndjson.gz.enc
    ;;
  *)
    echo "Unknown mode: $mode (use restore or save)" >&2
    exit 1
    ;;
esac
