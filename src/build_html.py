#!/usr/bin/env python3
"""把 data.json + style.css + app.js 内联成单文件 index.html（输出到 ../dist/）。"""
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)

def read(name):
    with open(os.path.join(BASE, name), encoding='utf-8') as f:
        return f.read()

data = json.loads(read('data.json'))
html = read('index.template.html')
css = read('style.css')
js = read('app.js')
blob = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = html.replace('{{CSS}}', css).replace('{{DATA}}', blob).replace('{{JS}}', js)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist', 'index.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print('bytes', len(html.encode()), 'words', len(data['core']) + len(data['bulk']))
