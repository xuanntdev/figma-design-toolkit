// Figma giả nghiêm ngặt: node đã remove() (và mọi node con của nó) ném đúng lỗi của Figma thật khi đọc/ghi
// thuộc tính hay gọi hàm: `The node with id "<id>" does not exist`. Chỉ `id` và `removed` còn đọc được.
// Dùng: trong constructor của MockNode `return strictNode(this);`, và remove() gọi `markRemoved(this)`.

function markRemoved(node) {
  const kids = (node.children || []).slice();
  node.removed = true;
  kids.forEach(markRemoved);
}

function strictNode(target) {
  const dead = (t, k) => t.removed === true && k !== 'id' && k !== 'removed' && typeof k === 'string';
  const fail = (t) => { if (process.env.STRICT_TRACE) console.error(new Error('trace').stack); throw new Error('The node with id "' + t.id + '" does not exist'); };
  return new Proxy(target, {
    get(t, k, r) { if (dead(t, k)) fail(t); return Reflect.get(t, k, r); },
    set(t, k, v, r) { if (dead(t, k)) fail(t); return Reflect.set(t, k, v, r); },
  });
}

module.exports = { strictNode, markRemoved };
