import openpyxl
p = "/Users/tranhien1897/Downloads/BẢNG GIÁ SỈ MANHAE (1).xlsx"
wb = openpyxl.load_workbook(p, data_only=True)
# sheet: (cost_col, [10thùng,5thùng,1thùng,<1thùng] cols, img_col)
CFG = {
 "MANHAE":            (5, [7,8,9,10], 17),
 "BIOISLAND GIÁ MỚI": (4, [7,8,9,10], 11),
 "OPTIBAC":           (4, [6,7,8,9], 10),
 "NEUBRIA":           (4, [6,7,8,9], 10),   # 100/60/30/10 hộp -> 10t/5t/1t/<1t
 "P'tit BOBO":        (3, [6,7,8,9], 10),
 "Vitatree":          (4, [6,7,8,9], 10),
}
TIERS = [("10 thùng",1,False),("5 thùng",2,False),("1 thùng",3,True),("<1 thùng",4,False)]
def num(v):
    if v is None: return None
    s=str(v).strip().replace(",","")
    if s in ("","HẾT HÀNG","#VALUE!"): return None
    try: return int(float(s))
    except: return None
prods=[]
for sheet,(cc,tcols,ic) in CFG.items():
    ws=wb[sheet]
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row: continue
        sku=str(row[1]).strip() if len(row)>1 and row[1] else ""
        name=str(row[2]).strip() if len(row)>2 and row[2] else ""
        if not sku or not name: continue
        tiers=[num(row[c]) if len(row)>c else None for c in tcols]
        if all(t is None for t in tiers): continue
        cost=num(row[cc]) if len(row)>cc else None
        img=str(row[ic]).strip() if len(row)>ic and row[ic] else ""
        if img and not img.startswith("http"): img=""
        prods.append(dict(sku=sku,name=name,cost=cost,tiers=tiers,img=img))
skus=[p['sku'] for p in prods]
def dq(s): return "$$"+s+"$$"
out=["BEGIN;"]
for p in prods:
    sets=[f"name={dq(p['name'])}","status='active'","updated_at=now()"]
    if p['cost'] is not None: sets.append(f"cost_price={p['cost']}")
    if p['img']: sets.append(f"main_image_url={dq(p['img'])}")
    out.append(f"UPDATE products SET {', '.join(sets)} WHERE sku={dq(p['sku'])};")
    out.append(f"UPDATE product_prices SET active=false, updated_at=now() WHERE active=true AND product_id=(SELECT id FROM products WHERE sku={dq(p['sku'])});")
    vals=[]
    for (tn,ordd,isdef),price in zip(TIERS,p['tiers']):
        if price is None: continue
        vals.append(f"({dq(tn)},{price},{ordd},{str(isdef).lower()})")
    if vals:
        out.append("INSERT INTO product_prices (id,product_id,tier_name,price,display_order,is_default,active,created_at,updated_at) "
                   f"SELECT gen_random_uuid()::text,p.id,t.tier_name,t.price,t.ord,t.is_def,true,now(),now() "
                   f"FROM products p,(VALUES {','.join(vals)}) AS t(tier_name,price,ord,is_def) WHERE p.sku={dq(p['sku'])};")
inlist=",".join(dq(s) for s in skus)
out.append(f"UPDATE products SET status='discontinued', updated_at=now() WHERE status='active' AND sku NOT IN ({inlist});")
out.append("COMMIT;")
open("/tmp/manhae.sql","w").write("\n".join(out))
print(f"SP: {len(prods)} | SKUs: {skus}")
for p in prods:
    if not p['img']: print("   (THIẾU ẢNH):", p['sku'])
print("\n--- 12 dòng SQL đầu ---")
print("\n".join(out[:12]))
