#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
	echo "Usage: $0 <ssh-target> <expected-hostname> [source-ref]" >&2
	exit 64
fi

ssh_target=$1
expected_hostname=$2
source_ref=${3:-HEAD}

if [[ ! $ssh_target =~ ^[A-Za-z0-9._:@-]+$ ]]; then
	echo "Invalid SSH target" >&2
	exit 64
fi
if [[ ! $expected_hostname =~ ^[A-Za-z0-9._-]+$ ]]; then
	echo "Invalid expected hostname" >&2
	exit 64
fi

repository_root=$(git rev-parse --show-toplevel)
source_commit=$(git rev-parse --verify "${source_ref}^{commit}")
source_commit_short=${source_commit:0:12}
build_root=$(mktemp -d "${TMPDIR:-/tmp}/iobroker-apple-deploy.XXXXXX")
source_directory="$build_root/source"
artifact_directory="$build_root/artifact"

cleanup() {
	if [[ $build_root == "${TMPDIR:-/tmp}"/iobroker-apple-deploy.* && -d $build_root ]]; then
		rm -rf -- "$build_root"
	fi
}
trap cleanup EXIT

mkdir -p "$source_directory" "$artifact_directory"
git archive --format=tar "$source_commit" | tar -xf - -C "$source_directory"
ln -s "$repository_root/node_modules" "$source_directory/node_modules"

(
	cd "$source_directory"
	npm run check
	npm run build
	npm_config_cache=/tmp/iobroker-apple-npm-cache npm pack --pack-destination "$artifact_directory"
)

package_version=$(node -p "require('$source_directory/package.json').version")
artifact="$artifact_directory/iobroker.apple-$package_version.tgz"
if [[ ! -f $artifact ]]; then
	echo "Expected adapter artifact was not created" >&2
	exit 66
fi
artifact_sha256=$(shasum -a 256 "$artifact" | awk '{print $1}')

actual_hostname=$(ssh -o BatchMode=yes "$ssh_target" hostname)
if [[ $actual_hostname != "$expected_hostname" ]]; then
	echo "Target hostname mismatch" >&2
	exit 67
fi

remote_directory="/opt/iobroker-apple-deploy/$source_commit_short"
remote_artifact="$remote_directory/$(basename "$artifact")"
remote_cache=/tmp/iobroker-apple-adapter-npm-cache

ssh -o BatchMode=yes "$ssh_target" \
	"available_kb=\$(df -Pk /opt/iobroker | awk 'NR==2 {print \$4}'); if [ \"\$available_kb\" -lt 400000 ]; then echo 'Insufficient free space' >&2; exit 68; fi; install -d -m 755 -o iobroker -g iobroker '$remote_directory'"

scp -q "$artifact" "$ssh_target:$remote_artifact"

ssh -o BatchMode=yes "$ssh_target" \
	"test \"\$(sha256sum '$remote_artifact' | awk '{print \$1}')\" = '$artifact_sha256'; chown iobroker:iobroker '$remote_artifact'"

ssh -o BatchMode=yes "$ssh_target" \
	"cd /opt/iobroker && sudo -u iobroker npm install --omit=dev --cache '$remote_cache' '$remote_artifact'"

ssh -o BatchMode=yes "$ssh_target" \
	"cd /opt/iobroker && sudo -u iobroker ./iobroker upload apple"

if ssh -o BatchMode=yes "$ssh_target" \
	"cd /opt/iobroker && sudo -u iobroker ./iobroker object get system.adapter.apple.0 >/dev/null 2>&1"; then
	ssh -o BatchMode=yes "$ssh_target" \
		"cd /opt/iobroker && sudo -u iobroker ./iobroker restart apple.0"
else
	ssh -o BatchMode=yes "$ssh_target" \
		"cd /opt/iobroker && sudo -u iobroker ./iobroker add apple --enabled"
fi

ssh -o BatchMode=yes "$ssh_target" \
	"printf '%s\n' '$source_commit' > '$remote_directory/.source-commit'; chown iobroker:iobroker '$remote_directory/.source-commit'"

echo "DEPLOYED_SOURCE_COMMIT=$source_commit"
echo "DEPLOYED_PACKAGE_VERSION=$package_version"
echo "DEPLOYED_TARGET_HOSTNAME=$actual_hostname"
echo "DEPLOYED_ARTIFACT_SHA256=$artifact_sha256"
