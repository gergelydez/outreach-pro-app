/* Panoul clientului: completează pe site tarifele, ofertele, galeria și contactul publicate din aplicație.
   Marcaje: data-cms="prices|offers|gallery" (copiii direcți cu data-cms-item sunt modelul), data-cms-field,
   data-cms-section (se ascunde când lista e goală), data-cms-text, data-cms-tel, data-cms-mailto. */
(function () {
  var s = document.currentScript
  var editor = s && s.getAttribute('data-mode') === 'editor'
  var src = s && s.getAttribute('data-src')
  if (!editor && (!src || !window.fetch)) return
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
  function setupEditor() {
    var edit = true
    var css = document.createElement('style')
    css.textContent = '.cms-edit [data-cms-section],.cms-edit [data-cms]:not([data-cms-section] [data-cms]),.cms-edit [data-cms-text]{outline:2px dashed rgba(13,148,136,.85)!important;outline-offset:6px;cursor:pointer}' +
      '.cms-badge{position:absolute;top:8px;right:8px;z-index:2147482000;background:#0d9488;color:#fff;font:600 13px/1 system-ui,sans-serif;padding:8px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.2);pointer-events:none}' +
      '.cms-edit [data-cms-section]{min-height:80px}'
    document.head.appendChild(css)
    function badges() {
      all('.cms-badge', function (b) { b.parentNode.removeChild(b) })
      if (!edit) return
      all('[data-cms-section]', function (sec) {
        if (getComputedStyle(sec).position === 'static') sec.style.position = 'relative'
        var b = document.createElement('div'); b.className = 'cms-badge'; b.textContent = '✏️'; sec.appendChild(b)
      })
    }
    function kindOf(el) {
      var box = el.closest('[data-cms]'); if (box) return box.getAttribute('data-cms')
      var sec = el.closest('[data-cms-section]'); if (sec) return sec.getAttribute('data-cms-section')
      if (el.closest('[data-cms-text],[data-cms-tel],[data-cms-mailto]')) return 'contact'
      return null
    }
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest('a'); if (a) ev.preventDefault()
      if (!edit) return
      var k = kindOf(ev.target)
      if (k) { ev.preventDefault(); ev.stopPropagation(); parent.postMessage({ type: 'cms-edit', kind: k }, '*') }
    }, true)
    document.addEventListener('submit', function (ev) { ev.preventDefault() }, true)
    window.addEventListener('message', function (e) {
      if (e.source !== parent) return
      var d = e.data || {}
      if (d.type === 'cms-mode') { edit = !!d.edit; document.documentElement.classList.toggle('cms-edit', edit); badges() }
      if (d.type === 'cms-content' && d.data) {
        apply(d.data)
        // în editor, secțiunea de oferte rămâne vizibilă (ca să poată fi atinsă) chiar dacă nu are oferte active
        if (edit) all('[data-cms-section]', function (sec) { sec.style.display = '' })
        badges()
      }
    })
    document.documentElement.classList.add('cms-edit')
    parent.postMessage({ type: 'cms-ready', markers: !!document.querySelector('[data-cms],[data-cms-text]') }, '*')
  }
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
  // Formularul de contact: trimis la aplicație (email către client + panoul lui)
  var lang = (document.documentElement.lang || 'ro').slice(0, 2)
  var TXT = { ro: ['Se trimite…', 'Mulțumim! Vă contactăm în curând.', 'Mesajul nu a putut fi trimis. Vă rugăm să ne sunați.'], hu: ['Küldés…', 'Köszönjük! Hamarosan jelentkezünk.', 'Az üzenetet nem sikerült elküldeni. Kérjük, hívjon minket.'], en: ['Sending…', 'Thank you! We will get back to you soon.', 'The message could not be sent. Please call us.'] }[lang] || null
  if (!TXT) TXT = ['Se trimite…', 'Mulțumim! Vă contactăm în curând.', 'Mesajul nu a putut fi trimis. Vă rugăm să ne sunați.']
  if (!editor) all('form[data-cms-form]', function (f) {
    var hp = document.createElement('input'); hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off'
    hp.setAttribute('aria-hidden', 'true'); hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0'
    f.appendChild(hp)
    f.addEventListener('submit', function (e) {
      e.preventDefault()
      var btn = f.querySelector('[type=submit]'), label = btn && btn.textContent
      if (btn) { btn.disabled = true; btn.textContent = TXT[0] }
      var data = {}; new FormData(f).forEach(function (v, k) { data[k] = String(v) })
      fetch(src + '/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status) })
        .then(function () {
          f.reset()
          var ok = f.querySelector('[data-cms-form-success]')
          if (ok) { ok.hidden = false; ok.style.display = '' } else { var p = document.createElement('p'); p.textContent = TXT[1]; p.style.cssText = 'margin-top:12px;font-weight:600'; f.appendChild(p) }
          if (btn) btn.textContent = '✓'
        })
        .catch(function () { if (btn) { btn.disabled = false; btn.textContent = label } alert(TXT[2]) })
    })
  })
  if (editor) { setupEditor(); return }
  fetch(src, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null }).then(function (d) { if (d && d.updated_at) apply(d) }).catch(function () {})
})()
