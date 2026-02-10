# 🚀 QUICK START - Hatchly Flask App

## ⚡ 5-Minute Setup

### 1️⃣ Install Python Dependencies (1 min)
```bash
cd prawn_flask_app
python -m venv venv
source venv/bin/activate  # Mac/Linux
# OR
venv\Scripts\activate     # Windows

pip install -r requirements.txt
```

### 2️⃣ Setup MySQL Database (2 min)
```bash
# Login to MySQL
mysql -u root -p

# Copy-paste from database.sql or:
CREATE DATABASE hatchly_db;
USE hatchly_db;
# Then run the CREATE TABLE commands
```

### 3️⃣ Update Database Config (30 sec)
Edit `app.py` line 24:
```python
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'YOUR_PASSWORD_HERE',  # <-- CHANGE THIS
    'database': 'hatchly_db'
}
```

### 4️⃣ Add Your CSS File (30 sec)
```bash
# Copy your styles.css to:
cp /path/to/styles.css static/css/styles.css
```

### 5️⃣ Run the App (30 sec)
```bash
python app.py
```

**Open browser:** http://localhost:5000

---

## ✅ Test Checklist

- [ ] App opens without errors
- [ ] Can signup: test@test.com / password123
- [ ] Can login
- [ ] Can register a prawn
- [ ] Can upload an image
- [ ] Homepage shows correctly

---

## 📁 Files You Need to Add

### Required:
1. `static/css/styles.css` - Your CSS file
2. `static/images/Logo.png` - Your logo

### Optional:
3. `models/prawn_model.h5` - Your ML model (when ready)

---

## 🎯 What to Do Next

1. **Test Everything** - Make sure all features work
2. **Add Your ML Model** - Update `/api/predict` endpoint
3. **Customize** - Change colors, text, etc.
4. **Deploy** - Use Gunicorn for production

---

## 🆘 Quick Fixes

**Can't connect to database?**
```bash
# Start MySQL
# Mac: brew services start mysql
# Windows: Start MySQL in XAMPP
# Linux: sudo service mysql start
```

**Import errors?**
```bash
pip install -r requirements.txt
```

**Template not found?**
```bash
# Check templates/main.html exists
ls templates/
```

---

## 📞 Next Steps

Read the full guides:
- `README.md` - Complete documentation
- `MIGRATION_GUIDE.md` - Detailed migration info
- `database.sql` - Database schema

---

**You're ready to go! 🦐**
