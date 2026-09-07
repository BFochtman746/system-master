from __future__ import annotations
import os, subprocess, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
MODES=['full-tests','predecessor-tests','compile','demo','adversarial','recovery','activation','diff']

def main():
    env=dict(os.environ); env['PYTHONPATH']=str(ROOT)
    for mode in MODES:
        proc=subprocess.run([sys.executable,str(ROOT/'qualification_impl009.py'),mode],cwd=ROOT,env=env)
        if proc.returncode:
            return proc.returncode
    return subprocess.run([sys.executable,str(ROOT/'aggregate_qualification_impl009.py')],cwd=ROOT,env=env).returncode

if __name__=='__main__':
    raise SystemExit(main())
