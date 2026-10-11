#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""push_to_github.py —— 一键把本仓库推送到 GitHub（Windows）

为什么需要这个脚本
------------------
本机 DNS 把 `github.com` 解析到 `20.205.243.166`，这个 IP 在本地网络不可达：
直连 443 会超时，走系统代理又是 `CONNECT tunnel failed, 502`。
而 GitHub 的其它边缘 IP（`140.82.112.3` / `140.82.113.3` …）**直连 + TLS 完全正常**。

所以本脚本在需要时会起一个**只监听 127.0.0.1 的临时 CONNECT 中继**，
把 `github.com:443` 转发到实测可达的 GitHub IP，推送完成后立即关闭。
不改 hosts、不动系统配置、不落盘任何令牌。

用法
----
    python .planning/tools/push_to_github.py            # 推送到 origin 的当前分支，并核验
    python .planning/tools/push_to_github.py --check    # 只核验，不推送
    python .planning/tools/push_to_github.py --branch dev

凭据
----
从 **Windows 凭据管理器**读取已登录的 GitHub OAuth token（GitHub Desktop / GCM
保存的那一份，长期有效）。脚本只在本进程内使用，**不写入磁盘、不打印明文**。

退出码：0 成功 / 1 失败
"""

import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

# 仓库根目录 = 本文件的上两级（.planning/tools/ → 仓库根）
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

# 凭据管理器里可能的 target（按命中概率排序）
CRED_TARGETS = ["git:https://github.com", "GitHub - https://api.github.com/"]

# 实测可达的 GitHub 边缘 IP（TLS 证书均为 github.com）
CANDIDATE_IPS = ["140.82.112.3", "140.82.113.3", "140.82.114.3",
                 "140.82.116.3", "140.82.121.3", "20.27.177.113"]


# ---------------------------------------------------------------- git 定位
def find_git():
    g = shutil.which("git")
    if g:
        return g
    home = os.path.expanduser("~")
    cands = [
        os.path.join(home, r".workbuddy\binaries\PortableGit\versions\1.2.0\cmd\git.exe"),
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    return "git"


GIT = find_git()


def git(args, **kw):
    return subprocess.run([GIT, "-C", REPO] + args, capture_output=True,
                          text=True, encoding="utf-8", errors="replace", **kw)


# ---------------------------------------------------------------- 凭据读取
class CREDENTIALW(ctypes.Structure):
    _fields_ = [
        ("Flags", wt.DWORD), ("Type", wt.DWORD),
        ("TargetName", wt.LPWSTR), ("Comment", wt.LPWSTR),
        ("LastWritten", wt.FILETIME), ("CredentialBlobSize", wt.DWORD),
        ("CredentialBlob", ctypes.POINTER(ctypes.c_byte)),
        ("Persist", wt.DWORD), ("AttributeCount", wt.DWORD),
        ("Attributes", ctypes.c_void_p),
        ("TargetAlias", wt.LPWSTR), ("UserName", wt.LPWSTR),
    ]


def _cred_read(target):
    ptr = ctypes.POINTER(CREDENTIALW)()
    if not ctypes.windll.advapi32.CredReadW(ctypes.c_wchar_p(target), 1, 0,
                                            ctypes.byref(ptr)):
        return None
    c = ptr.contents
    blob = ctypes.string_at(c.CredentialBlob, c.CredentialBlobSize)
    ctypes.windll.advapi32.CredFree(ptr)
    # blob 可能是 UTF-8 也可能是 UTF-16LE，两种都试并用 isascii 校验
    for enc in ("utf-8", "utf-16-le", "latin-1"):
        try:
            t = blob.decode(enc).strip().strip("\x00").strip()
        except Exception:
            continue
        if len(t) > 20 and t.isascii() and t.isprintable():
            return t
    return None


def opener():
    # api.github.com 直连可达，显式绕过系统代理
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(tok, path):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": "token " + tok, "User-Agent": "push-to-github",
                 "Accept": "application/vnd.github+json"})
    with opener().open(req, timeout=40) as r:
        return json.load(r)


def find_token():
    for tgt in CRED_TARGETS:
        tok = _cred_read(tgt)
        if not tok:
            continue
        try:
            login = api(tok, "/user").get("login")
        except Exception:
            continue
        if login:
            return tok, login
    return None, None


# ---------------------------------------------------------------- 网络绕行
def direct_ok(host="github.com", port=443, timeout=5):
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except Exception:
        return False


def pick_ip():
    for ip in CANDIDATE_IPS:
        try:
            s = socket.create_connection((ip, 443), timeout=4)
            s.close()
            return ip
        except Exception:
            continue
    return None


def _pipe(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d:
                break
            b.sendall(d)
    except Exception:
        pass
    finally:
        for x in (a, b):
            try:
                x.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass


def _handle(conn, ip):
    try:
        conn.settimeout(20)
        buf = b""
        while b"\r\n\r\n" not in buf:
            d = conn.recv(4096)
            if not d:
                return
            buf += d
        head = buf.split(b"\r\n", 1)[0].decode("latin-1", "replace")
        if not head.upper().startswith("CONNECT"):
            conn.sendall(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n")
            return
        hostport = head.split()[1]
        host, _, port = hostport.partition(":")
        up = socket.create_connection(
            (ip if host.endswith("github.com") else host, int(port or 443)), timeout=10)
        conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        conn.settimeout(None)
        up.settimeout(None)
        threading.Thread(target=_pipe, args=(up, conn), daemon=True).start()
        _pipe(conn, up)
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


def start_relay(ip):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 0))
    srv.listen(16)

    def loop():
        while True:
            try:
                c, _ = srv.accept()
            except Exception:
                return
            threading.Thread(target=_handle, args=(c, ip), daemon=True).start()

    threading.Thread(target=loop, daemon=True).start()
    return srv, srv.getsockname()[1]


# ---------------------------------------------------------------- 主流程
def parse_remote():
    """从 origin 解析出 owner/repo（兼容被 insteadOf 改写过的显示结果）。"""
    url = git(["remote", "get-url", "origin"]).stdout.strip()
    tail = url.split("github.com", 1)[-1].lstrip("/:").replace(".git", "")
    parts = [p for p in tail.split("/") if p]
    return (parts[0], parts[1]) if len(parts) >= 2 else (None, None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default=None, help="分支，默认当前分支")
    ap.add_argument("--check", action="store_true", help="只核验，不推送")
    a = ap.parse_args()

    if not os.path.isdir(os.path.join(REPO, ".git")):
        print("✗ 不是 git 仓库:", REPO)
        return 1
    print("仓库目录:", REPO)

    branch = a.branch or git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip() or "main"
    owner, repo = parse_remote()
    if not (owner and repo):
        print("✗ 认不出 origin，请先 `git remote add origin <url>`")
        return 1
    print("目标    : %s/%s  分支 %s" % (owner, repo, branch))

    tok, login = find_token()
    if not tok:
        print("✗ 凭据管理器里没有可用的 GitHub token"
              "（先在 GitHub Desktop 或 git 里登录一次）")
        return 1
    print("账号    : %s  | token %s… 长度 %d" % (login, tok[:4], len(tok)))

    if not a.check:
        env = dict(os.environ)
        for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
                  "ALL_PROXY", "all_proxy"):
            env.pop(k, None)
        empty = tempfile.mktemp(suffix=".gitconfig")
        open(empty, "w").close()
        env["GIT_CONFIG_GLOBAL"] = empty      # 隔离全局 url.insteadOf 镜像改写
        env["GIT_CONFIG_SYSTEM"] = empty      # 顶掉系统级 credential.helper=helper-selector
        env["GIT_TERMINAL_PROMPT"] = "0"      # 绝不交互卡死
        env["GCM_INTERACTIVE"] = "never"

        # Windows 的 schannel 要做证书吊销检查（CRL/OCSP），本机到吊销服务器的出口不通，
        # 会直接报 CRYPT_E_REVOCATION_OFFLINE (0x80092013) 让 push 失败；
        # `http.schannelCheckRevoke=false` 挡不住（握手阶段就断）。
        # 改用 OpenSSL 后端即可（证书链照样校验，只是不做吊销列表查询）。
        # 顺序按「实测能通」排：OpenSSL 在前，schannel 兜底。
        base = ["-c", "credential.helper=", "-c", "http.schannelCheckRevoke=false"]
        variants = [
            ("改用 OpenSSL 后端", ["-c", "http.sslBackend=openssl"]),
            ("默认 schannel 后端", []),
        ]

        url = "https://x-access-token:%s@github.com/%s/%s.git" % (tok, owner, repo)
        srv = None
        try:
            if direct_ok():
                print("网络    : github.com:443 直连可达")
                routes = [("直连", [])]
            else:
                routes = []
            ip = pick_ip()
            if not direct_ok() and not ip:
                print("✗ github.com 直连不通，且没有可用边缘 IP")
                return 1
            if ip:
                srv, port = start_relay(ip)
                print("网络    : 本地中转 127.0.0.1:%d → %s:443（备选）" % (port, ip))
                routes.append(("中继", ["-c", "http.proxy=http://127.0.0.1:%d" % port]))
                time.sleep(0.3)

            ok = False
            last = None
            for rname, rcfg in routes:
                for vname, vcfg in variants:
                    print("\n== git push [%s / %s] ==" % (rname, vname))
                    r = subprocess.run(
                        [GIT, "-C", REPO] + base + rcfg + vcfg +
                        ["push", "-v", url, "%s:%s" % (branch, branch)],
                        env=env, capture_output=True, text=True, encoding="utf-8",
                        errors="replace", timeout=900)
                    out = (r.stdout + r.stderr).replace(tok, "***").strip()
                    print(out[-900:])
                    if r.returncode == 0:
                        ok = True
                        break
                    last = out
                if ok:
                    break
            if not ok:
                print("\n✗ push 全部方式失败")
                return 1
        finally:
            if srv:
                try:
                    srv.close()
                except Exception:
                    pass
            try:
                os.remove(empty)
            except Exception:
                pass

    local = git(["rev-parse", "HEAD"]).stdout.strip()
    try:
        remote = api(tok, "/repos/%s/%s/git/ref/heads/%s" % (owner, repo, branch))["object"]["sha"]
    except Exception as e:
        print("核验失败:", type(e).__name__, str(e)[:120])
        return 1
    print("\n本地 HEAD :", local)
    print("远端 %-5s:" % branch, remote)
    ok = local == remote
    print("★ SHA 一致 =", ok)
    if ok:
        print("  链接: https://github.com/%s/%s" % (owner, repo))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
