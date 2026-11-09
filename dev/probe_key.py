import io
import json
import os
import re
import subprocess
import sys

CRED = os.path.expanduser(r"~\.dsh\.credentials.yaml")


def find_token():
    if not os.path.exists(CRED):
        return None
    text = io.open(CRED, encoding="utf-8", errors="ignore").read()
    # 取 issuer 为 platform.deepseek.com 的那条记录里的 token
    blocks = re.split(r"\n\s*-\s+", text)
    for b in blocks:
        if "platform.deepseek.com" in b:
            m = re.search(r"token:\s*([A-Za-z0-9\-_\.]+)", b)
            if m:
                return m.group(1)
    m = re.search(r"token:\s*([A-Za-z0-9\-_\.]{20,})", text)
    return m.group(1) if m else None


def main():
    tok = find_token()
    if not tok:
        print("NO_TOKEN")
        return 1
    print("token_len", len(tok))
    cmd = [
        "curl.exe", "-sS", "-o", os.devnull, "-w", "%{http_code}",
        "--max-time", "30",
        "-H", "Authorization: Bearer " + tok,
        "https://api.deepseek.com/v1/models",
    ]
    code = subprocess.run(cmd, capture_output=True, text=True).stdout.strip()
    print("models_status", code)

    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": "只回复两个字：你好"}],
        "max_tokens": 16,
        "stream": False,
    })
    tmp = os.path.join(os.environ.get("TEMP", "."), "ppai_chat.json")
    io.open(tmp, "w", encoding="utf-8").write(body)
    cmd2 = [
        "curl.exe", "-sS", "--max-time", "40",
        "-H", "Content-Type: application/json",
        "-H", "Authorization: Bearer " + tok,
        "-d", "@" + tmp,
        "https://api.deepseek.com/v1/chat/completions",
    ]
    out = subprocess.run(cmd2, capture_output=True, text=True).stdout
    try:
        data = json.loads(out)
        content = data["choices"][0]["message"]["content"]
        print("chat_ok", repr(content[:40]))
    except Exception:
        print("chat_raw", out[:300])
    return 0


if __name__ == "__main__":
    sys.exit(main())
