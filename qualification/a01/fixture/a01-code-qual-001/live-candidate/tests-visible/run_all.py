from __future__ import annotations
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, text=True)
    if p.returncode:
        raise SystemExit(p.returncode)

run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests-visible', '-p', 'test_*.py'])
run(['node', 'tests-visible/visible-js.mjs'])
out = ROOT / '.visible-java'
out.mkdir(exist_ok=True)
run(['javac', '-d', str(out), 'java/src/main/java/benchmark/RequestKey.java', 'tests-visible/VisibleRequestKey.java'])
run(['java', '-cp', str(out), 'VisibleRequestKey'])
print('VISIBLE_SUITE_PASS')
