#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
	echo "Usage: $0 <ssh-target>" >&2
	exit 64
fi

ssh_target=$1
if [[ ! $ssh_target =~ ^[A-Za-z0-9._:@-]+$ ]]; then
	echo "Invalid SSH target" >&2
	exit 64
fi

repository_root=$(git rev-parse --show-toplevel)
cd "$repository_root"

if [[ -n $(git status --porcelain) ]]; then
	echo "Refusing to deploy a dirty worktree" >&2
	exit 65
fi

source_commit=$(git rev-parse HEAD)
source_commit_short=$(git rev-parse --short=12 HEAD)
remote_root=/opt/iobroker-apple-poc
remote_directory="$remote_root/$source_commit_short"
remote_private_directory=/opt/iobroker-apple-poc-private
remote_cache=/tmp/iobroker-apple-poc-npm-cache

ssh -o BatchMode=yes "$ssh_target" \
	"if [ -e '$remote_directory' ]; then echo 'PoC target already exists' >&2; exit 73; fi; install -d -o iobroker -g iobroker '$remote_directory'"

ssh -o BatchMode=yes "$ssh_target" \
	"install -d -m 700 -o iobroker -g iobroker '$remote_private_directory'"

git archive --format=tar HEAD | ssh -o BatchMode=yes "$ssh_target" "tar -xf - -C '$remote_directory'"

ssh -o BatchMode=yes "$ssh_target" \
	"printf '%s\n' '$source_commit' > '$remote_directory/.source-commit'; chown -R iobroker:iobroker '$remote_directory'"

ssh -o BatchMode=yes "$ssh_target" \
	"cd '$remote_directory' && sudo -u iobroker npm ci --cache '$remote_cache'"

ssh -o BatchMode=yes "$ssh_target" \
	"cd '$remote_directory' && sudo -u iobroker npm run poc:test"

ssh -o BatchMode=yes "$ssh_target" \
	"cd '$remote_directory' && sudo -u iobroker npm run poc:discovery:low-level"

echo "DEPLOYED_SOURCE_COMMIT=$source_commit"
echo "DEPLOYED_POC_DIRECTORY=$remote_directory"
