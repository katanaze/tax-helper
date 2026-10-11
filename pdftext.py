"""Minimal PDF text extraction with the Python standard library.

Enough for browser-printed PDFs (the e-return's "Return View" saved as PDF): unencrypted,
FlateDecode streams, fonts with ToUnicode maps. Returns each page as lines of cells, where
a cell is text that sits close together on one line (a table cell, a label, a value).
"""
import re
import zlib

OBJ_RE = re.compile(rb"(\d+)\s+(\d+)\s+obj\b(.*?)\bendobj", re.S)
REF_RE = re.compile(rb"(\d+)\s+\d+\s+R")


class PDFError(Exception):
    pass


# ---------- tokenizer for dictionaries and content streams ----------
WS = b" \t\r\n\f\0"
DELIM = b"()<>[]{}/%"


class Name(str):
    pass


class Op(str):
    pass


class Ref:
    def __init__(self, num):
        self.num = num


def tokens(data, pos=0):
    n = len(data)
    while pos < n:
        c = data[pos]
        if c in WS:
            pos += 1
        elif c == 0x25:  # % comment
            while pos < n and data[pos] not in b"\r\n":
                pos += 1
        elif c == 0x2F:  # /Name
            end = pos + 1
            while end < n and data[end] not in WS and data[end] not in DELIM:
                end += 1
            raw = data[pos + 1:end]
            yield Name(re.sub(rb"#([0-9A-Fa-f]{2})", lambda m: bytes([int(m.group(1), 16)]), raw).decode("latin-1"))
            pos = end
        elif c == 0x28:  # (literal string)
            depth, out, pos = 1, bytearray(), pos + 1
            while pos < n:
                ch = data[pos]
                if ch == 0x5C:  # backslash
                    pos += 1
                    e = data[pos:pos + 1]
                    esc = {b"n": 10, b"r": 13, b"t": 9, b"b": 8, b"f": 12}
                    if e in esc:
                        out.append(esc[e]); pos += 1
                    elif e in b"\r\n":
                        pos += 2 if data[pos:pos + 2] == b"\r\n" else 1
                    elif e.isdigit():
                        m = re.match(rb"[0-7]{1,3}", data[pos:pos + 3])
                        out.append(int(m.group(), 8) & 255); pos += len(m.group())
                    else:
                        out += e; pos += 1
                    continue
                if ch == 0x28:
                    depth += 1
                elif ch == 0x29:
                    depth -= 1
                    if depth == 0:
                        pos += 1
                        break
                out.append(ch); pos += 1
            yield bytes(out)
        elif data[pos:pos + 2] == b"<<":
            yield Op("<<"); pos += 2
        elif data[pos:pos + 2] == b">>":
            yield Op(">>"); pos += 2
        elif c == 0x3C:  # <hex string>
            end = data.index(b">", pos)
            hx = re.sub(rb"\s", b"", data[pos + 1:end])
            if len(hx) % 2:
                hx += b"0"
            yield bytes.fromhex(hx.decode())
            pos = end + 1
        elif c in b"[]{}":
            yield Op(chr(c)); pos += 1
        else:
            end = pos
            while end < n and data[end] not in WS and data[end] not in DELIM:
                end += 1
            word = data[pos:end]
            pos = end
            try:
                yield float(word) if (b"." in word or b"e" in word.lower()) and not word.isalpha() else int(word)
            except ValueError:
                if word == b"ID":  # inline image: skip binary data up to EI
                    m = re.compile(rb"\sEI(?=[\s]|$)").search(data, pos)
                    pos = m.end() if m else n
                    continue
                yield Op(word.decode("latin-1"))


def parse_object(data):
    """Parse one PDF object (dict, array, number, name, string, ref) from bytes."""
    toks = list(tokens(data))
    # turn "n g R" into Ref
    merged = []
    for t in toks:
        if isinstance(t, Op) and t == "R" and len(merged) >= 2 and isinstance(merged[-1], int) and isinstance(merged[-2], int):
            merged.pop(); num = merged.pop()
            merged.append(Ref(num))
        else:
            merged.append(t)

    def build(i):
        t = merged[i]
        if isinstance(t, Op) and t == "<<":
            d, i = {}, i + 1
            while not (isinstance(merged[i], Op) and merged[i] == ">>"):
                k = merged[i]
                v, i = build(i + 1)
                d[k] = v
            return d, i + 1
        if isinstance(t, Op) and t == "[":
            a, i = [], i + 1
            while not (isinstance(merged[i], Op) and merged[i] == "]"):
                v, i = build(i)
                a.append(v)
            return a, i + 1
        return t, i + 1

    if not merged:
        return None
    return build(0)[0]


# ---------- document ----------
class Doc:
    def __init__(self, data):
        if not data.startswith(b"%PDF"):
            raise PDFError("not a PDF file")
        if b"/Encrypt" in data:
            raise PDFError("the PDF is encrypted")
        self.objs = {}
        for m in OBJ_RE.finditer(data):
            body = m.group(3)
            s = re.search(rb"\bstream\r?\n", body)
            if s:
                head, raw = body[:s.start()], body[s.end():]
                raw = raw[:raw.rfind(b"endstream")]
                self.objs[int(m.group(1))] = (parse_object(head), raw)
            else:
                self.objs[int(m.group(1))] = (parse_object(body), None)
        if any(isinstance(d, dict) and d.get("Type") == "ObjStm" for d, _ in self.objs.values()):
            self._load_objstms()
        self.font_cache = {}

    def _load_objstms(self):
        for d, raw in list(self.objs.values()):
            if not (isinstance(d, dict) and d.get("Type") == "ObjStm"):
                continue
            data = self.decode(d, raw)
            first = d["First"]
            nums = [int(x) for x in data[:first].split()]
            for k in range(0, len(nums), 2):
                start = first + nums[k + 1]
                end = first + nums[k + 3] if k + 3 < len(nums) else len(data)
                self.objs.setdefault(nums[k], (parse_object(data[start:end]), None))

    def get(self, v):
        while isinstance(v, Ref):
            v = self.objs.get(v.num, (None, None))[0]
        return v

    def stream(self, v):
        if isinstance(v, Ref):
            d, raw = self.objs.get(v.num, (None, None))
            return self.decode(d, raw) if raw is not None else b""
        return b""

    def decode(self, d, raw):
        f = self.get(d.get("Filter")) if isinstance(d, dict) else None
        filters = f if isinstance(f, list) else ([f] if f else [])
        for name in filters:
            if name == "FlateDecode":
                raw = zlib.decompressobj().decompress(raw)
            else:
                raise PDFError(f"unsupported stream filter {name}")
        return raw

    def pages(self):
        root = None
        for d, _ in self.objs.values():
            if isinstance(d, dict) and d.get("Type") == "Catalog":
                root = d
                break
        out = []

        def walk(node, inherited):
            node = self.get(node)
            res = node.get("Resources", inherited)
            if node.get("Type") == "Pages":
                for k in self.get(node.get("Kids", [])):
                    walk(k, res)
            else:
                out.append((node, self.get(res) or {}))

        if root:
            walk(root["Pages"], {})
        return out

    # ---------- fonts ----------
    def font(self, ref):
        key = ref.num if isinstance(ref, Ref) else id(ref)
        if key in self.font_cache:
            return self.font_cache[key]
        f = self.get(ref) or {}
        two_byte = f.get("Subtype") == "Type0"
        cmap = parse_cmap(self.stream(f.get("ToUnicode"))) if f.get("ToUnicode") else {}
        widths, default_w = {}, 1000 if two_byte else 500
        scale = 0.001
        if two_byte:
            desc = self.get((self.get(f.get("DescendantFonts")) or [{}])[0]) or {}
            default_w = desc.get("DW", 1000)
            w = self.get(desc.get("W")) or []
            i = 0
            while i < len(w):
                start = w[i]
                nxt = self.get(w[i + 1])
                if isinstance(nxt, list):
                    for j, val in enumerate(nxt):
                        widths[start + j] = val
                    i += 2
                else:
                    for c in range(start, nxt + 1):
                        widths[c] = w[i + 2]
                    i += 3
        else:
            fc = f.get("FirstChar", 0)
            for j, val in enumerate(self.get(f.get("Widths")) or []):
                widths[fc + j] = self.get(val)
            if f.get("Subtype") == "Type3":
                fm = self.get(f.get("FontMatrix")) or [0.001]
                scale = fm[0]
        res = {"two": two_byte, "cmap": cmap, "w": widths, "dw": default_w, "scale": scale}
        self.font_cache[key] = res
        return res


def parse_cmap(data):
    m = {}
    def uni(hexbytes):
        b = bytes.fromhex(hexbytes.decode())
        try:
            return b.decode("utf-16-be")
        except UnicodeDecodeError:
            return ""
    for block in re.findall(rb"beginbfchar(.*?)endbfchar", data, re.S):
        for src, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>", block):
            m[int(src, 16)] = uni(dst)
    for block in re.findall(rb"beginbfrange(.*?)endbfrange", data, re.S):
        for lo, hi, rest in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]*>)", block):
            lo, hi = int(lo, 16), int(hi, 16)
            if rest.startswith(b"["):
                for k, d in enumerate(re.findall(rb"<([0-9A-Fa-f]*)>", rest)):
                    m[lo + k] = uni(d)
            else:
                base = bytes.fromhex(rest[1:-1].decode())
                for k in range(hi - lo + 1):
                    b = base[:-1] + bytes([base[-1] + k]) if base else b""
                    try:
                        m[lo + k] = b.decode("utf-16-be")
                    except UnicodeDecodeError:
                        pass
    return m


def mul(a, b):
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


def run_content(doc, data, resources, ctm, out, depth=0):
    """Interpret a content stream; append (x, y, x_end, size, text) glyph runs to out."""
    fonts = doc.get(resources.get("Font")) or {}
    xobjs = doc.get(resources.get("XObject")) or {}
    stack = []
    gs = {"ctm": ctm}
    tm = tlm = [1, 0, 0, 1, 0, 0]
    font, size, tc, tw, tz, tl, rise = None, 0, 0, 0, 1, 0, 0
    operands = []

    def show(s):
        nonlocal tm
        if font is None:
            return
        trm = mul([size * tz, 0, 0, size, 0, rise], mul(tm, gs["ctm"]))
        x0, y0 = trm[4], trm[5]
        text = []
        codes = [s[i] << 8 | s[i + 1] for i in range(0, len(s) - 1, 2)] if font["two"] else list(s)
        adv = 0.0
        for code in codes:
            text.append(font["cmap"].get(code, "") if font["cmap"] else chr(code))
            w = font["w"].get(code, font["dw"]) * font["scale"]
            step = (w * size + tc + (tw if (not font["two"] and code == 32) else 0)) * tz
            adv += step
        tm = mul([1, 0, 0, 1, adv, 0], tm)
        x1 = mul([size * tz, 0, 0, size, 0, rise], mul(tm, gs["ctm"]))[4]
        hsize = abs(trm[3]) or abs(trm[0]) or size
        out.append((x0, y0, x1, hsize, "".join(text)))

    for t in tokens(data):
        if not isinstance(t, Op) or t in ("[", "]", "<<", ">>"):
            operands.append(t)
            continue
        op, a = str(t), operands
        operands = []
        if op == "q":
            stack.append(dict(gs))
        elif op == "Q":
            if stack:
                gs = stack.pop()
        elif op == "cm" and len(a) >= 6:
            gs["ctm"] = mul([float(v) for v in a[-6:]], gs["ctm"])
        elif op == "BT":
            tm = tlm = [1, 0, 0, 1, 0, 0]
        elif op == "Tf" and len(a) >= 2:
            ref = fonts.get(a[-2])
            font = doc.font(ref) if ref is not None else None
            size = float(a[-1])
        elif op == "Tc" and a:
            tc = float(a[-1])
        elif op == "Tw" and a:
            tw = float(a[-1])
        elif op == "Tz" and a:
            tz = float(a[-1]) / 100
        elif op == "TL" and a:
            tl = float(a[-1])
        elif op == "Ts" and a:
            rise = float(a[-1])
        elif op in ("Td", "TD") and len(a) >= 2:
            if op == "TD":
                tl = -float(a[-1])
            tlm = mul([1, 0, 0, 1, float(a[-2]), float(a[-1])], tlm)
            tm = tlm
        elif op == "Tm" and len(a) >= 6:
            tlm = tm = [float(v) for v in a[-6:]]
        elif op == "T*":
            tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm
        elif op == "Tj" and a:
            show(a[-1])
        elif op in ("'", '"') and a:
            tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm
            show(a[-1])
        elif op == "TJ":
            # operands: "[", items..., "]"
            items = [x for x in a if not isinstance(x, Op)]
            for it in items:
                if isinstance(it, bytes):
                    show(it)
                elif isinstance(it, (int, float)):
                    tm = mul([1, 0, 0, 1, -it / 1000 * size * tz, 0], tm)
        elif op == "Do" and a and depth < 8:
            x = xobjs.get(a[-1])
            if isinstance(x, Ref):
                d, raw = doc.objs.get(x.num, (None, None))
                if isinstance(d, dict) and d.get("Subtype") == "Form" and raw is not None:
                    m = [float(v) for v in (doc.get(d.get("Matrix")) or [1, 0, 0, 1, 0, 0])]
                    run_content(doc, doc.decode(d, raw), doc.get(d.get("Resources")) or resources,
                                mul(m, gs["ctm"]), out, depth + 1)


def page_lines(runs):
    """Group glyph runs into lines (top to bottom) of cells (left to right): [[x, text], ...]."""
    runs = [r for r in runs if r[4].strip()]
    runs.sort(key=lambda r: (-r[1], r[0]))
    lines = []
    for r in runs:
        tol = max(2.0, r[3] * 0.4)
        if lines and abs(lines[-1]["y"] - r[1]) <= tol:
            lines[-1]["runs"].append(r)
        else:
            lines.append({"y": r[1], "runs": [r]})
    out = []
    for ln in lines:
        cells, cur, start, end = [], "", 0, None
        for x0, _, x1, sz, text in sorted(ln["runs"], key=lambda r: r[0]):
            if end is None:
                cur, start, end = text, x0, x1
                continue
            gap = x0 - end
            if gap > sz * 1.2:  # a wide gap starts a new cell
                cells.append([start, cur]); cur, start = text, x0
            else:
                cur += (" " if gap > sz * 0.15 and not cur.endswith(" ") and not text.startswith(" ") else "") + text
            end = max(end, x1)
        cells.append([start, cur])
        cells = [[round(x, 1), re.sub(r"\s+", " ", t).strip()] for x, t in cells]
        out.append([c for c in cells if c[1]])
    return out


def extract(data):
    """PDF bytes -> list of pages, each a list of lines, each a list of [x, text] cells."""
    doc = Doc(data)
    pages = []
    for page, res in doc.pages():
        contents = doc.get(page.get("Contents"))
        refs = contents if isinstance(contents, list) else [page.get("Contents")]
        data = b"\n".join(doc.stream(r) for r in refs if r is not None)
        runs = []
        run_content(doc, data, res, [1, 0, 0, 1, 0, 0], runs)
        pages.append(page_lines(runs))
    return pages


if __name__ == "__main__":
    import sys
    for i, page in enumerate(extract(open(sys.argv[1], "rb").read()), 1):
        print(f"===== page {i}")
        for ln in page:
            print(" | ".join(t for _, t in ln))
