# Throwaway disk probe: times many small files (like a Douze web root) and one large file on a directory.
# Usage: python probe.py <label> <dir> [files] [size_bytes]
import os, sys, time, shutil, subprocess, platform
from concurrent.futures import ThreadPoolExecutor

label, root = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 60000
size = int(sys.argv[4]) if len(sys.argv) > 4 else 20000
base = os.path.join(root, f"disk-probe-{os.getpid()}")
data = os.urandom(size)
threads = os.cpu_count() or 4
per_dir = 200

def drop_caches():
    s = platform.system()
    try:
        if s == "Linux":
            subprocess.run(["sudo", "sh", "-c", "sync; echo 3 > /proc/sys/vm/drop_caches"], check=False)
        elif s == "Darwin":
            subprocess.run(["sudo", "purge"], check=False)
    except Exception:
        pass

def timed(fn):
    t = time.perf_counter(); fn(); return time.perf_counter() - t

def write_chunk(c):
    d = os.path.join(base, str(c))
    os.makedirs(d, exist_ok=True)
    for i in range(c * per_dir, min(n, (c + 1) * per_dir)):
        with open(os.path.join(d, f"{i}.html"), "wb") as f:
            f.write(data)

chunks = range((n + per_dir - 1) // per_dir)
os.makedirs(base, exist_ok=True)
t_write = timed(lambda: list(ThreadPoolExecutor(threads).map(write_chunk, chunks)))
t_sync = timed(lambda: os.sync() if hasattr(os, "sync") else None)
drop_caches()

def stat_walk():
    c = 0
    for dp, dn, fn in os.walk(base):
        for f in fn:
            os.stat(os.path.join(dp, f)); c += 1
    assert c == n, c
t_walk = timed(stat_walk)
drop_caches()

def read_chunk(c):
    d = os.path.join(base, str(c))
    for f in os.listdir(d):
        with open(os.path.join(d, f), "rb") as h:
            h.read()
t_read = timed(lambda: list(ThreadPoolExecutor(threads).map(read_chunk, chunks)))
t_rm = timed(lambda: shutil.rmtree(base))

# Sequential: 2 GB in 4 MB blocks, fsync, then read back cold.
big = os.path.join(root, f"disk-probe-big-{os.getpid()}")
block = os.urandom(4 << 20)
def seq_write():
    with open(big, "wb") as f:
        for _ in range(512): f.write(block)
        f.flush(); os.fsync(f.fileno())
t_seqw = timed(seq_write)
drop_caches()
def seq_read():
    with open(big, "rb") as f:
        while f.read(4 << 20): pass
t_seqr = timed(seq_read)
os.remove(big)

mb = n * size / 1e6
line = (f"| {label} | `{root}` | {t_write:.1f} | {t_sync:.1f} | {t_walk:.1f} | {t_read:.1f} | {t_rm:.1f} "
        f"| {2048/t_seqw:.0f} | {2048/t_seqr:.0f} |")
print(line)
with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as s:
    s.write(line + "\n")
