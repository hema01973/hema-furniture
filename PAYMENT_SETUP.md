# دليل تشغيل الدفع — Paymob

## 1. أنشئ حساب Paymob
- ادخل على https://accept.paymob.com
- سجّل حساب تاجر (Merchant)
- بعد التفعيل، ادخل لوحة التحكم

## 2. احصل على المفاتيح الأربعة
من لوحة Paymob:

| المفتاح | مكانه في لوحة Paymob |
|---|---|
| `PAYMOB_API_KEY` | Developers → API Keys → Secret Key |
| `PAYMOB_HMAC_SECRET` | Developers → HMAC |
| `PAYMOB_INTEGRATION_ID` | Developers → Payment Integrations → ID رقم البطاقة |
| `PAYMOB_IFRAME_ID` | Developers → iframes → ID |

## 3. ضعها في ملف .env
```bash
cp .env.example .env
# ثم عدّل .env وضع المفاتيح الحقيقية
```

## 4. اضبط Webhook في لوحة Paymob
داخل Paymob → Developers → Transaction Processed Callback، حط:
```
https://your-domain.com/api/paymob/callback
```
أو محلياً للاختبار، استخدم `ngrok`:
```
ngrok http 3000
# ثم حط الرابط https://xxxx.ngrok.io/api/paymob/callback
```

## 5. شغّل المشروع
```bash
docker compose up
```

## 6. اختبر بكروت Paymob التجريبية
- بطاقة ناجحة: `5123 4567 8901 2346` — CVV `100` — تاريخ `12/25`
- بطاقة فاشلة: `5111 1111 1111 1118`

## ميزات الدفع المُفعّلة في المشروع
- ✅ دفع بالبطاقة عبر iFrame Paymob
- ✅ التحقق من HMAC على Webhook
- ✅ تحديث حالة الطلب تلقائياً عند نجاح/فشل الدفع
- ✅ حفظ `paymobTransactionId` للمطابقة لاحقاً
- ✅ استرداد فعلي عبر Paymob API (Refund)
- ✅ إعادة محاولة الدفع مع التحقق من توفر المخزون
- ✅ تنبيهات Slack عند فشل الدفع أو فتح Circuit Breaker
- ✅ بريد تأكيد للعميل عند نجاح الدفع
- ✅ بريد للعميل عند الاسترداد
- ✅ الدفع عند الاستلام (COD) كبديل
