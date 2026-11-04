"""Prüft ios/CraftWorld.xcodeproj/project.pbxproj: Syntax (OpenStep-Plist),
eindeutige IDs, alle Verweise vorhanden, referenzierte Dateien existieren."""
import os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'ios')
src = open(os.path.join(ROOT, 'CraftWorld.xcodeproj', 'project.pbxproj'), encoding='utf-8').read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
src = re.sub(r'^//.*$', '', src, flags=re.M)
i = 0

def ws():
    global i
    while i < len(src) and src[i] in ' \t\r\n':
        i += 1

def token():
    global i
    ws()
    if src[i] == '"':
        j = i + 1
        out = ''
        while src[j] != '"':
            if src[j] == '\\':
                out += src[j + 1]; j += 2
            else:
                out += src[j]; j += 1
        i = j + 1
        return out
    m = re.match(r'[A-Za-z0-9_$./\-:<>]+', src[i:])
    if not m:
        raise SyntaxError('Unerwartetes Zeichen %r bei %d: %r' % (src[i], i, src[i:i + 40]))
    i += m.end()
    return m.group(0)

def value():
    global i
    ws()
    c = src[i]
    if c == '{':
        i += 1; d = {}
        while True:
            ws()
            if src[i] == '}':
                i += 1; return d
            k = token(); ws()
            assert src[i] == '=', 'erwarte = bei %d' % i
            i += 1
            if k in d:
                raise SyntaxError('Doppelter Schlüssel ' + k)
            d[k] = value(); ws()
            assert src[i] == ';', 'erwarte ; bei %d: %r' % (i, src[i:i + 30])
            i += 1
    if c == '(':
        i += 1; a = []
        while True:
            ws()
            if src[i] == ')':
                i += 1; return a
            a.append(value()); ws()
            if src[i] == ',':
                i += 1
    return token()

root = value()
ws()
assert i == len(src), 'Restinhalt nach Ende'
objs = root['objects']
errors = []
ids = set(objs)
for k in ids:
    if not re.fullmatch(r'[0-9A-F]{24}', k):
        errors.append('ID ungültig: ' + k)

def refs(v):
    if isinstance(v, dict):
        for x in v.values(): yield from refs(x)
    elif isinstance(v, list):
        for x in v: yield from refs(x)
    elif isinstance(v, str) and re.fullmatch(r'[0-9A-F]{24}', v):
        yield v

for k, o in objs.items():
    for r in refs(o):
        if r not in ids:
            errors.append('%s verweist auf fehlendes Objekt %s' % (k, r))
if root['rootObject'] not in ids:
    errors.append('rootObject fehlt')

# Pfade auflösen
parent = {}
for k, o in objs.items():
    if o.get('isa') == 'PBXGroup':
        for c in o.get('children', []):
            parent[c] = k
def resolve(k):
    o = objs[k]
    st = o.get('sourceTree')
    path = o.get('path', '')
    if st == 'SOURCE_ROOT':
        return os.path.normpath(os.path.join(ROOT, path))
    if st == '<group>':
        base = resolve(parent[k]) if k in parent else ROOT
        return os.path.normpath(os.path.join(base, path))
    return None
for k, o in objs.items():
    if o.get('isa') == 'PBXFileReference':
        p = resolve(k)
        if p and not os.path.exists(p):
            errors.append('Datei fehlt: ' + p)
        elif p:
            print('  ✓', os.path.relpath(p, os.path.join(ROOT, '..')))
for k, o in objs.items():
    if o.get('isa') == 'PBXBuildFile' and o['fileRef'] not in ids:
        errors.append('BuildFile ohne Datei ' + k)

print('Objekte:', len(objs))
if errors:
    print('\n'.join('  ✗ ' + e for e in errors)); sys.exit(1)
print('Xcode-Projekt ist gültig.')
