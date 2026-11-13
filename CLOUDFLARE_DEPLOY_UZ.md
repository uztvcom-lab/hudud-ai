# Hudud.AI — Cloudflare Pages versiyasi

## O'zgartirilgan qismlar
- Mavjud sayt dizayni va asosiy frontend funksiyalari saqlandi.
- API manzili `/api/dataset` ga ko'chirildi.
- Netlify Blobs/Functions o'rniga Cloudflare Pages Functions + R2 ishlatiladi.
- 4 ta dataset slot saqlanadi; har bir yuklangan fayl 8 soatdan keyin muddati o'tgan hisoblanadi va navbatdagi API murojaatida R2'dan o'chiriladi.
- Admin paroli kod ichida yo'q. `ADMIN_PASSWORD` Cloudflare Secret sifatida kiritilishi shart.
- Service Worker `/api/` javoblarini keshlamaydi.

## 1. R2 bucket yarating
Cloudflare Dashboard → R2 Object Storage → Create bucket.
Bucket nomi: `hudud-dataset`.

## 2. Cloudflare Pages loyihasini yarating
Workers & Pages → Create → Pages. Git orqali ulash yoki Wrangler bilan deploy qilish mumkin.
Build output directory: `public`.
`functions/` papkasi loyiha ildizida qolishi shart; uni `public/` ichiga ko'chirmang.

## 3. R2 binding ulang
Pages project → Settings → Bindings → Add → R2 bucket.
- Variable name: `HUDUD_DATASET`
- Bucket: `hudud-dataset`

`wrangler.toml` ham shu bindingni e'lon qiladi.

## 4. Admin parolini kiriting
Pages project → Settings → Variables and Secrets → Add → Secret.
- Name: `ADMIN_PASSWORD`
- Value: o'zingiz tanlagan kamida 4 belgili maxfiy parol.

Secret qo'shilgach qayta deploy qiling. Bu secret bo'lmasa admin autentifikatsiyasi rad etiladi.

## 5. Deploy
Wrangler bilan:
```bash
npm install
npx wrangler login
npx wrangler pages deploy ./public
```
Yoki Git integratsiyasi orqali deploy qiling. Deploy jarayonida loyiha ildizidagi `functions/api/dataset.js` Pages Function sifatida aniqlanishi kerak.

## 6. Sinov
- `https://SAYT-MANZILI/api/dataset` ochilganda `{"slots":[null,null,null,null]}` javobi kelishi kerak.
- Admin oynasida Cloudflare Secret'da belgilangan parol bilan kiring.
- Sinov Excel faylini joylang, sahifani yangilang va ommaviy ko'rinishini tekshiring.

## Muhim
- 8 soatlik muddat API chaqiruvi vaqtida tekshiriladi; muddatidan o'tgan obyekt shu so'rovda o'chiriladi. Bu daqiqalik scheduler emas.
- Cloudflare Pages/R2 bepul limitlari mavjud, limitlardan oshish to'lovga olib kelishi mumkin.
- Production uchun avval secret va R2 bindingni sozlang; keyin ommaviy havolani tarqating.
