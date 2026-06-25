/**
 * apply-active-catalog-2026-06-25.ts
 *
 * One-off: đồng bộ catalog theo "BẢNG GIÁ VỐN (1).xlsx" do anh Philip gửi 25/06/2026.
 *  - 53 SKU đang kinh doanh: set ảnh đại diện + giá bán lẻ ('Giá lẻ niêm yết'),
 *    bật hiển thị (hasSales=true) + status='active'.
 *  - Mọi SKU KHÁC trong org: ẩn khỏi catalog (hasSales=false). KHÔNG xoá, KHÔNG
 *    đụng đơn hàng/doanh số — chỉ là cờ hiển thị (cả CRM lẫn Sale app dùng hasSales).
 *
 * An toàn:
 *  - DRY_RUN=1 (mặc định): chỉ in kế hoạch, KHÔNG ghi.
 *  - DRY_RUN=0: backup trạng thái cũ ra scripts/backup-catalog-<ts>.json rồi ghi.
 *  - Giá bán lẻ upsert theo (productId, tierName) + fallback tier "lẻ" như endpoint
 *    PUT /sale-app/products/:id/prices.
 *
 * Chạy:  npx tsx --env-file=.env scripts/apply-active-catalog-2026-06-25.ts          # dry-run
 *        DRY_RUN=0 npx tsx --env-file=.env scripts/apply-active-catalog-2026-06-25.ts # ghi thật
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { writeFileSync } from 'node:fs';

const RETAIL_TIER = 'Giá lẻ niêm yết';
const DRY = process.env.DRY_RUN !== '0';

// 53 SKU đang kinh doanh (dbSku đã resolve về đúng mã trong DB)
const ACTIVE: Array<{ sku: string; img: string; retail: number }> = [
  {"sku": "VTPM_01", "img": "https://product.hstatic.net/200000292324/product/vitamin-tong-hop-cho-ba-bau-pregnacare-max-84-vien_fb18f91bbea2494badb42c8d80dfba8d_1024x1024.jpg", "retail": 805000},
  {"sku": "VTPB_02", "img": "https://suabotngoainhap.com/wp-content/uploads/2021/10/vitamin-pregnacare-breast-feeding-4-1.jpg", "retail": 745000},
  {"sku": "HC_01", "img": "https://product.hstatic.net/1000398092/product/chrome_5slokwhlx2_a3c528acc25f4561a104697e6b6447d3.png", "retail": 325000},
  {"sku": "HC_02", "img": "https://cdn1.concung.com/2026/03/52945-135755-large_mobile/vien-uong-bo-nao-healthy-care-ginkgo-biloba-2000mg.webp", "retail": 385000},
  {"sku": "HC_03", "img": "https://cdn.famitaa.net/storage/uploads/noidung/dau-ca-healthy-care-fish-oil-1000mg-omega-3-400-vien_00908.jpg", "retail": 650000},
  {"sku": "HC_20", "img": "https://bizweb.dktcdn.net/thumb/grande/100/415/053/products/z7730976223972-36d7e2d424c16094284ccc690aa61c52.jpg?v=1776314249660", "retail": 625000},
  {"sku": "HC_11", "img": "https://product.hstatic.net/200000713511/product/omega-3-6-9-healthycare-uc-1_e075a74b8f1543869954fb24dc170f66.jpg", "retail": 625000},
  {"sku": "HC_14", "img": "https://nhathuocphuongchinh.com/static/Product/healthy-care-kids-high-strength-dha.jpg", "retail": 355000},
  {"sku": "BIO_01", "img": "https://bioisland.vn/wp-content/uploads/2025/03/product-tiles-388x390-j-bld104-d.png", "retail": 825000},
  {"sku": "BIO_02", "img": "https://product.hstatic.net/1000398092/product/f2d_800_f3199c733b214525a4886e76c84b2c3a.jpg", "retail": 715000},
  {"sku": "BIO_03", "img": "https://sieuthivitamin.vn/wp-content/uploads/2013/08/bio-island-milk-calcium-for-kids_sua-canxi-uc-jpg.webp", "retail": 825000},
  {"sku": "BIO_05", "img": "https://mbmart.com.vn/uploads/bio-island-lysine-dang-vien.jpg.webp", "retail": 935000},
  {"sku": "BIO_06", "img": "https://product.hstatic.net/200000713511/product/bioisland-dha-cho-ba-bau-hop-60-vien_fb7a67afb2f74183b4e2e11ccfecee87.jpeg", "retail": 990000},
  {"sku": "BIO_07", "img": "https://sieuthivitamin.vn/wp-content/uploads/2023/10/Bio-island-Milk-Calcium-Bone-Care-jpg.webp", "retail": 935000},
  {"sku": "VTR_04", "img": "https://bizweb.dktcdn.net/thumb/1024x1024/100/443/082/products/organ-fat-detox-vitatree-48.jpg?v=1715227838387", "retail": 750000},
  {"sku": "VTR_18", "img": "https://pos.nvncdn.com/772fc0-62010/ps/20250410_kq097M1FLI.png?v=1744253532", "retail": 395000},
  {"sku": "OTB01", "img": "https://cdn.nhathuoclongchau.com.vn/unsafe/2560x0/filters:quality(90):format(webp)/Optibac_FW_30_Front_Panel_With_The_Format_SQ_Pack_Shot_VIETNAM_e7e7290a6d.png", "retail": 525000},
  {"sku": "OTB02", "img": "https://cdn.nhathuoclongchau.com.vn/unsafe/2560x0/filters:quality(90):format(webp)/4c234d7f1b8196dfcf90_1_7becf4032c.jpg", "retail": 1155000},
  {"sku": "OTB03", "img": "https://cdn.hstatic.net/products/200001027734/optibac-pregnancy-with_format-pack_shot-eu_9fd6eea419c44b58b83dbd552e8d1838.png", "retail": 550000},
  {"sku": "OTB04", "img": "https://concung.com/2022/07/58155-90551-large_mobile/optibac-babies-children.webp", "retail": 485000},
  {"sku": "OTB06", "img": "https://cdn11.bigcommerce.com/s-owbbbxknti/images/stencil/1200w/products/1674/465/Optibac-Bifido_Fibre_30s-Front_Panel_with_Format-960x960px-SQ-EU__17868.1753365342.386.513__54928.1761316004.png?compression=lossy", "retail": 585000},
  {"sku": "OTB07", "img": "https://cdn11.bigcommerce.com/s-owbbbxknti/images/stencil/480w/products/1667/423/Optibac_ED30s_Front_Panel_SQ_960x960px_EU__17676.1753365455.386.513__94305.1761315990.png?compression=lossy", "retail": 430000},
  {"sku": "OTB08", "img": "https://a.storyblok.com/f/340553/1814x2088/6bb1fe4cba/bd30-primary.png", "retail": 320000},
  {"sku": "NM_1", "img": "https://hadoha.com/wp-content/uploads/2024/09/Vitamin-tong-hop-cho-ba-bau-Prenatal-Folic-Acid-DHA-150-Vien-My_11zon.webp", "retail": 1280000},
  {"sku": "NEU_01", "img": "https://production-cdn.pharmacity.io/digital/1080x1080/plain/e-com/images/product/20250321101752-0-P28804_2.jpg?versionId=cPh_28H4M4KT0b7U4oPPufJlkfPdu048", "retail": 520000},
  {"sku": "NEU_04", "img": "https://product.hstatic.net/200000292324/product/vitamin-tong-hop-cho-be-neubria-neu-kid-anh-30-vien_7bd77193c0c74d5287783f943f7c747a_1024x1024.jpg", "retail": 525000},
  {"sku": "VAG_01", "img": "https://cdn.hstatic.net/products/1000006063/bt_tim_9cba327ce82b476ab06f94b1f775bb4f_1024x1024.jpg", "retail": 235000},
  {"sku": "VAG_001", "img": "https://cdn.hstatic.net/products/1000006063/bt_hong_bcddbe66786d45a2921455685a51ee0d_1024x1024.jpg", "retail": 235000},
  {"sku": "VAG_02", "img": "https://www.lamdepeva.vn/images/202508/goods_img/dung-dich-ve-sinh-vagisil-cua-my-nhieu-mui-huong-240ml-354ml-P3083-1754938547609.jpg", "retail": 335000},
  {"sku": "PBB_001", "img": "https://down-vn.img.susercontent.com/file/vn-11134207-7r98o-lmion1qnpdy73d", "retail": 140000},
  {"sku": "PBB_01", "img": "https://down-vn.img.susercontent.com/file/vn-11134207-7r98o-lmion1qnpdy73d", "retail": 180000},
  {"sku": "HB_01", "img": "https://www.hangjapan.com/wp-content/uploads/2023/03/Bot-dinh-duong-Happi-Baby-LACTOFERRIN-POWDER-28g.png", "retail": 1135000},
  {"sku": "MH_01", "img": "https://lh3.googleusercontent.com/d/1IJgQD2-DBpZ_oeJT4F6SvCcArNHGGFJ3", "retail": 450000},
  {"sku": "MH_02", "img": "https://lh3.googleusercontent.com/d/1lvm43VUOXvd8r2sQknmHGCvjbLQyAf0u", "retail": 840000},
  {"sku": "MH_03", "img": "https://lh3.googleusercontent.com/d/1BKFTExVcrtup1tDu9LGs3OQFlCriH599", "retail": 1260000},
  {"sku": "MH_003", "img": "https://lh3.googleusercontent.com/d/13A7_7IRKe1vOD4dapxxMUuBMaDXE771U", "retail": 1440000},
  {"sku": "MH_04", "img": "https://down-vn.img.susercontent.com/file/vn-11134207-820l4-mj5cb934mvbbd4", "retail": 390000},
  {"sku": "MH_05", "img": "https://bizweb.dktcdn.net/thumb/large/100/522/245/products/force-g-libido-60-vien.png?v=1780468221217", "retail": 720000},
  {"sku": "MH_07", "img": "https://pharmadi.vn/wp-content/uploads/2025/10/68.png", "retail": 570000},
  {"sku": "MH_09", "img": "https://bizweb.dktcdn.net/thumb/1024x1024/100/522/245/products/370-72fc15c3-a276-40b7-97ee-349e4d4ea474.jpg?v=1778838460010", "retail": 660000},
  {"sku": "MR_01", "img": "https://product.hstatic.net/200000455999/product/artboard-18-1-510x511_e404bd9acd6c4e0e9aa1f8879c651051_grande.png", "retail": 260000},
  {"sku": "MR_02", "img": "https://img.watsonsvn.com/ecommerce/ecom/Marvis/Marvis-Smokers-Whitening-Mint-Toothpaste-85ml-1.jpg", "retail": 270000},
  {"sku": "MR_03", "img": "https://img.watsonsvn.com/ecommerce/ecom/Marvis/Marvis-Smokers-Whitening-Mint-Toothpaste-85ml-1.jpg", "retail": 270000},
  {"sku": "MR_04", "img": "https://classic.vn/wp-content/uploads/2020/03/GreenClassicStrongMint85ml_1024x1024.jpg", "retail": 260000},
  {"sku": "MR_05", "img": "https://marvisvietnam.com.vn/wp-content/uploads/2024/05/20231204_MARVIS_GC_KissingRose_IGS_1-2.jpg", "retail": 270000},
  {"sku": "MR_06", "img": "https://cdn.vuahanghieu.com/unsafe/0x900/left/top/smart/filters:quality(90)/https://admin.vuahanghieu.com/upload/product/2025/12/kem-danh-rang-marvis-anise-mint-85ml-693a4856cd20a-11122025112806.jpg", "retail": 270000},
  {"sku": "MR_07", "img": "https://cdn.vuahanghieu.com/unsafe/0x900/left/top/smart/filters:quality(90)/https://admin.vuahanghieu.com/upload/product/2025/12/kem-danh-rang-marvis-anise-mint-85ml-693a4856cd20a-11122025112806.jpg", "retail": 270000},
  {"sku": "MR_08", "img": "https://medias.watsons.vn/publishing/WTCVN-BP_215003-front-zoom.jpg", "retail": 270000},
  {"sku": "MR_09", "img": "https://classic.vn/wp-content/uploads/2020/03/BlackAmarelliLicoriceMint85ml_1024x1024.jpg", "retail": 270000},
  {"sku": "MR_10", "img": "https://medias.watsons.vn/publishing/WTCVN-215270-extra1-zoom.jpg?version=1759422391", "retail": 290000},
  {"sku": "MR_11", "img": "https://marvis.com.vn/wp-content/uploads/2022/10/Kem-danh-rang-Marvis-Orange-Blossom-75ml..jpg", "retail": 270000},
  {"sku": "MR_12", "img": "https://classic.vn/wp-content/uploads/2020/04/marvis-blackforest-1.jpg", "retail": 270000},
  {"sku": "MR_13", "img": "https://marvisvietnam.com.vn/wp-content/uploads/2023/08/Artboard-6.webp", "retail": 270000}
];

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('Không tìm thấy organization');
  const orgId = org.id;
  console.log(`Org: ${org.name} (${orgId})  |  MODE: ${DRY ? 'DRY-RUN (không ghi)' : 'GHI THẬT'}`);

  const activeSkus = ACTIVE.map((a) => a.sku);

  // ── kiểm tra: SKU nào trong list không có trong DB ──
  const found = await prisma.product.findMany({
    where: { orgId, sku: { in: activeSkus } },
    select: { id: true, sku: true, hasSales: true, status: true, mainImageUrl: true,
      prices: { where: { active: true }, select: { id: true, tierName: true, price: true, displayOrder: true } } },
  });
  const bySku = new Map(found.map((p) => [p.sku, p]));
  const missing = activeSkus.filter((s) => !bySku.has(s));
  if (missing.length) {
    console.log(`⚠️  ${missing.length} SKU không có trong DB (bỏ qua):`, missing.join(', '));
  }

  // ── kế hoạch ẩn ──
  const toHide = await prisma.product.count({ where: { orgId, hasSales: true, sku: { notIn: activeSkus } } });
  console.log(`\nKẾ HOẠCH:`);
  console.log(`  • Hiện + bổ sung ảnh/giá: ${found.length} SKU`);
  console.log(`  • Ẩn (đang hiện, không thuộc list): ${toHide} SKU -> hasSales=false`);

  if (DRY) {
    let willEnableImg = 0, willSetPrice = 0, willReveal = 0;
    for (const a of ACTIVE) {
      const p = bySku.get(a.sku); if (!p) continue;
      if (!p.hasSales) willReveal++;
      if (p.mainImageUrl !== a.img) willEnableImg++;
      const retail = p.prices.find((r) => /lẻ|le|retail/i.test(r.tierName));
      if (!retail || Number(retail.price) !== a.retail) willSetPrice++;
    }
    console.log(`\n[DRY-RUN] Trong 53 SKU: ${willReveal} cần bật hiện, ${willEnableImg} cập nhật ảnh, ${willSetPrice} cập nhật giá bán lẻ.`);
    console.log('[DRY-RUN] KHÔNG ghi gì. Chạy lại với DRY_RUN=0 để áp dụng.');
    return;
  }

  // ── BACKUP trạng thái cũ (mọi SKU sẽ đổi) ──
  const affectedNow = await prisma.product.findMany({
    where: { orgId, OR: [{ sku: { in: activeSkus } }, { hasSales: true }] },
    select: { id: true, sku: true, hasSales: true, status: true, mainImageUrl: true,
      prices: { where: { active: true }, select: { id: true, tierName: true, price: true } } },
  });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `scripts/backup-catalog-${ts}.json`;
  writeFileSync(backupPath, JSON.stringify(affectedNow, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  console.log(`\n✅ Backup: ${backupPath} (${affectedNow.length} rows)`);

  // ── 1) cập nhật 53 SKU ──
  let nImg = 0, nReveal = 0, nPrice = 0;
  for (const a of ACTIVE) {
    const p = bySku.get(a.sku); if (!p) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { mainImageUrl: a.img, hasSales: true, status: 'active' },
    });
    if (p.mainImageUrl !== a.img) nImg++;
    if (!p.hasSales) nReveal++;

    // upsert giá bán lẻ (fallback tier "lẻ")
    let existing = p.prices.find((r) => r.tierName === RETAIL_TIER)
      ?? p.prices.find((r) => /lẻ|le|retail/i.test(r.tierName));
    if (existing) {
      if (Number(existing.price) !== a.retail) {
        await prisma.productPrice.update({ where: { id: existing.id }, data: { price: a.retail } });
        nPrice++;
      }
    } else {
      const maxRow = await prisma.productPrice.aggregate({ where: { productId: p.id }, _max: { displayOrder: true } });
      await prisma.productPrice.create({
        data: { productId: p.id, tierName: RETAIL_TIER, price: a.retail, active: true,
          displayOrder: (maxRow._max.displayOrder ?? 0) + 1, isDefault: false },
      });
      nPrice++;
    }
  }

  // ── 2) ẩn mọi SKU khác ──
  const hidden = await prisma.product.updateMany({
    where: { orgId, hasSales: true, sku: { notIn: activeSkus } },
    data: { hasSales: false },
  });

  // ── 3) quy tắc "có tồn thì hiện": bật lại mọi SP còn tồn (kể cả ngoài DS 53) ──
  const revealedStock = await prisma.product.updateMany({
    where: { orgId, hasSales: false, totalStock: { gt: 0 } },
    data: { hasSales: true },
  });

  // ── verify ──
  const visibleAfter = await prisma.product.count({ where: { orgId, hasSales: true } });
  console.log(`\n✅ XONG:`);
  console.log(`  • Bật hiện thêm: ${nReveal} | cập nhật ảnh: ${nImg} | cập nhật giá lẻ: ${nPrice}`);
  console.log(`  • Đã ẩn: ${hidden.count} SKU`);
  console.log(`  • Hiện lại mã còn tồn (ngoài DS): ${revealedStock.count} SKU`);
  console.log(`  • Catalog giờ hiển thị: ${visibleAfter} SKU (53 + mã còn tồn)`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
