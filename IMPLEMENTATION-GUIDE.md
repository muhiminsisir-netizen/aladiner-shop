# Shop project: চালানো, backup ও যাচাই

## Backup ও restore

Database migration বা product/category editing-এর আগে project root থেকে চালান:

```powershell
npm run backup
```

এটি `backups/`-এর ভেতরে আলাদা timestamped folder তৈরি করে, project sources ও `uploads/` কপি করে, এবং SQLite online backup নিয়ে integrity check করে। আগের backup কখনও overwrite করে না। `node_modules/` ও `.git/` কপি হয় না; `package-lock.json` থাকে, তাই dependencies আবার ইনস্টল করা যায়।

এই কাজের শুরুতে নেওয়া pre-change backup: `backups/2026-10-22T12-30-24-242Z/`। Migration-এর আগে নেওয়া এই কপিতে মূল database ও session configuration-ও আছে।

সম্পূর্ণ implementation-এর পরের verified snapshot: `backups/2026-10-22T12-55-27-340Z/`।

Restore করতে আগে server বন্ধ করুন। প্রয়োজনীয় source/upload ফাইল ওই backup থেকে ফেরত নিন। Database restore করতে SQLite-aware backup file `shop.db`-কে project root-এর `shop.db` হিসেবে ফেরত দিন। চলমান server-এর `shop.db`, `shop.db-wal` বা `shop.db-shm` আলাদা করে কপি করবেন না। Restore-এর পর `npm install` চালিয়ে server শুরু করুন।

## চালানো

```powershell
npm install
npm start
```

Store: `http://localhost:3000/` · Admin: `http://localhost:3000/admin.html`

Admin account আগে থেকে থাকলে আগের credential-ই থাকবে। নতুন database-এ admin না থাকলে server নিরাপত্তার জন্য বন্ধ হবে; `ADMIN_EMAIL` এবং কমপক্ষে ১৪ অক্ষরের `ADMIN_PASSWORD` process environment-এ দিয়ে server চালু করুন। কোনো secret source code বা `.env` file-এ রাখবেন না। Production HTTPS hosting-এ `COOKIE_SECURE=1`; reverse proxy ব্যবহার করলে তবেই `TRUST_PROXY=1` দিন।

Admin password বদলাতে Admin → Settings-এ বর্তমান password দিয়ে নতুন ১৪+ অক্ষরের password দিন। বর্তমান password জানা না থাকলে server বন্ধ করে `node set-admin.js` চালান; এটি email/password prompt করে এবং password টাইপ করার সময় দেখায় না।

## ফিচার যাচাই

1. **Category:** Admin → Categories-এ main, subcategory ও child category তৈরি করুন। নাম, slug, image, visibility এবং ordering বদলান। product edit করে তিন স্তরের category নির্বাচন করুন, parent বদলে descendant dropdown reset হচ্ছে কি না দেখুন। Category মুছলে product সরানোর destination বেছে নিন অথবা uncategorized করুন।
2. **SKU:** Product form-এ Auto দিয়ে SKU নিন। একই SKU অন্য product-এ দিলে save প্রত্যাখ্যান হচ্ছে কি না দেখুন। SKU ফাঁকা রেখে save করলেও backend unique SKU বানায়।
3. **Variant stock:** product-এ size/variant চালু করে দুটি variant, আলাদা SKU ও stock যোগ করুন। Storefront product page-এ size বেছে cart-এ দিন। Cart/checkout line-এ size ও সঠিক মূল্য/stocks মিলিয়ে দেখুন। Stock-এর বেশি quantity checkout করা যাবে না। Pending/Confirmed order cancel করে Admin product list-এ variant stock ফেরত এসেছে যাচাই করুন।
4. **Size chart/table:** Product form-এর Add Table-এ heading ও data দিন, row/column যোগ/বাদ দিন, save করে product page-এ responsive table দেখুন। আবার Edit Product খুলে data টিকে আছে নিশ্চিত করুন।
5. **Filters/navigation:** storefront category menu, homepage category visibility, subcategory/child filters এবং filtered product count যাচাই করুন। Product detail page-এ category navigation row লুকানো থাকবে; মূল header, search, account ও cart থাকবে।
6. **Appearance/banner:** Admin Appearance/Theme-এ আগের Phase 4-এর banner, theme ও hover controls যাচাই করুন। Banner hide/disable এবং mobile/desktop rendering দেখুন।
7. **Security:** নতুন admin password দিয়ে পুনরায় login করুন; logged-out অবস্থায় admin API-তে access অস্বীকৃত হয় কি না দেখুন। `.session-secret`, `.env`, `shop.db*`, `uploads/`, `node_modules/` Git-এ stage হচ্ছে না নিশ্চিত করুন।

## Migration ও regression verification

Server startup-এর additive migration existing products/orders মুছে না দিয়ে category hierarchy, variant ও description-table columns যোগ করে। এই implementation-এর migration-এর পরে `PRAGMA integrity_check` সফল হয়েছে; product row ৫ এবং order row ২ অপরিবর্তিত ছিল।

End-to-end regression isolated backup clone-এ চালানো হয়েছে; local live orders-এ test order তৈরি করা হয়নি। Category hierarchy/filter, duplicate SKU rejection, variant cart/order/cancellation/restock, description-table persistence ও safe category deletion—সব pass করেছে।

পুরোনো `patch.py` backup file overwrite করতে পারত; এখন backup থাকলে timestamped নতুন backup নেয়। Phase 1/2/4 patch scripts already-applied marker পেলে পরিবর্তন ছাড়াই exit করে। এই patch scripts পুনরায় চালানোর দরকার নেই; বর্তমান files-ই সম্পূর্ণ implementation।
