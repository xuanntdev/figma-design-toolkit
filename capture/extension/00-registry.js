// Kho dữ liệu snapshot: các tệp data/*.gen.json (do capture/gen-plan.mjs sinh) điền vào đây khi build.
// SNAP_SNAPSHOTS[stem] = snapshot màn; SNAP_GROUPS = [{ id, title, order, screens: [{ stem, title }] }].
var SNAP_SNAPSHOTS = {};
var SNAP_GROUPS = [];
// Móc engine link (tuỳ chọn): mô-đun của extension gán SNAP_LINK.linkRules / linkTokens / linkTag / buildTokens (xem capture/link-example/).
// Không gán gì thì màn dựng như cũ (khối thô, không instance, không gắn biến).
var SNAP_LINK = {};
