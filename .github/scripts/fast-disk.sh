#!/usr/bin/env bash
# Mounts each given folder (relative to the repository root) on the runner's fast disk, keeping what the checkout
# put there. A bind mount (or tmpfs mount) keeps every path the same for Douze, actions/cache, upload-artifact and
# MSBuild, which sees a plain folder.
#   FAST_DISK=mnt    bind mounts a folder of /mnt, the VM's temporary disk
#   FAST_DISK=tmpfs  mounts a RAM-backed tmpfs
#   FAST_DISK=none   leaves the folders on the workspace disk
set -euo pipefail
mode="${FAST_DISK:-none}"
[[ "$mode" == none || "$RUNNER_OS" != Linux ]] && { echo "Folders stay on the workspace disk."; exit 0; }
for dir in "$@"; do
  mkdir -p "$dir"
  if [[ "$mode" == tmpfs ]]; then
    staged=$(mktemp -d)
    cp -a "$dir/." "$staged/"
    sudo mount -t tmpfs -o "size=${FAST_DISK_TMPFS_SIZE:-8g},mode=0755,uid=$(id -u),gid=$(id -g)" tmpfs "$dir"
    cp -a "$staged/." "$dir/"
    rm -rf "$staged"
  else
    target="/mnt/fast/$(echo "$dir" | tr '/' '_')"
    sudo mkdir -p "$target"
    sudo chown "$(id -u):$(id -g)" "$target"
    cp -a "$dir/." "$target/"
    sudo mount --bind "$target" "$dir"
  fi
  echo "$dir -> $(findmnt -no SOURCE,FSTYPE --target "$dir" | head -1)"
done
