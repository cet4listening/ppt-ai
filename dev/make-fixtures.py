#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 dev/fixtures.js：把真实 docx / pptx / pdf / png 以 base64 内联，
供 dev/files-test.html 在 file:// 下无网络、无 fetch 地构造 File 对象。"""
import base64, io, json, os, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fixtures.js')


def b64(b):
    return base64.b64encode(b).decode('ascii')


# ---------------------------------------------------------------- docx
def make_docx():
    from docx import Document
    d = Document()
    d.add_heading('第一单元 Hello!', level=1)
    d.add_paragraph('Good morning, class! 同学们早上好。')
    d.add_paragraph('今天我们要学习：字母 A、B、C，以及问候语。')
    p = d.add_paragraph('重点词汇：')
    p.add_run(' apple / banana / cat ')
    d.add_paragraph('课堂活动：两人一组互相问候。')
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- pptx
def make_pptx():
    from pptx import Presentation
    prs = Presentation()
    blank = prs.slide_layouts[1]  # Title and Content
    data = [
        ('Unit 1 Greetings', ['Hello!', 'Good morning!', 'How are you?']),
        ('字母表 ABC', ['A - apple', 'B - banana', 'C - cat']),
        ('课堂练习', ['跟读三遍', '两人对话', '上台表演']),
    ]
    for title, items in data:
        s = prs.slides.add_slide(blank)
        s.shapes.title.text = title
        body = s.placeholders[1].text_frame
        body.text = items[0]
        for it in items[1:]:
            body.add_paragraph().text = it
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- pdf
def make_pdf():
    pages = [
        ['Hello PPT AI', 'This is a test PDF for text extraction.', 'Page one content line A.'],
        ['Second Page', 'Numbers 12345 and letters ABC.', 'The quick brown fox jumps over the lazy dog.'],
    ]
    objs = {}

    def stream(text_lines):
        body = '\n'.join(
            'BT /F1 %d Tf 72 %d Td (%s) Tj ET' % (22 if i == 0 else 12, 700 - i * 34, ln)
            for i, ln in enumerate(text_lines)
        )
        return ('<< /Length %d >>\nstream\n%s\nendstream' % (len(body), body)).encode('latin-1')

    # 对象编号：1 Catalog, 2 Pages, 3 Font, 然后每页 2 个
    page_ids = []
    next_id = 4
    for _ in pages:
        page_ids.append(next_id)
        next_id += 2

    objs[1] = b'<< /Type /Catalog /Pages 2 0 R >>'
    kids = ' '.join('%d 0 R' % pid for pid in page_ids)
    objs[2] = ('<< /Type /Pages /Kids [%s] /Count %d >>' % (kids, len(pages))).encode('latin-1')
    objs[3] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

    for idx, pid in enumerate(page_ids):
        content_id = pid + 1
        objs[pid] = ('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
                     '/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>' % content_id).encode('latin-1')
        objs[content_id] = stream(pages[idx])

    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = {}
    for num in sorted(objs):
        offsets[num] = len(out)
        out += ('%d 0 obj\n' % num).encode('latin-1') + objs[num] + b'\nendobj\n'
    xref_at = len(out)
    maxnum = max(objs) + 1
    out += ('xref\n0 %d\n' % maxnum).encode('latin-1')
    out += b'0000000000 65535 f \n'
    for num in range(1, maxnum):
        if num in offsets:
            out += ('%010d 00000 n \n' % offsets[num]).encode('latin-1')
        else:
            out += b'0000000000 65535 f \n'
    out += ('trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (maxnum, xref_at)).encode('latin-1')
    return bytes(out)


# ---------------------------------------------------------------- png
def make_png(w, h):
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (w, h), (248, 250, 252))
    dr = ImageDraw.Draw(img)
    dr.rectangle([0, 0, w, int(h * 0.22)], fill=(43, 92, 230))
    dr.ellipse([int(w * 0.62), int(h * 0.35), int(w * 0.94), int(h * 0.92)], fill=(242, 160, 61))
    dr.rectangle([int(w * 0.06), int(h * 0.42), int(w * 0.55), int(h * 0.56)], fill=(20, 26, 36))
    dr.rectangle([int(w * 0.06), int(h * 0.64), int(w * 0.42), int(h * 0.70)], fill=(93, 103, 121))
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------- video / audio
FFMPEG_CANDIDATES = [
    r'C:\Program Files\ffmpeg\bin\ffmpeg.exe',
    'ffmpeg',
]


def ffmpeg_path():
    for p in FFMPEG_CANDIDATES:
        if p == 'ffmpeg':
            from shutil import which
            p2 = which('ffmpeg')
            if p2:
                return p2
        elif os.path.isfile(p):
            return p
    return None


def make_media(name, args):
    """用 ffmpeg 现场生成一个真实媒体文件（testsrc / sine）"""
    import subprocess, tempfile
    exe = ffmpeg_path()
    if not exe:
        print('  (跳过 %s：没有 ffmpeg)' % name)
        return None
    path = os.path.join(tempfile.gettempdir(), 'pp-ai-fixture-' + name)
    cmd = [exe, '-y', '-hide_banner', '-loglevel', 'error'] + args + [path]
    subprocess.run(cmd, check=True)
    with open(path, 'rb') as f:
        data = f.read()
    os.remove(path)
    return data


def main():
    fixtures = {}

    def put(name, mime, data, note):
        fixtures[name] = {'mime': mime, 'b64': b64(data), 'bytes': len(data), 'note': note}
        print('%-22s %8d bytes  %s' % (name, len(data), note))

    put('sample.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        make_docx(), 'python-docx 真实文件（中英混排）')
    put('unit1.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        make_pptx(), 'python-pptx 真实文件（3 页）')
    put('lesson.pdf', 'application/pdf', make_pdf(), '手写 2 页文本 PDF')
    put('wide.png', 'image/png', make_png(2000, 900), '2000×900，测试压缩到 1600')
    put('tiny.png', 'image/png', make_png(120, 80), '120×80，小图不压缩')

    clip = make_media('clip.mp4', [
        '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=1.5',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    if clip:
        put('clip.mp4', 'video/mp4', clip, '真实 1.5s 320×180 视频，测首帧缩略图')
    webm = make_media('clip.webm', [
        '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=1.5',
        '-c:v', 'libvpx-vp9', '-b:v', '200k'])
    if webm:
        put('clip.webm', 'video/webm', webm, '真实 webm，测首帧缩略图')
    tone = make_media('tone.mp3', [
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5'])
    if tone:
        put('tone.mp3', 'audio/mpeg', tone, '真实 0.5s 音频，只判 kind 不解析')

    js = ('/* 自动生成：python dev/make-fixtures.py —— 请勿手改 */\n'
          'window.__FIXTURES = ' +
          json.dumps(fixtures, ensure_ascii=False, indent=1) + ';\n')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)
    print('\nwrote', OUT, os.path.getsize(OUT), 'bytes')

    # 自检：生成的文件本身可被标准库打开
    for nm, key in (('sample.docx', None), ('unit1.pptx', None)):
        path = os.path.join(HERE, nm)
        with open(path, 'wb') as f:
            f.write(base64.b64decode(fixtures[nm]['b64']))
    for nm in ('sample.docx', 'unit1.pptx'):
        with zipfile.ZipFile(os.path.join(HERE, nm)) as z:
            print(nm, 'zip ok,', len(z.namelist()), 'entries')
        os.remove(os.path.join(HERE, nm))


if __name__ == '__main__':
    main()
