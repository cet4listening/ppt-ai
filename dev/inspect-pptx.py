# -*- coding: utf-8 -*-
"""抽查 pptx 里的字体 / 备注 / 图片 / 自动缩放（集成测试用）"""
import sys, zipfile, re, json, os

path = sys.argv[1]
z = zipfile.ZipFile(path)
slides = sorted(
    (n for n in z.namelist() if re.match(r'^ppt/slides/slide\d+\.xml$', n)),
    key=lambda n: int(re.search(r'(\d+)\.xml$', n).group(1)),
)
out = {'file': os.path.basename(path), 'bytes': os.path.getsize(path), 'slides': len(slides), 'pages': []}
for i, n in enumerate(slides, 1):
    x = z.read(n).decode('utf-8')
    out['pages'].append({
        'i': i,
        'typeface': sorted(set(re.findall(r'typeface="([^"]+)"', x))),
        'normAutofit': '<a:normAutofit' in x,
        'srgbClr': sorted(set(re.findall(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', x)))[:6],
        'pics': len(re.findall(r'<p:pic>', x)),
        'texts': len(re.findall(r'<a:t>', x)),
        'notes': None,
    })
notes = sorted(
    (n for n in z.namelist() if re.match(r'^ppt/notesSlides/notesSlide\d+\.xml$', n)),
    key=lambda n: int(re.search(r'(\d+)\.xml$', n).group(1)),
)
for i, n in enumerate(notes):
    txt = ''.join(re.findall(r'<a:t>([^<]*)</a:t>', z.read(n).decode('utf-8')))
    if i < len(out['pages']):
        out['pages'][i]['notes'] = txt
out['notesFiles'] = len(notes)
out['medias'] = [(i.filename, i.file_size) for i in z.infolist() if i.filename.startswith('ppt/media/') and not i.is_dir()]
print(json.dumps(out, ensure_ascii=False, indent=1))
