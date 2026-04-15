# 🛋️ Hema Modern Furniture — Production System
### هيما للأثاث العصري

A **full-stack, production-ready** e-commerce platform for a premium Egyptian furniture brand.

---

## ✅ What's Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| REST API (Products, Orders, Users) | ✅ Complete | Full CRUD + filtering + pagination |
| MongoDB + Mongoose Models | ✅ Complete | Product, Order, User, Review, Coupon |
| Authentication (NextAuth + JWT) | ✅ Complete | Credentials + Google OAuth ready |
| Role-based Access (Admin/Staff/Customer) | ✅ Complete | Middleware-protected routes |
| Cloudinary Image Upload | ✅ Complete | Multi-image, auto-optimize |
| Paymob Integration (Egypt) | ✅ Complete | Card + Fawry + Valu + COD |
| Email Notifications | ✅ Complete | Order confirm, password reset |
| Zustand State (Cart + Wishlist) | ✅ Complete | Persisted to localStorage |
| Input Validation (Zod) | ✅ Complete | Server + client side |
| Rate Limiting | ✅ Complete | Per-IP, configurable |
| Security Headers | ✅ Complete | CSP, XSS, CSRF protection |
| Next.js Middleware | ✅ Complete | Auth guards, redirects |
| Analytics API | ✅ Complete | Revenue, orders, top products |
| Coupon System | ✅ Complete | % and fixed discounts |
| Database Seed Script | ✅ Complete | 10 products + admin + coupons |
| SEO (Static) | ✅ Complete | Meta, OG, LD+JSON |
| Bilingual AR/EN | ✅ Complete | RTL + translations |
| Dark Mode | ✅ Complete | CSS variables |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### 1. Install

```bash
git clone https://github.com/yourusername/hema-furniture.git
cd hema-furniture
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
# Fill in your values (see Configuration section)
```

### 3. Seed Database

```bash
npm run seed
```

### 4. Run

```bash
npm run dev
# → http://localhost:3000
# → Admin: http://localhost:3000/admin
```

**Admin credentials:** `admin@hemafurniture.com` / `admin123` (change after first login!)

---

## 🏗️ Architecture

```
hema-furniture/
├── src/
│   ├── app/                          # Next.js 14 App Router
│   │   ├── [locale]/                 # i18n: /en/* and /ar/*
│   │   │   ├── page.tsx              # Home page (SSR)
│   │   │   ├── shop/                 # Product listing
│   │   │   ├── product/[slug]/       # Product detail (SSG + ISR)
│   │   │   ├── cart/                 # Shopping cart
│   │   │   ├── checkout/             # Checkout (auth required)
│   │   │   ├── orders/               # Order history
│   │   │   ├── account/              # User profile
│   │   │   ├── about/
│   │   │   └── contact/
│   │   ├── admin/                    # Admin dashboard (auth + role required)
│   │   │   ├── page.tsx              # Dashboard + analytics
│   │   │   ├── products/             # CRUD products
│   │   │   ├── orders/               # Manage orders
│   │   │   └── users/                # Manage customers
│   │   └── api/                      # API Routes
│   │       ├── auth/                 # NextAuth + register
│   │       ├── products/             # GET/POST/PUT/DELETE
│   │       │   └── [id]/
│   │       ├── orders/               # Order creation + management
│   │       │   └── [id]/
│   │       ├── users/                # User management
│   │       ├── upload/               # Cloudinary image upload
│   │       ├── analytics/            # Dashboard stats
│   │       ├── paymob/               # Payment webhook
│   │       │   └── callback/
│   │       └── reviews/              # Product reviews
│   ├── components/
│   │   ├── layout/                   # Navbar, Footer, AdminSidebar
│   │   ├── shop/                     # ProductCard, Grid, Filters
│   │   ├── product/                  # Gallery, Tabs, Reviews
│   │   ├── cart/                     # CartItem, Summary, FreeShipBar
│   │   ├── checkout/                 # Steps, PaymentForm, Paymob
│   │   ├── admin/                    # ProductForm, OrderTable, Analytics
│   │   └── ui/                       # Button, Input, Toast, Modal
│   ├── lib/
│   │   ├── mongodb.ts                # DB connection + all models
│   │   ├── auth.ts                   # NextAuth config
│   │   ├── cloudinary.ts             # Image upload
│   │   ├── paymob.ts                 # Payment gateway
│   │   ├── email.ts                  # Nodemailer templates
│   │   └── api.ts                    # Middleware helpers
│   ├── store/
│   │   └── cartStore.ts              # Zustand: Cart + Wishlist + UI
│   ├── hooks/
│   │   ├── useProducts.ts            # SWR data fetching
│   │   ├── useCart.ts                # Cart actions
│   │   └── useAuth.ts                # Session helpers
│   ├── types/
│   │   └── index.ts                  # TypeScript interfaces
│   └── middleware.ts                 # Route protection + security
├── public/
│   └── locales/                      # Translation files
├── scripts/
│   └── seed.ts                       # Database seeding
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## ⚙️ Configuration

### Required Environment Variables

```env
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/hema-furniture

# Auth
NEXTAUTH_SECRET=minimum-32-character-random-string
NEXTAUTH_URL=http://localhost:3000

# Admin
ADMIN_EMAIL=admin@hemafurniture.com
ADMIN_PASSWORD=StrongPassword123!

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret

# Paymob
PAYMOB_API_KEY=your-api-key
PAYMOB_INTEGRATION_ID=your-integration-id
PAYMOB_IFRAME_ID=your-iframe-id
PAYMOB_HMAC_SECRET=your-hmac-secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
```

---

## 💳 Payment Integration (Paymob)

1. Create account at [accept.paymob.com](https://accept.paymob.com)
2. Go to **Developers → API Keys** → copy your API key
3. Create an **Online Card Integration** → copy Integration ID
4. Create an **iFrame** → copy iFrame ID
5. Set **HMAC key** in security settings
6. Add your domain to **Allowed Origins**
7. Set webhook URL: `https://yourdomain.com/api/paymob/callback`

---

## 🖼️ Image Upload (Cloudinary)

1. Create free account at [cloudinary.com](https://cloudinary.com)
2. Copy Cloud Name, API Key, API Secret from dashboard
3. Images are automatically optimized to WebP/AVIF

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel --prod
```

Add all environment variables in Vercel Dashboard → Settings → Environment Variables.

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t hema-furniture .
docker run -p 3000:3000 --env-file .env.production hema-furniture
```

### PM2 (VPS)

```bash
npm run build
pm2 start npm --name "hema" -- start
pm2 save
pm2 startup
```

---

## 🛡️ Security Checklist

- [x] JWT authentication
- [x] bcrypt password hashing (cost 12)
- [x] Role-based access control
- [x] Rate limiting (100 req/15min per IP)
- [x] Input validation (Zod)
- [x] Security headers (CSP, XSS, CSRF)
- [x] SQL injection impossible (MongoDB + Mongoose)
- [x] Paymob HMAC webhook verification
- [ ] Enable HTTPS (handled by Vercel/Nginx)
- [ ] Set up Redis for rate limiting in production
- [ ] Enable 2FA for admin accounts
- [ ] Regular dependency audits: `npm audit`

---

## 📊 API Reference

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products` | — | List products (filters, sort, paginate) |
| GET | `/api/products/:id` | — | Get single product |
| POST | `/api/products` | Admin | Create product |
| PUT | `/api/products/:id` | Admin | Update product |
| DELETE | `/api/products/:id` | Admin | Deactivate product |

### Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/orders` | User | List orders (admin sees all) |
| POST | `/api/orders` | — | Create order (guest or user) |
| GET | `/api/orders/:id` | User | Get order details |
| PUT | `/api/orders/:id` | Admin | Update order status |

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/signin` | — | Login (NextAuth) |
| POST | `/api/upload` | Admin | Upload images to Cloudinary |
| GET | `/api/analytics` | Admin | Dashboard statistics |

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests (Playwright)
npm run test:e2e

# API tests
npm run test:api
```

---

*Built for production — هيما للأثاث العصري © 2026*
