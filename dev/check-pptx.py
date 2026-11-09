# -*- coding: utf-8 -*-
"""dev/check-pptx.py —— 校验导出的 pptx 结构（用 python-pptx + zipfile）

用法：
  python dev/check-pptx.py dev/out/native.pptx --expect-slides 9
  python dev/check-pptx.py dev/out/image.pptx --expect-slides 9 --mode image
"""
import io
import re
import sys
import zipfile

from pptx import Presentation
from pptx.util import Emu

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def main():
    path = sys.argv[1]
    expect = None
    mode = 'native'
    args = sys.argv[2:]
    for i, a in enumerate(args):
        if a == '--expect-slides':
            expect = int(args[i + 1])
        if a == '--mode':
            mode = args[i + 1]

    report = {'file': path, 'checks': [], 'warn': []}

    def check(name, ok, detail=''):
        report['checks'].append({'name': name, 'ok': bool(ok), 'detail': str(detail)})

    zf = zipfile.ZipFile(path)
    names = zf.namelist()
    slide_names = sorted([n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n)],
                         key=lambda s: int(re.findall(r'\d+', s)[0]))
    notes = [n for n in names if re.match(r'ppt/notesSlides/notesSlide\d+\.xml$', n)]

    check('是 zip 且含 [Content_Types].xml', '[Content_Types].xml' in names, f'{len(names)} 个条目')
    check('含 ppt/slides/slide1.xml', 'ppt/slides/slide1.xml' in names, f'{len(slide_names)} 页')
    if expect is not None:
        check(f'页数 = {expect}', len(slide_names) == expect, f'实际 {len(slide_names)}')

    # 每页都有 notes？
    check('每页有 notesSlide', len(notes) >= len(slide_names), f'{len(notes)} 个 notes')

    prs = Presentation(path)
    w, h = prs.slide_width, prs.slide_height
    ratio = w / float(h) if h else 0
    check('16:9 宽高比', abs(ratio - 16 / 9.0) < 0.005,
          f'{Emu(w).inches:.3f} × {Emu(h).inches:.3f} in (ratio {ratio:.4f})')
    check('python-pptx 可打开且页数一致', len(prs.slides) == len(slide_names),
          f'{len(prs.slides)} 页')

    # ---- 逐页文本 / 图片 ----
    total_text = 0
    pics = 0
    pics_per_slide = []
    for idx, slide in enumerate(prs.slides, 1):
        texts = []
        npic = 0
        for sh in slide.shapes:
            if sh.shape_type == 13 or sh.__class__.__name__ == 'Picture':
                npic += 1
            if sh.has_text_frame:
                t = sh.text_frame.text.strip()
                if t:
                    texts.append(t)
        pics += npic
        pics_per_slide.append(npic)
        total_text += sum(len(t) for t in texts)
        if idx <= 2 or idx == len(prs.slides):
            report.setdefault('samples', []).append({
                'slide': idx, 'pictures': npic,
                'text': (' | '.join(texts))[:160]
            })
        if slide.has_notes_slide:
            nt = slide.notes_slide.notes_text_frame.text.strip()
            if idx == 1:
                check('第 1 页 notes 非空', len(nt) > 0, nt[:80])
    report['pictures'] = {'total': pics, 'perSlide': pics_per_slide}
    report['textChars'] = total_text

    if mode == 'native':
        check('native：有可编辑文本', total_text > 200, f'{total_text} 字符')
        # 抽查 slide1.xml：自动缩放、背景色、字号
        xml1 = zf.read('ppt/slides/slide1.xml').decode('utf-8', 'replace')
        check('slide1 有 <a:normAutofit/> (fit:shrink)', '<a:normAutofit' in xml1, '')
        check('slide1 有背景 <p:bg>', '<p:bg>' in xml1, '')
        check('slide1 背景为 srgbClr', bool(re.search(r'<p:bg>.*?<a:srgbClr val="[0-9A-F]{6}"', xml1, re.S)), '')
        # 字号自适应收缩：>=7 条 → 14pt(1400)，5–6 条 → 16pt(1600)，<=4 条 → 18pt(1800)
        # 测试 deck 里含 8 条要点的页，因此全篇应出现 1400；正文任何字号都不该低于 14pt
        per_slide_sizes = {}
        all_sizes = set()
        for n in slide_names:
            x = zf.read(n).decode('utf-8', 'replace')
            sizes = sorted(set(int(s) for s in re.findall(r'sz="(\d+)"', x)))
            per_slide_sizes[n.split('/')[-1]] = sizes
            all_sizes.update(sizes)
        report['fontSizes'] = per_slide_sizes
        check('有条目较多的页把字号收缩到 14pt（1400 出现）', 1400 in all_sizes,
              f'全篇 sz={sorted(all_sizes)}')
        body_sizes = [s for s in all_sizes if s != 900]
        check('没有小到看不清的字（正文/说明 >= 11pt）',
              bool(body_sizes) and min(body_sizes) >= 1100,
              f'非页脚字号={sorted(body_sizes)}')
        bgs = re.findall(r'<p:bg>.*?</p:bg>', xml1, re.S)
        report['bgSnippet'] = bgs[0][:200] if bgs else None
        # 线条宽度 0 是否写成 noFill（确认不出现 width=0 的可见描边）
        widths = re.findall(r'<a:ln w="(\d+)"', xml1)
        report['lineWidths'] = sorted(set(widths))
    else:
        check('image：每页都有整页图片', pics == len(slide_names) and all(p >= 1 for p in pics_per_slide),
              f'{pics} 张 / {len(slide_names)} 页: {pics_per_slide}')
        check('image：无文字（不可编辑，整页位图）', total_text == 0, f'{total_text} 字符')

    # ---- 几何越界检查（防止内容跑出页面） ----
    tol = 25400  # 0.02 inch 容差
    oob = []
    oob_hard = []
    empty_text_boxes = []
    for idx, slide in enumerate(prs.slides, 1):
        for sh in slide.shapes:
            try:
                l, t = sh.left, sh.top
                wd, ht = sh.width, sh.height
            except Exception:
                continue
            if None in (l, t, wd, ht):
                continue
            is_pic = sh.shape_type == 13 or sh.__class__.__name__ == 'Picture'
            is_text = sh.has_text_frame and sh.text_frame.text.strip() != ''
            if l < -tol or t < -tol or l + wd > prs.slide_width + tol or t + ht > prs.slide_height + tol:
                item = {
                    'slide': idx, 'shape': str(sh.shape_type), 'kind': 'text' if is_text else ('picture' if is_pic else 'decor'),
                    'left': round(Emu(l).inches, 3), 'top': round(Emu(t).inches, 3),
                    'right': round(Emu(l + wd).inches, 3), 'bottom': round(Emu(t + ht).inches, 3),
                }
                (oob_hard if (is_pic or is_text) else oob).append(item)
            if sh.has_text_frame and sh.text_frame.text.strip() and (wd <= 0 or ht <= 0):
                empty_text_boxes.append({'slide': idx, 'text': sh.text_frame.text[:30]})
    report['outOfBounds'] = oob
    report['outOfBoundsHard'] = oob_hard
    report['zeroSizeTextBoxes'] = empty_text_boxes
    check('文字/图片元素在页面范围内', len(oob_hard) == 0, f'{len(oob_hard)} 个硬越界')
    check('装饰色块越界仅出血', True, f'{len(oob)} 个装饰元素出血（允许）')
    check('文字框尺寸有效', len(empty_text_boxes) == 0, f'{len(empty_text_boxes)} 个零尺寸文字框')

    # ---- 每页文字是否带自动缩放（fit:'shrink' → normAutofit），防溢出 ----
    autofit_pages = []
    for n in slide_names:
        xml = zf.read(n).decode('utf-8', 'replace')
        if '<a:normAutofit' in xml:
            autofit_pages.append(n)
    check('文字框带自动缩放（防溢出）', mode != 'native' or len(autofit_pages) >= len(slide_names) - 1,
          f'{len(autofit_pages)}/{len(slide_names)} 页含 <a:normAutofit/>' + ('（图片版无文字，不适用）' if mode != 'native' else ''))

    # ---- 体积分布 ----
    sizes = sorted(((i.file_size, i.filename) for i in zf.infolist()), reverse=True)[:8]
    report['largest'] = [f'{n} {s / 1024:.0f}KB' for s, n in sizes]
    report['totalUncompressedKB'] = round(sum(i.file_size for i in zf.infolist()) / 1024)

    failed = [c for c in report['checks'] if not c['ok']]
    report['state'] = 'PASS' if not failed else 'FAIL'
    import json
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
