# МДМ

Original game marketplace web app where players trade items with in-game currency only.
No real payments, no external banking APIs.

## Stack

- Frontend: React + Vite (JavaScript)
- UI: Tailwind CSS v4 + Framer Motion + Lucide icons
- State: Zustand
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- Auth: JWT + bcryptjs

## Architecture (concise)

### Layers

- `backend/src/server.js`: API and business logic orchestration
- `backend/src/db.js`: DB bootstrap and schema
- `backend/src/middleware/auth.js`: JWT auth guard
- `backend/src/utils/common.js`: validation and error primitives
- `frontend/src/pages/*`: route-level UI flows
- `frontend/src/components/*`: reusable UI blocks
- `frontend/src/store/*`: client auth/cart state + API actions
- `frontend/src/lib/*`: API client and format helpers

### Core entities

- `users`: id, username, email, password_hash, avatar, bio, balance, rating, timestamps
- `products`: id, title, description, price, image, category, condition, rarity, stock, seller_id, listed flag
- `cart_items`: user/product/quantity
- `orders`: buyer_id, total, status, timestamps
- `order_items`: snapshot of product data at purchase time
- `transactions`: debit/credit records for economy audit

### Purchase validation rules

- buyer cannot purchase own item
- item must be listed and in stock
- requested quantity must be <= stock
- buyer must have enough in-game balance
- on success: buyer debited, sellers credited, stock reduced, transaction records written, order created

## Folder tree

```text
arcadia_market/
  backend/
    .env.example
    package.json
    scripts/
      seed.js
    src/
      db.js
      server.js
      middleware/auth.js
      utils/common.js
  frontend/
    .env.example
    package.json
    index.html
    vite.config.js
    src/
      App.jsx
      index.css
      main.jsx
      components/
        AnimatedPage.jsx
        EmptyState.jsx
        Layout.jsx
        OrderStatusBadge.jsx
        ProductCard.jsx
        ProtectedRoute.jsx
        SkeletonCard.jsx
      constants/
        marketOptions.js
      lib/
        api.js
        format.js
      pages/
        AuthPage.jsx
        CartPage.jsx
        CatalogPage.jsx
        HomePage.jsx
        NotFoundPage.jsx
        OrdersPage.jsx
        ProductDetailsPage.jsx
        ProfilePage.jsx
        SellPage.jsx
      store/
        authStore.js
        cartStore.js
```

## API endpoints

### Auth / user

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me` (auth)
- `GET /api/users/:id`
- `PUT /api/users/me` (auth)
- `GET /api/users/me/dashboard` (auth)

### Marketplace

- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products` (auth)
- `PUT /api/products/:id` (auth, seller)
- `PATCH /api/products/:id/listing` (auth, seller)

### Cart / checkout

- `GET /api/cart` (auth)
- `POST /api/cart/items` (auth)
- `PATCH /api/cart/items/:id` (auth)
- `DELETE /api/cart/items/:id` (auth)
- `POST /api/cart/checkout` (auth)

### Orders

- `GET /api/orders/my` (auth)
- `GET /api/orders/sales` (auth)
- `PATCH /api/orders/:id/status` (auth, seller in order)

## Setup and run

### 1) Backend

```bash
cd arcadia_market/backend
npm install
copy .env.example .env
npm run seed
npm run dev
```

Backend runs on `http://localhost:4000`.

### 2) Frontend

```bash
cd arcadia_market/frontend
npm install
copy .env.example .env
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Demo account

After `npm run seed`:

- Email: `rookie@arcadia.local`
- Password: `demo123`

## Run in local network (home devices)

- Backend: in `backend/.env`, set `FRONTEND_ORIGIN` to your frontend origin (or `*` for LAN demo).
- Frontend Vite already uses `host: true`.
- Open frontend using your PC LAN IP: `http://YOUR_IP:5173`.

## Future improvements

1. Favorites and wishlists
2. Buyer/seller chat
3. Ratings/reviews with moderation
4. Real-time updates (WebSocket/SSE) for stock and prices
5. Lightweight admin moderation panel
6. Notification center for sales and order status updates
7. Image uploads via backend storage instead of URL-only
