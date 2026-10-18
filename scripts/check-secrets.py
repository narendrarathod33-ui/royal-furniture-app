#!/usr/bin/env python3
"""Conservative secret-pattern scan; report locations, never matched values."""
import re
import subprocess
import sys
from pathlib import Path

PATTERNS = {
    'private key': r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'provider key': r'\b(?:AKIA[0-9A-Z]{16}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[A-Za-z0-9_-]{35}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})',
    'JWT': r'\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
    'database URL': r'(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis)://[^\s\x22\x27<>]+',
    'URL credentials': r'https?://[^\s/:@]+:[^\s/@]+@',
    'credential assignment': r'''(?i)["']?\b(?:api[_-]?key|client[_-]?secret|jwt[_-]?secret|service[_-]?role[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|aws_secret_access_key)["']?\s*[:=]\s*["'](?!REPLACE_ME|YOUR_|<|\$\{)[^"'\s]{8,}["']''',
    'sensitive public env': r'\b(?:EXPO_PUBLIC_|NEXT_PUBLIC_|REACT_APP_)[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|DATABASE_URL|PASSWORD|ACCESS_TOKEN)[A-Z0-9_]*\b',
}
checks = [(name, re.compile(pattern)) for name, pattern in PATTERNS.items()]

def scan(label, data):
    if b'\0' in data:
        return 0
    text = data.decode('utf-8', errors='replace')
    count = 0
    for name, pattern in checks:
        for match in pattern.finditer(text):
            line = text.count('\n', 0, match.start()) + 1
            print(f'{label}:{line}: potential {name} (value redacted)')
            count += 1
    return count

failures = 0
files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).split(b'\0')
for entry in set(files):
    if entry:
        path = Path(entry.decode())
        if path.is_file():
            failures += scan(str(path), path.read_bytes())
if '--history' in sys.argv:
    objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all']).decode().splitlines()
    for entry in objects:
        oid, _, path = entry.partition(' ')
        if subprocess.check_output(['git', 'cat-file', '-t', oid]).strip() == b'blob':
            failures += scan(f'history:{oid[:12]}:{path}', subprocess.check_output(['git', 'cat-file', 'blob', oid]))
print(f'Secret scan: {failures} potential findings. Pattern scanning is not a guarantee.')
sys.exit(1 if failures else 0)
