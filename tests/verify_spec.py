"""Kiểm dàn ý gọn (figma_spec): dòng đúng từ vựng flex/token, thu gọn theo trần dòng kèm id để đọc tiếp, instance không bung ruột."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from kit_core import figma_spec  # noqa: E402


def tree(width: int, depth: int) -> dict:
    root = {"id": "0:1", "t": "FRAME", "n": "Màn", "w": 1440, "h": 900, "lm": "V", "gap": 16, "pad": [24, 24, 24, 24], "c": []}
    level = [root]
    for d in range(depth):
        nxt = []
        for i, parent in enumerate(level):
            for j in range(width):
                node = {"id": f"{d + 1}:{i}-{j}", "t": "FRAME", "n": f"n{d}", "w": 10, "h": 10, "c": []}
                parent["c"].append(node)
                nxt.append(node)
        level = nxt
    return root


def main() -> None:
    root = tree(4, 4)  # 1 + 4 + 16 + 64 + 256 node
    lines, folded = figma_spec.outline(root, 1000)
    assert len(lines) == 341 and folded == 0
    lines, folded = figma_spec.outline(root, 100)
    assert len(lines) == 85 and folded == 256, (len(lines), folded)
    assert all("▸ #" in line for line in lines if line.startswith("      ")), "nhánh thu gọn phải kèm id"
    assert lines[0] == 'box "Màn" #0:1 · 1440×900 · flex col · gap 16 · pad 24', lines[0]
    inst = {"id": "9:1", "t": "INSTANCE", "n": "Nút", "w": 80.004, "h": 32, "set": "Button", "variant": {"Kind": "primary"},
            "texts": ["Lưu"], "fills": [{"c": "#059669", "var": "color/primary"}], "c": [{"id": "9:2", "t": "TEXT", "n": "x", "chars": "Lưu"}]}
    text = {"id": "9:3", "t": "TEXT", "n": "Tiêu đề", "chars": "Chào", "font": "Inter Bold", "size": 18, "lh": 24, "fills": [{"c": "#111827"}],
            "textAlignHorizontal": "CENTER", "layoutSizingHorizontal": "FILL", "layoutSizingVertical": "HUG", "w": 1, "h": 1}
    card = {"id": "9:4", "t": "FRAME", "n": "Card", "w": 300, "h": 100, "styles": {"fill": "Surface/Card"}, "fills": [{"c": "#ffffff"}], "r": 12,
            "effects": [{"type": "DROP_SHADOW", "radius": 32, "spread": -4, "offset": [0, 12], "color": "#000000@0.06"}],
            "strokes": [{"c": "#e5e7eb"}], "sw": [0, 0, 1, 0]}
    row = {"id": "8:1", "t": "FRAME", "n": "Hàng", "w": 300, "h": 40, "lm": "H", "primaryAxisAlignItems": "SPACE_BETWEEN",
           "counterAxisAlignItems": "CENTER", "gap": 539.0300293, "c": [inst, text, card]}
    lines, _ = figma_spec.outline(row, 50)
    assert lines[0].endswith("flex row · justify between · align center"), lines[0]
    assert "→ Button {Kind=primary}" in lines[1] and "80×32" in lines[1] and "bg $color/primary (#059669)" in lines[1], lines[1]
    assert '"Chào" · Inter Bold 18/24 · #111827 · text-center' in lines[2] and "fill×hug" in lines[2], lines[2]
    assert "bg $Surface/Card (#ffffff) · border [0 0 1 0] #e5e7eb · radius 12 · shadow 0 12 32 -4 #000000@0.06" in lines[3], lines[3]
    assert len(lines) == 4, "instance không bung ruột"
    print("verify_spec.py: OK")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
