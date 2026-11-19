/* Panoul clientului: completează pe site tarifele, ofertele, galeria și contactul publicate din aplicație.
   Marcaje: data-cms="prices|offers|gallery" (copiii direcți cu data-cms-item sunt modelul), data-cms-field,
   data-cms-section (se ascunde când lista e goală), data-cms-text, data-cms-tel, data-cms-mailto. */
(function () {
  var s = document.currentScript
  var src = s && s.getAttribute('data-src')
  if (!src || !window.fetch) return
  var today = new Date().toISOString().slice(0, 10)
  function fmt(d) { if (!d) return ''; var p = d.split('-'); return p[2] + '.' + p[1] + '.' + p[0] }
  function period(o) { return o.from && o.to ? fmt(o.from) + ' – ' + fmt(o.to) : o.to ? '→ ' + fmt(o.to) : o.from ? fmt(o.from) + ' →' : '' }
  function set(el, v) { if (v) { el.textContent = v; el.style.display = '' } else el.style.display = 'none' }
  function fill(node, item) {
    var fields = [].slice.call(node.querySelectorAll('[data-cms-field]'))
    if (node.hasAttribute('data-cms-field')) fields.push(node)
    fields.forEach(function (f) {
      var k = f.getAttribute('data-cms-field')
      if (k === 'src') {
        var img = f.tagName === 'IMG' ? f : f.querySelector('img')
        if (img) { img.src = item.src; img.removeAttribute('srcset'); img.alt = item.alt || '' } else f.style.backgroundImage = 'url("' + item.src + '")'
        return
      }
      set(f, item[k])
    })
  }
  function list(box, items) {
    if (!box.__tpl) { var t = box.querySelector('[data-cms-item]'); if (!t) return; box.__tpl = t.cloneNode(true) }
    [].slice.call(box.children).forEach(function (n) { if (n.hasAttribute('data-cms-item')) box.removeChild(n) })
    items.forEach(function (it) { var n = box.__tpl.cloneNode(true); n.style.display = ''; fill(n, it); box.appendChild(n) })
    var sec = box.closest('[data-cms-section]') || box
    sec.style.display = items.length ? '' : 'none'
  }
  function all(sel, fn) { [].forEach.call(document.querySelectorAll(sel), fn) }
  function apply(d) {
    var c = d.contact || {}
    all('[data-cms-text]', function (el) { var v = c[el.getAttribute('data-cms-text')]; if (v) el.innerText = v })
    if (c.phone) all('[data-cms-tel]', function (el) { el.setAttribute('href', 'tel:' + c.phone.replace(/[^\d+]/g, '')) })
    if (c.email) all('[data-cms-mailto]', function (el) { el.setAttribute('href', 'mailto:' + c.email) })
    var offers = (d.offers || []).filter(function (o) { return o.active !== false && (!o.from || o.from <= today) && (!o.to || o.to >= today) })
      .map(function (o) { return { title: o.title, text: o.text, period: period(o) } })
    all('[data-cms="prices"]', function (b) { list(b, d.prices || []) })
    all('[data-cms="offers"]', function (b) { list(b, offers) })
    all('[data-cms="gallery"]', function (b) { if ((d.gallery || []).length) list(b, d.gallery) })
  }
  fetch(src, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null }).then(function (d) { if (d && d.updated_at) apply(d) }).catch(function () {})
})()
