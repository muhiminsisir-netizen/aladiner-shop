import re,sys,os,shutil,time
D=(sys.argv[1] if len(sys.argv)>1 else 'public').rstrip('/\\')+'/'
U=D; O=D
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
for f in ['app.js','style.css','admin.html']:
    if not os.path.exists(D+f): sys.exit('Not found: '+D+f+'  (usage: python patch.py <folder with app.js>)')
    base=D+f+'.bak'; target=base
    if os.path.exists(target):
        stamp=time.strftime('%Y%m%d-%H%M%S')
        target=D+f+'.'+stamp+'.bak'; n=1
        while os.path.exists(target):
            target=D+f+'.'+stamp+'-'+str(n)+'.bak'; n+=1
    shutil.copy2(D+f,target)
def rep(s,old,new):
    assert s.count(old)==1,('NOT UNIQUE/FOUND',old[:60],s.count(old))
    return s.replace(old,new)
# ---- app.js
a=open(U+'app.js',encoding='utf8').read()
i=a.index('async function checkout() {'); j=a.index('function loginPage(')
a=a[:i]+open(HERE+'new_checkout.js',encoding='utf8').read()+a[j:]
a=rep(a,r"""${PAGES.map(([k, t]) => `<a href="#/page/${k}">${t}</a>`).join('')}""",r"""<a href="#/track">Track order</a>${PAGES.map(([k, t]) => `<a href="#/page/${k}">${t}</a>`).join('')}""")
a=rep(a,"else if (page === 'page') pageStatic(arg);","else if (page === 'track') trackPage(); else if (page === 'page') pageStatic(arg);")
a=rep(a,"""  if (!me) { store.set('next', location.hash); location.hash = '#/login'; return }
  const t = routeId; const o = await api('/api/orders/' + encodeURIComponent(id)); if (t !== routeId) return;""",
"""  const t = routeId; let o;
  try { o = await api('/api/orders/' + encodeURIComponent(id)) } catch (e) { if (t === routeId) app.innerHTML = empty('😕', 'Order not found', 'Use Track order with your order ID and phone number.', '<a class="btn" href="#/track">Track order</a>'); return }
  if (t !== routeId) return;""")
a=rep(a,r"""<div class="crumb"><a href="#/orders">My orders</a> / <span>${esc(o.id)}</span></div><h1 class="pt">Order ${esc(o.id)}</h1>""",
r"""<div class="crumb"><a href="${me ? '#/orders' : '#/track'}">${me ? 'My orders' : 'Track order'}</a> / <span>${esc(o.id)}</span></div>
  ${Q().q.get('new') ? `<div class="box okbox"><div class="tick">${ic('check')}</div><h2>Thank you! Order confirmed</h2><p>Your order ID is <b>${esc(o.id)}</b>. Save it to track delivery.${o.payment_status === 'Verifying' ? ' We are verifying your payment.' : ''}</p>${String(cfg.whatsapp || '').replace(/\D/g, '') ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${String(cfg.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent('Hello, my order ID is ' + o.id)}">Confirm on WhatsApp</a>` : ''}</div>` : ''}
  <h1 class="pt">Order ${esc(o.id)}</h1>""")
a=rep(a,r"""<small>Payment</small><p style="margin:0 0 10px"><b>${esc(o.payment)}</b></p>""",
r"""<small>Payment</small><p style="margin:0 0 10px"><b>${esc(o.payment)}</b> · ${esc(o.payment_status || '')}${o.trx ? '<br><small>TrxID: ' + esc(o.trx) + '</small>' : ''}</p>""")
a=rep(a,'// ---------- router ----------',open(HERE+'track.js',encoding='utf8').read()+'// ---------- router ----------')
open(O+'app.js','w',encoding='utf8').write(a)
# ---- style.css
c=open(U+'style.css',encoding='utf8').read()
c+="""

/* v2: checkout, trust, calm */
.trust{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.trust span{font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:99px;background:var(--surface);border:1px solid var(--border);color:var(--muted)}
.pays{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.pay{display:flex;align-items:center;gap:10px;padding:12px 14px;border:2px solid var(--border);border-radius:14px;cursor:pointer;background:var(--surface);transition:.2s}
.pay input{width:auto;margin:0;position:absolute;opacity:0}.pay.on{border-color:var(--primary);background:rgba(99,102,241,.08)}
.payinfo{margin-top:14px;padding:14px;border-radius:14px;background:var(--surface2);font-size:14px}.payinfo p{margin:0 0 8px}
.pn{font-size:20px;letter-spacing:1px}
.sec-note{font-size:12.5px;color:var(--muted);text-align:center;margin:10px 0 0}
.okbox{text-align:center;border-color:var(--ok)}.okbox h2{margin:8px 0 4px}.okbox p{color:var(--muted)}
.tick{width:64px;height:64px;margin:0 auto;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center;animation:popk .6s}
.tick .ic{width:32px;height:32px;stroke-width:3}
.cube{animation-duration:48s}.orb{animation-duration:12s}
.btn{box-shadow:0 6px 16px rgba(99,102,241,.25)}.btn:hover{transform:translateY(-1px)}
@media(max-width:899px){.cow aside.sum{order:-1}}
"""
open(O+'style.css','w',encoding='utf8').write(c)
# ---- admin.html
h=open(U+'admin.html',encoding='utf8').read()
h=rep(h,'<div class="stat"><small>Customers</small>','<div class="stat"><small>Payments to verify</small><b style="color:var(--wa)">${s.verify}</b></div><div class="stat"><small>Customers</small>')
h=rep(h,"""<td><b class="${p.stock<=5?'err':''}">${p.stock}</b></td>""","""<td><input type="number" min="0" value="${p.stock}" data-st="${p.id}" style="width:80px"></td>""")
h=rep(h,"$$('[data-e]').forEach(b=>b.onclick=()=>pform(","""$$('[data-st]').forEach(i=>i.onchange=async()=>{try{await api('/api/admin/products/'+i.dataset.st+'/stock',{method:'POST',body:{stock:i.value}});toast('Stock updated')}catch(e){toast(e.message,'err')}});
    $$('[data-e]').forEach(b=>b.onclick=()=>pform(""")
h=rep(h," · ${esc(o.payment)}</small></p></div></div>","""</small></p><p><small>Payment: <b>${esc(o.payment)}</b> <span class="chip">${esc(o.payment_status)}</span>${o.trx?' · TrxID <b>'+esc(o.trx)+'</b>':''}${o.guest?' · Guest order':''}</small></p></div></div>""")
h=rep(h,'<div class="of">${fin?','''<div class="of"><select data-p="${esc(o.id)}">${['Unpaid','Verifying','Paid'].map(s=>`<option ${s===o.payment_status?'selected':''}>${s}</option>`).join('')}</select><button class="btn gh sm" data-pay="${esc(o.id)}">Save payment</button><button class="btn gh sm" data-pr="${esc(o.id)}">🖨 Invoice</button>${fin?''')
h=rep(h,"$$('[data-save]').forEach(b=>b.onclick=async()=>{","""$$('[data-pay]').forEach(b=>b.onclick=async()=>{const id=b.dataset.pay;try{await api('/api/admin/orders/'+encodeURIComponent(id),{method:'POST',body:{payment_status:$(`[data-p="${CSS.escape(id)}"]`).value}});toast('Payment updated');load()}catch(e){toast(e.message,'err')}});
    $$('[data-pr]').forEach(b=>b.onclick=()=>invoice(list.find(o=>o.id===b.dataset.pr)));
    $$('[data-save]').forEach(b=>b.onclick=async()=>{""")
h=rep(h,"${T('about','About Us')}","${F('bkash','bKash number','text','01XXXXXXXXX')}${F('nagad','Nagad number','text','01XXXXXXXXX')}${T('pay_note','Payment note shown at checkout')}${T('about','About Us')}")
h=rep(h,'<span class="err" id="se"></span></form>','''<span class="err" id="se"></span></form>
  <form class="box" id="pwf" novalidate><b>Change admin password</b><div class="g2" style="margin-top:10px"><label class="f">Current password<input name="current" type="password" autocomplete="current-password"></label><label class="f">New password <small>min 10 characters</small><input name="next" type="password" autocomplete="new-password"></label></div><button class="btn">Change password</button> <span class="err" id="pe2"></span></form>''')
h=rep(h,"$('#sf').onsubmit=","""$('#pwf').onsubmit=async e=>{e.preventDefault();const f=e.target;$('#pe2').textContent='';try{await api('/api/admin/password',{method:'POST',body:{current:f.elements.current.value,next:f.elements.next.value}});toast('Password changed');f.reset()}catch(er){$('#pe2').textContent=er.message}};
  $('#sf').onsubmit=""")
h=rep(h,"\ninit();\n</script>","""
function invoice(o){const w=window.open('','_blank');if(!w)return toast('Allow popups to print','err');
w.document.write(`<meta charset="utf-8"><title>${esc(o.id)}</title><body style="font-family:sans-serif;max-width:680px;margin:24px auto;color:#111"><h2>Invoice ${esc(o.id)}</h2><p>${esc(dt(o.created))}<br><b>${esc(o.name)}</b> · ${esc(o.phone)}<br>${esc(o.address)}</p><table style="width:100%;border-collapse:collapse">${o.items.map(i=>`<tr><td style="padding:6px 0;border-bottom:1px solid #ddd">${esc(i.name)} × ${i.qty}</td><td style="text-align:right;border-bottom:1px solid #ddd">${tk(i.price*i.qty)}</td></tr>`).join('')}</table><p style="text-align:right">Subtotal ${tk(o.subtotal)}<br>${o.discount?'Discount -'+tk(o.discount)+'<br>':''}Delivery ${tk(o.shipping)}<br><b style="font-size:20px">Total ${tk(o.total)}</b><br>${esc(o.payment)} · ${esc(o.payment_status)}</p>`);w.document.close();w.focus();w.print()}
init();
</script>""")
open(O+'admin.html','w',encoding='utf8').write(h)
open('.gitignore','w').write('node_modules/\n.session-secret\nshop.db*\nuploads/\n')
print('OK')
