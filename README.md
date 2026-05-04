# 🌍 Wanderlust

An Airbnb-inspired full-stack web app to discover and list unique travel stays — from mountain cabins to arctic domes.

🔗 **Live Demo:** https://wanderlust-m3dm.onrender.com/listings

---

## ✨ Features

- 🔐 User Authentication — Signup, Login, Logout (Passport.js)
- 🏠 Full CRUD on Listings — Create, edit, and delete your stays
- 🗂️ Category Filters — Rooms, Mountains, Castles, Camping, Arctic, Domes, Boats & more
- ⭐ Reviews — Authenticated users can post and delete reviews
- 🗺️ Interactive Maps — Listing locations powered by Mapbox
- ☁️ Image Uploads — Stored and served via Cloudinary
- 💰 GST Display — Toggle to show total price with 18% GST
- 📱 Responsive UI — Built with Bootstrap 5

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Templating | EJS |
| Database | MongoDB, Mongoose |
| Authentication | Passport.js |
| Image Storage | Cloudinary, Multer |
| Maps | Mapbox GL JS |
| Sessions | express-session, connect-mongo |
| Deployment | Render |

---

## 🚀 Getting Started

```bash
git clone https://github.com/ROOHITABASSUM786/wanderlust.git
cd wanderlust
npm install
node app.js
```

Visit: `http://localhost:8080/listings`

---

## 🔑 Environment Variables

Create a `.env` file in the root:

```env
ATLASDB_URL=your_mongodb_atlas_url
SECRET=your_session_secret
CLOUD_NAME=your_cloudinary_cloud_name
CLOUD_API_KEY=your_cloudinary_api_key
CLOUD_API_SECRET=your_cloudinary_api_secret
MAP_TOKEN=your_mapbox_token
```

---


